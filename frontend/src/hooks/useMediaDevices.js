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

/** Safely stop all tracks on a stream without throwing */
function stopTracks(stream) {
    try { stream?.getTracks().forEach(t => t.stop()) }
    catch (e) { /* tracks already stopped or stream detached */ }
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
        let hasVideo = false
        let hasAudio = false

        try {
            await navigator.mediaDevices.getUserMedia({ video: true })
            hasVideo = true
            setVideoAvailable(true)
        } catch { setVideoAvailable(false) }

        try {
            await navigator.mediaDevices.getUserMedia({ audio: true })
            hasAudio = true
            setAudioAvailable(true)
        } catch { setAudioAvailable(false) }

        setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia)

        try {
            if (hasVideo || hasAudio) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: hasVideo, audio: hasAudio })
                window.localStream = stream
                if (localVideoRef.current) localVideoRef.current.srcObject = stream
            }
        } catch (e) {
            console.warn('Failed to get initial media stream:', e.message)
        }
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
                    .catch(e => console.warn('Signal after track replace failed:', e.message))
            })
        }
    }, [connectionsRef, socketRef])

    const getUserMediaSuccess = useCallback((stream) => {
        stopTracks(window.localStream)
        window.localStream = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        _replaceTracksOnPeers(stream)

        stream.getTracks().forEach(track => {
            track.onended = () => {
                setVideo(false)
                setAudio(false)
                stopTracks(localVideoRef.current?.srcObject)
                const bs = makeBlackSilenceStream()
                window.localStream = bs
                if (localVideoRef.current) localVideoRef.current.srcObject = bs
                _replaceTracksOnPeers(bs)
            }
        })
    }, [localVideoRef, _replaceTracksOnPeers])

    const getUserMedia = useCallback((videoOn, audioOn, videoAvail, audioAvail) => {
        if ((videoOn && videoAvail) || (audioOn && audioAvail)) {
            navigator.mediaDevices.getUserMedia({ video: videoOn && videoAvail, audio: audioOn && audioAvail })
                .then(getUserMediaSuccess)
                .catch(e => console.warn('getUserMedia failed:', e.message))
        } else {
            stopTracks(localVideoRef.current?.srcObject)
        }
    }, [getUserMediaSuccess, localVideoRef])

    const getDisplayMediaSuccess = useCallback((stream) => {
        stopTracks(window.localStream)
        window.localStream = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        _replaceTracksOnPeers(stream)

        stream.getTracks().forEach(track => {
            track.onended = () => {
                setScreen(false)
                stopTracks(localVideoRef.current?.srcObject)
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
                .catch(e => console.warn('getDisplayMedia failed:', e.message))
        }
    }, [getDisplayMediaSuccess])

    /** Force-start camera + mic (call when entering the meeting) */
    const startMedia = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            getUserMediaSuccess(stream)
            setVideo(true)
            setAudio(true)
        } catch {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                getUserMediaSuccess(stream)
                setVideo(true)
            } catch {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
                    getUserMediaSuccess(stream)
                    setAudio(true)
                } catch (e) {
                    console.warn('No media devices available:', e.message)
                }
            }
        }
    }, [getUserMediaSuccess])

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
        startMedia,
    }
}
