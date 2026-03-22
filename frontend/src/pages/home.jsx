import { useContext, useState } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate } from 'react-router-dom'
import "../App.css"
import { Button, IconButton, TextField } from '@mui/material'
import RestoreIcon from '@mui/icons-material/Restore'
import LogoutIcon from '@mui/icons-material/Logout'
import VideocamIcon from '@mui/icons-material/Videocam'
import AddIcon from '@mui/icons-material/Add'
import { AuthContext } from '../contexts/AuthContext'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import UshaMeetXLogo from '../components/UshaMeetXLogo'
import AvatarPicker from '../components/AvatarPicker'

const theme = createTheme({
    palette: { mode: 'dark', primary: { main: '#0ea5e9' } },
    components: {
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(14,165,233,0.4)' },
                        '&.Mui-focused fieldset': { borderColor: '#0ea5e9' },
                        borderRadius: '10px',
                        color: '#e2f4fd',
                        background: 'rgba(255,255,255,0.04)',
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(139,154,176,0.7)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#38bdf8' },
                },
            },
        },
    },
})

function HomeComponent() {
    const navigate = useNavigate()
    const [meetingCode, setMeetingCode] = useState('')
    const { addToUserHistory } = useContext(AuthContext)

    const generateMeetingCode = () => Math.random().toString(36).substring(2, 10)

    const handleJoinVideoCall = async () => {
        if (!meetingCode.trim()) return
        await addToUserHistory(meetingCode.trim())
        navigate(`/${meetingCode.trim()}`)
    }

    const handleNewMeeting = async () => {
        const code = generateMeetingCode()
        await addToUserHistory(code)
        navigate(`/${code}`)
    }

    return (
        <ThemeProvider theme={theme}>
            <div className="homePageContainer">

                {/* ── Navbar ── */}
                <div className="navBar">
                    <div className="navBarBrand">
                        <UshaMeetXLogo size={36} />
                        <h2>UshaMeetX</h2>
                    </div>
                    <div className="navBarActions">
                        <IconButton onClick={() => navigate('/history')} title="Meeting History"
                            sx={{ color: 'rgba(139,154,176,0.7)', '&:hover': { color: '#7dd3fc', background: 'rgba(14,165,233,0.08)' } }}>
                            <RestoreIcon />
                        </IconButton>
                        <span style={{ color: 'rgba(139,154,176,0.5)', fontSize: '0.84rem', marginRight: '0.2rem' }}>History</span>
                        <Button onClick={() => { localStorage.removeItem('token'); navigate('/auth'); }}
                            startIcon={<LogoutIcon />}
                            sx={{
                                color: 'rgba(139,154,176,0.65)', textTransform: 'none', fontSize: '0.88rem',
                                '&:hover': { color: '#fca5a5', background: 'rgba(239,68,68,0.07)' },
                            }}>
                            Logout
                        </Button>
                        <AvatarPicker size={36} />
                    </div>
                </div>

                {/* ── Dashboard ── */}
                <div className="dashboardContainer">
                    <div className="dashboardWelcome">
                        <h1>Good to see you! 👋</h1>
                        <p>Start a new meeting or join one with an existing code.</p>
                    </div>

                    <div className="dashboardActions">

                        {/* New Meeting */}
                        <div className="actionCard" onClick={handleNewMeeting}>
                            <div className="actionCardIcon iconBlue">
                                <VideocamIcon sx={{ fontSize: '1.6rem', color: '#38bdf8' }} />
                            </div>
                            <h3>New Meeting</h3>
                            <p>Start an instant meeting and share a code to invite others.</p>
                            <Button variant="contained"
                                startIcon={<AddIcon />}
                                onClick={e => { e.stopPropagation(); handleNewMeeting(); }}
                                sx={{
                                    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                                    borderRadius: '9px', textTransform: 'none', fontWeight: 600,
                                    boxShadow: '0 4px 16px rgba(14,165,233,0.3)',
                                    '&:hover': { background: 'linear-gradient(135deg, #0284c7, #0369a1)', boxShadow: '0 6px 20px rgba(14,165,233,0.4)' },
                                }}>
                                Start Meeting
                            </Button>
                        </div>

                        {/* Join Meeting */}
                        <div className="actionCard" style={{ cursor: 'default' }}>
                            <div className="actionCardIcon iconPurple">
                                <span style={{ fontSize: '1.5rem' }}>🔗</span>
                            </div>
                            <h3>Join a Meeting</h3>
                            <p>Enter a meeting code to join an ongoing call.</p>
                            <div className="joinMeetingInput">
                                <TextField size="small" label="Meeting Code"
                                    value={meetingCode}
                                    onChange={e => setMeetingCode(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleJoinVideoCall()}
                                    onClick={e => e.stopPropagation()}
                                    sx={{ flex: 1 }} />
                                <Button variant="contained"
                                    onClick={e => { e.stopPropagation(); handleJoinVideoCall(); }}
                                    disabled={!meetingCode.trim()}
                                    sx={{
                                        background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                                        borderRadius: '9px', textTransform: 'none', fontWeight: 600, flexShrink: 0,
                                        '&:hover': { background: 'linear-gradient(135deg, #0284c7, #0369a1)' },
                                        '&:disabled': { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.2)' },
                                    }}>
                                    Join
                                </Button>
                            </div>
                        </div>

                        {/* History */}
                        <div className="actionCard" onClick={() => navigate('/history')}>
                            <div className="actionCardIcon iconGreen">
                                <span style={{ fontSize: '1.5rem' }}>📋</span>
                            </div>
                            <h3>Meeting History</h3>
                            <p>View and quickly rejoin your past meetings.</p>
                            <Button variant="outlined"
                                onClick={e => { e.stopPropagation(); navigate('/history'); }}
                                sx={{
                                    borderColor: 'rgba(14,165,233,0.3)', color: '#38bdf8',
                                    borderRadius: '9px', textTransform: 'none', fontWeight: 600,
                                    '&:hover': { borderColor: 'rgba(14,165,233,0.6)', background: 'rgba(14,165,233,0.07)' },
                                }}>
                                View History
                            </Button>
                        </div>

                    </div>
                </div>
            </div>
        </ThemeProvider>
    )
}

export default withAuth(HomeComponent)
