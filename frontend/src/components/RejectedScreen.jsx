import { Button } from '@mui/material'
import styles from '../styles/videoComponent.module.css'
import NexusMeetLogo from './NexusMeetLogo'

export default function RejectedScreen() {
    return (
        <div className={styles.lobbyContainer}>
            <div className={styles.waitingAdmissionCard}>
                <div className={styles.lobbyBrand}>
                    <NexusMeetLogo size={34} />
                    <span className={styles.lobbyBrandName}>NexusMeet</span>
                </div>
                <div style={{ fontSize: '3rem', margin: '1.5rem 0 0.5rem', textAlign: 'center' }}>🚫</div>
                <h2 className={styles.waitingTitle}>You were not admitted</h2>
                <p className={styles.waitingSubtext}>The host did not allow you to join this meeting.</p>
                <Button variant="contained" onClick={() => { window.location.href = '/' }}
                    sx={{ mt: 2, background: '#0E72ED', borderRadius: '10px', textTransform: 'none', fontWeight: 700, '&:hover': { background: '#0A5BC4' } }}>
                    Return Home
                </Button>
            </div>
        </div>
    )
}
