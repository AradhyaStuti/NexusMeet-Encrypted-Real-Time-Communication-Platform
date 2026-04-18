import { TextField, Button } from '@mui/material'
import styles from '../styles/videoComponent.module.css'
import NexusMeetLogo from './NexusMeetLogo'
import { getAvatar } from './AvatarPicker'

export default function PreJoinLobby({ localVideoRef, username, setUsername, connect }) {
    return (
        <div className={styles.lobbyContainer}>
            <div className={styles.lobbyCard}>
                <div className={styles.lobbyBrand}>
                    <NexusMeetLogo size={34} />
                    <span className={styles.lobbyBrandName}>NexusMeet</span>
                </div>
                <h2 className={styles.lobbyTitle}>Ready to join?</h2>
                <p className={styles.lobbySubtitle}>Enter your name to join the meeting</p>
                <div className={styles.lobbyPreview}>
                    <video ref={localVideoRef} autoPlay muted className={styles.lobbyVideo} />
                    <div className={styles.lobbyPreviewOverlay}><span>Camera Preview</span></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.14)', borderRadius: '10px', padding: '0.55rem 0.9rem' }}>
                    <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{getAvatar()}</span>
                    <div>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(139,154,176,0.6)', marginBottom: '0.1rem' }}>Your avatar</p>
                        <p style={{ fontSize: '0.78rem', color: 'rgba(139,154,176,0.4)' }}>Change it from the home page</p>
                    </div>
                </div>
                <TextField
                    fullWidth label="Your Name" value={username}
                    onChange={e => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && username.trim() && connect()}
                    variant="outlined" size="small"
                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' }, '&.Mui-focused fieldset': { borderColor: '#0E72ED' }, borderRadius: '10px', color: 'white', background: 'rgba(255,255,255,0.06)' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiInputLabel-root.Mui-focused': { color: '#0E72ED' }, mb: 2 }}
                />
                <Button variant="contained" fullWidth onClick={connect} disabled={!username.trim()}
                    sx={{ py: 1.3, background: '#0E72ED', borderRadius: '10px', textTransform: 'none', fontWeight: 700, fontSize: '1rem', '&:hover': { background: '#0A5BC4' }, '&:disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}>
                    Join Meeting
                </Button>
                <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.72rem', color: 'rgba(139,154,176,0.35)' }}>
                    Shortcuts: M = Mute, V = Camera, C = Chat, H = Hand, E = End
                </p>
            </div>
        </div>
    )
}
