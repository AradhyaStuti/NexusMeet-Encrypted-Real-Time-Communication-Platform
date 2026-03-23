import { render, screen, fireEvent } from '@testing-library/react'
import AvatarPicker, { getAvatar, saveAvatar } from './AvatarPicker'

beforeEach(() => {
    localStorage.clear()
})

test('getAvatar returns default emoji when no avatar saved', () => {
    expect(getAvatar()).toBe('😊')
})

test('saveAvatar persists to localStorage', () => {
    saveAvatar('🦊')
    expect(getAvatar()).toBe('🦊')
})

test('renders avatar button', () => {
    render(<AvatarPicker size={36} />)
    const button = screen.getByTitle('Change avatar')
    expect(button).toBeInTheDocument()
})

test('opens picker on click', () => {
    render(<AvatarPicker size={36} />)
    fireEvent.click(screen.getByTitle('Change avatar'))
    expect(screen.getByText('Choose your avatar')).toBeInTheDocument()
})

test('selects an avatar and closes picker', () => {
    render(<AvatarPicker size={36} />)
    fireEvent.click(screen.getByTitle('Change avatar'))
    // Click on the fox avatar
    const foxButton = screen.getByText('🦊')
    fireEvent.click(foxButton)
    // Picker should close — "Choose your avatar" should not be visible
    expect(screen.queryByText('Choose your avatar')).not.toBeInTheDocument()
    // Avatar should be saved
    expect(getAvatar()).toBe('🦊')
})
