import { useRef, useEffect, useCallback } from 'react'
import { IconButton, TextField } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import DOMPurify from 'dompurify'
import styles from '../styles/videoComponent.module.css'

const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

export default function ChatPanel({ chat, username, onClose }) {
    const chatEndRef = useRef(null)

    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [chat.messages])

    const handleSendMessage = useCallback(() => {
        chat.sendMessage(chat.message, username)
        chat.setMessage('')
    }, [chat, username])

    const handleChatKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }, [handleSendMessage])

    return (
        <aside className={styles.chatRoom} aria-label="In-meeting chat">
            <div className={styles.chatHeader}>
                <span className={styles.chatTitle}>In-Meeting Chat</span>
                <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}><CloseIcon fontSize="small" /></IconButton>
            </div>
            <div className={styles.chattingDisplay}>
                {chat.messages.length === 0 ? (
                    <div className={styles.noMessages}><p>No messages yet</p><span style={{ fontSize: '0.78rem', opacity: 0.5 }}>Say hello to everyone!</span></div>
                ) : (
                    chat.messages.map((item, index) => (
                        <div key={index} className={item.isSelf ? styles.chatMessageSelf : styles.chatMessage}>
                            <div className={styles.chatMessageHeader}>
                                <span className={styles.chatSender}>{item.isSelf ? 'You' : (DOMPurify.sanitize(item.sender) || 'Participant')}</span>
                                <span className={styles.chatTimestamp}>{formatTime(item.timestamp)}</span>
                            </div>
                            <p className={styles.chatText}>{DOMPurify.sanitize(item.data)}</p>
                        </div>
                    ))
                )}
                <div ref={chatEndRef} />
            </div>
            {chat.typingUsers.size > 0 && (
                <div className={styles.typingIndicator}>
                    <span className={styles.typingDots}><span></span><span></span><span></span></span>
                    {chat.typingUsers.size === 1 ? 'Someone is typing...' : `${chat.typingUsers.size} people typing...`}
                </div>
            )}
            <div className={styles.chattingArea}>
                <TextField value={chat.message} onChange={e => chat.handleMessageChange(e.target.value)} onKeyDown={handleChatKeyDown} placeholder="Type a message..." size="small" multiline maxRows={3} fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#0E72ED' }, borderRadius: '10px', color: 'white', fontSize: '0.88rem' }, '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.35)' } }} />
                <IconButton onClick={handleSendMessage} disabled={!chat.message.trim()}
                    sx={{ background: chat.message.trim() ? '#0E72ED' : 'rgba(255,255,255,0.08)', color: 'white', borderRadius: '10px', width: '40px', height: '40px', flexShrink: 0, '&:hover': { background: '#0A5BC4' }, '&:disabled': { color: 'rgba(255,255,255,0.2)' } }}>
                    <SendIcon fontSize="small" />
                </IconButton>
            </div>
        </aside>
    )
}
