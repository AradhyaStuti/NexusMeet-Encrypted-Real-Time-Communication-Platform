import { useEffect, useRef, useState, useCallback } from 'react'
import io from "socket.io-client"
import { Badge, IconButton, TextField, Tooltip } from '@mui/material'
import { Button } from '@mui/material'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import styles from "../styles/videoComponent.module.css"
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

const server_url = server

// ── Fallback ICE config (used until server responds) ──
const DEFAULT_ICE_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
    ]
}

// ── Reaction emojis ──
const REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '🔥']

export default function VideoMeetComponent() {
    const socketRef = useRef(null)
    const socketIdRef = useRef(null)
    const localVideoref = useRef(null)
    const connectionsRef = useRef({})          // RTCPeerConnection map
    const chatEndRef = useRef(null)            // auto-scroll chat
    const iceConfigRef = useRef(DEFAULT_ICE_CONFIG) // dynamic ICE with TURN

    const [videoAvailable, setVideoAvailable] = useState(true)
    const [audioAvailable, setAudioAvailable] = useState(true)
    const [video, setVideo] = useState([])
    const [audio, setAudio] = useState()
    const [screen, setScreen] = useState()
    const [showModal, setModal] = useState(false)
    const [screenAvailable, setScreenAvailable] = useState()
    const [messages, setMessages] = useState([])
    const [message, setMessage] = useState("")
    const [newMessages, setNewMessages] = useState(0)
    const [askForUsername, setAskForUsername] = useState(true)
    const [username, setUsername] = useState("")
    const videoRef = useRef([])
    const [videos, setVideos] = useState([])

    // ── Spotlight, Volume, Hover ──
    const [pinnedVideo, setPinnedVideo] = useState(null)
    const [localVideoLarge, setLocalVideoLarge] = useState(false)
    const [videoVolumes, setVideoVolumes] = useState({})
    const [hoveredVideo, setHoveredVideo] = useState(null)
    const [copyToast, setCopyToast] = useState(false)

    // ── Participant names (from server) ──
    const participantNames = useRef({})         // { socketId: { username, avatar } }

    // ── Hand raise ──
    const [handRaised, setHandRaised] = useState(false)
    const [raisedHands, setRaisedHands] = useState({}) // { socketId: true }

    // ── Reactions ──
    const [activeReactions, setActiveReactions] = useState([]) // [{ id, socketId, emoji }]
    const [showReactionPicker, setShowReactionPicker] = useState(false)

    // ── Typing ──
    const [typingUsers, setTypingUsers] = useState(new Set())
    const typingTimeout = useRef(null)

    // ── Network quality ──
    const [networkQuality, setNetworkQuality] = useState('good') // good | fair | poor

    // Refs for volume sync
    const remoteVideoElems = useRef({})

    // ── Init: check permissions ──
    useEffect(() => {
        getPermissions()
        return () => cleanupCall()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keyboard shortcuts ──
    useEffect(() => {
        if (askForUsername) return

        const handleKeyDown = (e) => {
            // Don't trigger shortcuts when typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

            switch (e.key.toLowerCase()) {
                case 'm': handleAudio(); break
                case 'v': handleVideo(); break
                case 'e': handleEndCall(); break
                case 'c': setModal(prev => { if (!prev) setNewMessages(0); return !prev }); break
                case 'h': toggleHandRaise(); break
                default: break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [askForUsername, audio, video, handRaised]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Auto-scroll chat ──
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages])

    // ── Network quality monitor ──
    useEffect(() => {
        if (askForUsername) return

        const interval = setInterval(async () => {
            const connections = connectionsRef.current
            for (const id in connections) {
                try {
                    const stats = await connections[id].getStats()
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            const rtt = report.currentRoundTripTime
                            if (rtt !== undefined) {
                                if (rtt < 0.15) setNetworkQuality('good')
                                else if (rtt < 0.4) setNetworkQuality('fair')
                                else setNetworkQuality('poor')
                            }
                        }
                    })
                } catch { /* peer may be closed */ }
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [askForUsername])

    // ── Cleanup all connections ──
    const cleanupCall = useCallback(() => {
        try {
            const localStream = window.localStream
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop())
                window.localStream = null
            }
        } catch { }

        // Close all peer connections
        for (const id in connectionsRef.current) {
            try { connectionsRef.current[id].close() } catch { }
        }
        connectionsRef.current = {}

        // Disconnect socket
        if (socketRef.current) {
            socketRef.current.disconnect()
            socketRef.current = null
        }
    }, [])

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true })
            videoPermission.getTracks().forEach(t => t.stop())
            setVideoAvailable(true)
        } catch {
            setVideoAvailable(false)
        }

        try {
            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true })
            audioPermission.getTracks().forEach(t => t.stop())
            setAudioAvailable(true)
        } catch {
            setAudioAvailable(false)
        }

        setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia)

        try {
            const hasVideo = await navigator.mediaDevices.getUserMedia({ video: true }).then(() => true).catch(() => false)
            const hasAudio = await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => true).catch(() => false)

            if (hasVideo || hasAudio) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({
                    video: hasVideo,
                    audio: hasAudio,
                })
                window.localStream = userMediaStream
                if (localVideoref.current) {
                    localVideoref.current.srcObject = userMediaStream
                }
            }
        } catch (error) {
            console.log("[PERMISSIONS]", error)
        }
    }

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia()
        }
    }, [video, audio]) // eslint-disable-line react-hooks/exhaustive-deps

    const getMedia = async () => {
        // Fetch ICE/TURN config from server before connecting
        try {
            const res = await fetch(`${server_url}/api/v1/ice-config`)
            const data = await res.json()
            if (data.iceServers) {
                iceConfigRef.current = { iceServers: data.iceServers }
            }
        } catch {
            // Fallback to default STUN-only config
        }

        setVideo(videoAvailable)
        setAudio(audioAvailable)
        connectToSocketServer()
    }

    const getUserMediaSuccess = (stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()) } catch { }

        window.localStream = stream
        if (localVideoref.current) localVideoref.current.srcObject = stream

        const connections = connectionsRef.current
        for (const id in connections) {
            if (id === socketIdRef.current) continue

            // Replace tracks instead of adding new streams (modern API)
            const senders = connections[id].getSenders()
            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track?.kind === track.kind)
                if (sender) {
                    sender.replaceTrack(track)
                } else {
                    connections[id].addTrack(track, stream)
                }
            })

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => socketRef.current?.emit('signal', id, JSON.stringify({ sdp: connections[id].localDescription })))
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false)
            setAudio(false)
            try {
                localVideoref.current?.srcObject?.getTracks().forEach(t => t.stop())
            } catch { }

            const blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            if (localVideoref.current) localVideoref.current.srcObject = window.localStream

            for (const id in connectionsRef.current) {
                const senders = connectionsRef.current[id].getSenders()
                window.localStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track?.kind === track.kind)
                    if (sender) sender.replaceTrack(track)
                })
                connectionsRef.current[id].createOffer().then((description) => {
                    connectionsRef.current[id].setLocalDescription(description)
                        .then(() => socketRef.current?.emit('signal', id, JSON.stringify({ sdp: connectionsRef.current[id].localDescription })))
                        .catch(e => console.log(e))
                })
            }
        })
    }

    const getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .catch((e) => console.log(e))
        } else {
            try {
                localVideoref.current?.srcObject?.getTracks().forEach(t => t.stop())
            } catch { }
        }
    }

    const getDisplayMediaSuccess = (stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()) } catch { }

        window.localStream = stream
        if (localVideoref.current) localVideoref.current.srcObject = stream

        const connections = connectionsRef.current
        for (const id in connections) {
            if (id === socketIdRef.current) continue
            const senders = connections[id].getSenders()
            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track?.kind === track.kind)
                if (sender) sender.replaceTrack(track)
                else connections[id].addTrack(track, stream)
            })
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => socketRef.current?.emit('signal', id, JSON.stringify({ sdp: connections[id].localDescription })))
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)
            try {
                localVideoref.current?.srcObject?.getTracks().forEach(t => t.stop())
            } catch { }
            const blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            if (localVideoref.current) localVideoref.current.srcObject = window.localStream
            getUserMedia()
        })
    }

    const getDisplayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDisplayMediaSuccess)
                    .catch((e) => console.log(e))
            }
        }
    }

    const gotMessageFromServer = (fromId, message) => {
        const signal = JSON.parse(message)
        const connections = connectionsRef.current

        if (fromId !== socketIdRef.current && connections[fromId]) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current?.emit('signal', fromId, JSON.stringify({ sdp: connections[fromId].localDescription }))
                            }).catch(e => console.log(e))
                        }).catch(e => console.log(e))
                    }
                }).catch(e => console.log(e))
            }
            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }

    const connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: true })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {
            // Send join with username and avatar
            socketRef.current.emit('join-call', window.location.href, username, getAvatar())
            socketIdRef.current = socketRef.current.id

            socketRef.current.on('chat-message', addMessage)

            socketRef.current.on('error-message', (msg) => {
                setMessages(prev => [...prev, { sender: 'System', data: msg, timestamp: Date.now() }])
            })

            socketRef.current.on('user-left', (id) => {
                // Close & clean up the peer connection
                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close()
                    delete connectionsRef.current[id]
                }
                delete remoteVideoElems.current[id]

                setVideos((videos) => videos.filter((v) => v.socketId !== id))
                setPinnedVideo(prev => prev === id ? null : prev)
                setRaisedHands(prev => { const next = { ...prev }; delete next[id]; return next })
                participantNames.current = { ...participantNames.current }
                delete participantNames.current[id]
            })

            // ── Hand raise from others ──
            socketRef.current.on('hand-raise', (id, raised) => {
                setRaisedHands(prev => raised ? { ...prev, [id]: true } : (() => { const n = { ...prev }; delete n[id]; return n })())
            })

            // ── Reactions from others ──
            socketRef.current.on('reaction', (id, emoji) => {
                const reactionId = Date.now() + Math.random()
                setActiveReactions(prev => [...prev, { id: reactionId, socketId: id, emoji }])
                setTimeout(() => {
                    setActiveReactions(prev => prev.filter(r => r.id !== reactionId))
                }, 3000)
            })

            // ── Typing indicator ──
            socketRef.current.on('typing', (id, isTyping) => {
                setTypingUsers(prev => {
                    const next = new Set(prev)
                    isTyping ? next.add(id) : next.delete(id)
                    return next
                })
            })

            // ── User joined — receives full participant list ──
            socketRef.current.on('user-joined', (id, participants) => {
                // Update participant name map
                participants.forEach(p => {
                    participantNames.current[p.socketId] = { username: p.username, avatar: p.avatar }
                })

                participants.forEach((participant) => {
                    const socketListId = participant.socketId
                    if (socketListId === socketIdRef.current) return

                    // Don't recreate existing connections
                    if (connectionsRef.current[socketListId]) return

                    connectionsRef.current[socketListId] = new RTCPeerConnection(iceConfigRef.current)

                    connectionsRef.current[socketListId].onicecandidate = (event) => {
                        if (event.candidate != null) {
                            socketRef.current?.emit('signal', socketListId, JSON.stringify({ ice: event.candidate }))
                        }
                    }

                    // ── ICE connection state — detect drops ──
                    connectionsRef.current[socketListId].oniceconnectionstatechange = () => {
                        const state = connectionsRef.current[socketListId]?.iceConnectionState
                        if (state === 'failed') {
                            // Attempt ICE restart
                            connectionsRef.current[socketListId]?.createOffer({ iceRestart: true })
                                .then(desc => {
                                    connectionsRef.current[socketListId]?.setLocalDescription(desc)
                                        .then(() => socketRef.current?.emit('signal', socketListId, JSON.stringify({ sdp: connectionsRef.current[socketListId].localDescription })))
                                })
                                .catch(() => { })
                        }
                    }

                    connectionsRef.current[socketListId].ontrack = (event) => {
                        const stream = event.streams[0]
                        if (!stream) return

                        const existing = videoRef.current.find(v => v.socketId === socketListId)
                        if (existing) {
                            setVideos(videos => {
                                const updated = videos.map(v =>
                                    v.socketId === socketListId ? { ...v, stream } : v
                                )
                                videoRef.current = updated
                                return updated
                            })
                        } else {
                            const newVideo = { socketId: socketListId, stream, autoplay: true, playsinline: true }
                            setVideos(videos => {
                                const updated = [...videos, newVideo]
                                videoRef.current = updated
                                return updated
                            })
                        }
                    }

                    // Also keep onaddstream for backward compat with older browsers
                    connectionsRef.current[socketListId].onaddstream = (event) => {
                        const existing = videoRef.current.find(v => v.socketId === socketListId)
                        if (existing) {
                            setVideos(videos => {
                                const updated = videos.map(v =>
                                    v.socketId === socketListId ? { ...v, stream: event.stream } : v
                                )
                                videoRef.current = updated
                                return updated
                            })
                        } else {
                            const newVideo = { socketId: socketListId, stream: event.stream, autoplay: true, playsinline: true }
                            setVideos(videos => {
                                const updated = [...videos, newVideo]
                                videoRef.current = updated
                                return updated
                            })
                        }
                    }

                    if (window.localStream) {
                        window.localStream.getTracks().forEach(track => {
                            connectionsRef.current[socketListId].addTrack(track, window.localStream)
                        })
                    } else {
                        const blackSilence = (...args) => new MediaStream([black(...args), silence()])
                        window.localStream = blackSilence()
                        window.localStream.getTracks().forEach(track => {
                            connectionsRef.current[socketListId].addTrack(track, window.localStream)
                        })
                    }
                })

                // Create offers if WE are the one who just joined
                if (id === socketIdRef.current) {
                    for (const id2 in connectionsRef.current) {
                        if (id2 === socketIdRef.current) continue
                        connectionsRef.current[id2].createOffer().then((description) => {
                            connectionsRef.current[id2].setLocalDescription(description)
                                .then(() => socketRef.current?.emit('signal', id2, JSON.stringify({ sdp: connectionsRef.current[id2].localDescription })))
                                .catch(e => console.log(e))
                        })
                    }
                }
            })
        })
    }

    const silence = () => {
        const ctx = new AudioContext()
        const oscillator = ctx.createOscillator()
        const dst = oscillator.connect(ctx.createMediaStreamDestination())
        oscillator.start()
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }

    const black = ({ width = 640, height = 480 } = {}) => {
        const canvas = Object.assign(document.createElement("canvas"), { width, height })
        canvas.getContext('2d').fillRect(0, 0, width, height)
        const stream = canvas.captureStream()
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    const handleVideo = () => setVideo(!video)
    const handleAudio = () => setAudio(!audio)

    useEffect(() => {
        if (screen !== undefined) getDisplayMedia()
    }, [screen]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleScreen = () => setScreen(!screen)

    const handleEndCall = () => {
        cleanupCall()
        window.location.href = "/"
    }

    const addMessage = (data, sender, socketIdSender, timestamp) => {
        setMessages((prev) => [...prev, { sender, data, timestamp }])
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prev) => prev + 1)
        }
    }

    const sendMessage = () => {
        if (!message.trim()) return
        socketRef.current?.emit('chat-message', message, username)
        setMessage("")
        // Clear typing indicator
        socketRef.current?.emit('typing', false)
    }

    const connect = () => {
        setAskForUsername(false)
        getMedia()
    }

    const handleChatKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    // ── Typing indicator emission ──
    const handleMessageChange = (e) => {
        setMessage(e.target.value)
        socketRef.current?.emit('typing', true)
        clearTimeout(typingTimeout.current)
        typingTimeout.current = setTimeout(() => {
            socketRef.current?.emit('typing', false)
        }, 2000)
    }

    // ── Spotlight ──
    const handlePinToggle = (socketId) => {
        setLocalVideoLarge(false)
        setPinnedVideo(prev => prev === socketId ? null : socketId)
    }

    const handleLocalVideoClick = () => {
        setPinnedVideo(null)
        setLocalVideoLarge(prev => !prev)
    }

    // ── Volume ──
    const handleVolumeChange = (socketId, val) => {
        setVideoVolumes(prev => ({ ...prev, [socketId]: val }))
        const el = remoteVideoElems.current[socketId]
        if (el) el.volume = val / 100
    }

    const assignRemoteRef = (el, socketId, stream) => {
        if (el && stream) {
            el.srcObject = stream
            el.volume = (videoVolumes[socketId] ?? 100) / 100
            remoteVideoElems.current[socketId] = el
        }
    }

    // ── Copy meeting link ──
    const copyMeetingLink = () => {
        navigator.clipboard.writeText(window.location.href).catch(() => { })
        setCopyToast(true)
        setTimeout(() => setCopyToast(false), 2000)
    }

    // ── Hand raise ──
    const toggleHandRaise = () => {
        const next = !handRaised
        setHandRaised(next)
        socketRef.current?.emit('hand-raise', next)
    }

    // ── Send reaction ──
    const sendReaction = (emoji) => {
        socketRef.current?.emit('reaction', emoji)
        setShowReactionPicker(false)
        // Show locally too
        const reactionId = Date.now() + Math.random()
        setActiveReactions(prev => [...prev, { id: reactionId, socketId: socketIdRef.current, emoji }])
        setTimeout(() => {
            setActiveReactions(prev => prev.filter(r => r.id !== reactionId))
        }, 3000)
    }

    // ── Get participant display name ──
    const getParticipantName = (socketId) => {
        return participantNames.current[socketId]?.username || `Participant`
    }

    const getParticipantAvatar = (socketId) => {
        return participantNames.current[socketId]?.avatar || '😊'
    }

    // ── Find the pinned video object ──
    const pinnedVideoObj = pinnedVideo ? videos.find(v => v.socketId === pinnedVideo) : null

    // ── Network quality indicator ──
    const networkIcon = networkQuality === 'good' ? '🟢' : networkQuality === 'fair' ? '🟡' : '🔴'

    // ── Format timestamp ──
    const formatTime = (ts) => {
        if (!ts) return ''
        const d = new Date(ts)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div>
            {askForUsername ? (
                /* ── Lobby ── */
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
                            <div className={styles.lobbyPreviewOverlay}>
                                <span>Camera Preview</span>
                            </div>
                        </div>

                        {/* Avatar row */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                            marginBottom: '1rem',
                            background: 'rgba(14,165,233,0.06)',
                            border: '1px solid rgba(14,165,233,0.14)',
                            borderRadius: '10px',
                            padding: '0.55rem 0.9rem',
                        }}>
                            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{getAvatar()}</span>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(139,154,176,0.6)', marginBottom: '0.1rem' }}>Your avatar</p>
                                <p style={{ fontSize: '0.78rem', color: 'rgba(139,154,176,0.4)' }}>Change it from the home page</p>
                            </div>
                        </div>

                        <TextField
                            fullWidth
                            label="Your Name"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && username.trim() && connect()}
                            variant="outlined"
                            size="small"
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
                                    '&.Mui-focused fieldset': { borderColor: '#0E72ED' },
                                    borderRadius: '10px',
                                    color: 'white',
                                    background: 'rgba(255,255,255,0.06)',
                                },
                                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
                                '& .MuiInputLabel-root.Mui-focused': { color: '#0E72ED' },
                                mb: 2,
                            }}
                        />

                        <Button
                            variant="contained"
                            fullWidth
                            onClick={connect}
                            disabled={!username.trim()}
                            sx={{
                                py: 1.3,
                                background: '#0E72ED',
                                borderRadius: '10px',
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: '1rem',
                                '&:hover': { background: '#0A5BC4' },
                                '&:disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
                            }}
                        >
                            Join Meeting
                        </Button>

                        {/* Keyboard shortcuts hint */}
                        <p style={{
                            textAlign: 'center', marginTop: '1rem',
                            fontSize: '0.72rem', color: 'rgba(139,154,176,0.35)',
                        }}>
                            Shortcuts: M = Mute, V = Camera, C = Chat, H = Hand, E = End
                        </p>
                    </div>
                </div>
            ) : (
                /* ── Meeting Room ── */
                <div className={styles.meetVideoContainer}>

                    {/* ── Copy toast ── */}
                    {copyToast && (
                        <div className={styles.copyToast}>Link copied!</div>
                    )}

                    {/* ── Floating Reactions ── */}
                    <div className={styles.reactionsContainer}>
                        {activeReactions.map(r => (
                            <div key={r.id} className={styles.floatingReaction}>
                                <span className={styles.reactionEmoji}>{r.emoji}</span>
                                <span className={styles.reactionName}>
                                    {r.socketId === socketIdRef.current ? 'You' : getParticipantName(r.socketId)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* ── Video Area ── */}
                    {pinnedVideo && pinnedVideoObj ? (
                        /* SPOTLIGHT MODE */
                        <div className={styles.spotlightLayout}>
                            <div className={styles.spotlightMain} onClick={() => setPinnedVideo(null)}>
                                <video
                                    ref={el => assignRemoteRef(el, pinnedVideoObj.socketId, pinnedVideoObj.stream)}
                                    autoPlay
                                    className={styles.spotlightVideo}
                                />
                                <div className={styles.spotlightOverlay}>
                                    <span className={styles.spotlightName}>
                                        {getParticipantAvatar(pinnedVideo)} {getParticipantName(pinnedVideo)}
                                        {raisedHands[pinnedVideo] && <span className={styles.handRaisedBadge}>✋</span>}
                                    </span>
                                    <span className={styles.spotlightUnpin}>Click to unpin</span>
                                </div>
                                <div className={styles.spotlightVolumeWrap} onClick={e => e.stopPropagation()}>
                                    {(videoVolumes[pinnedVideo] ?? 100) === 0
                                        ? <VolumeOffIcon sx={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }} />
                                        : <VolumeUpIcon sx={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }} />
                                    }
                                    <input
                                        type="range" min={0} max={100}
                                        value={videoVolumes[pinnedVideo] ?? 100}
                                        onChange={e => handleVolumeChange(pinnedVideo, Number(e.target.value))}
                                        className={styles.volumeSlider}
                                    />
                                    <span className={styles.volumeVal}>{videoVolumes[pinnedVideo] ?? 100}%</span>
                                </div>
                            </div>

                            <div className={styles.thumbnailStrip}>
                                {videos.filter(v => v.socketId !== pinnedVideo).map((v) => (
                                    <div
                                        key={v.socketId}
                                        className={styles.thumbnailItem}
                                        onClick={() => handlePinToggle(v.socketId)}
                                        title="Click to spotlight"
                                    >
                                        <video
                                            ref={el => assignRemoteRef(el, v.socketId, v.stream)}
                                            autoPlay
                                            className={styles.thumbnailVideo}
                                        />
                                        <span className={styles.thumbnailName}>
                                            {getParticipantAvatar(v.socketId)} {getParticipantName(v.socketId)}
                                        </span>
                                        {raisedHands[v.socketId] && <span className={styles.thumbnailHand}>✋</span>}
                                        <span className={styles.thumbnailHint}>Spotlight</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* GRID MODE */
                        <div className={styles.conferenceView}>
                            {videos.length === 0 ? (
                                <div className={styles.waitingRoom}>
                                    <div className={styles.waitingRoomIcon}>👥</div>
                                    <p className={styles.waitingRoomText}>Waiting for others to join...</p>
                                    <p className={styles.waitingRoomSub}>Share the meeting link to invite participants</p>
                                    <button className={styles.copyLinkBtn} onClick={copyMeetingLink}>
                                        Copy Invite Link
                                    </button>
                                </div>
                            ) : (
                                videos.map((v) => (
                                    <div
                                        key={v.socketId}
                                        className={styles.remoteVideoWrap}
                                        onMouseEnter={() => setHoveredVideo(v.socketId)}
                                        onMouseLeave={() => setHoveredVideo(null)}
                                    >
                                        <video
                                            ref={el => assignRemoteRef(el, v.socketId, v.stream)}
                                            autoPlay
                                            className={styles.remoteVideo}
                                        />
                                        {/* Name tag */}
                                        <span className={styles.participantLabel}>
                                            {getParticipantAvatar(v.socketId)} {getParticipantName(v.socketId)}
                                            {raisedHands[v.socketId] && <span className={styles.handRaisedBadge}> ✋</span>}
                                        </span>

                                        {/* Pin button */}
                                        <button
                                            onClick={e => { e.stopPropagation(); handlePinToggle(v.socketId) }}
                                            className={styles.pinBtn}
                                            style={{
                                                background: pinnedVideo === v.socketId ? '#0E72ED' : 'rgba(0,0,0,0.55)',
                                            }}
                                        >
                                            {pinnedVideo === v.socketId ? 'Unpin' : 'Pin'}
                                        </button>

                                        {/* Hover overlay: volume */}
                                        <div className={`${styles.videoHoverOverlay} ${hoveredVideo === v.socketId ? styles.videoHoverVisible : ''}`}>
                                            <div className={styles.hoverVolumeRow} onClick={e => e.stopPropagation()}>
                                                {(videoVolumes[v.socketId] ?? 100) === 0
                                                    ? <VolumeOffIcon sx={{ fontSize: '1.1rem', color: 'white' }} />
                                                    : <VolumeUpIcon sx={{ fontSize: '1.1rem', color: 'white' }} />
                                                }
                                                <input
                                                    type="range" min={0} max={100}
                                                    value={videoVolumes[v.socketId] ?? 100}
                                                    onChange={e => handleVolumeChange(v.socketId, Number(e.target.value))}
                                                    className={styles.volumeSlider}
                                                />
                                                <span className={styles.volumeVal}>{videoVolumes[v.socketId] ?? 100}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── Local (self) video ── */}
                    <video
                        className={localVideoLarge ? styles.meetUserVideoLarge : styles.meetUserVideo}
                        ref={localVideoref}
                        autoPlay
                        muted
                        onClick={handleLocalVideoClick}
                        title={localVideoLarge ? "Click to minimize" : "Click to enlarge your video"}
                    />
                    <div className={localVideoLarge ? styles.localLabelLarge : styles.localLabel}>
                        <span style={{ marginRight: '0.3rem' }}>{getAvatar()}</span>
                        {username ? `${username} (You)` : 'You'}
                        {handRaised && <span> ✋</span>}
                    </div>

                    {/* ── Chat Panel ── */}
                    {showModal && (
                        <div className={styles.chatRoom}>
                            <div className={styles.chatHeader}>
                                <span className={styles.chatTitle}>In-Meeting Chat</span>
                                <IconButton onClick={() => setModal(false)} size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </div>

                            <div className={styles.chattingDisplay}>
                                {messages.length === 0 ? (
                                    <div className={styles.noMessages}>
                                        <p>No messages yet</p>
                                        <span style={{ fontSize: '0.78rem', opacity: 0.5 }}>Say hello to everyone!</span>
                                    </div>
                                ) : (
                                    messages.map((item, index) => (
                                        <div key={index} className={styles.chatMessage}>
                                            <div className={styles.chatMessageHeader}>
                                                <span className={styles.chatSender}>{DOMPurify.sanitize(item.sender)}</span>
                                                <span className={styles.chatTimestamp}>{formatTime(item.timestamp)}</span>
                                            </div>
                                            <p className={styles.chatText}>{DOMPurify.sanitize(item.data)}</p>
                                        </div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Typing indicator */}
                            {typingUsers.size > 0 && (
                                <div className={styles.typingIndicator}>
                                    <span className={styles.typingDots}>
                                        <span></span><span></span><span></span>
                                    </span>
                                    {typingUsers.size === 1 ? 'Someone is typing...' : `${typingUsers.size} people typing...`}
                                </div>
                            )}

                            <div className={styles.chattingArea}>
                                <TextField
                                    value={message}
                                    onChange={handleMessageChange}
                                    onKeyDown={handleChatKeyDown}
                                    placeholder="Type a message..."
                                    size="small"
                                    multiline
                                    maxRows={3}
                                    fullWidth
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                                            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                            '&.Mui-focused fieldset': { borderColor: '#0E72ED' },
                                            borderRadius: '10px',
                                            color: 'white',
                                            fontSize: '0.88rem',
                                        },
                                        '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.35)' },
                                    }}
                                />
                                <IconButton
                                    onClick={sendMessage}
                                    disabled={!message.trim()}
                                    sx={{
                                        background: message.trim() ? '#0E72ED' : 'rgba(255,255,255,0.08)',
                                        color: 'white',
                                        borderRadius: '10px',
                                        width: '40px',
                                        height: '40px',
                                        flexShrink: 0,
                                        '&:hover': { background: '#0A5BC4' },
                                        '&:disabled': { color: 'rgba(255,255,255,0.2)' },
                                    }}
                                >
                                    <SendIcon fontSize="small" />
                                </IconButton>
                            </div>
                        </div>
                    )}

                    {/* ── Reaction Picker ── */}
                    {showReactionPicker && (
                        <div className={styles.reactionPicker}>
                            {REACTIONS.map(emoji => (
                                <button
                                    key={emoji}
                                    className={styles.reactionPickerBtn}
                                    onClick={() => sendReaction(emoji)}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Control Bar ── */}
                    <div className={styles.buttonContainers}>
                        {/* Left: participant count + network */}
                        <div className={styles.controlsLeft}>
                            <div className={styles.participantCount}>
                                <PeopleIcon sx={{ fontSize: '1rem' }} />
                                <span>{videos.length + 1}</span>
                            </div>
                            <Tooltip title={`Network: ${networkQuality}`} arrow>
                                <span className={styles.networkIndicator}>{networkIcon}</span>
                            </Tooltip>
                        </div>

                        {/* Center: main controls */}
                        <div className={styles.controlsInner}>
                            <Tooltip title={`${audio ? 'Mute' : 'Unmute'} (M)`} arrow>
                                <IconButton onClick={handleAudio} className={audio ? styles.controlBtn : styles.controlBtnOff}>
                                    {audio ? <MicIcon /> : <MicOffIcon />}
                                </IconButton>
                            </Tooltip>

                            <Tooltip title={`${video ? 'Stop Video' : 'Start Video'} (V)`} arrow>
                                <IconButton onClick={handleVideo} className={video ? styles.controlBtn : styles.controlBtnOff}>
                                    {video ? <VideocamIcon /> : <VideocamOffIcon />}
                                </IconButton>
                            </Tooltip>

                            {screenAvailable && (
                                <Tooltip title={screen ? 'Stop Sharing' : 'Share Screen'} arrow>
                                    <IconButton onClick={handleScreen} className={screen ? styles.controlBtnActive : styles.controlBtn}>
                                        {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                                    </IconButton>
                                </Tooltip>
                            )}

                            <Tooltip title="Hand Raise (H)" arrow>
                                <IconButton
                                    onClick={toggleHandRaise}
                                    className={handRaised ? styles.controlBtnActive : styles.controlBtn}
                                >
                                    <PanToolIcon />
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Reactions" arrow>
                                <IconButton
                                    onClick={() => setShowReactionPicker(prev => !prev)}
                                    className={showReactionPicker ? styles.controlBtnActive : styles.controlBtn}
                                >
                                    <span style={{ fontSize: '1.2rem' }}>😊</span>
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Chat (C)" arrow>
                                <Badge badgeContent={newMessages} max={99} color="error">
                                    <IconButton
                                        onClick={() => { setModal(!showModal); setNewMessages(0) }}
                                        className={showModal ? styles.controlBtnActive : styles.controlBtn}
                                    >
                                        <ChatIcon />
                                    </IconButton>
                                </Badge>
                            </Tooltip>

                            <Tooltip title="End Call (E)" arrow>
                                <IconButton onClick={handleEndCall} className={styles.controlBtnEnd}>
                                    <CallEndIcon />
                                </IconButton>
                            </Tooltip>
                        </div>

                        {/* Right: copy link */}
                        <div className={styles.controlsRight}>
                            <Tooltip title="Copy meeting link" arrow>
                                <IconButton onClick={copyMeetingLink} className={styles.controlBtn}>
                                    <ContentCopyIcon sx={{ fontSize: '1.1rem' }} />
                                </IconButton>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
