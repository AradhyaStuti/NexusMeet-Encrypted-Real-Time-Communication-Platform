/**
 * Socket.IO event handler tests
 *
 * Spins up a real HTTP server + Socket.IO instance via connectToSocket(),
 * then connects with socket.io-client to verify event behaviour end-to-end.
 * Also tests the exported isRateLimited utility directly.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { io as ioClient } from 'socket.io-client'
import { connectToSocket, isRateLimited } from '../src/controllers/socketManager.js'

// ── Server lifecycle ───────────────────────────────────────────────────────

let httpServer
let port

before(async () => {
    httpServer = createServer()
    connectToSocket(httpServer, ['*'])
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
    port = httpServer.address().port
})

after(async () => {
    await new Promise(resolve => httpServer.close(resolve))
})

// ── Helpers ────────────────────────────────────────────────────────────────

function makeClient() {
    return ioClient(`http://127.0.0.1:${port}`, {
        forceNew: true,
        transports: ['websocket'],
    })
}

function connected(client) {
    return new Promise((resolve, reject) => {
        if (client.connected) return resolve()
        client.on('connect', resolve)
        client.on('connect_error', reject)
    })
}

function once(client, event) {
    return new Promise(resolve => client.once(event, (...args) => resolve(args)))
}

// ── isRateLimited (unit) ───────────────────────────────────────────────────

describe('isRateLimited', () => {
    it('allows the first 10 messages', () => {
        const id = `rl-test-${Date.now()}`
        for (let i = 0; i < 10; i++) {
            assert.equal(isRateLimited(id), false, `msg ${i + 1} should be allowed`)
        }
    })

    it('blocks the 11th message within the window', () => {
        const id = `rl-block-${Date.now()}`
        for (let i = 0; i < 10; i++) isRateLimited(id)
        assert.equal(isRateLimited(id), true)
    })

    it('different socket IDs have independent buckets', () => {
        const a = `rl-a-${Date.now()}`
        const b = `rl-b-${Date.now()}`
        for (let i = 0; i < 10; i++) isRateLimited(a)
        // Socket B should still be free
        assert.equal(isRateLimited(b), false)
    })
})

// ── join-call ──────────────────────────────────────────────────────────────

describe('join-call', () => {
    it('emits user-joined with participant list', async () => {
        const c = makeClient()
        await connected(c)
        const p = once(c, 'user-joined')
        c.emit('join-call', 'room-join-1', 'Alice', '😊')
        const [, participants] = await p
        assert.ok(Array.isArray(participants))
        assert.equal(participants.length, 1)
        assert.equal(participants[0].username, 'Alice')
        c.disconnect()
    })

    it('second joiner sees both participants', async () => {
        const room = 'room-join-2'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])

        await new Promise(resolve => {
            c1.on('user-joined', resolve)
            c1.emit('join-call', room, 'Alice', '😊')
        })

        const p2 = once(c2, 'user-joined')
        c2.emit('join-call', room, 'Bob', '🙂')
        const [, participants] = await p2
        assert.equal(participants.length, 2)

        c1.disconnect()
        c2.disconnect()
    })

    it('truncates username longer than 40 chars', async () => {
        const c = makeClient()
        await connected(c)
        const p = once(c, 'user-joined')
        c.emit('join-call', 'room-trunc', 'A'.repeat(60), '😊')
        const [, participants] = await p
        assert.equal(participants[0].username.length, 40)
        c.disconnect()
    })

    it('replays message history to late joiner', async () => {
        const room = 'room-history'
        const c1 = makeClient()
        await connected(c1)
        await new Promise(resolve => {
            c1.on('user-joined', resolve)
            c1.emit('join-call', room, 'Alice', '😊')
        })
        c1.emit('chat-message', 'hello from before', 'Alice')

        // small delay so the message is stored
        await new Promise(r => setTimeout(r, 50))

        const c2 = makeClient()
        await connected(c2)
        const msgP = once(c2, 'chat-message')
        c2.emit('join-call', room, 'Bob', '🙂')
        const [text] = await msgP
        assert.equal(text, 'hello from before')

        c1.disconnect()
        c2.disconnect()
    })
})

// ── chat-message ───────────────────────────────────────────────────────────

describe('chat-message', () => {
    it('broadcasts to everyone in the room', async () => {
        const room = 'room-chat-1'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])

        await Promise.all([
            new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') }),
            new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'B', '😊') }),
        ])

        const received = once(c2, 'chat-message')
        c1.emit('chat-message', 'hello room', 'A')
        const [text, sender] = await received
        assert.equal(text, 'hello room')
        assert.equal(sender, 'A')

        c1.disconnect()
        c2.disconnect()
    })

    it('truncates message body to 2000 chars', async () => {
        const room = 'room-chat-trunc'
        const c = makeClient()
        await connected(c)
        await new Promise(r => { c.on('user-joined', r); c.emit('join-call', room, 'A', '😊') })

        const received = once(c, 'chat-message')
        c.emit('chat-message', 'x'.repeat(3000), 'A')
        const [text] = await received
        assert.equal(text.length, 2000)
        c.disconnect()
    })

    it('rate-limits and emits error-message when exceeded', async () => {
        const room = 'room-ratelimit'
        const c = makeClient()
        await connected(c)
        await new Promise(r => { c.on('user-joined', r); c.emit('join-call', room, 'A', '😊') })

        const errP = once(c, 'error-message')
        // send 11 messages to exceed the 10-message window limit
        for (let i = 0; i <= 10; i++) c.emit('chat-message', `msg ${i}`, 'A')
        const [errText] = await errP
        assert.match(errText, /too fast/i)
        c.disconnect()
    })

    it('is silently ignored when not in any room', async () => {
        const c = makeClient()
        await connected(c)
        // never join a room — emit should be a no-op (no error, no crash)
        c.emit('chat-message', 'ghost message', 'Nobody')
        await new Promise(r => setTimeout(r, 80))
        assert.ok(c.connected) // server didn't close the connection
        c.disconnect()
    })
})

// ── hand-raise ────────────────────────────────────────────────────────────

describe('hand-raise', () => {
    it('broadcasts raised state to other peers', async () => {
        const room = 'room-hand'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])
        await Promise.all([
            new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') }),
            new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'B', '😊') }),
        ])

        const raised = once(c2, 'hand-raise')
        c1.emit('hand-raise', true)
        const [socketId, isRaised] = await raised
        assert.equal(socketId, c1.id)
        assert.equal(isRaised, true)

        c1.disconnect()
        c2.disconnect()
    })

    it('does not emit back to the sender', async () => {
        const room = 'room-hand-self'
        const c = makeClient()
        await connected(c)
        await new Promise(r => { c.on('user-joined', r); c.emit('join-call', room, 'Solo', '😊') })

        let selfReceived = false
        c.on('hand-raise', () => { selfReceived = true })
        c.emit('hand-raise', true)
        await new Promise(r => setTimeout(r, 80))
        assert.equal(selfReceived, false)
        c.disconnect()
    })
})

// ── reaction ──────────────────────────────────────────────────────────────

describe('reaction', () => {
    it('broadcasts emoji to the room', async () => {
        const room = 'room-reaction'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])
        await Promise.all([
            new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') }),
            new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'B', '😊') }),
        ])

        const rxn = once(c2, 'reaction')
        c1.emit('reaction', '👍')
        const [socketId, emoji] = await rxn
        assert.equal(socketId, c1.id)
        assert.equal(emoji, '👍')

        c1.disconnect()
        c2.disconnect()
    })

    it('truncates emoji to 4 chars', async () => {
        const room = 'room-reaction-trunc'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])
        await Promise.all([
            new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') }),
            new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'B', '😊') }),
        ])

        const rxn = once(c2, 'reaction')
        c1.emit('reaction', 'toolong!')
        const [, emoji] = await rxn
        assert.equal(emoji.length, 4)

        c1.disconnect()
        c2.disconnect()
    })
})

// ── typing ────────────────────────────────────────────────────────────────

describe('typing', () => {
    it('broadcasts typing state to other peers', async () => {
        const room = 'room-typing'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])
        await Promise.all([
            new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') }),
            new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'B', '😊') }),
        ])

        const typingP = once(c2, 'typing')
        c1.emit('typing', true)
        const [socketId, isTyping] = await typingP
        assert.equal(socketId, c1.id)
        assert.equal(isTyping, true)

        c1.disconnect()
        c2.disconnect()
    })
})

// ── signal (P2P) ──────────────────────────────────────────────────────────

describe('signal', () => {
    it('forwards signal to the target peer', async () => {
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])

        const sigP = once(c2, 'signal')
        c1.emit('signal', c2.id, { type: 'offer', sdp: 'test-sdp' })
        const [fromId, msg] = await sigP
        assert.equal(fromId, c1.id)
        assert.equal(msg.type, 'offer')

        c1.disconnect()
        c2.disconnect()
    })
})

// ── disconnect ────────────────────────────────────────────────────────────

describe('disconnect', () => {
    it('emits user-left to remaining peers', async () => {
        const room = 'room-disconnect'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])
        await Promise.all([
            new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') }),
            new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'B', '😊') }),
        ])

        const c1Id = c1.id  // capture before disconnect clears it
        const leftP = once(c2, 'user-left')
        c1.disconnect()
        const [socketId] = await leftP
        assert.equal(socketId, c1Id)

        c2.disconnect()
    })

    it('cleans up room state when last peer leaves', async () => {
        const room = 'room-cleanup'
        const c = makeClient()
        await connected(c)
        await new Promise(r => { c.on('user-joined', r); c.emit('join-call', room, 'Solo', '😊') })

        c.disconnect()
        await new Promise(r => setTimeout(r, 80))

        // Re-join the same room — if cleanup worked, history should be empty
        const c2 = makeClient()
        await connected(c2)
        let msgReceived = false
        c2.on('chat-message', () => { msgReceived = true })
        await new Promise(r => { c2.on('user-joined', r); c2.emit('join-call', room, 'New', '😊') })
        await new Promise(r => setTimeout(r, 50))
        assert.equal(msgReceived, false)

        c2.disconnect()
    })
})
