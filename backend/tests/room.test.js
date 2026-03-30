import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SfuRoom } from '../src/sfu/room.js'

const makeRouter = (overrides = {}) => ({
    rtpCapabilities: { codecs: ['opus', 'VP8'] },
    canConsume: () => true,
    createWebRtcTransport: async () => makeTransport(),
    close: () => {},
    ...overrides,
})

const makeTransport = (id = 'transport-1') => ({
    id,
    iceParameters: { usernameFragment: 'uf', password: 'pw' },
    iceCandidates: [],
    dtlsParameters: { role: 'auto', fingerprints: [] },
    sctpParameters: null,
    connect: async () => {},
    produce: async ({ kind }) => makeProducer(kind),
    consume: async () => makeConsumer(),
    close: () => {},
    on: () => {},
})

const makeProducer = (kind = 'video', id = 'producer-1') => ({
    id, kind, appData: {},
    close: () => {},
    on: () => {},
})

const makeConsumer = (id = 'consumer-1') => ({
    id, kind: 'video',
    rtpParameters: {},
    appData: { socketId: 'peer-a' },
    resume: async () => {},
    close: () => {},
    on: () => {},
})

describe('SfuRoom — constructor', () => {
    it('stores roomId and starts with empty peers', () => {
        const room = new SfuRoom('room-abc')
        assert.equal(room.roomId, 'room-abc')
        assert.ok(room.peers instanceof Map)
        assert.equal(room.peers.size, 0)
        assert.equal(room.router, null)
    })
})

describe('SfuRoom — addPeer', () => {
    it('creates a peer entry with null transports', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        assert.ok(room.peers.has('s1'))
        const peer = room.peers.get('s1')
        assert.equal(peer.sendTransport, null)
        assert.equal(peer.recvTransport, null)
    })
})

describe('SfuRoom — removePeer', () => {
    it('removes the peer and returns closed producer IDs', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        const p = makeProducer('video', 'prod-42')
        room.peers.get('s1').producers.set('prod-42', p)
        const ids = room.removePeer('s1')
        assert.ok(!room.peers.has('s1'))
        assert.deepEqual(ids, ['prod-42'])
    })
})

describe('SfuRoom — produce', () => {
    it('returns producer when sendTransport is set', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        room.addPeer('s1')
        room.setSendTransport('s1', makeTransport())
        const producer = await room.produce('s1', 'video', {}, {})
        assert.ok(producer)
        assert.equal(producer.kind, 'video')
    })
})
