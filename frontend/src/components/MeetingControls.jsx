import { IconButton, Tooltip, Badge } from '@mui/material'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare'
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import CallEndIcon from '@mui/icons-material/CallEnd'
import PanToolIcon from '@mui/icons-material/PanTool'
import PeopleIcon from '@mui/icons-material/People'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LockIcon from '@mui/icons-material/Lock'
import styles from '../styles/videoComponent.module.css'

const REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '🔥']

export default function MeetingControls({ media, room, chat, lobby, videos, sfuActive, networkQuality, showModal, setModal, showWaitingPanel, setShowWaitingPanel, handleEndCall }) {
    const networkIcon = networkQuality === 'good' ? '🟢' : networkQuality === 'fair' ? '🟡' : '🔴'

    return (
        <>
            {room.showReactionPicker && (
                <div className={styles.reactionPicker}>
                    {REACTIONS.map(emoji => (
                        <button key={emoji} className={styles.reactionPickerBtn} onClick={() => room.sendReaction(emoji)}>{emoji}</button>
                    ))}
                </div>
            )}

            <nav className={styles.buttonContainers} aria-label="Meeting controls">
                <div className={styles.controlsLeft} role="status" aria-live="polite">
                    <div className={styles.participantCount} aria-label={`${videos.length + 1} participants`}><PeopleIcon sx={{ fontSize: '1rem' }} aria-hidden="true" /><span>{videos.length + 1}</span></div>
                    <Tooltip title={`Network: ${networkQuality}`} arrow><span className={styles.networkIndicator} aria-label={`Network quality: ${networkQuality}`}>{networkIcon}</span></Tooltip>
                    {chat.e2eEnabled && <Tooltip title="Chat is end-to-end encrypted" arrow><span className={styles.e2eBadge} aria-label="End-to-end encrypted"><LockIcon sx={{ fontSize: '0.7rem' }} aria-hidden="true" /> E2E</span></Tooltip>}
                    {sfuActive && <Tooltip title="SFU mode — media routed via server for scalability" arrow><span className={styles.sfuBadge} aria-label="SFU mode active">SFU</span></Tooltip>}
                </div>
                <div className={styles.controlsInner} role="toolbar" aria-label="Call controls">
                    <Tooltip title={`${media.audio ? 'Mute' : 'Unmute'} (M)`} arrow><IconButton onClick={media.handleAudio} aria-label={media.audio ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={!media.audio} className={media.audio ? styles.controlBtn : styles.controlBtnOff}>{media.audio ? <MicIcon aria-hidden="true" /> : <MicOffIcon aria-hidden="true" />}</IconButton></Tooltip>
                    <Tooltip title={`${media.video ? 'Stop Video' : 'Start Video'} (V)`} arrow><IconButton onClick={media.handleVideo} aria-label={media.video ? 'Stop camera' : 'Start camera'} aria-pressed={!media.video} className={media.video ? styles.controlBtn : styles.controlBtnOff}>{media.video ? <VideocamIcon aria-hidden="true" /> : <VideocamOffIcon aria-hidden="true" />}</IconButton></Tooltip>
                    {media.screenAvailable && (
                        <Tooltip title={media.screen ? 'Stop Sharing' : 'Share Screen'} arrow><IconButton onClick={media.handleScreen} aria-label={media.screen ? 'Stop screen share' : 'Share screen'} aria-pressed={media.screen} className={media.screen ? styles.controlBtnActive : styles.controlBtn}>{media.screen ? <ScreenShareIcon aria-hidden="true" /> : <StopScreenShareIcon aria-hidden="true" />}</IconButton></Tooltip>
                    )}
                    <Tooltip title="Hand Raise (H)" arrow><IconButton onClick={room.toggleHandRaise} aria-label={room.handRaised ? 'Lower hand' : 'Raise hand'} aria-pressed={room.handRaised} className={room.handRaised ? styles.controlBtnActive : styles.controlBtn}><PanToolIcon aria-hidden="true" /></IconButton></Tooltip>
                    <Tooltip title="Reactions" arrow><IconButton onClick={() => room.setShowReactionPicker(prev => !prev)} aria-label="Send reaction" aria-expanded={room.showReactionPicker} className={room.showReactionPicker ? styles.controlBtnActive : styles.controlBtn}><span style={{ fontSize: '1.2rem' }} aria-hidden="true">😊</span></IconButton></Tooltip>
                    <Tooltip title="Chat (C)" arrow>
                        <Badge badgeContent={chat.newMessages} max={99} color="error">
                            <IconButton onClick={() => { setModal(!showModal); chat.setNewMessages(0) }} aria-label={`Chat${chat.newMessages > 0 ? `, ${chat.newMessages} unread messages` : ''}`} aria-pressed={showModal} className={showModal ? styles.controlBtnActive : styles.controlBtn}><ChatIcon aria-hidden="true" /></IconButton>
                        </Badge>
                    </Tooltip>
                    {lobby.isHost && (
                        <Tooltip title="Waiting Room" arrow>
                            <Badge badgeContent={lobby.waitingUsers.length} max={99} color="warning">
                                <IconButton onClick={() => setShowWaitingPanel(prev => !prev)} aria-label="Waiting room" className={showWaitingPanel ? styles.controlBtnActive : styles.controlBtn}><PeopleIcon aria-hidden="true" /></IconButton>
                            </Badge>
                        </Tooltip>
                    )}
                    <Tooltip title="End Call (E)" arrow><IconButton onClick={handleEndCall} aria-label="End call" className={styles.controlBtnEnd}><CallEndIcon aria-hidden="true" /></IconButton></Tooltip>
                </div>
                <div className={styles.controlsRight}>
                    <Tooltip title="Copy meeting link" arrow><IconButton onClick={room.copyMeetingLink} aria-label="Copy meeting invite link" className={styles.controlBtn}><ContentCopyIcon sx={{ fontSize: '1.1rem' }} aria-hidden="true" /></IconButton></Tooltip>
                </div>
            </nav>
        </>
    )
}
