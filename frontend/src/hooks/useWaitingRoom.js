import { useState, useCallback, useEffect } from 'react'

/**
 * Manages waiting room state for both host and joining users.
 * - Host sees who's waiting and can admit/reject
 * - Joiners see their admission status
 */
export function useWaitingRoom({ socketRef }) {
    const [waitingStatus, setWaitingStatus] = useState(null) // null | 'waiting' | 'admitted' | 'rejected'
    const [isHost, setIsHost] = useState(false)
    const [waitingUsers, setWaitingUsers] = useState([])

    useEffect(() => {
        const socket = socketRef.current
        if (!socket) return

        const onWaitingStatus = ({ status }) => setWaitingStatus(status)
        const onHostStatus = (host) => setIsHost(host)
        const onWaitingUpdate = (list) => setWaitingUsers(list)

        socket.on('waiting-room-status', onWaitingStatus)
        socket.on('host-status', onHostStatus)
        socket.on('waiting-room-update', onWaitingUpdate)

        return () => {
            socket.off('waiting-room-status', onWaitingStatus)
            socket.off('host-status', onHostStatus)
            socket.off('waiting-room-update', onWaitingUpdate)
        }
    }, [socketRef])

    const admitUser = useCallback((socketId) => {
        socketRef.current?.emit('admit-user', socketId)
    }, [socketRef])

    const rejectUser = useCallback((socketId) => {
        socketRef.current?.emit('reject-user', socketId)
    }, [socketRef])

    const admitAll = useCallback(() => {
        socketRef.current?.emit('admit-all')
    }, [socketRef])

    return {
        waitingStatus, isHost, waitingUsers,
        admitUser, rejectUser, admitAll,
    }
}
