import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { io as ioClient } from 'socket.io-client'
import { connectToSocket, isRateLimited } from '../src/controllers/socketManager.js'

let httpServer
let port

before(async () => {
    httpServer = createServer()
    await connectToSocket(httpServer)
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
    port = httpServer.address().port
})

after(async () => {
    await new Promise(resolve => httpServer.close(resolve))
})

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

describe('isRateLimited', () => {
    it('allows first 10 messages then blocks the 11th', () => {
        const id = `rl-test-${Date.now()}`
        for (let i = 0; i < 10; i++) {
            assert.equal(isRateLimited(id), false, `msg ${i + 1} should be allowed`)
        }
        assert.equal(isRateLimited(id), true)
    })
})

describe('join-call', () => {
    it('emits user-joined with participant list (host)', async () => {
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
})

describe('chat-message', () => {
    it('broadcasts to everyone in the room', async () => {
        const room = 'room-chat-bc'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])

        // c1 joins as host
        await new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') })

        // c2 joins — goes to waiting room
        const waitP = once(c2, 'waiting-room-status')
        c2.emit('join-call', room, 'B', '🙂')
        await waitP

        // Host admits c2
        const updateP = once(c1, 'waiting-room-update')
        await updateP
        const joinP = once(c2, 'user-joined')
        c1.emit('admit-user', c2.id)
        await joinP

        const received = once(c2, 'chat-message')
        c1.emit('chat-message', 'hello room', 'A')
        const [text, sender] = await received
        assert.equal(text, 'hello room')
        assert.equal(sender, 'A')

        c1.disconnect()
        c2.disconnect()
    })
})

describe('disconnect', () => {
    it('emits user-left to remaining peers', async () => {
        const room = 'room-disconnect-t'
        const c1 = makeClient()
        const c2 = makeClient()
        await Promise.all([connected(c1), connected(c2)])

        // c1 joins as host
        await new Promise(r => { c1.on('user-joined', r); c1.emit('join-call', room, 'A', '😊') })

        // c2 joins — goes to waiting room, host admits
        const waitP = once(c2, 'waiting-room-status')
        c2.emit('join-call', room, 'B', '🙂')
        await waitP
        const updateP = once(c1, 'waiting-room-update')
        await updateP
        const joinP = once(c2, 'user-joined')
        c1.emit('admit-user', c2.id)
        await joinP

        const c1Id = c1.id
        const leftP = once(c2, 'user-left')
        c1.disconnect()
        const [socketId] = await leftP
        assert.equal(socketId, c1Id)

        c2.disconnect()
    })
})
