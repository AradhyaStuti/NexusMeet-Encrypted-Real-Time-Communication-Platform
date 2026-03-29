import { useState, useContext } from 'react';
import MeetSyncLogo from '../components/MeetSyncLogo'
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { TextField, Button, Snackbar, Alert, CircularProgress } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#0ea5e9' },
    },
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
});

export default function Authentication() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [formState, setFormState] = useState(0);
    const [open, setOpen] = useState(false);
    const [snackMsg, setSnackMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const [guestCode, setGuestCode] = useState('');

    const { handleRegister, handleLogin } = useContext(AuthContext);
    const navigate = useNavigate();

    const switchTab = (tab) => { setFormState(tab); setError(''); };

    const handleAuth = async () => {
        if (!username || !password) { setError('Please fill in all fields.'); return; }
        if (formState === 1 && !name) { setError('Please enter your full name.'); return; }
        setLoading(true);
        setError('');
        try {
            if (formState === 0) {
                await handleLogin(username, password);
            } else {
                const msg = await handleRegister(name, username, password);
                setSnackMsg(msg || 'Account created! Please sign in.');
                setOpen(true);
                setFormState(0);
                setUsername(''); setPassword(''); setName('');
            }
        } catch (err) {
            setError(err?.response?.data?.message || 'Something went wrong. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemeProvider theme={darkTheme}>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(155deg, #040d18 0%, #071a2e 55%, #040d18 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                padding: '1rem',
            }}>
                {/* Card */}
                <div style={{
                    width: '100%',
                    maxWidth: '420px',
                    background: 'rgba(14,165,233,0.04)',
                    border: '1px solid rgba(14,165,233,0.14)',
                    borderRadius: '24px',
                    padding: '2.5rem 2.2rem',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
                }}>
                    {/* Logo */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                            <MeetSyncLogo size={52} />
                        </div>
                        <h1 style={{
                            fontSize: '1.55rem', fontWeight: 800,
                            background: 'linear-gradient(135deg, #e2f4fd, #7dd3fc)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            marginBottom: '0.35rem',
                            letterSpacing: '-0.3px',
                        }}>MeetSync</h1>
                        <p style={{ color: 'rgba(139,154,176,0.7)', fontSize: '0.88rem' }}>
                            {formState === 0 ? 'Welcome back! Sign in to continue.' : 'Create your free account today.'}
                        </p>
                    </div>

                    {/* Tab Switcher */}
                    <div style={{
                        display: 'flex',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '11px',
                        padding: '4px',
                        marginBottom: '1.8rem',
                        gap: '4px',
                    }}>
                        {['Sign In', 'Sign Up'].map((label, i) => (
                            <button key={i} onClick={() => switchTab(i)} style={{
                                flex: 1, padding: '0.55rem', border: 'none',
                                borderRadius: '8px', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 600,
                                transition: 'all 0.2s ease',
                                background: formState === i
                                    ? 'linear-gradient(135deg, #0ea5e9, #0284c7)'
                                    : 'transparent',
                                color: formState === i ? 'white' : 'rgba(139,154,176,0.7)',
                                boxShadow: formState === i ? '0 4px 14px rgba(14,165,233,0.3)' : 'none',
                            }}>{label}</button>
                        ))}
                    </div>

                    {/* Form */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        {formState === 1 && (
                            <TextField label="Full Name" value={name} onChange={e => setName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAuth()} fullWidth autoFocus size="small" />
                        )}
                        <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAuth()} fullWidth
                            autoFocus={formState === 0} size="small" />
                        <TextField label="Password" type="password" value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAuth()} fullWidth size="small" />
                    </div>

                    {/* Error */}
                    {error && (
                        <p style={{
                            color: '#fca5a5', fontSize: '0.83rem', marginTop: '0.9rem',
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '9px', padding: '0.5rem 0.9rem',
                        }}>⚠️ {error}</p>
                    )}

                    {/* Submit */}
                    <Button fullWidth variant="contained" onClick={handleAuth} disabled={loading} sx={{
                        mt: 2.5, py: 1.3, borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem',
                        background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                        textTransform: 'none',
                        boxShadow: '0 6px 20px rgba(14,165,233,0.32)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                            boxShadow: '0 8px 26px rgba(14,165,233,0.42)',
                        },
                    }}>
                        {loading
                            ? <CircularProgress size={20} sx={{ color: 'white' }} />
                            : formState === 0 ? 'Sign In' : 'Create Account'
                        }
                    </Button>

                    {/* Switch hint */}
                    <p style={{ textAlign: 'center', marginTop: '1.2rem', fontSize: '0.84rem', color: 'rgba(139,154,176,0.55)' }}>
                        {formState === 0 ? "Don't have an account? " : "Already have an account? "}
                        <span onClick={() => switchTab(formState === 0 ? 1 : 0)}
                            style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 600 }}>
                            {formState === 0 ? 'Sign Up' : 'Sign In'}
                        </span>
                    </p>
                    <p onClick={() => navigate('/')} style={{
                        textAlign: 'center', marginTop: '0.7rem', fontSize: '0.82rem',
                        color: 'rgba(139,154,176,0.35)', cursor: 'pointer',
                    }}>← Back to home</p>
                </div>
            </div>

            {/* ── Guest Join Card ── */}
            <div style={{
                width: '100%',
                maxWidth: '420px',
                marginTop: '1rem',
                background: 'rgba(14,165,233,0.03)',
                border: '1px solid rgba(14,165,233,0.1)',
                borderRadius: '16px',
                padding: '1.2rem 1.6rem',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
            }}>
                <p style={{
                    textAlign: 'center', fontSize: '0.84rem',
                    color: 'rgba(139,154,176,0.6)', marginBottom: '0.8rem',
                }}>
                    No account? Join a meeting directly as a guest
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        value={guestCode}
                        onChange={e => setGuestCode(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && guestCode.trim() && navigate(`/${guestCode.trim()}`)}
                        placeholder="Enter meeting code"
                        style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(14,165,233,0.2)',
                            borderRadius: '9px',
                            color: '#e2f4fd',
                            padding: '0.55rem 0.9rem',
                            fontSize: '0.88rem',
                            fontFamily: 'inherit',
                            outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = '#0ea5e9'}
                        onBlur={e => e.target.style.borderColor = 'rgba(14,165,233,0.2)'}
                    />
                    <button
                        onClick={() => guestCode.trim() && navigate(`/${guestCode.trim()}`)}
                        disabled={!guestCode.trim()}
                        style={{
                            background: guestCode.trim()
                                ? 'linear-gradient(135deg, #0ea5e9, #0284c7)'
                                : 'rgba(255,255,255,0.06)',
                            border: 'none',
                            borderRadius: '9px',
                            color: guestCode.trim() ? 'white' : 'rgba(255,255,255,0.25)',
                            padding: '0.55rem 1rem',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: guestCode.trim() ? 'pointer' : 'not-allowed',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s',
                        }}
                    >
                        Join →
                    </button>
                </div>
            </div>

            <Snackbar open={open} autoHideDuration={4000} onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert onClose={() => setOpen(false)} severity="success"
                    sx={{ borderRadius: '10px', background: '#0c4a6e', color: '#e0f2fe' }}>
                    {snackMsg}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
}
