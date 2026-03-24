/**
 * Tests for SfuClient mediasoup-client wrapper
 */

import { SfuClient } from '../utils/sfuClient'

// Mock mediasoup-client — factory must be self-contained (no outer refs)
jest.mock('mediasoup-client', () => ({ Device: jest.fn() }))

// Get the mocked Device constructor so we can set its return value
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

const makeTransport = () => {
    const listeners = {}
    return {
        id: 'transport-id',
        on: jest.fn((event, cb) => { listeners[event] = cb }),
        produce: jest.fn().mockResolvedValue({ kind: 'video', id: 'producer-id', close: jest.fn() }),
        consume: jest.fn().mockResolvedValue({ id: 'consumer-id', kind: 'video', rtpParameters: {}, close: jest.fn() }),
        close: jest.fn(),
        _listeners: listeners,
    }
}

describe('SfuClient — constructor', () => {
    it('creates a Device instance', () => {
        const { Device } = require('mediasoup-client')
        new SfuClient({ emit: jest.fn() })
        expect(Device).toHaveBeenCalled()
    })

    it('initializes with empty producers and consumers', () => {
        const client = new SfuClient({ emit: jest.fn() })
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

    it('throws if server returns error', async () => {
        const socket = makeSocket({ 'get-rtp-capabilities': { error: 'not available' } })
        const client = new SfuClient(socket)
        await expect(client.load()).rejects.toThrow('not available')
    })
})

describe('SfuClient — createSendTransport', () => {
    it('emits create-send-transport', async () => {
        const transport = makeTransport()
        mockDevice.createSendTransport = jest.fn().mockReturnValue(transport)
        const socket = makeSocket({ 'create-send-transport': { id: 'transport-id', iceParameters: {} } })
        const client = new SfuClient(socket)
        await client.createSendTransport()
        expect(socket.emit).toHaveBeenCalledWith('create-send-transport', {}, expect.any(Function))
    })

    it('throws if server returns error', async () => {
        const socket = makeSocket({ 'create-send-transport': { error: 'no workers' } })
        const client = new SfuClient(socket)
        await expect(client.createSendTransport()).rejects.toThrow('no workers')
    })

    it('attaches connect and produce listeners on transport', async () => {
        const transport = makeTransport()
        mockDevice.createSendTransport = jest.fn().mockReturnValue(transport)
        const socket = makeSocket({ 'create-send-transport': { id: 'tid' } })
        const client = new SfuClient(socket)
        await client.createSendTransport()
        expect(transport.on).toHaveBeenCalledWith('connect', expect.any(Function))
        expect(transport.on).toHaveBeenCalledWith('produce', expect.any(Function))
    })
})

describe('SfuClient — createRecvTransport', () => {
    it('emits create-recv-transport', async () => {
        const transport = makeTransport()
        mockDevice.createRecvTransport = jest.fn().mockReturnValue(transport)
        const socket = makeSocket({ 'create-recv-transport': { id: 'recv-transport-id' } })
        const client = new SfuClient(socket)
        await client.createRecvTransport()
        expect(socket.emit).toHaveBeenCalledWith('create-recv-transport', {}, expect.any(Function))
    })

    it('throws if server returns error', async () => {
        const socket = makeSocket({ 'create-recv-transport': { error: 'fail' } })
        const client = new SfuClient(socket)
        await expect(client.createRecvTransport()).rejects.toThrow('fail')
    })
})

describe('SfuClient — closeProducer', () => {
    it('closes and removes a producer by kind', async () => {
        const transport = makeTransport()
        mockDevice.createSendTransport = jest.fn().mockReturnValue(transport)
        const socket = makeSocket({ 'create-send-transport': { id: 'tid' } })
        const client = new SfuClient(socket)
        await client.createSendTransport()
        const mockProducer = { kind: 'video', close: jest.fn() }
        client.producers.set('video', mockProducer)
        client.closeProducer('video')
        expect(mockProducer.close).toHaveBeenCalled()
        expect(client.producers.has('video')).toBe(false)
    })

    it('does nothing for unknown kind', () => {
        const client = new SfuClient({ emit: jest.fn() })
        expect(() => client.closeProducer('audio')).not.toThrow()
    })
})

describe('SfuClient — close', () => {
    it('closes all producers and consumers', () => {
        const client = new SfuClient({ emit: jest.fn() })
        const p1 = { close: jest.fn() }
        const c1 = { close: jest.fn() }
        client.producers.set('video', p1)
        client.consumers.set('c1', c1)
        client.close()
        expect(p1.close).toHaveBeenCalled()
        expect(c1.close).toHaveBeenCalled()
        expect(client.producers.size).toBe(0)
        expect(client.consumers.size).toBe(0)
    })

    it('closes transports if they exist', () => {
        const client = new SfuClient({ emit: jest.fn() })
        const sendT = { close: jest.fn() }
        const recvT = { close: jest.fn() }
        client.sendTransport = sendT
        client.recvTransport = recvT
        client.close()
        expect(sendT.close).toHaveBeenCalled()
        expect(recvT.close).toHaveBeenCalled()
    })

    it('does not throw when called with no transports', () => {
        const client = new SfuClient({ emit: jest.fn() })
        expect(() => client.close()).not.toThrow()
    })
})

describe('SfuClient — _request', () => {
    it('wraps socket.emit in a promise', async () => {
        const socket = { emit: jest.fn((_event, _data, cb) => cb({ result: 'ok' })) }
        const client = new SfuClient(socket)
        const res = await client._request('my-event', { foo: 'bar' })
        expect(res).toEqual({ result: 'ok' })
        expect(socket.emit).toHaveBeenCalledWith('my-event', { foo: 'bar' }, expect.any(Function))
    })
})
