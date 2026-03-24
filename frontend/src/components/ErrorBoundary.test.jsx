import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// Component that throws on render
function ThrowingComponent() {
    throw new Error('Test error')
}

function GoodComponent() {
    return <div>Working fine</div>
}

// Suppress console.error for expected errors in tests
const originalError = console.error
beforeAll(() => { console.error = jest.fn() })
afterAll(() => { console.error = originalError })

test('renders children when no error', () => {
    render(
        <ErrorBoundary>
            <GoodComponent />
        </ErrorBoundary>
    )
    expect(screen.getByText('Working fine')).toBeInTheDocument()
})

test('renders error UI when child throws', () => {
    render(
        <ErrorBoundary>
            <ThrowingComponent />
        </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Reload Page')).toBeInTheDocument()
    expect(screen.getByText('Go Home')).toBeInTheDocument()
})

test('shows error details in development mode', () => {
    render(
        <ErrorBoundary>
            <ThrowingComponent />
        </ErrorBoundary>
    )
    expect(screen.getByText(/Test error/)).toBeInTheDocument()
})
