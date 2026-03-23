import { render, screen } from '@testing-library/react';
import App from './App';

// Mock navigator.mediaDevices for VideoMeet
Object.defineProperty(navigator, 'mediaDevices', {
    value: {
        getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [],
        }),
        getDisplayMedia: jest.fn().mockResolvedValue({
            getTracks: () => [],
        }),
    },
    writable: true,
});

test('renders landing page with UshaMeetX branding', () => {
    render(<App />);
    const brandElements = screen.getAllByText(/UshaMeetX/i);
    expect(brandElements.length).toBeGreaterThan(0);
});

test('renders Get Started button on landing page', () => {
    render(<App />);
    const button = screen.getByText(/Get Started Free/i);
    expect(button).toBeInTheDocument();
});

test('renders Join as Guest button on landing page', () => {
    render(<App />);
    const buttons = screen.getAllByText(/Join as Guest/i);
    expect(buttons.length).toBeGreaterThan(0);
});

test('renders feature section heading', () => {
    render(<App />);
    expect(screen.getByText(/Everything you need for great meetings/i)).toBeInTheDocument();
});

test('renders HD Video Calls feature', () => {
    render(<App />);
    const elements = screen.getAllByText(/HD Video Calls/i);
    expect(elements.length).toBeGreaterThan(0);
});

test('renders Screen Sharing feature', () => {
    render(<App />);
    const elements = screen.getAllByText(/Screen Sharing/i);
    expect(elements.length).toBeGreaterThan(0);
});

test('renders Live Chat feature', () => {
    render(<App />);
    const elements = screen.getAllByText(/Live Chat/i);
    expect(elements.length).toBeGreaterThan(0);
});

test('renders sign in and sign up navigation', () => {
    render(<App />);
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
});

test('renders hero section with tagline', () => {
    render(<App />);
    expect(screen.getByText(/anywhere, anytime/i)).toBeInTheDocument();
});

test('renders CTA section', () => {
    render(<App />);
    expect(screen.getByText(/Ready to meet/i)).toBeInTheDocument();
});
