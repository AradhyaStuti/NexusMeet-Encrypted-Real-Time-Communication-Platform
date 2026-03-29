import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import styles from '../styles/videoComponent.module.css'

export default function VideoGrid({ videos, room, getName, getAvatarFor }) {
    const pinnedVideo = room.pinnedVideo
    const pinnedVideoObj = pinnedVideo ? videos.find(v => v.socketId === pinnedVideo) : null

    if (pinnedVideo && pinnedVideoObj) {
        return (
            <div className={styles.spotlightLayout}>
                <div className={styles.spotlightMain} onClick={() => room.setPinnedVideo(null)}>
                    <video ref={el => room.assignRemoteRef(el, pinnedVideoObj.socketId, pinnedVideoObj.stream, room.videoVolumes)} autoPlay className={styles.spotlightVideo} />
                    <div className={styles.spotlightOverlay}>
                        <span className={styles.spotlightName}>
                            {getAvatarFor(room.pinnedVideo)} {getName(room.pinnedVideo)}
                            {room.raisedHands[room.pinnedVideo] && <span className={styles.handRaisedBadge}>✋</span>}
                        </span>
                        <span className={styles.spotlightUnpin}>Click to unpin</span>
                    </div>
                    <div className={styles.spotlightVolumeWrap} onClick={e => e.stopPropagation()}>
                        {(room.videoVolumes[room.pinnedVideo] ?? 100) === 0 ? <VolumeOffIcon sx={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }} /> : <VolumeUpIcon sx={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }} />}
                        <input type="range" min={0} max={100} value={room.videoVolumes[room.pinnedVideo] ?? 100} onChange={e => room.handleVolumeChange(room.pinnedVideo, Number(e.target.value))} className={styles.volumeSlider} />
                        <span className={styles.volumeVal}>{room.videoVolumes[room.pinnedVideo] ?? 100}%</span>
                    </div>
                </div>
                <div className={styles.thumbnailStrip}>
                    {videos.filter(v => v.socketId !== room.pinnedVideo).map((v) => (
                        <div key={v.socketId} className={styles.thumbnailItem} onClick={() => room.handlePinToggle(v.socketId)} title="Click to spotlight">
                            <video ref={el => room.assignRemoteRef(el, v.socketId, v.stream, room.videoVolumes)} autoPlay className={styles.thumbnailVideo} />
                            <span className={styles.thumbnailName}>{getName(v.socketId)}</span>
                            {room.raisedHands[v.socketId] && <span className={styles.thumbnailHand}>✋</span>}
                            <span className={styles.thumbnailHint}>Spotlight</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className={styles.conferenceView}>
            {videos.length === 0 ? (
                <div className={styles.waitingRoom}>
                    <div className={styles.waitingRoomIcon}>👥</div>
                    <p className={styles.waitingRoomText}>Waiting for others to join...</p>
                    <p className={styles.waitingRoomSub}>Share the meeting link to invite participants</p>
                    <button className={styles.copyLinkBtn} onClick={room.copyMeetingLink}>Copy Invite Link</button>
                </div>
            ) : (
                videos.map((v) => (
                    <div key={v.socketId} className={styles.remoteVideoWrap} onMouseEnter={() => room.setHoveredVideo(v.socketId)} onMouseLeave={() => room.setHoveredVideo(null)}>
                        <video ref={el => room.assignRemoteRef(el, v.socketId, v.stream, room.videoVolumes)} autoPlay className={styles.remoteVideo} />
                        <span className={styles.participantLabel}>
                            <span className={styles.participantAvatar}>{getAvatarFor(v.socketId)}</span>
                            {getName(v.socketId)}
                            {room.raisedHands[v.socketId] && <span className={styles.handRaisedBadge}> ✋</span>}
                        </span>
                        <button onClick={e => { e.stopPropagation(); room.handlePinToggle(v.socketId) }} className={styles.pinBtn} style={{ background: room.pinnedVideo === v.socketId ? '#0E72ED' : 'rgba(0,0,0,0.55)' }}>
                            {room.pinnedVideo === v.socketId ? 'Unpin' : 'Pin'}
                        </button>
                        <div className={`${styles.videoHoverOverlay} ${room.hoveredVideo === v.socketId ? styles.videoHoverVisible : ''}`}>
                            <div className={styles.hoverVolumeRow} onClick={e => e.stopPropagation()}>
                                {(room.videoVolumes[v.socketId] ?? 100) === 0 ? <VolumeOffIcon sx={{ fontSize: '1.1rem', color: 'white' }} /> : <VolumeUpIcon sx={{ fontSize: '1.1rem', color: 'white' }} />}
                                <input type="range" min={0} max={100} value={room.videoVolumes[v.socketId] ?? 100} onChange={e => room.handleVolumeChange(v.socketId, Number(e.target.value))} className={styles.volumeSlider} />
                                <span className={styles.volumeVal}>{room.videoVolumes[v.socketId] ?? 100}%</span>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}
