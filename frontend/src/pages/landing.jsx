import { useState } from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'
import UshaMeetXLogo from '../components/UshaMeetXLogo'

export default function LandingPage() {
    const navigate = useNavigate()
    const [guestOpen, setGuestOpen] = useState(false)
    const [guestCode, setGuestCode] = useState('')

    const handleGuestJoin = () => {
        const code = guestCode.trim()
        if (!code) return
        navigate(`/${code}`)
    }

    return (
        <div className='landingPageContainer'>
            {/* ── Navbar ── */}
            <nav>
                <div className='navBrand'>
                    <UshaMeetXLogo size={36} />
                    <h2>UshaMeetX</h2>
                </div>
                <div className='navlist'>
                    <button className='navGuestBtn' onClick={() => setGuestOpen(o => !o)}>
                        Join as Guest
                    </button>
                    <button className='navRegisterBtn' onClick={() => navigate("/auth")}>
                        Sign Up
                    </button>
                    <button className='navLoginBtn' onClick={() => navigate("/auth")}>
                        Sign In
                    </button>
                </div>
            </nav>

            {/* ── Guest join bar (dropdown from nav) ── */}
            {guestOpen && (
                <div className="guestBar">
                    <span className="guestBarLabel">Enter a meeting code to join as guest</span>
                    <div className="guestBarRow">
                        <input
                            className="guestBarInput"
                            placeholder="Meeting code  (e.g. abc12345)"
                            value={guestCode}
                            onChange={e => setGuestCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleGuestJoin()}
                            autoFocus
                        />
                        <button
                            className="guestBarBtn"
                            onClick={handleGuestJoin}
                            disabled={!guestCode.trim()}
                        >
                            Join Now →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Hero Section ── */}
            <div className="landingMainContainer">
                <div className="landingHeroText">
                    <div className="heroBadge">
                        ✨ Free HD Video Conferencing
                    </div>
                    <h1>
                        <span className="highlight">Connect</span> with anyone,<br />
                        anywhere, anytime
                    </h1>
                    <p>
                        UshaMeetX brings high-quality video meetings to everyone.
                        Host secure, crystal-clear calls with screen sharing, live chat,
                        and instant join — no downloads required.
                    </p>
                    <div className="heroButtons">
                        <Link to="/auth" className="btnPrimary">
                            Get Started Free
                        </Link>
                        <button className="btnOutline" onClick={() => setGuestOpen(o => !o)}>
                            Join as Guest
                        </button>
                    </div>

                    {/* Stats row */}
                    <div className="heroStats">
                        <div className="heroStat">
                            <span className="heroStatNum">10K+</span>
                            <span className="heroStatLabel">Meetings Hosted</span>
                        </div>
                        <div className="heroStatDivider"></div>
                        <div className="heroStat">
                            <span className="heroStatNum">50K+</span>
                            <span className="heroStatLabel">Users</span>
                        </div>
                        <div className="heroStatDivider"></div>
                        <div className="heroStat">
                            <span className="heroStatNum">99.9%</span>
                            <span className="heroStatLabel">Uptime</span>
                        </div>
                    </div>
                </div>

                {/* ── Mock Video Card ── */}
                <div className="landingHeroVisual">
                    <div className="heroMockup">
                        <div className="mockupHeader">
                            <div className="mockupHeaderLeft">
                                <div className="mockupDot red"></div>
                                <div className="mockupDot yellow"></div>
                                <div className="mockupDot green"></div>
                                <span className="mockupTitle">UshaMeetX — Room #meet2024</span>
                            </div>
                            <div className="mockupLive">
                                <div className="mockupLiveDot"></div>
                                LIVE
                            </div>
                        </div>

                        <div className="mockupGrid">
                            <div className="mockParticipant">
                                <div className="mockAvatar blue">U</div>
                                <span className="mockParticipantName">Usha (You)</span>
                            </div>
                            <div className="mockParticipant">
                                <div className="mockAvatar green">R</div>
                                <span className="mockParticipantName">Rahul</span>
                            </div>
                            <div className="mockParticipant">
                                <div className="mockAvatar pink">P</div>
                                <span className="mockParticipantName">Priya</span>
                            </div>
                            <div className="mockParticipant">
                                <div className="mockAvatar orange">A</div>
                                <span className="mockParticipantName">Arjun</span>
                            </div>
                        </div>

                        {/* Control bar inside mockup */}
                        <div className="mockupControls">
                            <div className="mockupControlRow">
                                <div className="mockControlBtn dark" title="Mic">🎤</div>
                                <div className="mockControlBtn dark" title="Camera">📷</div>
                                <div className="mockControlBtn dark" title="Screen">🖥️</div>
                                <div className="mockControlBtn dark" title="Chat">💬</div>
                                <div className="mockControlBtn red" title="End">📵</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Feature Section ── */}
            <div className="landingFeatures">
                <div className="featuresHeading">
                    <h2>Everything you need for great meetings</h2>
                    <p>Built for teams, families, and professionals</p>
                </div>
                <div className="featuresGrid">
                    <div className="featureCard">
                        <div className="featureIcon" style={{ background: 'linear-gradient(135deg, rgba(14,114,237,0.2), rgba(14,114,237,0.45))' }}>🎥</div>
                        <h3>HD Video Calls</h3>
                        <p>Crystal-clear video quality with adaptive streaming for any connection speed.</p>
                    </div>
                    <div className="featureCard">
                        <div className="featureIcon" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(6,182,212,0.45))' }}>🖥️</div>
                        <h3>Screen Sharing</h3>
                        <p>Share your screen instantly — perfect for presentations, demos, and collaboration.</p>
                    </div>
                    <div className="featureCard">
                        <div className="featureIcon" style={{ background: 'linear-gradient(135deg, rgba(5,150,105,0.2), rgba(5,150,105,0.45))' }}>💬</div>
                        <h3>Live Chat</h3>
                        <p>Send messages to everyone in the meeting in real time without interrupting.</p>
                    </div>
                    <div className="featureCard">
                        <div className="featureIcon" style={{ background: 'linear-gradient(135deg, rgba(217,119,6,0.2), rgba(217,119,6,0.45))' }}>📌</div>
                        <h3>Spotlight Anyone</h3>
                        <p>Tap any participant's video to spotlight them — instantly brings them front and center.</p>
                    </div>
                    <div className="featureCard">
                        <div className="featureIcon" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.45))' }}>🔊</div>
                        <h3>Volume Control</h3>
                        <p>Manage each participant's audio volume independently right from the meeting screen.</p>
                    </div>
                    <div className="featureCard">
                        <div className="featureIcon" style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.45))' }}>📋</div>
                        <h3>Meeting History</h3>
                        <p>Keep track of all your past meetings and quickly rejoin with one click.</p>
                    </div>
                </div>
            </div>

            {/* ── CTA Footer ── */}
            <div className="landingCTA">
                <div className="landingCTAInner">
                    <h2>Ready to meet?</h2>
                    <p>Join thousands of people already using UshaMeetX every day.</p>
                    <div className="heroButtons" style={{ justifyContent: 'center' }}>
                        <Link to="/auth" className="btnPrimary">
                            Create Free Account
                        </Link>
                        <button className="btnOutline" onClick={() => { setGuestOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                            Join as Guest
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
