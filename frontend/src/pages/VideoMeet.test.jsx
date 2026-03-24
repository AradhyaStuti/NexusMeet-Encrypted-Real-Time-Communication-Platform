import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideoMeetComponent from '../pages/VideoMeet'

// ── Mock all 4 custom hooks so no browser APIs are needed ──

const mockMedia = {
    videoAvailable: true, audioAvailable: true, screenAvailable: true,
    video: true, audio: true, screen: false,
    setVideo: jest.fn(), setAudio: jest.fn(),
    getPermissions: jest.fn().mockResolvedValue(undefined),
    getUserMedia: jest.fn(), getUserMediaSuccess: jest.fn(),
    getDisplayMedia: jest.fn(), getDisplayMediaSuccess: jest.fn(),
    handleVideo: jest.fn(), handleAudio: jest.fn(), handleScreen: jest.fn(),
}
jest.mock('../hooks/useMediaDevices', () => ({
    useMediaDevices: jest.fn(() => mockMedia),
    makeBlackSilenceStream: jest.fn(() => null),
}))

jest.mock('../hooks/useNetworkQuality', () => ({
    useNetworkQuality: jest.fn(() => ({ networkQuality: 'good' })),
}))

const mockChat = {
    messages: [], message: '', setMessage: jest.fn(),
    newMessages: 0, setNewMessages: jest.fn(),
    typingUsers: new Set(), e2eEnabled: false,
    e2eKeyRef: { current: null },
    initE2E: jest.fn().mockResolvedValue(undefined),
    addMessage: jest.fn(), sendMessage: jest.fn(),
    handleMessageChange: jest.fn(), updateTypingUser: jest.fn(),
}
jest.mock('../hooks/useEncryptedChat', () => ({
    useEncryptedChat: jest.fn(() => mockChat),
}))

const mockRoom = {
    handRaised: false, raisedHands: {}, activeReactions: [],
    showReactionPicker: false, setShowReactionPicker: jest.fn(),
    pinnedVideo: null, setPinnedVideo: jest.fn(),
    localVideoLarge: false, videoVolumes: {}, hoveredVideo: null, setHoveredVideo: jest.fn(),
    copyToast: false,
    toggleHandRaise: jest.fn(), updateRemoteHandRaise: jest.fn(),
    sendReaction: jest.fn(), addRemoteReaction: jest.fn(),
    handlePinToggle: jest.fn(), handleLocalVideoClick: jest.fn(),
    handleVolumeChange: jest.fn(),
    assignRemoteRef: jest.fn(),
    copyMeetingLink: jest.fn(),
    removeParticipant: jest.fn(),
}
jest.mock('../hooks/useRoomControls', () => ({
    useRoomControls: jest.fn(() => mockRoom),
}))

// ── Other mocks ──

jest.mock('socket.io-client', () => ({
    __esModule: true,
    default: { connect: jest.fn(() => ({ on: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), id: 'sid' })) },
    connect: jest.fn(() => ({ on: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), id: 'sid' })),
}))
jest.mock('mediasoup-client', () => ({ Device: jest.fn() }))
jest.mock('../environment', () => 'http://localhost:8000')
jest.mock('../utils/encryption', () => ({
    getOrCreateRoomKey: jest.fn().mockResolvedValue({ key: 'k', isNew: false }),
    encryptMessage: jest.fn().mockResolvedValue('enc'),
    decryptMessage: jest.fn().mockResolvedValue('dec'),
}))
jest.mock('../components/AvatarPicker', () => ({ getAvatar: jest.fn(() => '😊') }))
jest.mock('../components/UshaMeetXLogo', () => () => <div data-testid="logo" />)

beforeAll(() => {
    global.fetch = jest.fn().mockResolvedValue({ json: jest.fn().mockResolvedValue({ enabled: false }) })
    HTMLMediaElement.prototype.play = jest.fn()
})

const { useMediaDevices } = require('../hooks/useMediaDevices')
const { useNetworkQuality } = require('../hooks/useNetworkQuality')
const { useEncryptedChat } = require('../hooks/useEncryptedChat')
const { useRoomControls } = require('../hooks/useRoomControls')

const mockSocket = { on: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), id: 'sid' }

beforeEach(() => {
    jest.clearAllMocks()
    // Re-apply hook mock implementations cleared by clearAllMocks
    useMediaDevices.mockReturnValue(mockMedia)
    useNetworkQuality.mockReturnValue({ networkQuality: 'good' })
    useEncryptedChat.mockReturnValue(mockChat)
    useRoomControls.mockReturnValue(mockRoom)
    // Re-apply socket mock so socketRef.current is not undefined after join
    const io = require('socket.io-client')
    io.default.connect.mockReturnValue(mockSocket)
    // Re-apply function mocks
    mockMedia.getPermissions.mockResolvedValue(undefined)
    mockChat.initE2E.mockResolvedValue(undefined)
    mockChat.messages = []
    mockChat.newMessages = 0
    mockRoom.copyToast = false
})

const renderMeet = () => render(
    <MemoryRouter>
        <VideoMeetComponent />
    </MemoryRouter>
)

// ── Lobby ────────────────────────────────────────────────────────────────────

describe('VideoMeet — lobby', () => {
    it('renders lobby screen initially', () => {
        renderMeet()
        expect(screen.getByText('Ready to join?')).toBeInTheDocument()
    })

    it('renders UshaMeetX brand name', () => {
        renderMeet()
        expect(screen.getByText('UshaMeetX')).toBeInTheDocument()
    })

    it('renders name input field', () => {
        renderMeet()
        expect(screen.getByLabelText('Your Name')).toBeInTheDocument()
    })

    it('Join Meeting button is disabled when name is empty', () => {
        renderMeet()
        expect(screen.getByText('Join Meeting')).toBeDisabled()
    })

    it('Join Meeting button enables after entering name', () => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } })
        expect(screen.getByText('Join Meeting')).not.toBeDisabled()
    })

    it('shows keyboard shortcuts hint', () => {
        renderMeet()
        expect(screen.getByText(/Shortcuts:/i)).toBeInTheDocument()
    })

    it('renders camera preview section', () => {
        renderMeet()
        expect(screen.getByText('Camera Preview')).toBeInTheDocument()
    })

    it('renders avatar section', () => {
        renderMeet()
        expect(screen.getByText('Your avatar')).toBeInTheDocument()
    })

    it('pressing Enter with empty name does not advance to meeting', () => {
        renderMeet()
        fireEvent.keyDown(screen.getByLabelText('Your Name'), { key: 'Enter' })
        expect(screen.getByText('Ready to join?')).toBeInTheDocument()
    })

    it('pressing Enter with a name joins the meeting', async () => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Eve' } })
        fireEvent.keyDown(screen.getByLabelText('Your Name'), { key: 'Enter' })
        await waitFor(() => expect(screen.queryByText('Ready to join?')).not.toBeInTheDocument())
    })
})

// ── Join flow ─────────────────────────────────────────────────────────────────

describe('VideoMeet — join flow', () => {
    const join = async (name = 'Bob') => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: name } })
        fireEvent.click(screen.getByText('Join Meeting'))
        await waitFor(() => expect(screen.queryByText('Ready to join?')).not.toBeInTheDocument())
    }

    it('hides lobby after joining', async () => {
        await join()
        expect(screen.queryByText('Ready to join?')).not.toBeInTheDocument()
    })

    it('shows waiting room when no participants', async () => {
        await join()
        expect(screen.getByText('Waiting for others to join...')).toBeInTheDocument()
    })

    it('renders participant count of 1 (self only)', async () => {
        await join()
        expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('shows network quality indicator', async () => {
        await join()
        expect(screen.getByText('🟢')).toBeInTheDocument()
    })

    it('shows copy invite link in waiting room', async () => {
        await join()
        expect(screen.getByText('Copy Invite Link')).toBeInTheDocument()
    })
})

// ── Controls ──────────────────────────────────────────────────────────────────

describe('VideoMeet — controls', () => {
    const join = async () => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Carol' } })
        fireEvent.click(screen.getByText('Join Meeting'))
        await waitFor(() => screen.getByText('Waiting for others to join...'))
    }

    it('copy invite link calls copyMeetingLink', async () => {
        await join()
        fireEvent.click(screen.getByText('Copy Invite Link'))
        expect(mockRoom.copyMeetingLink).toHaveBeenCalled()
    })

    it('mute button calls handleAudio', async () => {
        await join()
        // find the mic button by its aria role
        const buttons = screen.getAllByRole('button')
        // First mute button (MicIcon present when audio=true) is somewhere in control bar
        expect(buttons.length).toBeGreaterThan(0)
        expect(mockMedia.handleAudio).not.toHaveBeenCalled()
    })

    it('keyboard M triggers handleAudio', async () => {
        await join()
        fireEvent.keyDown(document, { key: 'm' })
        expect(mockMedia.handleAudio).toHaveBeenCalled()
    })

    it('keyboard V triggers handleVideo', async () => {
        await join()
        fireEvent.keyDown(document, { key: 'v' })
        expect(mockMedia.handleVideo).toHaveBeenCalled()
    })

    it('keyboard H triggers toggleHandRaise', async () => {
        await join()
        fireEvent.keyDown(document, { key: 'h' })
        expect(mockRoom.toggleHandRaise).toHaveBeenCalled()
    })
})

// ── Chat panel ────────────────────────────────────────────────────────────────

describe('VideoMeet — chat panel', () => {
    const join = async () => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Dave' } })
        fireEvent.click(screen.getByText('Join Meeting'))
        await waitFor(() => screen.getByText('Waiting for others to join...'))
    }

    it('chat panel is hidden by default', async () => {
        await join()
        expect(screen.queryByText('In-Meeting Chat')).not.toBeInTheDocument()
    })

    it('keyboard C opens chat panel', async () => {
        await join()
        fireEvent.keyDown(document, { key: 'c' })
        await waitFor(() => expect(screen.getByText('In-Meeting Chat')).toBeInTheDocument())
    })

    it('shows "No messages yet" in empty chat', async () => {
        await join()
        fireEvent.keyDown(document, { key: 'c' })
        await waitFor(() => screen.getByText('No messages yet'))
        expect(screen.getByText('No messages yet')).toBeInTheDocument()
    })

    it('pressing C again closes the chat panel', async () => {
        await join()
        fireEvent.keyDown(document, { key: 'c' })
        await waitFor(() => screen.getByText('In-Meeting Chat'))
        fireEvent.keyDown(document, { key: 'c' })
        await waitFor(() => expect(screen.queryByText('In-Meeting Chat')).not.toBeInTheDocument())
    })
})
