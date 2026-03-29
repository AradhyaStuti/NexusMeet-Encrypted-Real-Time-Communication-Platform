import { useState, useCallback } from 'react'

const REACTION_TTL = 3000

/**
 * Manages meeting room interaction state: hand raise, reactions, pin/spotlight, volume, copy link.
 */
export function useRoomControls({ socketRef, socketIdRef, remoteVideoElems }) {
    const [handRaised, setHandRaised] = useState(false)
    const [raisedHands, setRaisedHands] = useState({})
    const [activeReactions, setActiveReactions] = useState([])
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const [pinnedVideo, setPinnedVideo] = useState(null)
    const [localVideoLarge, setLocalVideoLarge] = useState(false)
    const [videoVolumes, setVideoVolumes] = useState({})
    const [hoveredVideo, setHoveredVideo] = useState(null)
    const [copyToast, setCopyToast] = useState(false)

    const toggleHandRaise = useCallback(() => {
        setHandRaised(prev => {
            const next = !prev
            socketRef.current?.emit('hand-raise', next)
            return next
        })
    }, [socketRef])

    const updateRemoteHandRaise = useCallback((id, raised) => {
        setRaisedHands(prev =>
            raised ? { ...prev, [id]: true } : (() => { const n = { ...prev }; delete n[id]; return n })()
        )
    }, [])

    const _spawnReaction = useCallback((reactionId, socketId, emoji) => {
        setActiveReactions(prev => [...prev, { id: reactionId, socketId, emoji }])
        setTimeout(() => {
            setActiveReactions(prev => prev.filter(r => r.id !== reactionId))
        }, REACTION_TTL)
    }, [])

    const sendReaction = useCallback((emoji) => {
        socketRef.current?.emit('reaction', emoji)
        setShowReactionPicker(false)
        _spawnReaction(Date.now() + Math.random(), socketIdRef.current, emoji)
    }, [socketRef, socketIdRef, _spawnReaction])

    const addRemoteReaction = useCallback((id, emoji) => {
        _spawnReaction(Date.now() + Math.random(), id, emoji)
    }, [_spawnReaction])

    const handlePinToggle = useCallback((socketId) => {
        setLocalVideoLarge(false)
        setPinnedVideo(prev => prev === socketId ? null : socketId)
    }, [])

    const handleLocalVideoClick = useCallback(() => {
        setPinnedVideo(null)
        setLocalVideoLarge(prev => !prev)
    }, [])

    const handleVolumeChange = useCallback((socketId, val) => {
        setVideoVolumes(prev => ({ ...prev, [socketId]: val }))
        const el = remoteVideoElems.current[socketId]
        if (el) el.volume = val / 100
    }, [remoteVideoElems])

    const assignRemoteRef = useCallback((el, socketId, stream, volumes) => {
        if (el && stream) {
            el.srcObject = stream
            el.volume = (volumes[socketId] ?? 100) / 100
            remoteVideoElems.current[socketId] = el
        }
    }, [remoteVideoElems])

    const copyMeetingLink = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
            .catch(e => console.warn('Clipboard write failed:', e.message))
        setCopyToast(true)
        setTimeout(() => setCopyToast(false), 2000)
    }, [])

    const removeParticipant = useCallback((id) => {
        setRaisedHands(prev => { const n = { ...prev }; delete n[id]; return n })
        delete remoteVideoElems.current[id]
    }, [remoteVideoElems])

    return {
        handRaised, raisedHands, activeReactions, showReactionPicker, setShowReactionPicker,
        pinnedVideo, setPinnedVideo, localVideoLarge, videoVolumes, hoveredVideo, setHoveredVideo,
        copyToast,
        toggleHandRaise, updateRemoteHandRaise, sendReaction, addRemoteReaction,
        handlePinToggle, handleLocalVideoClick, handleVolumeChange, assignRemoteRef,
        copyMeetingLink, removeParticipant,
    }
}
