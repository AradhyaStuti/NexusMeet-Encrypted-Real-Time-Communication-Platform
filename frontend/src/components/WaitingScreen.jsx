import { Button } from '@mui/material'
import styles from '../styles/videoComponent.module.css'
import MeetSyncLogo from './MeetSyncLogo'
import { getAvatar } from './AvatarPicker'

export default function WaitingScreen({ localVideoRef, username, onLeave }) {
    return (
        <div className={styles.lobbyContainer}>
            <div className={styles.waitingAdmissionCard}>
                <div className={styles.lobbyBrand}>
                    <MeetSyncLogo size={34} />
                    <span className={styles.lobbyBrandName}>MeetSync</span>
                </div>
                <div className={styles.waitingPulseRing}>
                    <div className={styles.waitingPulseInner} />
                </div>
                <h2 className={styles.waitingTitle}>Waiting for the host to let you in</h2>
                <p className={styles.waitingSubtext}>The host has been notified. Please wait...</p>
                <div className={styles.waitingPreview}>
                    <video ref={localVideoRef} autoPlay muted className={styles.lobbyVideo} />
                </div>
                <div className={styles.waitingUserInfo}>
                    <span style={{ fontSize: '1.4rem' }}>{getAvatar()}</span>
                    <span className={styles.waitingUsername}>{username}</span>
                </div>
                <Button variant="outlined" onClick={onLeave}
                    sx={{ mt: 1, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', borderRadius: '10px', textTransform: 'none', fontWeight: 600, '&:hover': { borderColor: '#f87171', background: 'rgba(248,113,113,0.08)' } }}>
                    Leave
                </Button>
            </div>
        </div>
    )
}
