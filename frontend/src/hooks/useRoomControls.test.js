import { renderHook, act } from '@testing-library/react'
import { useRoomControls } from '../hooks/useRoomControls'

jest.useFakeTimers()

const makeRefs = () => ({
    socketRef: { current: { emit: jest.fn() } },
    socketIdRef: { current: 'socket-self' },
    remoteVideoElems: { current: {} },
})

describe('useRoomControls — hand raise', () => {
    it('starts with handRaised false', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        expect(result.current.handRaised).toBe(false)
    })

    it('toggleHandRaise emits hand-raise true on first call', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.toggleHandRaise())
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('hand-raise', true)
        expect(result.current.handRaised).toBe(true)
    })

    it('toggleHandRaise emits false on second call', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.toggleHandRaise())
        act(() => result.current.toggleHandRaise())
        expect(refs.socketRef.current.emit).toHaveBeenLastCalledWith('hand-raise', false)
        expect(result.current.handRaised).toBe(false)
    })

    it('updateRemoteHandRaise adds a participant', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.updateRemoteHandRaise('peer1', true))
        expect(result.current.raisedHands).toEqual({ peer1: true })
    })

    it('updateRemoteHandRaise removes a participant', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.updateRemoteHandRaise('peer1', true))
        act(() => result.current.updateRemoteHandRaise('peer1', false))
        expect(result.current.raisedHands).toEqual({})
    })
})

describe('useRoomControls — reactions', () => {
    it('starts with empty reactions', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        expect(result.current.activeReactions).toEqual([])
    })

    it('sendReaction emits to socket and adds locally', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.sendReaction('👍'))
        expect(refs.socketRef.current.emit).toHaveBeenCalledWith('reaction', '👍')
        expect(result.current.activeReactions).toHaveLength(1)
        expect(result.current.activeReactions[0].emoji).toBe('👍')
    })

    it('reactions expire after 3 seconds', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.sendReaction('❤️'))
        expect(result.current.activeReactions).toHaveLength(1)
        act(() => jest.advanceTimersByTime(3000))
        expect(result.current.activeReactions).toHaveLength(0)
    })

    it('addRemoteReaction adds a reaction without socket emit', () => {
        const refs = makeRefs()
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.addRemoteReaction('peer2', '🎉'))
        expect(result.current.activeReactions).toHaveLength(1)
        expect(result.current.activeReactions[0].emoji).toBe('🎉')
        expect(refs.socketRef.current.emit).not.toHaveBeenCalled()
    })

    it('sendReaction closes the reaction picker', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.setShowReactionPicker(true))
        act(() => result.current.sendReaction('👏'))
        expect(result.current.showReactionPicker).toBe(false)
    })
})

describe('useRoomControls — spotlight / pin', () => {
    it('starts with no pinned video', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        expect(result.current.pinnedVideo).toBeNull()
    })

    it('handlePinToggle pins a socket', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.handlePinToggle('peer1'))
        expect(result.current.pinnedVideo).toBe('peer1')
    })

    it('handlePinToggle unpins when called again with same socket', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.handlePinToggle('peer1'))
        act(() => result.current.handlePinToggle('peer1'))
        expect(result.current.pinnedVideo).toBeNull()
    })

    it('handlePinToggle disables local video large mode', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.handleLocalVideoClick()) // make large
        act(() => result.current.handlePinToggle('peer1'))
        expect(result.current.localVideoLarge).toBe(false)
    })

    it('handleLocalVideoClick toggles large mode', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        expect(result.current.localVideoLarge).toBe(false)
        act(() => result.current.handleLocalVideoClick())
        expect(result.current.localVideoLarge).toBe(true)
        act(() => result.current.handleLocalVideoClick())
        expect(result.current.localVideoLarge).toBe(false)
    })

    it('handleLocalVideoClick clears pinnedVideo', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.handlePinToggle('peer1'))
        act(() => result.current.handleLocalVideoClick())
        expect(result.current.pinnedVideo).toBeNull()
    })
})

describe('useRoomControls — volume', () => {
    it('handleVolumeChange updates videoVolumes state', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.handleVolumeChange('peer1', 50))
        expect(result.current.videoVolumes.peer1).toBe(50)
    })

    it('handleVolumeChange sets element volume as fraction', () => {
        const refs = makeRefs()
        const el = { volume: 1 }
        refs.remoteVideoElems.current.peer1 = el
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.handleVolumeChange('peer1', 50))
        expect(el.volume).toBe(0.5)
    })

    it('assignRemoteRef sets srcObject and volume', () => {
        const refs = makeRefs()
        const el = { srcObject: null, volume: 1 }
        const stream = { id: 'stream1' }
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.assignRemoteRef(el, 'peer1', stream, {}))
        expect(el.srcObject).toBe(stream)
        expect(el.volume).toBe(1) // default 100%
    })

    it('assignRemoteRef uses custom volume when set', () => {
        const refs = makeRefs()
        const el = { srcObject: null, volume: 1 }
        const stream = { id: 'stream1' }
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.assignRemoteRef(el, 'peer1', stream, { peer1: 60 }))
        expect(el.volume).toBe(0.6)
    })

    it('assignRemoteRef stores element in remoteVideoElems ref', () => {
        const refs = makeRefs()
        const el = { srcObject: null, volume: 1 }
        const { result } = renderHook(() => useRoomControls(refs))
        act(() => result.current.assignRemoteRef(el, 'peer1', { id: 's' }, {}))
        expect(refs.remoteVideoElems.current.peer1).toBe(el)
    })
})

describe('useRoomControls — copy link', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: jest.fn().mockResolvedValue(undefined) },
        })
    })

    it('copyMeetingLink shows toast', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.copyMeetingLink())
        expect(result.current.copyToast).toBe(true)
    })

    it('toast disappears after 2 seconds', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.copyMeetingLink())
        act(() => jest.advanceTimersByTime(2000))
        expect(result.current.copyToast).toBe(false)
    })

    it('copyMeetingLink writes to clipboard', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.copyMeetingLink())
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href)
    })
})

describe('useRoomControls — removeParticipant', () => {
    it('removes from raisedHands', () => {
        const { result } = renderHook(() => useRoomControls(makeRefs()))
        act(() => result.current.updateRemoteHandRaise('peer1', true))
        act(() => result.current.removeParticipant('peer1'))
        expect(result.current.raisedHands.peer1).toBeUndefined()
    })
})
