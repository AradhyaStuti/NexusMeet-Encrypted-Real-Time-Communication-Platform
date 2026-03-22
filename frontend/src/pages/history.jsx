import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import withAuth from '../utils/withAuth'
import { IconButton } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import VideocamIcon from '@mui/icons-material/Videocam'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import "../App.css"
import UshaMeetXLogo from '../components/UshaMeetXLogo'
import AvatarPicker from '../components/AvatarPicker'

function History() {
    const { getHistoryOfUser, deleteFromUserHistory } = useContext(AuthContext)
    const [meetings, setMeetings] = useState([])
    const [deletingId, setDeletingId] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser()
                setMeetings(history)
            } catch { }
        }
        fetchHistory()
    }, [])

    const formatDate = (dateString) => {
        const d = new Date(dateString)
        const day = d.getDate().toString().padStart(2, '0')
        const month = (d.getMonth() + 1).toString().padStart(2, '0')
        const year = d.getFullYear()
        const h = d.getHours().toString().padStart(2, '0')
        const m = d.getMinutes().toString().padStart(2, '0')
        return `${day}/${month}/${year} at ${h}:${m}`
    }

    const handleDelete = async (meetingId) => {
        setDeletingId(meetingId)
        try {
            await deleteFromUserHistory(meetingId)
            setMeetings(prev => prev.filter(m => m._id !== meetingId))
        } catch { }
        setDeletingId(null)
    }

    const handleClearAll = async () => {
        for (const meeting of meetings) {
            try { await deleteFromUserHistory(meeting._id) } catch { }
        }
        setMeetings([])
    }

    return (
        <div className="historyPageContainer">

            {/* Navbar */}
            <div className="navBar">
                <div className="navBarBrand">
                    <UshaMeetXLogo size={36} />
                    <h2>UshaMeetX</h2>
                </div>
                <div className="navBarActions">
                    <IconButton onClick={() => navigate('/home')} title="Back to Home"
                        sx={{ color: 'rgba(139,154,176,0.7)', '&:hover': { color: '#7dd3fc', background: 'rgba(14,165,233,0.08)' } }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <AvatarPicker size={36} />
                </div>
            </div>

            <div className="historyContent">
                <div className="historyHeader">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h1>Meeting History</h1>
                            <p>
                                {meetings.length > 0
                                    ? `${meetings.length} meeting${meetings.length > 1 ? 's' : ''} attended`
                                    : 'Your past meetings will appear here'}
                            </p>
                        </div>
                        {meetings.length > 0 && (
                            <button
                                onClick={handleClearAll}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    color: '#fca5a5',
                                    padding: '0.42rem 0.9rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
                                    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                                    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                                }}
                            >
                                <DeleteSweepIcon sx={{ fontSize: '1rem' }} />
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                {meetings.length > 0 ? (
                    <div className="historyGrid">
                        {meetings.map((meeting) => (
                            <div key={meeting._id} className="historyCard">
                                <div className="historyCardLeft">
                                    <div className="historyCardIconWrap">
                                        <VideocamIcon sx={{ fontSize: '1.1rem', color: '#38bdf8' }} />
                                    </div>
                                    <div>
                                        <div className="historyCardCode">{meeting.meetingCode}</div>
                                        <div className="historyCardDate">{formatDate(meeting.date)}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button
                                        onClick={() => navigate(`/${meeting.meetingCode}`)}
                                        onMouseOver={e => {
                                            e.currentTarget.style.background = 'rgba(14,165,233,0.2)'
                                            e.currentTarget.style.borderColor = 'rgba(14,165,233,0.5)'
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.background = 'rgba(14,165,233,0.1)'
                                            e.currentTarget.style.borderColor = 'rgba(14,165,233,0.25)'
                                        }}
                                        style={{
                                            background: 'rgba(14,165,233,0.1)',
                                            border: '1px solid rgba(14,165,233,0.25)',
                                            color: '#38bdf8',
                                            padding: '0.42rem 1rem',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            fontFamily: 'inherit',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap',
                                        }}>
                                        Rejoin →
                                    </button>
                                    <IconButton
                                        onClick={() => handleDelete(meeting._id)}
                                        disabled={deletingId === meeting._id}
                                        size="small"
                                        title="Delete"
                                        sx={{
                                            color: 'rgba(239,68,68,0.5)',
                                            '&:hover': { color: '#fca5a5', background: 'rgba(239,68,68,0.1)' },
                                            '&:disabled': { color: 'rgba(255,255,255,0.15)' },
                                        }}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="historyEmpty">
                        <div className="historyEmptyIcon">📅</div>
                        <h3>No meetings yet</h3>
                        <p>Start or join a meeting to see your history here.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default withAuth(History)
