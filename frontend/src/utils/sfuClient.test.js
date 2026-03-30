import { SfuClient } from '../utils/sfuClient'

jest.mock('mediasoup-client', () => ({ Device: jest.fn() }))

const { Device } = require('mediasoup-client')

let mockDevice
beforeEach(() => {
    mockDevice = {
        load: jest.fn().mockResolvedValue(undefined),
        rtpCapabilities: { codecs: [] },
        createSendTransport: jest.fn(),
        createRecvTransport: jest.fn(),
    }
    Device.mockImplementation(() => mockDevice)
})

const makeSocket = (responses = {}) => ({
    emit: jest.fn((event, data, cb) => {
        const res = responses[event] ?? {}
        if (typeof cb === 'function') cb(res)
        else if (typeof data === 'function') data(res)
    }),
})

describe('SfuClient — constructor', () => {
    it('creates a Device and initializes empty producers/consumers', () => {
        const client = new SfuClient({ emit: jest.fn() })
        expect(Device).toHaveBeenCalled()
        expect(client.producers.size).toBe(0)
        expect(client.consumers.size).toBe(0)
    })
})

describe('SfuClient — load', () => {
    it('emits get-rtp-capabilities and loads device', async () => {
        const socket = makeSocket({ 'get-rtp-capabilities': { rtpCapabilities: { codecs: [] } } })
        const client = new SfuClient(socket)
        await client.load()
        expect(socket.emit).toHaveBeenCalledWith('get-rtp-capabilities', {}, expect.any(Function))
        expect(mockDevice.load).toHaveBeenCalledWith({ routerRtpCapabilities: { codecs: [] } })
    })
})
