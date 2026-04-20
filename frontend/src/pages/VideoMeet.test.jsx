import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideoMeetComponent from '../pages/VideoMeet'

const mockMedia = {
    videoAvailable: true, audioAvailable: true, screenAvailable: true,
    video: true, audio: true, screen: false,
    setVideo: jest.fn(), setAudio: jest.fn(),
    getPermissions: jest.fn().mockResolvedValue(undefined),
    getUserMedia: jest.fn(), getUserMediaSuccess: jest.fn(),
    getDisplayMedia: jest.fn(), getDisplayMediaSuccess: jest.fn(),
    handleVideo: jest.fn(), handleAudio: jest.fn(), handleScreen: jest.fn(),
    startMedia: jest.fn(),
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

const mockLobby = {
    waitingStatus: null, isHost: false, waitingUsers: [],
    admitUser: jest.fn(), rejectUser: jest.fn(), admitAll: jest.fn(),
    registerListeners: jest.fn(),
}
jest.mock('../hooks/useWaitingRoom', () => ({
    useWaitingRoom: () => mockLobby,
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
jest.mock('../components/NexusMeetLogo', () => () => <div data-testid="logo" />)

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
    useMediaDevices.mockReturnValue(mockMedia)
    useNetworkQuality.mockReturnValue({ networkQuality: 'good' })
    useEncryptedChat.mockReturnValue(mockChat)
    useRoomControls.mockReturnValue(mockRoom)
    const io = require('socket.io-client')
    io.default.connect.mockReturnValue(mockSocket)
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

describe('VideoMeet — lobby', () => {
    it('renders lobby with name input and disabled join button', () => {
        renderMeet()
        expect(screen.getByText('Ready to join?')).toBeInTheDocument()
        expect(screen.getByLabelText('Your Name')).toBeInTheDocument()
        expect(screen.getByText('Join Meeting')).toBeDisabled()
    })
})

describe('VideoMeet — join flow', () => {
    it('hides lobby and shows waiting room after joining', async () => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bob' } })
        fireEvent.click(screen.getByText('Join Meeting'))
        await waitFor(() => expect(screen.queryByText('Ready to join?')).not.toBeInTheDocument())
        expect(screen.getByText('Waiting for others to join...')).toBeInTheDocument()
    })
})

describe('VideoMeet — controls', () => {
    it('keyboard M triggers handleAudio', async () => {
        renderMeet()
        fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Carol' } })
        fireEvent.click(screen.getByText('Join Meeting'))
        await screen.findByText('Waiting for others to join...')
        fireEvent.keyDown(document, { key: 'm' })
        expect(mockMedia.handleAudio).toHaveBeenCalled()
    })
})
