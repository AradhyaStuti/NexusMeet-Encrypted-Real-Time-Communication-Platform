import { Component } from 'react'
import MeetSyncLogo from './MeetSyncLogo'

/**
 * React Error Boundary — catches render errors in child tree
 * and shows a recovery UI instead of a white screen.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary]', error, errorInfo.componentStack)
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null })
        window.location.reload()
    }

    handleGoHome = () => {
        this.setState({ hasError: false, error: null })
        window.location.href = '/'
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    background: 'linear-gradient(155deg, #040d18 0%, #071a2e 55%, #040d18 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                    padding: '2rem',
                }}>
                    <div style={{
                        textAlign: 'center',
                        maxWidth: 440,
                        background: 'rgba(14,165,233,0.04)',
                        border: '1px solid rgba(14,165,233,0.14)',
                        borderRadius: 24,
                        padding: '2.5rem 2rem',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
                    }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <MeetSyncLogo size={48} />
                        </div>
                        <h1 style={{
                            fontSize: '1.4rem',
                            fontWeight: 700,
                            color: '#f0f6fc',
                            marginBottom: '0.6rem',
                        }}>
                            Something went wrong
                        </h1>
                        <p style={{
                            fontSize: '0.88rem',
                            color: 'rgba(139,154,176,0.7)',
                            lineHeight: 1.6,
                            marginBottom: '1.8rem',
                        }}>
                            An unexpected error occurred. This has been logged and we'll look into it.
                        </p>

                        {process.env.NODE_ENV !== 'production' && this.state.error && (
                            <pre style={{
                                textAlign: 'left',
                                fontSize: '0.72rem',
                                color: '#fca5a5',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: 10,
                                padding: '0.8rem',
                                marginBottom: '1.5rem',
                                overflowX: 'auto',
                                maxHeight: 120,
                            }}>
                                {this.state.error.toString()}
                            </pre>
                        )}

                        <div style={{ display: 'flex', gap: '0.7rem', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleReload}
                                style={{
                                    background: '#0ea5e9',
                                    border: 'none',
                                    color: 'white',
                                    padding: '0.7rem 1.6rem',
                                    borderRadius: 10,
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'background 0.2s',
                                }}
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={this.handleGoHome}
                                style={{
                                    background: 'transparent',
                                    border: '1.5px solid rgba(255,255,255,0.15)',
                                    color: '#c9d8e8',
                                    padding: '0.7rem 1.6rem',
                                    borderRadius: 10,
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                }}
                            >
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
