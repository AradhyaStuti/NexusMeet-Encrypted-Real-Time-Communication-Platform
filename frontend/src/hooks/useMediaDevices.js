import { useState, useCallback } from 'react'

const silence = () => {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const dst = oscillator.connect(ctx.createMediaStreamDestination())
    oscillator.start()
    ctx.resume()
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
}

const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement('canvas'), { width, height })
    canvas.getContext('2d').fillRect(0, 0, width, height)
    const stream = canvas.captureStream()
    return Object.assign(stream.getVideoTracks()[0], { enabled: false })
}

export function makeBlackSilenceStream() {
    return new MediaStream([black(), silence()])
}

/**
 * Manages local media devices: camera, mic, screen share.
 * @param {{ localVideoRef: React.RefObject, connectionsRef: React.RefObject, socketRef: React.RefObject }} refs
 */
export function useMediaDevices({ localVideoRef, connectionsRef, socketRef }) {
    const [videoAvailable, setVideoAvailable] = useState(true)
    const [audioAvailable, setAudioAvailable] = useState(true)
    const [screenAvailable, setScreenAvailable] = useState(false)
    const [video, setVideo] = useState(true)
    const [audio, setAudio] = useState(true)
    const [screen, setScreen] = useState(false)

    const getPermissions = useCallback(async () => {
        try {
            const p = await navigator.mediaDevices.getUserMedia({ video: true })
            p.getTracks().forEach(t => t.stop())
            setVideoAvailable(true)
        } catch { setVideoAvailable(false) }

        try {
            const p = await navigator.mediaDevices.getUserMedia({ audio: true })
            p.getTracks().forEach(t => t.stop())
            setAudioAvailable(true)
        } catch { setAudioAvailable(false) }

        setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia)

        try {
            const hasVideo = await navigator.mediaDevices.getUserMedia({ video: true }).then(() => true).catch(() => false)
            const hasAudio = await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => true).catch(() => false)
            if (hasVideo || hasAudio) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: hasVideo, audio: hasAudio })
                window.localStream = stream
                if (localVideoRef.current) localVideoRef.current.srcObject = stream
            }
        } catch { }
    }, [localVideoRef])

    const _replaceTracksOnPeers = useCallback((stream) => {
        const connections = connectionsRef.current
        for (const id in connections) {
            const senders = connections[id].getSenders()
            stream.getTracks().forEach(track => {
                const sender = senders.find(s => s.track?.kind === track.kind)
                if (sender) sender.replaceTrack(track)
                else connections[id].addTrack(track, stream)
            })
            connections[id].createOffer().then(desc => {
                connections[id].setLocalDescription(desc)
                    .then(() => socketRef.current?.emit('signal', id, JSON.stringify({ sdp: connections[id].localDescription })))
                    .catch(() => { })
            })
        }
    }, [connectionsRef, socketRef])

    const getUserMediaSuccess = useCallback((stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()) } catch { }
        window.localStream = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        _replaceTracksOnPeers(stream)

        stream.getTracks().forEach(track => {
            track.onended = () => {
                setVideo(false)
                setAudio(false)
                try { localVideoRef.current?.srcObject?.getTracks().forEach(t => t.stop()) } catch { }
                const bs = makeBlackSilenceStream()
                window.localStream = bs
                if (localVideoRef.current) localVideoRef.current.srcObject = bs
                _replaceTracksOnPeers(bs)
            }
        })
    }, [localVideoRef, _replaceTracksOnPeers])

    const getUserMedia = useCallback((videoOn, audioOn, videoAvail, audioAvail) => {
        if ((videoOn && videoAvail) || (audioOn && audioAvail)) {
            navigator.mediaDevices.getUserMedia({ video: videoOn, audio: audioOn })
                .then(getUserMediaSuccess)
                .catch(() => { })
        } else {
            try { localVideoRef.current?.srcObject?.getTracks().forEach(t => t.stop()) } catch { }
        }
    }, [getUserMediaSuccess, localVideoRef])

    const getDisplayMediaSuccess = useCallback((stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()) } catch { }
        window.localStream = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        _replaceTracksOnPeers(stream)

        stream.getTracks().forEach(track => {
            track.onended = () => {
                setScreen(false)
                try { localVideoRef.current?.srcObject?.getTracks().forEach(t => t.stop()) } catch { }
                const bs = makeBlackSilenceStream()
                window.localStream = bs
                if (localVideoRef.current) localVideoRef.current.srcObject = bs
                getUserMedia(true, true, true, true)
            }
        })
    }, [localVideoRef, _replaceTracksOnPeers, getUserMedia])

    const getDisplayMedia = useCallback((screenOn) => {
        if (screenOn && navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                .then(getDisplayMediaSuccess)
                .catch(() => { })
        }
    }, [getDisplayMediaSuccess])

    const handleVideo = useCallback(() => setVideo(v => !v), [])
    const handleAudio = useCallback(() => setAudio(a => !a), [])
    const handleScreen = useCallback(() => setScreen(s => !s), [])

    return {
        videoAvailable, audioAvailable, screenAvailable,
        video, audio, screen,
        setVideo, setAudio,
        getPermissions, getUserMedia, getUserMediaSuccess,
        getDisplayMedia, getDisplayMediaSuccess,
        handleVideo, handleAudio, handleScreen,
    }
}
