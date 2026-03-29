import { useEffect, useRef, useState, useCallback } from 'react'
import io from 'socket.io-client'
import { IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import styles from '../styles/videoComponent.module.css'
import server from '../environment'
import { getAvatar } from '../components/AvatarPicker'
import { SfuClient } from '../utils/sfuClient'
import { useMediaDevices, makeBlackSilenceStream } from '../hooks/useMediaDevices'
import { useNetworkQuality } from '../hooks/useNetworkQuality'
import { useEncryptedChat } from '../hooks/useEncryptedChat'
import { useRoomControls } from '../hooks/useRoomControls'
import { useWaitingRoom } from '../hooks/useWaitingRoom'

import PreJoinLobby from '../components/PreJoinLobby'
import WaitingScreen from '../components/WaitingScreen'
import RejectedScreen from '../components/RejectedScreen'
import VideoGrid from '../components/VideoGrid'
import ChatPanel from '../components/ChatPanel'
import MeetingControls from '../components/MeetingControls'

const server_url = server
const DEFAULT_ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
    ],
}

export default function VideoMeetComponent() {
    // ── Core refs ──
    const socketRef = useRef(null)
    const socketIdRef = useRef(null)
    const localVideoRef = useRef(null)
    const connectionsRef = useRef({})
    const iceConfigRef = useRef(DEFAULT_ICE_CONFIG)
    const sfuClientRef = useRef(null)
    const sfuModeRef = useRef(false)
    const remoteVideoElems = useRef({})
    const videoRef = useRef([])

    // ── Component state ──
    const [askForUsername, setAskForUsername] = useState(true)
    const [username, setUsername] = useState('')
    const [videos, setVideos] = useState([])
    const [showModal, setModal] = useState(false)
    const [sfuActive, setSfuActive] = useState(false)
    const [showWaitingPanel, setShowWaitingPanel] = useState(false)
    const participantNamesRef = useRef({}) // socketId → { username, avatar }

    // ── Custom hooks ──
    const media = useMediaDevices({ localVideoRef, connectionsRef, socketRef })
    const { networkQuality } = useNetworkQuality({ connectionsRef, active: !askForUsername })
    const chat = useEncryptedChat({ socketRef, socketIdRef })
    const room = useRoomControls({ socketRef, socketIdRef, remoteVideoElems })
    const lobby = useWaitingRoom({ socketRef })

    // ── Init: run once on mount, clean up on unmount ──
    // Intentionally empty deps — getPermissions and cleanupCall are stable refs
    useEffect(() => {
        media.getPermissions()
        return () => cleanupCall()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-get media when video/audio toggles ──
    // Only re-run when video/audio booleans change, not when getUserMedia ref changes
    useEffect(() => {
        if (media.video !== undefined && media.audio !== undefined) {
            media.getUserMedia(media.video, media.audio, media.videoAvailable, media.audioAvailable)
        }
    }, [media.video, media.audio]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Screen share ──
    useEffect(() => {
        if (media.screen !== undefined) media.getDisplayMedia(media.screen)
    }, [media.screen]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Adaptive simulcast: switch SFU layer based on network quality ──
    useEffect(() => {
        if (!sfuClientRef.current) return
        const layer = networkQuality === 'good' ? 2 : networkQuality === 'fair' ? 1 : 0
        sfuClientRef.current.setPreferredLayer(layer)
    }, [networkQuality])

    // ── Keyboard shortcuts ──
    // Handlers are stable callbacks — only rebind when meeting state changes
    useEffect(() => {
        if (askForUsername) return
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            switch (e.key.toLowerCase()) {
                case 'm': media.handleAudio(); break
                case 'v': media.handleVideo(); break
                case 'e': handleEndCall(); break
                case 'c': setModal(prev => { if (!prev) chat.setNewMessages(0); return !prev }); break
                case 'h': room.toggleHandRaise(); break
                default: break
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [askForUsername, media.audio, media.video, room.handRaised]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cleanup ──
    const cleanupCall = useCallback(() => {
        try { window.localStream?.getTracks().forEach(t => t.stop()) }
        catch (e) { /* track already stopped */ }
        window.localStream = null
        if (sfuClientRef.current) {
            try { sfuClientRef.current.close() }
            catch (e) { /* already closed */ }
            sfuClientRef.current = null
        }
        for (const id in connectionsRef.current) {
            try { connectionsRef.current[id].close() }
            catch (e) { /* peer already gone */ }
        }
        connectionsRef.current = {}
        if (socketRef.current) {
            socketRef.current.disconnect()
            socketRef.current = null
        }
    }, [])

    // ── Add remote stream (P2P) ──
    const addRemoteStream = useCallback((socketId, stream) => {
        const existing = videoRef.current.find(v => v.socketId === socketId)
        if (existing) {
            setVideos(prev => {
                const updated = prev.map(v => v.socketId === socketId ? { ...v, stream } : v)
                videoRef.current = updated
                return updated
            })
        } else {
            const newVideo = { socketId, stream, autoplay: true, playsinline: true }
            setVideos(prev => {
                const updated = [...prev, newVideo]
                videoRef.current = updated
                return updated
            })
        }
    }, [])

    // ── Add remote track (SFU) ──
    const addRemoteTrack = useCallback((socketId, track) => {
        const existing = videoRef.current.find(v => v.socketId === socketId)
        if (existing) {
            existing.stream.addTrack(track)
            setVideos(prev => {
                const updated = prev.map(v => v.socketId === socketId ? { ...v, stream: existing.stream } : v)
                videoRef.current = updated
                return updated
            })
        } else {
            const stream = new MediaStream([track])
            const newVideo = { socketId, stream, autoplay: true, playsinline: true }
            setVideos(prev => {
                const updated = [...prev, newVideo]
                videoRef.current = updated
                return updated
            })
        }
    }, [])

    // ── P2P signaling ──
    const gotMessageFromServer = useCallback((fromId, message) => {
        let signal
        try { signal = JSON.parse(message) }
        catch { return } // malformed JSON from peer — discard
        const connections = connectionsRef.current
        if (fromId === socketIdRef.current || !connections[fromId]) return
        if (signal.sdp) {
            connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                if (signal.sdp.type === 'offer') {
                    connections[fromId].createAnswer().then(desc => {
                        connections[fromId].setLocalDescription(desc).then(() => {
                            socketRef.current?.emit('signal', fromId, JSON.stringify({ sdp: connections[fromId].localDescription }))
                        }).catch(e => console.warn('WebRTC setLocalDescription failed:', e.message))
                    }).catch(e => console.warn('WebRTC createAnswer failed:', e.message))
                }
            }).catch(e => console.warn('WebRTC setRemoteDescription failed:', e.message))
        }
        if (signal.ice) {
            connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice))
                .catch(e => console.warn('ICE candidate failed:', e.message))
        }
    }, [])

    // ── Socket connection ──
    const connectToSocketServer = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect()
            socketRef.current = null
        }
        socketRef.current = io.connect(server_url, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnectionAttempts: 5,
        })
        socketRef.current.on('signal', gotMessageFromServer)

        // Register event listeners once (outside 'connect') to avoid duplicates on reconnect
        socketRef.current.on('chat-message', (data, sender, socketId, timestamp) => {
            const name = participantNamesRef.current[socketId]?.username || sender || 'Participant'
            chat.addMessage(data, name, socketId, timestamp)
        })
        socketRef.current.on('error-message', (msg) => {
            chat.addMessage(msg, 'System', null, Date.now())
        })

        socketRef.current.on('user-left', (id) => {
            if (connectionsRef.current[id]) {
                connectionsRef.current[id].close()
                delete connectionsRef.current[id]
            }
            room.removeParticipant(id)
            setVideos(prev => prev.filter(v => v.socketId !== id))
            room.setPinnedVideo(prev => prev === id ? null : prev)
            videoRef.current = videoRef.current.filter(v => v.socketId !== id)
        })

        socketRef.current.on('hand-raise', (id, raised) => room.updateRemoteHandRaise(id, raised))
        socketRef.current.on('reaction', (id, emoji) => room.addRemoteReaction(id, emoji))
        socketRef.current.on('typing', (id, isTyping) => chat.updateTypingUser(id, isTyping))

        lobby.registerListeners(socketRef.current)

        socketRef.current.on('connect', async () => {
            // Clean up stale P2P connections from before the reconnect
            for (const id in connectionsRef.current) {
                try { connectionsRef.current[id].close() }
                catch (e) { /* peer already gone */ }
            }
            connectionsRef.current = {}

            socketRef.current.emit('join-call', window.location.pathname, username, getAvatar())
            socketIdRef.current = socketRef.current.id
            await chat.initE2E()

            if (sfuModeRef.current) {
                socketRef.current.on('new-producer', async ({ producerId, socketId: prodSocketId }) => {
                    if (!sfuClientRef.current) return
                    try {
                        const consumer = await sfuClientRef.current.consume(producerId)
                        if (!consumer) return
                        addRemoteTrack(prodSocketId, consumer.track)
                    } catch (e) {
                        console.warn('SFU consume failed:', e.message)
                    }
                })
                socketRef.current.on('producer-closed', () => { })
            }

            socketRef.current.on('user-joined', async (id, participants) => {
                participants.forEach(p => {
                    participantNamesRef.current[p.socketId] = { username: p.username, avatar: p.avatar }
                })

                if (sfuModeRef.current && id === socketIdRef.current) {
                    try {
                        sfuClientRef.current = new SfuClient(socketRef.current)
                        await sfuClientRef.current.load()
                        await sfuClientRef.current.createSendTransport()
                        await sfuClientRef.current.createRecvTransport()
                        if (window.localStream) {
                            for (const track of window.localStream.getTracks()) {
                                await sfuClientRef.current.produce(track)
                            }
                        }
                        const existing = await sfuClientRef.current.getExistingProducers()
                        for (const { producerId, socketId: prodSocketId } of existing) {
                            const consumer = await sfuClientRef.current.consume(producerId)
                            if (consumer) addRemoteTrack(prodSocketId, consumer.track)
                        }
                    } catch (err) {
                        console.warn('SFU init failed, falling back to P2P:', err.message)
                        sfuModeRef.current = false
                        setSfuActive(false)
                    }
                }

                if (!sfuModeRef.current) {
                    participants.forEach(({ socketId: pid }) => {
                        if (pid === socketIdRef.current || connectionsRef.current[pid]) return
                        connectionsRef.current[pid] = new RTCPeerConnection(iceConfigRef.current)
                        connectionsRef.current[pid].onicecandidate = (event) => {
                            if (event.candidate != null) {
                                socketRef.current?.emit('signal', pid, JSON.stringify({ ice: event.candidate }))
                            }
                        }
                        connectionsRef.current[pid].oniceconnectionstatechange = () => {
                            const state = connectionsRef.current[pid]?.iceConnectionState
                            if (state === 'failed') {
                                connectionsRef.current[pid]?.createOffer({ iceRestart: true })
                                    .then(desc => {
                                        connectionsRef.current[pid]?.setLocalDescription(desc)
                                            .then(() => socketRef.current?.emit('signal', pid, JSON.stringify({ sdp: connectionsRef.current[pid].localDescription })))
                                    }).catch(e => console.warn('ICE restart failed:', e.message))
                            }
                        }
                        connectionsRef.current[pid].ontrack = (event) => {
                            if (event.streams[0]) addRemoteStream(pid, event.streams[0])
                        }
                        connectionsRef.current[pid].onaddstream = (event) => {
                            addRemoteStream(pid, event.stream)
                        }
                        const stream = window.localStream || makeBlackSilenceStream()
                        if (!window.localStream) window.localStream = stream
                        stream.getTracks().forEach(track => connectionsRef.current[pid].addTrack(track, stream))
                    })

                    if (id === socketIdRef.current) {
                        for (const id2 in connectionsRef.current) {
                            if (id2 === socketIdRef.current) continue
                            connectionsRef.current[id2].createOffer().then(desc => {
                                connectionsRef.current[id2].setLocalDescription(desc)
                                    .then(() => socketRef.current?.emit('signal', id2, JSON.stringify({ sdp: connectionsRef.current[id2].localDescription })))
                                    .catch(e => console.warn('WebRTC offer setLocal failed:', e.message))
                            })
                        }
                    }
                }
            })
        })
        // Deps: username changes require a fresh socket; other deps are stable refs.
        // Hook objects (chat, room, lobby) are excluded because they change identity every
        // render but their inner functions close over the same refs. Including them would
        // cause infinite reconnect loops.
    }, [username, gotMessageFromServer, addRemoteStream, addRemoteTrack]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Get media + connect ──
    // connectToSocketServer is the only real dep; media.startMedia is a stable ref
    const getMedia = useCallback(async () => {
        try {
            const res = await fetch(`${server_url}/api/v1/ice-config`)
            const data = await res.json()
            if (data.iceServers) iceConfigRef.current = { iceServers: data.iceServers }
        } catch (e) {
            console.warn('Failed to fetch ICE config, using defaults:', e.message)
        }
        try {
            const res = await fetch(`${server_url}/api/v1/sfu-status`)
            const data = await res.json()
            sfuModeRef.current = data.enabled === true
            setSfuActive(data.enabled === true)
        } catch (e) {
            console.warn('Failed to fetch SFU status, defaulting to P2P:', e.message)
        }
        media.startMedia()
        connectToSocketServer()
    }, [connectToSocketServer]) // eslint-disable-line react-hooks/exhaustive-deps

    const connect = useCallback(() => {
        setAskForUsername(false)
        getMedia()
    }, [getMedia])

    const handleEndCall = useCallback(() => {
        cleanupCall()
        window.location.href = '/'
    }, [cleanupCall])

    // ── Helpers ──
    const getName = (socketId) => {
        const p = participantNamesRef.current[socketId]
        return p ? p.username : 'Participant'
    }
    const getAvatarFor = (socketId) => {
        const p = participantNamesRef.current[socketId]
        return p ? p.avatar : '😊'
    }

    // ── Render ──
    if (askForUsername) {
        return <PreJoinLobby localVideoRef={localVideoRef} username={username} setUsername={setUsername} connect={connect} />
    }

    if (lobby.waitingStatus === 'waiting') {
        return <WaitingScreen localVideoRef={localVideoRef} username={username} onLeave={handleEndCall} />
    }

    if (lobby.waitingStatus === 'rejected') {
        return <RejectedScreen />
    }

    return (
        <main className={styles.meetVideoContainer} aria-label="Video meeting room">
            {room.copyToast && <div className={styles.copyToast}>Link copied!</div>}

            <div className={styles.reactionsContainer}>
                {room.activeReactions.map(r => (
                    <div key={r.id} className={styles.floatingReaction}>
                        <span className={styles.reactionEmoji}>{r.emoji}</span>
                        <span className={styles.reactionName}>
                            {r.socketId === socketIdRef.current ? 'You' : (r.socketId || 'Participant')}
                        </span>
                    </div>
                ))}
            </div>

            {/* Host Waiting Room Panel */}
            {lobby.isHost && showWaitingPanel && (
                <aside className={styles.waitingRoomPanel} aria-label="Waiting room">
                    <div className={styles.waitingPanelHeader}>
                        <span className={styles.chatTitle}>Waiting Room</span>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            {lobby.waitingUsers.length > 1 && (
                                <button className={styles.admitAllBtn} onClick={lobby.admitAll}>Admit All</button>
                            )}
                            <IconButton onClick={() => setShowWaitingPanel(false)} size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}><CloseIcon fontSize="small" /></IconButton>
                        </div>
                    </div>
                    <div className={styles.waitingPanelList}>
                        {lobby.waitingUsers.length === 0 ? (
                            <div className={styles.noMessages}><p>No one waiting</p></div>
                        ) : (
                            lobby.waitingUsers.map(u => (
                                <div key={u.socketId} className={styles.waitingUserCard}>
                                    <div className={styles.waitingUserLeft}>
                                        <span className={styles.waitingUserAvatar}>{u.avatar}</span>
                                        <span className={styles.waitingUserName}>{u.username}</span>
                                    </div>
                                    <div className={styles.waitingUserActions}>
                                        <button className={styles.admitBtn} onClick={() => lobby.admitUser(u.socketId)}>Accept</button>
                                        <button className={styles.rejectBtn} onClick={() => lobby.rejectUser(u.socketId)}>Reject</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </aside>
            )}

            <VideoGrid videos={videos} room={room} getName={getName} getAvatarFor={getAvatarFor} />

            <video className={room.localVideoLarge ? styles.meetUserVideoLarge : styles.meetUserVideo} ref={localVideoRef} autoPlay muted onClick={room.handleLocalVideoClick} title={room.localVideoLarge ? 'Click to minimize' : 'Click to enlarge your video'} />
            <div className={room.localVideoLarge ? styles.localLabelLarge : styles.localLabel}>
                <span style={{ marginRight: '0.3rem' }}>{getAvatar()}</span>
                {username ? `${username} (You)` : 'You'}
                {room.handRaised && <span> ✋</span>}
                {lobby.isHost && <span className={styles.hostBadge}>Host</span>}
            </div>

            {showModal && <ChatPanel chat={chat} username={username} onClose={() => setModal(false)} />}

            <MeetingControls
                media={media} room={room} chat={chat} lobby={lobby}
                videos={videos} sfuActive={sfuActive} networkQuality={networkQuality}
                showModal={showModal} setModal={setModal}
                showWaitingPanel={showWaitingPanel} setShowWaitingPanel={setShowWaitingPanel}
                handleEndCall={handleEndCall}
            />
        </main>
    )
}
