import { useState, useEffect, useRef } from 'react'

const AVATARS = [
    '😊', '😎', '🤩', '😄',
    '🧑‍💻', '👩‍💼', '🧑‍🎨', '🦸',
    '🦊', '🐼', '🐺', '🐧',
    '🌸', '⭐', '💎', '⚡',
]

const AVATAR_KEY = 'ushaMeetX_avatar'

export function getAvatar() {
    return localStorage.getItem(AVATAR_KEY) || '😊'
}

export function saveAvatar(emoji) {
    localStorage.setItem(AVATAR_KEY, emoji)
}

// The circle that shows the current avatar — click to open picker
export default function AvatarPicker({ size = 38 }) {
    const [avatar, setAvatar] = useState(getAvatar())
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const pick = (emoji) => {
        saveAvatar(emoji)
        setAvatar(emoji)
        setOpen(false)
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            {/* Avatar circle button */}
            <button
                onClick={() => setOpen(o => !o)}
                title="Change avatar"
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(14,165,233,0.25), rgba(2,132,199,0.35))',
                    border: open
                        ? '2px solid #38bdf8'
                        : '2px solid rgba(14,165,233,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: size * 0.52,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: open ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none',
                    padding: 0,
                    lineHeight: 1,
                }}
            >
                {avatar}
            </button>

            {/* Picker dropdown */}
            {open && (
                <div style={{
                    position: 'absolute',
                    top: size + 8,
                    right: 0,
                    background: 'rgba(6,15,30,0.97)',
                    border: '1px solid rgba(14,165,233,0.2)',
                    borderRadius: '14px',
                    padding: '0.8rem',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
                    backdropFilter: 'blur(20px)',
                    zIndex: 200,
                    minWidth: '180px',
                    animation: 'avatarPickerIn 0.15s ease',
                }}>
                    <p style={{
                        fontSize: '0.75rem',
                        color: 'rgba(139,154,176,0.6)',
                        marginBottom: '0.55rem',
                        textAlign: 'center',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                    }}>
                        Choose your avatar
                    </p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.35rem',
                    }}>
                        {AVATARS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => pick(emoji)}
                                style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '9px',
                                    background: avatar === emoji
                                        ? 'rgba(14,165,233,0.25)'
                                        : 'rgba(255,255,255,0.05)',
                                    border: avatar === emoji
                                        ? '1.5px solid rgba(14,165,233,0.6)'
                                        : '1.5px solid transparent',
                                    fontSize: '1.3rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s',
                                    lineHeight: 1,
                                    padding: 0,
                                }}
                                onMouseEnter={e => {
                                    if (avatar !== emoji) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (avatar !== emoji) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                    }
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
