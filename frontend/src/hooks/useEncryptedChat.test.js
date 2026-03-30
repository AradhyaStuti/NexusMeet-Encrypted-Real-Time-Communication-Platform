import { renderHook, act } from '@testing-library/react'
import { useEncryptedChat } from '../hooks/useEncryptedChat'

jest.mock('../utils/encryption', () => ({
    getOrCreateRoomKey: jest.fn().mockResolvedValue({ key: 'testkey123', isNew: false }),
    encryptMessage: jest.fn().mockResolvedValue('encrypted-payload'),
    decryptMessage: jest.fn().mockImplementation((data) => Promise.resolve(`decrypted:${data}`)),
}))

const makeRefs = () => ({
    socketRef: { current: { emit: jest.fn() } },
    socketIdRef: { current: 'self-id' },
})

describe('useEncryptedChat — addMessage', () => {
    it('adds plain message and increments newMessages for others', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.addMessage('hello', 'Alice', 'other-id', 1000) })
        expect(result.current.messages).toHaveLength(1)
        expect(result.current.messages[0].data).toBe('hello')
        expect(result.current.newMessages).toBe(1)
    })
})

describe('useEncryptedChat — sendMessage', () => {
    it('emits chat-message and typing false', async () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useEncryptedChat(refs))
        await act(async () => { await result.current.sendMessage('hello world') })
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('chat-message', 'hello world', '')
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('typing', false)
    })
})
