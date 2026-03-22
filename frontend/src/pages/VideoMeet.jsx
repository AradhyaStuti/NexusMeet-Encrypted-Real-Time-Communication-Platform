import { useEffect, useRef, useState } from 'react'
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
import server from '../environment'
import UshaMeetXLogo from '../components/UshaMeetXLogo'
import { getAvatar } from '../components/AvatarPicker'

const server_url = server.prod;

var connections = {}

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" },
        { "urls": "stun:stun1.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {
    var socketRef = useRef()
    let socketIdRef = useRef()
    let localVideoref = useRef()

    let [videoAvailable, setVideoAvailable] = useState(true)
    let [audioAvailable, setAudioAvailable] = useState(true)
    let [video, setVideo] = useState([])
    let [audio, setAudio] = useState()
    let [screen, setScreen] = useState()
    let [showModal, setModal] = useState(false)
    let [screenAvailable, setScreenAvailable] = useState()
    let [messages, setMessages] = useState([])
    let [message, setMessage] = useState("")
    let [newMessages, setNewMessages] = useState(0)
    let [askForUsername, setAskForUsername] = useState(true)
    let [username, setUsername] = useState("")
    const videoRef = useRef([])
    let [videos, setVideos] = useState([])

    // ── New: Spotlight, Volume, Hover ──
    let [pinnedVideo, setPinnedVideo] = useState(null)       // socketId | null
    let [localVideoLarge, setLocalVideoLarge] = useState(false)
    let [videoVolumes, setVideoVolumes] = useState({})       // { socketId: 0-100 }
    let [hoveredVideo, setHoveredVideo] = useState(null)     // socketId | null
    let [copyToast, setCopyToast] = useState(false)

    // Refs to remote video DOM elements for volume sync
    const remoteVideoElems = useRef({})

    useEffect(() => {
        getPermissions()
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    let getDislayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDislayMediaSuccess)
                    .catch((e) => console.log(e))
            }
        }
    }

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true })
            if (videoPermission) setVideoAvailable(true)
            else setVideoAvailable(false)

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true })
            if (audioPermission) setAudioAvailable(true)
            else setAudioAvailable(false)

            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia)

            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable })
                if (userMediaStream) {
                    window.localStream = userMediaStream
                    if (localVideoref.current) {
                        localVideoref.current.srcObject = userMediaStream
                    }
                }
            }
        } catch (error) {
            console.log(error)
        }
    }

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia()
        }
    }, [video, audio])  // eslint-disable-line react-hooks/exhaustive-deps

    let getMedia = () => {
        setVideo(videoAvailable)
        setAudio(audioAvailable)
        connectToSocketServer()
    }

    let getUserMediaSuccess = (stream) => {
        try { window.localStream.getTracks().forEach(t => t.stop()) } catch (e) { }

        window.localStream = stream
        localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue
            connections[id].addStream(window.localStream)
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription })))
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false)
            setAudio(false)
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(t => t.stop())
            } catch (e) { }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream

            for (let id in connections) {
                connections[id].addStream(window.localStream)
                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription })))
                        .catch(e => console.log(e))
                })
            }
        })
    }

    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .catch((e) => console.log(e))
        } else {
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(t => t.stop())
            } catch (e) { }
        }
    }

    let getDislayMediaSuccess = (stream) => {
        try { window.localStream.getTracks().forEach(t => t.stop()) } catch (e) { }

        window.localStream = stream
        localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue
            connections[id].addStream(window.localStream)
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription })))
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(t => t.stop())
            } catch (e) { }
            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream
            getUserMedia()
        })
    }

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)
        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }))
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

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false })
        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', window.location.href)
            socketIdRef.current = socketRef.current.id

            socketRef.current.on('chat-message', addMessage)

            socketRef.current.on('user-left', (id) => {
                setVideos((videos) => videos.filter((v) => v.socketId !== id))
                setPinnedVideo(prev => prev === id ? null : prev)
            })

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach((socketListId) => {
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections)

                    connections[socketListId].onicecandidate = function (event) {
                        if (event.candidate != null) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
                        }
                    }

                    connections[socketListId].onaddstream = (event) => {
                        let videoExists = videoRef.current.find(v => v.socketId === socketListId)
                        if (videoExists) {
                            setVideos(videos => {
                                const updated = videos.map(v =>
                                    v.socketId === socketListId ? { ...v, stream: event.stream } : v
                                )
                                videoRef.current = updated
                                return updated
                            })
                        } else {
                            let newVideo = { socketId: socketListId, stream: event.stream, autoplay: true, playsinline: true }
                            setVideos(videos => {
                                const updated = [...videos, newVideo]
                                videoRef.current = updated
                                return updated
                            })
                        }
                    }

                    if (window.localStream !== undefined && window.localStream !== null) {
                        connections[socketListId].addStream(window.localStream)
                    } else {
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()])
                        window.localStream = blackSilence()
                        connections[socketListId].addStream(window.localStream)
                    }
                })

                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue
                        try { connections[id2].addStream(window.localStream) } catch (e) { }
                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                                .then(() => socketRef.current.emit('signal', id2, JSON.stringify({ 'sdp': connections[id2].localDescription })))
                                .catch(e => console.log(e))
                        })
                    }
                }
            })
        })
    }

    let silence = () => {
        let ctx = new AudioContext()
        let oscillator = ctx.createOscillator()
        let dst = oscillator.connect(ctx.createMediaStreamDestination())
        oscillator.start()
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }

    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height })
        canvas.getContext('2d').fillRect(0, 0, width, height)
        let stream = canvas.captureStream()
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    let handleVideo = () => { setVideo(!video) }
    let handleAudio = () => { setAudio(!audio) }

    useEffect(() => {
        if (screen !== undefined) getDislayMedia()
    }, [screen])  // eslint-disable-line react-hooks/exhaustive-deps

    let handleScreen = () => { setScreen(!screen) }

    let handleEndCall = () => {
        try {
            let tracks = localVideoref.current.srcObject.getTracks()
            tracks.forEach(t => t.stop())
        } catch (e) { }
        window.location.href = "/"
    }

    const addMessage = (data, sender, socketIdSender) => {
        setMessages((prev) => [...prev, { sender, data }])
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prev) => prev + 1)
        }
    }

    let sendMessage = () => {
        if (!message.trim()) return
        socketRef.current.emit('chat-message', message, username)
        setMessage("")
    }

    let connect = () => {
        setAskForUsername(false)
        getMedia()
    }

    const handleChatKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    // ── Spotlight: toggle pin on a remote video ──
    const handlePinToggle = (socketId) => {
        setLocalVideoLarge(false)
        setPinnedVideo(prev => prev === socketId ? null : socketId)
    }

    // ── Local video: click to enlarge / minimize ──
    const handleLocalVideoClick = () => {
        setPinnedVideo(null)
        setLocalVideoLarge(prev => !prev)
    }

    // ── Volume: 0-100 per remote participant ──
    const handleVolumeChange = (socketId, val) => {
        setVideoVolumes(prev => ({ ...prev, [socketId]: val }))
        const el = remoteVideoElems.current[socketId]
        if (el) el.volume = val / 100
    }

    // ── Assign remote video ref + set volume ──
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

    // ── Find the pinned video object ──
    const pinnedVideoObj = pinnedVideo ? videos.find(v => v.socketId === pinnedVideo) : null

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
                    </div>
                </div>
            ) : (
                /* ── Meeting Room ── */
                <div className={styles.meetVideoContainer}>

                    {/* ── Copy toast ── */}
                    {copyToast && (
                        <div className={styles.copyToast}>Link copied!</div>
                    )}

                    {/* ── Video Area ── */}
                    {pinnedVideo && pinnedVideoObj ? (
                        /* SPOTLIGHT MODE — one big video + strip */
                        <div className={styles.spotlightLayout}>
                            {/* Main spotlight video */}
                            <div className={styles.spotlightMain} onClick={() => setPinnedVideo(null)}>
                                <video
                                    ref={el => assignRemoteRef(el, pinnedVideoObj.socketId, pinnedVideoObj.stream)}
                                    autoPlay
                                    className={styles.spotlightVideo}
                                />
                                <div className={styles.spotlightOverlay}>
                                    <span className={styles.spotlightName}>
                                        Participant {videos.findIndex(v => v.socketId === pinnedVideo) + 1}
                                    </span>
                                    <span className={styles.spotlightUnpin}>📌 Tap to unpin</span>
                                </div>
                                {/* Volume for spotlighted video */}
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

                            {/* Thumbnail strip — other remote videos */}
                            <div className={styles.thumbnailStrip}>
                                {videos.filter(v => v.socketId !== pinnedVideo).map((v, i) => (
                                    <div
                                        key={v.socketId}
                                        className={styles.thumbnailItem}
                                        onClick={() => handlePinToggle(v.socketId)}
                                        title="Tap to spotlight"
                                    >
                                        <video
                                            ref={el => assignRemoteRef(el, v.socketId, v.stream)}
                                            autoPlay
                                            className={styles.thumbnailVideo}
                                        />
                                        <span className={styles.thumbnailName}>P{i + 2}</span>
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
                                videos.map((v, i) => (
                                    <div
                                        key={v.socketId}
                                        className={styles.remoteVideoWrap}
                                        onMouseEnter={() => setHoveredVideo(v.socketId)}
                                        onMouseLeave={() => setHoveredVideo(null)}
                                        onClick={() => handlePinToggle(v.socketId)}
                                        title="Tap to spotlight"
                                    >
                                        <video
                                            ref={el => assignRemoteRef(el, v.socketId, v.stream)}
                                            autoPlay
                                            className={styles.remoteVideo}
                                        />
                                        {/* Name tag */}
                                        <span className={styles.participantLabel}>Participant {i + 1}</span>

                                        {/* Hover overlay: spotlight + volume */}
                                        <div className={`${styles.videoHoverOverlay} ${hoveredVideo === v.socketId ? styles.videoHoverVisible : ''}`}>
                                            <div className={styles.hoverSpotlightHint}>📌 Tap to spotlight</div>
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
                        title={localVideoLarge ? "Tap to minimize" : "Tap to enlarge your video"}
                    />
                    {/* Label on local video */}
                    <div className={localVideoLarge ? styles.localLabelLarge : styles.localLabel}>
                        <span style={{ marginRight: '0.3rem' }}>{getAvatar()}</span>
                        {username ? `${username} (You)` : 'You'} · {localVideoLarge ? 'Tap to minimize' : 'Tap to enlarge'}
                    </div>

                    {/* ── Chat Panel ── */}
                    {showModal && (
                        <div className={styles.chatRoom}>
                            <div className={styles.chatHeader}>
                                <span className={styles.chatTitle}>💬 In-Meeting Chat</span>
                                <IconButton onClick={() => setModal(false)} size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </div>

                            <div className={styles.chattingDisplay}>
                                {messages.length === 0 ? (
                                    <div className={styles.noMessages}>
                                        <span>💬</span>
                                        <p>No messages yet</p>
                                        <span style={{ fontSize: '0.78rem', opacity: 0.5 }}>Say hello to everyone!</span>
                                    </div>
                                ) : (
                                    messages.map((item, index) => (
                                        <div key={index} className={styles.chatMessage}>
                                            <span className={styles.chatSender}>{item.sender}</span>
                                            <p className={styles.chatText}>{item.data}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className={styles.chattingArea}>
                                <TextField
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
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

                    {/* ── Control Bar ── */}
                    <div className={styles.buttonContainers}>
                        {/* Participant count — left */}
                        <div className={styles.controlsLeft}>
                            <div className={styles.participantCount}>
                                <PeopleIcon sx={{ fontSize: '1rem' }} />
                                <span>{videos.length + 1}</span>
                            </div>
                        </div>

                        {/* Main controls — center */}
                        <div className={styles.controlsInner}>
                            <Tooltip title={audio ? 'Mute' : 'Unmute'} arrow>
                                <IconButton onClick={handleAudio} className={audio ? styles.controlBtn : styles.controlBtnOff}>
                                    {audio ? <MicIcon /> : <MicOffIcon />}
                                </IconButton>
                            </Tooltip>

                            <Tooltip title={video ? 'Stop Video' : 'Start Video'} arrow>
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

                            <Tooltip title="Chat" arrow>
                                <Badge badgeContent={newMessages} max={99} color="error">
                                    <IconButton
                                        onClick={() => { setModal(!showModal); setNewMessages(0) }}
                                        className={showModal ? styles.controlBtnActive : styles.controlBtn}
                                    >
                                        <ChatIcon />
                                    </IconButton>
                                </Badge>
                            </Tooltip>

                            <Tooltip title="End Call" arrow>
                                <IconButton onClick={handleEndCall} className={styles.controlBtnEnd}>
                                    <CallEndIcon />
                                </IconButton>
                            </Tooltip>
                        </div>

                        {/* Copy link — right */}
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
