import { renderHook, act } from '@testing-library/react'
import { useNetworkQuality } from '../hooks/useNetworkQuality'

jest.useFakeTimers()

const makeConnection = (rtt) => ({
    getStats: jest.fn().mockResolvedValue(new Map([
        ['pair1', { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: rtt }],
    ])),
})

describe('useNetworkQuality', () => {
    it('starts with good quality', () => {
        const connectionsRef = { current: {} }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        expect(result.current.networkQuality).toBe('good')
    })

    it('stays good when no connections exist', async () => {
        const connectionsRef = { current: {} }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(5000) })
        expect(result.current.networkQuality).toBe('good')
    })

    it('sets good quality for RTT < 0.15', async () => {
        const connectionsRef = { current: { peer1: makeConnection(0.05) } }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(5000) })
        expect(result.current.networkQuality).toBe('good')
    })

    it('sets fair quality for RTT between 0.15 and 0.4', async () => {
        const connectionsRef = { current: { peer1: makeConnection(0.25) } }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(5000) })
        expect(result.current.networkQuality).toBe('fair')
    })

    it('sets poor quality for RTT >= 0.4', async () => {
        const connectionsRef = { current: { peer1: makeConnection(0.5) } }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(5000) })
        expect(result.current.networkQuality).toBe('poor')
    })

    it('does not start interval when inactive', async () => {
        const connectionsRef = { current: { peer1: makeConnection(0.5) } }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: false }))
        await act(async () => { jest.advanceTimersByTime(10000) })
        expect(result.current.networkQuality).toBe('good')
        expect(connectionsRef.current.peer1.getStats).not.toHaveBeenCalled()
    })

    it('handles getStats throwing without crashing', async () => {
        const connectionsRef = {
            current: {
                peer1: { getStats: jest.fn().mockRejectedValue(new Error('closed')) },
            },
        }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(5000) })
        expect(result.current.networkQuality).toBe('good') // unchanged, no crash
    })

    it('polls every 5 seconds', async () => {
        const connectionsRef = { current: { peer1: makeConnection(0.1) } }
        renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(15000) })
        expect(connectionsRef.current.peer1.getStats).toHaveBeenCalledTimes(3)
    })

    it('ignores candidate-pair reports that are not succeeded', async () => {
        const connectionsRef = {
            current: {
                peer1: {
                    getStats: jest.fn().mockResolvedValue(new Map([
                        ['pair1', { type: 'candidate-pair', state: 'waiting', currentRoundTripTime: 0.9 }],
                    ])),
                },
            },
        }
        const { result } = renderHook(() => useNetworkQuality({ connectionsRef, active: true }))
        await act(async () => { jest.advanceTimersByTime(5000) })
        expect(result.current.networkQuality).toBe('good') // not changed by non-succeeded pair
    })
})
