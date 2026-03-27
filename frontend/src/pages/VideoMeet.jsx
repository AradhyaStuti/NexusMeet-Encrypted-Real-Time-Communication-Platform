import { useEffect, useRef, useState, useCallback } from 'react'
import io from 'socket.io-client'
import { Badge, IconButton, TextField, Tooltip } from '@mui/material'
import { Button } from '@mui/material'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import styles from '../styles/videoComponent.module.css'
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare'
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import PeopleIcon from '@mui/icons-material/People'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PanToolIcon from '@mui/icons-material/PanTool'
import DOMPurify from 'dompurify'
import server from '../environment'
import UshaMeetXLogo from '../components/UshaMeetXLogo'
import { getAvatar } from '../components/AvatarPicker'
import { SfuClient } from '../utils/sfuClient'
import LockIcon from '@mui/icons-material/Lock'
import { useMediaDevices, makeBlackSilenceStream } from '../hooks/useMediaDevices'
import { useNetworkQuality } from '../hooks/useNetworkQuality'
import { useEncryptedChat } from '../hooks/useEncryptedChat'
import { useRoomControls } from '../hooks/useRoomControls'
import { useWaitingRoom } from '../hooks/useWaitingRoom'

const server_url = server
const DEFAULT_ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
    ],
}
const REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '🔥']

export default function VideoMeetComponent() {
    // ── Core refs ──
    const socketRef = useRef(null)
    const socketIdRef = useRef(null)
    const localVideoref = useRef(null)
    const connectionsRef = useRef({})
    const chatEndRef = useRef(null)
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

    // ── Custom hooks ──
    const media = useMediaDevices({ localVideoRef: localVideoref, connectionsRef, socketRef })
    const { networkQuality } = useNetworkQuality({ connectionsRef, active: !askForUsername })
    const chat = useEncryptedChat({ socketRef, socketIdRef })
    const room = useRoomControls({ socketRef, socketIdRef, remoteVideoElems })
    const lobby = useWaitingRoom({ socketRef })

    // ── Init ──
    useEffect(() => {
        media.getPermissions()
        return () => cleanupCall()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-get media when video/audio toggles ──
    useEffect(() => {
        if (media.video !== undefined && media.audio !== undefined) {
            media.getUserMedia(media.video, media.audio, media.videoAvailable, media.audioAvailable)
        }
    }, [media.video, media.audio]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Screen share ──
    useEffect(() => {
        if (media.screen !== undefined) media.getDisplayMedia(media.screen)
    }, [media.screen]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keyboard shortcuts ──
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

    // ── Auto-scroll chat ──
    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [chat.messages])

    // ── Cleanup ──
    const cleanupCall = useCallback(() => {
        try {
            window.localStream?.getTracks().forEach(t => t.stop())
            window.localStream = null
        } catch { }
        if (sfuClientRef.current) {
            try { sfuClientRef.current.close() } catch { }
            sfuClientRef.current = null
        }
        for (const id in connectionsRef.current) {
            try { connectionsRef.current[id].close() } catch { }
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
        try { signal = JSON.parse(message) } catch { return }
        const connections = connectionsRef.current
        if (fromId === socketIdRef.current || !connections[fromId]) return
        if (signal.sdp) {
            connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                if (signal.sdp.type === 'offer') {
                    connections[fromId].createAnswer().then(desc => {
                        connections[fromId].setLocalDescription(desc).then(() => {
                            socketRef.current?.emit('signal', fromId, JSON.stringify({ sdp: connections[fromId].localDescription }))
                        }).catch(() => { })
                    }).catch(() => { })
                }
            }).catch(() => { })
        }
        if (signal.ice) {
            connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(() => { })
        }
    }, [])

    // ── Socket connection ──
    const connectToSocketServer = useCallback(() => {
        // Prevent duplicate connections
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

        socketRef.current.on('connect', async () => {
            socketRef.current.emit('join-call', window.location.pathname, username, getAvatar())
            socketIdRef.current = socketRef.current.id
            await chat.initE2E()

            // Register waiting room listeners on this socket
            lobby.registerListeners(socketRef.current)

            socketRef.current.on('chat-message', chat.addMessage)
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

            if (sfuModeRef.current) {
                socketRef.current.on('new-producer', async ({ producerId, socketId: prodSocketId }) => {
                    if (!sfuClientRef.current) return
                    try {
                        const consumer = await sfuClientRef.current.consume(producerId)
                        if (!consumer) return
                        addRemoteTrack(prodSocketId, consumer.track)
                    } catch { }
                })
                socketRef.current.on('producer-closed', () => { })
            }

            socketRef.current.on('user-joined', async (id, participants) => {
                const participantNames = {}
                participants.forEach(p => { participantNames[p.socketId] = { username: p.username, avatar: p.avatar } })

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
                                    }).catch(() => { })
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
                                    .catch(() => { })
                            })
                        }
                    }
                }
            })
        })
    }, [username, gotMessageFromServer, chat, room, lobby, addRemoteStream, addRemoteTrack])

    // ── Get media + connect ──
    const getMedia = useCallback(async () => {
        try {
            const res = await fetch(`${server_url}/api/v1/ice-config`)
            const data = await res.json()
            if (data.iceServers) iceConfigRef.current = { iceServers: data.iceServers }
        } catch { }
        try {
            const res = await fetch(`${server_url}/api/v1/sfu-status`)
            const data = await res.json()
            sfuModeRef.current = data.enabled === true
            setSfuActive(data.enabled === true)
        } catch { }
        media.setVideo(media.videoAvailable)
        media.setAudio(media.audioAvailable)
        connectToSocketServer()
    }, [chat, media, connectToSocketServer])

    const connect = useCallback(() => {
        setAskForUsername(false)
        getMedia()
    }, [getMedia])

    const handleEndCall = useCallback(() => {
        cleanupCall()
        window.location.href = '/'
    }, [cleanupCall])

    const handleSendMessage = useCallback(() => {
        chat.sendMessage(chat.message)
        chat.setMessage('')
    }, [chat])

    const handleChatKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }, [handleSendMessage])

    // ── Derived ──
    const pinnedVideo = room.pinnedVideo
    const pinnedVideoObj = pinnedVideo ? videos.find(v => v.socketId === pinnedVideo) : null
    const networkIcon = networkQuality === 'good' ? '🟢' : networkQuality === 'fair' ? '🟡' : '🔴'
    const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    const inMeeting = !askForUsername && lobby.waitingStatus !== 'waiting' && lobby.waitingStatus !== 'rejected'

    return (
        <div>
            {/* ── PRE-JOIN LOBBY ── */}
            {askForUsername ? (
                <div className={styles.lobbyContainer}>
                    <div className={styles.lobbyCard}>
                        <div className={styles.lobbyBrand}>
                            <UshaMeetXLogo size={34} />
                            <span className={styles.lobbyBrandName}>UshaMeetX</span>
                        </div>
                        <h2 className={styles.lobbyTitle}>Ready to join?</h2>
                        <p className={styles.lobbySubtitle}>Enter your name to join the meeting</p>
                        <div className={styles.lobbyPreview}>
                            <video ref={localVideoref} autoPlay muted className={styles.lobbyVideo} />
                            <div className={styles.lobbyPreviewOverlay}><span>Camera Preview</span></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.14)', borderRadius: '10px', padding: '0.55rem 0.9rem' }}>
                            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{getAvatar()}</span>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(139,154,176,0.6)', marginBottom: '0.1rem' }}>Your avatar</p>
                                <p style={{ fontSize: '0.78rem', color: 'rgba(139,154,176,0.4)' }}>Change it from the home page</p>
                            </div>
                        </div>
                        <TextField
                            fullWidth label="Your Name" value={username}
                            onChange={e => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && username.trim() && connect()}
                            variant="outlined" size="small"
                            sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' }, '&.Mui-focused fieldset': { borderColor: '#0E72ED' }, borderRadius: '10px', color: 'white', background: 'rgba(255,255,255,0.06)' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiInputLabel-root.Mui-focused': { color: '#0E72ED' }, mb: 2 }}
                        />
                        <Button variant="contained" fullWidth onClick={connect} disabled={!username.trim()}
                            sx={{ py: 1.3, background: '#0E72ED', borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: '1rem', '&:hover': { background: '#0A5BC4' }, '&:disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}>
                            Join Meeting
                        </Button>
                        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.72rem', color: 'rgba(139,154,176,0.35)' }}>
                            Shortcuts: M = Mute, V = Camera, C = Chat, H = Hand, E = End
                        </p>
                    </div>
                </div>

            /* ── WAITING FOR ADMISSION ── */
            ) : lobby.waitingStatus === 'waiting' ? (
                <div className={styles.lobbyContainer}>
                    <div className={styles.waitingAdmissionCard}>
                        <div className={styles.lobbyBrand}>
                            <UshaMeetXLogo size={34} />
                            <span className={styles.lobbyBrandName}>UshaMeetX</span>
                        </div>
                        <div className={styles.waitingPulseRing}>
                            <div className={styles.waitingPulseInner} />
                        </div>
                        <h2 className={styles.waitingTitle}>Waiting for the host to let you in</h2>
                        <p className={styles.waitingSubtext}>The host has been notified. Please wait...</p>
                        <div className={styles.waitingPreview}>
                            <video ref={localVideoref} autoPlay muted className={styles.lobbyVideo} />
                        </div>
                        <div className={styles.waitingUserInfo}>
                            <span style={{ fontSize: '1.4rem' }}>{getAvatar()}</span>
                            <span className={styles.waitingUsername}>{username}</span>
                        </div>
                        <Button variant="outlined" onClick={handleEndCall}
                            sx={{ mt: 1, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', borderRadius: '10px', textTransform: 'none', fontWeight: 600, '&:hover': { borderColor: '#f87171', background: 'rgba(248,113,113,0.08)' } }}>
                            Leave
                        </Button>
                    </div>
                </div>

            /* ── REJECTED ── */
            ) : lobby.waitingStatus === 'rejected' ? (
                <div className={styles.lobbyContainer}>
                    <div className={styles.waitingAdmissionCard}>
                        <div className={styles.lobbyBrand}>
                            <UshaMeetXLogo size={34} />
                            <span className={styles.lobbyBrandName}>UshaMeetX</span>
                        </div>
                        <div style={{ fontSize: '3rem', margin: '1.5rem 0 0.5rem', textAlign: 'center' }}>🚫</div>
                        <h2 className={styles.waitingTitle}>You were not admitted</h2>
                        <p className={styles.waitingSubtext}>The host did not allow you to join this meeting.</p>
                        <Button variant="contained" onClick={() => { window.location.href = '/' }}
                            sx={{ mt: 2, background: '#0E72ED', borderRadius: '10px', textTransform: 'none', fontWeight: 700, '&:hover': { background: '#0A5BC4' } }}>
                            Return Home
                        </Button>
                    </div>
                </div>

            /* ── IN-MEETING ── */
            ) : (
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

                    {pinnedVideo && pinnedVideoObj ? (
                        <div className={styles.spotlightLayout}>
                            <div className={styles.spotlightMain} onClick={() => room.setPinnedVideo(null)}>
                                <video ref={el => room.assignRemoteRef(el, pinnedVideoObj.socketId, pinnedVideoObj.stream, room.videoVolumes)} autoPlay className={styles.spotlightVideo} />
                                <div className={styles.spotlightOverlay}>
                                    <span className={styles.spotlightName}>
                                        {room.pinnedVideo}
                                        {room.raisedHands[room.pinnedVideo] && <span className={styles.handRaisedBadge}>✋</span>}
                                    </span>
                                    <span className={styles.spotlightUnpin}>Click to unpin</span>
                                </div>
                                <div className={styles.spotlightVolumeWrap} onClick={e => e.stopPropagation()}>
                                    {(room.videoVolumes[room.pinnedVideo] ?? 100) === 0 ? <VolumeOffIcon sx={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }} /> : <VolumeUpIcon sx={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }} />}
                                    <input type="range" min={0} max={100} value={room.videoVolumes[room.pinnedVideo] ?? 100} onChange={e => room.handleVolumeChange(room.pinnedVideo, Number(e.target.value))} className={styles.volumeSlider} />
                                    <span className={styles.volumeVal}>{room.videoVolumes[room.pinnedVideo] ?? 100}%</span>
                                </div>
                            </div>
                            <div className={styles.thumbnailStrip}>
                                {videos.filter(v => v.socketId !== room.pinnedVideo).map((v) => (
                                    <div key={v.socketId} className={styles.thumbnailItem} onClick={() => room.handlePinToggle(v.socketId)} title="Click to spotlight">
                                        <video ref={el => room.assignRemoteRef(el, v.socketId, v.stream, room.videoVolumes)} autoPlay className={styles.thumbnailVideo} />
                                        <span className={styles.thumbnailName}>{v.socketId}</span>
                                        {room.raisedHands[v.socketId] && <span className={styles.thumbnailHand}>✋</span>}
                                        <span className={styles.thumbnailHint}>Spotlight</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.conferenceView}>
                            {videos.length === 0 ? (
                                <div className={styles.waitingRoom}>
                                    <div className={styles.waitingRoomIcon}>👥</div>
                                    <p className={styles.waitingRoomText}>Waiting for others to join...</p>
                                    <p className={styles.waitingRoomSub}>Share the meeting link to invite participants</p>
                                    <button className={styles.copyLinkBtn} onClick={room.copyMeetingLink}>Copy Invite Link</button>
                                </div>
                            ) : (
                                videos.map((v) => (
                                    <div key={v.socketId} className={styles.remoteVideoWrap} onMouseEnter={() => room.setHoveredVideo(v.socketId)} onMouseLeave={() => room.setHoveredVideo(null)}>
                                        <video ref={el => room.assignRemoteRef(el, v.socketId, v.stream, room.videoVolumes)} autoPlay className={styles.remoteVideo} />
                                        <span className={styles.participantLabel}>
                                            {v.socketId}
                                            {room.raisedHands[v.socketId] && <span className={styles.handRaisedBadge}> ✋</span>}
                                        </span>
                                        <button onClick={e => { e.stopPropagation(); room.handlePinToggle(v.socketId) }} className={styles.pinBtn} style={{ background: room.pinnedVideo === v.socketId ? '#0E72ED' : 'rgba(0,0,0,0.55)' }}>
                                            {room.pinnedVideo === v.socketId ? 'Unpin' : 'Pin'}
                                        </button>
                                        <div className={`${styles.videoHoverOverlay} ${room.hoveredVideo === v.socketId ? styles.videoHoverVisible : ''}`}>
                                            <div className={styles.hoverVolumeRow} onClick={e => e.stopPropagation()}>
                                                {(room.videoVolumes[v.socketId] ?? 100) === 0 ? <VolumeOffIcon sx={{ fontSize: '1.1rem', color: 'white' }} /> : <VolumeUpIcon sx={{ fontSize: '1.1rem', color: 'white' }} />}
                                                <input type="range" min={0} max={100} value={room.videoVolumes[v.socketId] ?? 100} onChange={e => room.handleVolumeChange(v.socketId, Number(e.target.value))} className={styles.volumeSlider} />
                                                <span className={styles.volumeVal}>{room.videoVolumes[v.socketId] ?? 100}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    <video className={room.localVideoLarge ? styles.meetUserVideoLarge : styles.meetUserVideo} ref={localVideoref} autoPlay muted onClick={room.handleLocalVideoClick} title={room.localVideoLarge ? 'Click to minimize' : 'Click to enlarge your video'} />
                    <div className={room.localVideoLarge ? styles.localLabelLarge : styles.localLabel}>
                        <span style={{ marginRight: '0.3rem' }}>{getAvatar()}</span>
                        {username ? `${username} (You)` : 'You'}
                        {room.handRaised && <span> ✋</span>}
                        {lobby.isHost && <span className={styles.hostBadge}>Host</span>}
                    </div>

                    {showModal && (
                        <aside className={styles.chatRoom} aria-label="In-meeting chat">
                            <div className={styles.chatHeader}>
                                <span className={styles.chatTitle}>In-Meeting Chat</span>
                                <IconButton onClick={() => setModal(false)} size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}><CloseIcon fontSize="small" /></IconButton>
                            </div>
                            <div className={styles.chattingDisplay}>
                                {chat.messages.length === 0 ? (
                                    <div className={styles.noMessages}><p>No messages yet</p><span style={{ fontSize: '0.78rem', opacity: 0.5 }}>Say hello to everyone!</span></div>
                                ) : (
                                    chat.messages.map((item, index) => (
                                        <div key={index} className={item.isSelf ? styles.chatMessageSelf : styles.chatMessage}>
                                            <div className={styles.chatMessageHeader}>
                                                <span className={styles.chatSender}>{item.isSelf ? 'You' : (DOMPurify.sanitize(item.sender) || 'Participant')}</span>
                                                <span className={styles.chatTimestamp}>{formatTime(item.timestamp)}</span>
                                            </div>
                                            <p className={styles.chatText}>{DOMPurify.sanitize(item.data)}</p>
                                        </div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>
                            {chat.typingUsers.size > 0 && (
                                <div className={styles.typingIndicator}>
                                    <span className={styles.typingDots}><span></span><span></span><span></span></span>
                                    {chat.typingUsers.size === 1 ? 'Someone is typing...' : `${chat.typingUsers.size} people typing...`}
                                </div>
                            )}
                            <div className={styles.chattingArea}>
                                <TextField value={chat.message} onChange={e => chat.handleMessageChange(e.target.value)} onKeyDown={handleChatKeyDown} placeholder="Type a message..." size="small" multiline maxRows={3} fullWidth
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#0E72ED' }, borderRadius: '10px', color: 'white', fontSize: '0.88rem' }, '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.35)' } }} />
                                <IconButton onClick={handleSendMessage} disabled={!chat.message.trim()}
                                    sx={{ background: chat.message.trim() ? '#0E72ED' : 'rgba(255,255,255,0.08)', color: 'white', borderRadius: '10px', width: '40px', height: '40px', flexShrink: 0, '&:hover': { background: '#0A5BC4' }, '&:disabled': { color: 'rgba(255,255,255,0.2)' } }}>
                                    <SendIcon fontSize="small" />
                                </IconButton>
                            </div>
                        </aside>
                    )}

                    {room.showReactionPicker && (
                        <div className={styles.reactionPicker}>
                            {REACTIONS.map(emoji => (
                                <button key={emoji} className={styles.reactionPickerBtn} onClick={() => room.sendReaction(emoji)}>{emoji}</button>
                            ))}
                        </div>
                    )}

                    <nav className={styles.buttonContainers} aria-label="Meeting controls">
                        <div className={styles.controlsLeft} role="status" aria-live="polite">
                            <div className={styles.participantCount} aria-label={`${videos.length + 1} participants`}><PeopleIcon sx={{ fontSize: '1rem' }} aria-hidden="true" /><span>{videos.length + 1}</span></div>
                            <Tooltip title={`Network: ${networkQuality}`} arrow><span className={styles.networkIndicator} aria-label={`Network quality: ${networkQuality}`}>{networkIcon}</span></Tooltip>
                            {chat.e2eEnabled && <Tooltip title="Chat is end-to-end encrypted" arrow><span className={styles.e2eBadge} aria-label="End-to-end encrypted"><LockIcon sx={{ fontSize: '0.7rem' }} aria-hidden="true" /> E2E</span></Tooltip>}
                            {sfuActive && <Tooltip title="SFU mode — media routed via server for scalability" arrow><span className={styles.sfuBadge} aria-label="SFU mode active">SFU</span></Tooltip>}
                        </div>
                        <div className={styles.controlsInner} role="toolbar" aria-label="Call controls">
                            <Tooltip title={`${media.audio ? 'Mute' : 'Unmute'} (M)`} arrow><IconButton onClick={media.handleAudio} aria-label={media.audio ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!media.audio} className={media.audio ? styles.controlBtn : styles.controlBtnOff}>{media.audio ? <MicIcon aria-hidden="true" /> : <MicOffIcon aria-hidden="true" />}</IconButton></Tooltip>
                            <Tooltip title={`${media.video ? 'Stop Video' : 'Start Video'} (V)`} arrow><IconButton onClick={media.handleVideo} aria-label={media.video ? 'Stop camera' : 'Start camera'} aria-pressed={!media.video} className={media.video ? styles.controlBtn : styles.controlBtnOff}>{media.video ? <VideocamIcon aria-hidden="true" /> : <VideocamOffIcon aria-hidden="true" />}</IconButton></Tooltip>
                            {media.screenAvailable && (
                                <Tooltip title={media.screen ? 'Stop Sharing' : 'Share Screen'} arrow><IconButton onClick={media.handleScreen} aria-label={media.screen ? 'Stop screen share' : 'Share screen'} aria-pressed={media.screen} className={media.screen ? styles.controlBtnActive : styles.controlBtn}>{media.screen ? <ScreenShareIcon aria-hidden="true" /> : <StopScreenShareIcon aria-hidden="true" />}</IconButton></Tooltip>
                            )}
                            <Tooltip title="Hand Raise (H)" arrow><IconButton onClick={room.toggleHandRaise} aria-label={room.handRaised ? 'Lower hand' : 'Raise hand'} aria-pressed={room.handRaised} className={room.handRaised ? styles.controlBtnActive : styles.controlBtn}><PanToolIcon aria-hidden="true" /></IconButton></Tooltip>
                            <Tooltip title="Reactions" arrow><IconButton onClick={() => room.setShowReactionPicker(prev => !prev)} aria-label="Send reaction" aria-expanded={room.showReactionPicker} className={room.showReactionPicker ? styles.controlBtnActive : styles.controlBtn}><span style={{ fontSize: '1.2rem' }} aria-hidden="true">😊</span></IconButton></Tooltip>
                            <Tooltip title="Chat (C)" arrow>
                                <Badge badgeContent={chat.newMessages} max={99} color="error">
                                    <IconButton onClick={() => { setModal(!showModal); chat.setNewMessages(0) }} aria-label={`Chat${chat.newMessages > 0 ? `, ${chat.newMessages} unread messages` : ''}`} aria-pressed={showModal} className={showModal ? styles.controlBtnActive : styles.controlBtn}><ChatIcon aria-hidden="true" /></IconButton>
                                </Badge>
                            </Tooltip>
                            {lobby.isHost && (
                                <Tooltip title="Waiting Room" arrow>
                                    <Badge badgeContent={lobby.waitingUsers.length} max={99} color="warning">
                                        <IconButton onClick={() => setShowWaitingPanel(prev => !prev)} aria-label="Waiting room" className={showWaitingPanel ? styles.controlBtnActive : styles.controlBtn}><PeopleIcon aria-hidden="true" /></IconButton>
                                    </Badge>
                                </Tooltip>
                            )}
                            <Tooltip title="End Call (E)" arrow><IconButton onClick={handleEndCall} aria-label="End call" className={styles.controlBtnEnd}><CallEndIcon aria-hidden="true" /></IconButton></Tooltip>
                        </div>
                        <div className={styles.controlsRight}>
                            <Tooltip title="Copy meeting link" arrow><IconButton onClick={room.copyMeetingLink} aria-label="Copy meeting invite link" className={styles.controlBtn}><ContentCopyIcon sx={{ fontSize: '1.1rem' }} aria-hidden="true" /></IconButton></Tooltip>
                        </div>
                    </nav>
                </main>
            )}
        </div>
    )
}
