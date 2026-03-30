import { renderHook, act } from '@testing-library/react'
import { useRoomControls } from '../hooks/useRoomControls'

const makeRefs = () => ({
    socketRef: { current: { emit: jest.fn() } },
    socketIdRef: { current: 'socket-self' },
    remoteVideoElems: { current: {} },
})

describe('useRoomControls — hand raise', () => {
    it('toggleHandRaise emits hand-raise and toggles state', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useRoomControls(refs))
        expect(result.current.handRaised).toBe(false)
        act(() => result.current.toggleHandRaise())
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('hand-raise', true)
        expect(result.current.handRaised).toBe(true)
    })
})

describe('useRoomControls — spotlight / pin', () => {
    it('handlePinToggle pins and unpins a socket', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        expect(result.current.pinnedVideo).toBeNull()
        act(() => result.current.handlePinToggle('peer1'))
        expect(result.current.pinnedVideo).toBe('peer1')
        act(() => result.current.handlePinToggle('peer1'))
        expect(result.current.pinnedVideo).toBeNull()
    })
})
