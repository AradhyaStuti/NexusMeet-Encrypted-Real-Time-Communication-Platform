import { useState, useRef, useCallback } from 'react'
import { getOrCreateRoomKey, encryptMessage, decryptMessage } from '../utils/encryption'

/**
 * Manages chat state with optional E2E encryption.
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
            const { key } = await getOrCreateRoomKey()
            e2eKeyRef.current = key
            setE2eEnabled(true)
        } catch { }
    }, [])

    const addMessage = useCallback(async (data, sender, socketIdSender, timestamp) => {
        let plaintext = data
        if (e2eKeyRef.current) {
            try { plaintext = await decryptMessage(data, e2eKeyRef.current) } catch { plaintext = data }
        }
        setMessages(prev => [...prev, { sender, data: plaintext, timestamp }])
        if (socketIdSender !== socketIdRef.current) {
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
