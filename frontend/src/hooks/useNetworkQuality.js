import { useState, useEffect } from 'react'

/**
 * Monitors WebRTC peer connection RTT and returns a quality label.
 * @param {{ connectionsRef: React.RefObject, active: boolean }} params
 */
export function useNetworkQuality({ connectionsRef, active }) {
    const [networkQuality, setNetworkQuality] = useState('good')

    useEffect(() => {
        if (!active) return

        const interval = setInterval(async () => {
            const connections = connectionsRef.current
            for (const id in connections) {
                try {
                    const stats = await connections[id].getStats()
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            const rtt = report.currentRoundTripTime
                            if (rtt !== undefined) {
                                if (rtt < 0.15) setNetworkQuality('good')
                                else if (rtt < 0.4) setNetworkQuality('fair')
                                else setNetworkQuality('poor')
                            }
                        }
                    })
                } catch { }
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [active, connectionsRef])

    return { networkQuality }
}
