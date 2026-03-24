import { renderHook, act } from '@testing-library/react'
import { useEncryptedChat } from '../hooks/useEncryptedChat'

// Mock encryption utilities
jest.mock('../utils/encryption', () => ({
    getOrCreateRoomKey: jest.fn().mockResolvedValue({ key: 'testkey123', isNew: false }),
    encryptMessage: jest.fn().mockResolvedValue('encrypted-payload'),
    decryptMessage: jest.fn().mockImplementation((data) => Promise.resolve(`decrypted:${data}`)),
}))

import { getOrCreateRoomKey, encryptMessage, decryptMessage } from '../utils/encryption'

const makeRefs = () => ({
    socketRef: { current: { emit: jest.fn() } },
    socketIdRef: { current: 'self-id' },
})

describe('useEncryptedChat — init', () => {
    it('starts with empty messages', () => {
        const { result } = renderHook(() => useEncryptedChat(makeRefs()))
        expect(result.current.messages).toEqual([])
    })

    it('starts with e2eEnabled false', () => {
        const { result } = renderHook(() => useEncryptedChat(makeRefs()))
        expect(result.current.e2eEnabled).toBe(false)
    })

    it('initE2E calls getOrCreateRoomKey', async () => {
        const { result } = renderHook(() => useEncryptedChat(makeRefs()))
        await act(async () => { await result.current.initE2E() })
        expect(getOrCreateRoomKey).toHaveBeenCalled()
    })

    it('initE2E does not crash if getOrCreateRoomKey throws', async () => {
        getOrCreateRoomKey.mockRejectedValueOnce(new Error('no crypto'))
        const { result } = renderHook(() => useEncryptedChat(makeRefs()))
        await act(async () => { await result.current.initE2E() })
        expect(result.current.e2eEnabled).toBe(false)
    })
})

describe('useEncryptedChat — addMessage', () => {
    it('adds plain message when E2E is disabled', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.addMessage('hello', 'Alice', 'other-id', 1000) })
        expect(result.current.messages).toHaveLength(1)
        expect(result.current.messages[0].data).toBe('hello')
        expect(result.current.messages[0].sender).toBe('Alice')
    })

    it('increments newMessages for messages from others', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.addMessage('hi', 'Bob', 'other-id', 1000) })
        expect(result.current.newMessages).toBe(1)
    })

    it('does not increment newMessages for own messages', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.addMessage('hi', 'Me', 'self-id', 1000) })
        expect(result.current.newMessages).toBe(0)
    })

    it('calls decryptMessage when E2E key is set', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        result.current.e2eKeyRef.current = 'testkey123'
        await act(async () => { await result.current.addMessage('encrypted-data', 'Alice', 'other-id', 1000) })
        expect(decryptMessage).toHaveBeenCalledWith('encrypted-data', 'testkey123')
    })

    it('adds message to list after receiving', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.addMessage('hello', 'Alice', 'other-id', 1000) })
        expect(result.current.messages[0]).toMatchObject({ sender: 'Alice', data: 'hello', timestamp: 1000 })
    })

    it('falls back to raw data if decryption fails', async () => {
        decryptMessage.mockRejectedValueOnce(new Error('bad key'))
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        result.current.e2eKeyRef.current = 'testkey123'
        await act(async () => { await result.current.addMessage('raw-data', 'X', 'other', 1000) })
        expect(result.current.messages[0]).toMatchObject({ sender: 'X' })
    })

    it('accumulates multiple messages', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => {
            await result.current.addMessage('m1', 'A', 'a', 1)
            await result.current.addMessage('m2', 'B', 'b', 2)
            await result.current.addMessage('m3', 'C', 'c', 3)
        })
        expect(result.current.messages).toHaveLength(3)
    })
})

describe('useEncryptedChat — sendMessage', () => {
    it('does not emit empty message', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.sendMessage('   ') })
        expect(refs.socketRef.current.emit).not.toHaveBeenCalledWith('chat-message', expect.anything(), expect.anything())
    })

    it('emits chat-message when E2E disabled', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.sendMessage('hello world') })
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('chat-message', 'hello world', '')
    })

    it('calls encryptMessage when E2E key is set', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        result.current.e2eKeyRef.current = 'testkey123'
        await act(async () => { await result.current.sendMessage('secret') })
        expect(encryptMessage).toHaveBeenCalledWith('secret', 'testkey123')
    })

    it('emits typing false after sending', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.sendMessage('hi') })
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('typing', false)
    })
})

describe('useEncryptedChat — typing indicator', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('handleMessageChange updates message state', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        act(() => result.current.handleMessageChange('hel'))
        expect(result.current.message).toBe('hel')
    })

    it('handleMessageChange emits typing true', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        act(() => result.current.handleMessageChange('x'))
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('typing', true)
    })

    it('emits typing false after 2 second idle', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        act(() => result.current.handleMessageChange('x'))
        act(() => jest.advanceTimersByTime(2000))
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('typing', false)
    })

    it('updateTypingUser adds user to set', () => {
        const { result } = renderHook(() => useEncryptedChat(makeRefs()))
        act(() => result.current.updateTypingUser('peer1', true))
        expect(result.current.typingUsers.has('peer1')).toBe(true)
    })

    it('updateTypingUser removes user from set', () => {
        const { result } = renderHook(() => useEncryptedChat(makeRefs()))
        act(() => result.current.updateTypingUser('peer1', true))
        act(() => result.current.updateTypingUser('peer1', false))
        expect(result.current.typingUsers.has('peer1')).toBe(false)
    })
})
