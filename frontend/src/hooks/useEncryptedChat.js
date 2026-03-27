import { useState, useRef, useCallback } from 'react'
import { getOrCreateRoomKey, encryptMessage, decryptMessage } from '../utils/encryption'

/**
 * Manages chat state with optional E2E encryption.
 * The room key is derived from the URL hash — when sharing via "Copy Invite Link"
 * the hash is included so both users get the same key.
 * For users joining via code (no hash), the key is exchanged via socket after admission.
 */
export function useEncryptedChat({ socketRef, socketIdRef }) {
    const [messages, setMessages] = useState([])
    const [message, setMessage] = useState('')
    const [newMessages, setNewMessages] = useState(0)
    const [typingUsers, setTypingUsers] = useState(new Set())
    const [e2eEnabled, setE2eEnabled] = useState(false)
    const e2eKeyRef = useRef(null)
    const keyIsFromUrl = useRef(false)
    const typingTimeout = useRef(null)

    /** Request the room key from other participants */
    const requestKeyFromPeers = useCallback(() => {
        const socket = socketRef.current
        if (!socket) return
        socket.emit('request-e2e-key')
    }, [socketRef])

    const initE2E = useCallback(async () => {
        try {
            const { key, isNew } = await getOrCreateRoomKey()
            e2eKeyRef.current = key
            keyIsFromUrl.current = !isNew
            setE2eEnabled(true)

            const socket = socketRef.current
            if (!socket) return

            // Listen for key shared by other participants
            socket.off('e2e-key') // prevent duplicate listeners
            socket.on('e2e-key', (sharedKey) => {
                if (sharedKey && sharedKey.length >= 20) {
                    e2eKeyRef.current = sharedKey
                    window.history.replaceState(null, '', window.location.pathname + '#' + sharedKey)
                }
            })

            // When someone requests our key, share it
            socket.off('request-e2e-key')
            socket.on('request-e2e-key', () => {
                if (e2eKeyRef.current) {
                    socket.emit('share-e2e-key', e2eKeyRef.current)
                }
            })

            // If we joined via code (no hash), request key from peers
            // This works if we're the host (already in room) or will retry after admission
            if (isNew) {
                requestKeyFromPeers()
            }
        } catch { }
    }, [socketRef, requestKeyFromPeers])

    const addMessage = useCallback(async (data, sender, socketIdSender, timestamp) => {
        let plaintext = data

        if (e2eKeyRef.current && typeof data === 'string' && data.length > 0) {
            try {
                const decrypted = await decryptMessage(data, e2eKeyRef.current)
                if (decrypted !== '[encrypted message]') {
                    plaintext = decrypted
                }
                // If decryption returned fallback, the data might be plain text (not encrypted)
                // Check if it looks like base64 encoded data — if so, show fallback
                if (decrypted === '[encrypted message]') {
                    const looksEncrypted = /^[A-Za-z0-9+/=]{20,}$/.test(data.trim())
                    if (looksEncrypted) {
                        plaintext = '[encrypted message]'
                    }
                    // Otherwise it's probably just plain text, show as-is
                }
            } catch {
                // decryption threw — show as-is if it looks like plain text
                const looksEncrypted = /^[A-Za-z0-9+/=]{20,}$/.test(data.trim())
                plaintext = looksEncrypted ? '[encrypted message]' : data
            }
        }

        const isSelf = socketIdSender === socketIdRef.current
        setMessages(prev => [...prev, { sender, data: plaintext, timestamp, isSelf }])
        if (!isSelf) {
            setNewMessages(prev => prev + 1)
        }
    }, [socketIdRef])

    const sendMessage = useCallback(async (msgText) => {
        if (!msgText.trim()) return
        let payload = msgText
        if (e2eKeyRef.current) {
            try { payload = await encryptMessage(msgText, e2eKeyRef.current) } catch { }
        }
        socketRef.current?.emit('chat-message', payload, '')
        socketRef.current?.emit('typing', false)
    }, [socketRef])

    const handleMessageChange = useCallback((value) => {
        setMessage(value)
        socketRef.current?.emit('typing', true)
        clearTimeout(typingTimeout.current)
        typingTimeout.current = setTimeout(() => {
            socketRef.current?.emit('typing', false)
        }, 2000)
    }, [socketRef])

    const updateTypingUser = useCallback((id, isTyping) => {
        setTypingUsers(prev => {
            const next = new Set(prev)
            isTyping ? next.add(id) : next.delete(id)
            return next
        })
    }, [])

    return {
        messages, message, setMessage, newMessages, setNewMessages,
        typingUsers, e2eEnabled, e2eKeyRef,
        initE2E, addMessage, sendMessage, handleMessageChange, updateTypingUser,
        requestKeyFromPeers,
    }
}
