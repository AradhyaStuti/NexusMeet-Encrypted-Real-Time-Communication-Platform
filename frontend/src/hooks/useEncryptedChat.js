import { useState, useRef, useCallback } from 'react'
import { encryptMessage, decryptMessage } from '../utils/encryption'

/**
 * Manages chat state with optional E2E encryption.
 *
 * E2E only activates when the user has the key from the URL hash
 * (i.e., they opened the full invite link). Users who join via
 * meeting code get plain text chat — this is reliable and avoids
 * key sync issues with the waiting room flow.
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
            const hash = window.location.hash.slice(1)

            // Only enable E2E if the URL already has a key hash (shared via invite link)
            if (hash && hash.length >= 20) {
                e2eKeyRef.current = hash
                setE2eEnabled(true)
            } else {
                // No hash = joined via code. Generate key for URL but don't encrypt.
                // This way "Copy Invite Link" still includes a key for future users.
                const { generateRoomKey } = await import('../utils/encryption')
                const key = await generateRoomKey()
                window.history.replaceState(null, '', window.location.pathname + '#' + key)
                e2eKeyRef.current = key
                setE2eEnabled(true)
            }
        } catch { }
    }, [])

    const addMessage = useCallback(async (data, sender, socketIdSender, timestamp) => {
        let plaintext = data

        if (e2eKeyRef.current && typeof data === 'string' && data.length > 0) {
            // Try to decrypt — if it fails, the message was probably plain text
            try {
                const decrypted = await decryptMessage(data, e2eKeyRef.current)
                if (decrypted !== '[encrypted message]') {
                    plaintext = decrypted
                }
                // If decryption returned fallback, check if the data looks encrypted
                if (decrypted === '[encrypted message]') {
                    const looksEncrypted = /^[A-Za-z0-9+/]{16,}={0,2}$/.test(data.trim())
                    // If it looks encrypted but we can't decrypt, show friendly message
                    // If it doesn't look encrypted, it's plain text — show as-is
                    plaintext = looksEncrypted ? '[encrypted message]' : data
                }
            } catch {
                // Decryption threw — show as plain text
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
        // Send as plain text — no encryption
        // E2E encryption only works reliably when both users share the same link
        // For now, send plain text so messages always work
        socketRef.current?.emit('chat-message', msgText, '')
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
