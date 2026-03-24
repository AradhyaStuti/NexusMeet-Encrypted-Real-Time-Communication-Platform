/**
 * Tests for SfuRoom (sfu/room.js)
 *
 * Strategy: import SfuRoom directly (mediasoup loads fine without workers).
 * Skip init() by injecting a mock router directly — this lets us test
 * every method without a real mediasoup worker process.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SfuRoom } from '../src/sfu/room.js'

// ── Shared mock builders ───────────────────────────────────────────────────

const makeRouter = (overrides = {}) => ({
    rtpCapabilities: { codecs: ['opus', 'VP8'] },
    canConsume: () => true,
    createWebRtcTransport: async () => makeTransport(),
    close: () => {},
    ...overrides,
})

const makeTransport = (id = 'transport-1') => {
    return {
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
    }
}

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

// ── Constructor ───────────────────────────────────────────────────────────

describe('SfuRoom — constructor', () => {
    it('stores roomId', () => {
        const room = new SfuRoom('room-abc')
        assert.equal(room.roomId, 'room-abc')
    })

    it('peers is an empty Map', () => {
        const room = new SfuRoom('room-abc')
        assert.ok(room.peers instanceof Map)
        assert.equal(room.peers.size, 0)
    })

    it('router is null before init', () => {
        const room = new SfuRoom('room-abc')
        assert.equal(room.router, null)
    })
})

// ── isEmpty ───────────────────────────────────────────────────────────────

describe('SfuRoom — isEmpty', () => {
    it('returns true on fresh room', () => {
        assert.equal(new SfuRoom('r').isEmpty(), true)
    })

    it('returns false after addPeer', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        assert.equal(room.isEmpty(), false)
    })

    it('returns true after all peers removed', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        room.removePeer('s1')
        assert.equal(room.isEmpty(), true)
    })
})

// ── addPeer ───────────────────────────────────────────────────────────────

describe('SfuRoom — addPeer', () => {
    it('creates a peer entry', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        assert.ok(room.peers.has('s1'))
    })

    it('peer has null transports and empty producer/consumer maps', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        const peer = room.peers.get('s1')
        assert.equal(peer.sendTransport, null)
        assert.equal(peer.recvTransport, null)
        assert.equal(peer.producers.size, 0)
        assert.equal(peer.consumers.size, 0)
    })

    it('can add multiple peers', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        room.addPeer('s2')
        assert.equal(room.peers.size, 2)
    })
})

// ── Transport assignment ──────────────────────────────────────────────────

describe('SfuRoom — transport assignment', () => {
    it('setSendTransport stores transport on peer', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        const t = makeTransport('send-1')
        room.setSendTransport('s1', t)
        assert.equal(room.peers.get('s1').sendTransport, t)
    })

    it('setRecvTransport stores transport on peer', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        const t = makeTransport('recv-1')
        room.setRecvTransport('s1', t)
        assert.equal(room.peers.get('s1').recvTransport, t)
    })

    it('does not throw for unknown peer', () => {
        const room = new SfuRoom('r')
        assert.doesNotThrow(() => room.setSendTransport('ghost', makeTransport()))
        assert.doesNotThrow(() => room.setRecvTransport('ghost', makeTransport()))
    })
})

// ── removePeer ────────────────────────────────────────────────────────────

describe('SfuRoom — removePeer', () => {
    it('removes the peer', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        room.removePeer('s1')
        assert.ok(!room.peers.has('s1'))
    })

    it('returns list of closed producer IDs', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        const p = makeProducer('video', 'prod-42')
        room.peers.get('s1').producers.set('prod-42', p)
        const ids = room.removePeer('s1')
        assert.deepEqual(ids, ['prod-42'])
    })

    it('calls close() on each producer', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        let closed = false
        const p = { ...makeProducer(), close: () => { closed = true } }
        room.peers.get('s1').producers.set(p.id, p)
        room.removePeer('s1')
        assert.ok(closed)
    })

    it('calls close() on send and recv transports', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        let sendClosed = false, recvClosed = false
        room.peers.get('s1').sendTransport = { close: () => { sendClosed = true } }
        room.peers.get('s1').recvTransport = { close: () => { recvClosed = true } }
        room.removePeer('s1')
        assert.ok(sendClosed)
        assert.ok(recvClosed)
    })

    it('returns empty array for unknown peer', () => {
        const room = new SfuRoom('r')
        assert.deepEqual(room.removePeer('ghost'), [])
    })
})

// ── getProducerIds ────────────────────────────────────────────────────────

describe('SfuRoom — getProducerIds', () => {
    it('returns producers from other peers', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        room.addPeer('s2')
        const p = makeProducer('video', 'p-s2')
        room.peers.get('s2').producers.set('p-s2', p)
        const ids = room.getProducerIds('s1')
        assert.equal(ids.length, 1)
        assert.equal(ids[0].producerId, 'p-s2')
        assert.equal(ids[0].socketId, 's2')
        assert.equal(ids[0].kind, 'video')
    })

    it('excludes the given socketId', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        const p = makeProducer('audio', 'p-s1')
        room.peers.get('s1').producers.set('p-s1', p)
        assert.deepEqual(room.getProducerIds('s1'), [])
    })

    it('returns empty array when no other peers', () => {
        const room = new SfuRoom('r')
        room.addPeer('s1')
        assert.deepEqual(room.getProducerIds('s1'), [])
    })
})

// ── getRtpCapabilities ────────────────────────────────────────────────────

describe('SfuRoom — getRtpCapabilities', () => {
    it('returns router rtpCapabilities', () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        const caps = room.getRtpCapabilities()
        assert.deepEqual(caps, room.router.rtpCapabilities)
    })
})

// ── produce ───────────────────────────────────────────────────────────────

describe('SfuRoom — produce', () => {
    it('returns null when peer has no sendTransport', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        room.addPeer('s1')
        const result = await room.produce('s1', 'video', {}, {})
        assert.equal(result, null)
    })

    it('returns producer when sendTransport is set', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        room.addPeer('s1')
        room.setSendTransport('s1', makeTransport())
        const producer = await room.produce('s1', 'video', {}, {})
        assert.ok(producer)
        assert.equal(producer.kind, 'video')
    })

    it('stores producer in peer.producers', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        room.addPeer('s1')
        room.setSendTransport('s1', makeTransport())
        const producer = await room.produce('s1', 'video', {}, {})
        assert.ok(room.peers.get('s1').producers.has(producer.id))
    })
})

// ── consume ───────────────────────────────────────────────────────────────

describe('SfuRoom — consume', () => {
    it('returns null when peer has no recvTransport', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        room.addPeer('s1')
        const result = await room.consume('s1', 'producer-1', {})
        assert.equal(result, null)
    })

    it('returns consumer data when canConsume is true', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter()
        room.addPeer('s1')
        room.setRecvTransport('s1', makeTransport())
        const result = await room.consume('s1', 'prod-1', { codecs: [] })
        assert.ok(result)
        assert.ok(result.id)
        assert.ok(result.kind)
    })

    it('returns null when router.canConsume returns false', async () => {
        const room = new SfuRoom('r')
        room.router = makeRouter({ canConsume: () => false })
        room.addPeer('s1')
        room.setRecvTransport('s1', makeTransport())
        const result = await room.consume('s1', 'prod-1', {})
        assert.equal(result, null)
    })
})

// ── close ─────────────────────────────────────────────────────────────────

describe('SfuRoom — close', () => {
    it('calls router.close()', () => {
        const room = new SfuRoom('r')
        let closed = false
        room.router = { ...makeRouter(), close: () => { closed = true } }
        room.close()
        assert.ok(closed)
    })
})
