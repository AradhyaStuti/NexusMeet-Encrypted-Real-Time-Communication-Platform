import { render, screen } from '@testing-library/react';
import App from './App';

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

test('renders landing page with MeetSync branding', () => {
    render(<App />);
    const brandElements = screen.getAllByText(/MeetSync/i);
    expect(brandElements.length).toBeGreaterThan(0);
});

test('renders Get Started and Join as Guest buttons', () => {
    render(<App />);
    expect(screen.getByText(/Get Started Free/i)).toBeInTheDocument();
    const guestButtons = screen.getAllByText(/Join as Guest/i);
    expect(guestButtons.length).toBeGreaterThan(0);
});
