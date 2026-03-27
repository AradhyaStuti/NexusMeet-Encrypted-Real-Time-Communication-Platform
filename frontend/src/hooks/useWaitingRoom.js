import { useState, useCallback } from 'react'

/**
 * Manages waiting room state for both host and joining users.
 * - Host sees who's waiting and can admit/reject
 * - Joiners see their admission status
 *
 * Call registerListeners(socket) after the socket connects.
 */
export function useWaitingRoom({ socketRef }) {
    const [waitingStatus, setWaitingStatus] = useState(null) // null | 'waiting' | 'admitted' | 'rejected'
    const [isHost, setIsHost] = useState(false)
    const [waitingUsers, setWaitingUsers] = useState([])

    /** Call this inside the socket 'connect' handler to register listeners */
    const registerListeners = useCallback((socket) => {
        socket.on('waiting-room-status', ({ status }) => setWaitingStatus(status))
        socket.on('host-status', (host) => setIsHost(host))
        socket.on('waiting-room-update', (list) => setWaitingUsers(list))
    }, [])

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
        admitUser, rejectUser, admitAll, registerListeners,
    }
}
