import { useState, useRef, useCallback } from 'react'
import { getOrCreateRoomKey, encryptMessage, decryptMessage } from '../utils/encryption'

/**
 * Manages chat state with optional E2E encryption.
 * Shares the E2E key via socket so users joining via code also get it.
 */
export function useEncryptedChat({ socketRef, socketIdRef }) {
    const [messages, setMessages] = useState([])
    const [message, setMessage] = useState('')
    const [newMessages, setNewMessages] = useState(0)
    const [typingUsers, setTypingUsers] = useState(new Set())
    const [e2eEnabled, setE2eEnabled] = useState(false)
    const e2eKeyRef = useRef(null)
    const typingTimeout = useRef(null)

    const initE2E = useCallback(async () => {
        try {
            const { key, isNew } = await getOrCreateRoomKey()
            e2eKeyRef.current = key
            setE2eEnabled(true)

            const socket = socketRef.current
            if (!socket) return

            // If we created a new key (no hash in URL), request the room key from others
            if (isNew) {
                socket.on('e2e-key', async (sharedKey) => {
                    if (sharedKey && sharedKey.length >= 20) {
                        e2eKeyRef.current = sharedKey
                        // Update URL hash so "Copy Invite Link" includes the key
                        window.history.replaceState(null, '', window.location.pathname + '#' + sharedKey)
                    }
                })
                socket.emit('request-e2e-key')
            }

            // When someone requests the key, share ours
            socket.on('request-e2e-key', () => {
                if (e2eKeyRef.current) {
                    socket.emit('share-e2e-key', e2eKeyRef.current)
                }
            })
        } catch { }
    }, [socketRef])

    const addMessage = useCallback(async (data, sender, socketIdSender, timestamp) => {
        let plaintext = data
        if (e2eKeyRef.current) {
            try {
                const decrypted = await decryptMessage(data, e2eKeyRef.current)
                // Only use decrypted if it actually decrypted (not the fallback)
                if (decrypted !== '[encrypted message]') {
                    plaintext = decrypted
                }
            } catch {
                // If decryption fails, show raw data
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
    }
}
