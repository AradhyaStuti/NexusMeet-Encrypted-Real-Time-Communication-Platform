/**
 * Integration tests for the HTTP API
 *
 * Uses mongodb-memory-server for a real in-memory MongoDB instance
 * and supertest to fire real HTTP requests against the Express app.
 * This catches bugs that unit tests with mock req/res cannot.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import supertest from 'supertest'
import { app } from '../src/app.js'

let mongod
let request
let _uid = 0
const uid = () => `usr${++_uid}`  // unique username per call — avoids cross-test collisions

before(async () => {
    mongod = await MongoMemoryServer.create()
    await mongoose.connect(mongod.getUri())
    request = supertest(app)
})

after(async () => {
    await mongoose.disconnect()
    await mongod.stop()
})

// ── Helper ─────────────────────────────────────────────────────────────────

async function registerAndLogin(username, password = 'pass123') {
    const u = username ?? uid()
    await request.post('/api/v1/users/register')
        .send({ name: 'Test User', username: u, password })
    const res = await request.post('/api/v1/users/login').send({ username: u, password })
    return { token: res.body.token, username: u }
}

// ── /health ────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const res = await request.get('/health')
        assert.equal(res.status, 200)
        assert.equal(res.body.status, 'ok')
    })

    it('reports mongo as connected', async () => {
        const res = await request.get('/health')
        assert.equal(res.body.mongo, 'connected')
    })

    it('includes version field', async () => {
        const res = await request.get('/health')
        assert.ok(res.body.version)
    })
})

// ── /api/v1/metrics ────────────────────────────────────────────────────────

describe('GET /api/v1/metrics', () => {
    it('returns uptime and memory stats', async () => {
        const res = await request.get('/api/v1/metrics')
        assert.equal(res.status, 200)
        assert.ok(typeof res.body.uptime_seconds === 'number')
        assert.ok(typeof res.body.memory_mb === 'number')
    })

    it('includes request counters', async () => {
        const res = await request.get('/api/v1/metrics')
        assert.ok(typeof res.body.requests_total === 'number')
        assert.ok(typeof res.body.requests_errors === 'number')
    })
})

// ── /api/v1/ice-config ─────────────────────────────────────────────────────

describe('GET /api/v1/ice-config', () => {
    it('returns array of ICE servers', async () => {
        const res = await request.get('/api/v1/ice-config')
        assert.equal(res.status, 200)
        assert.ok(Array.isArray(res.body.iceServers))
        assert.ok(res.body.iceServers.length > 0)
    })

    it('each server has a urls field', async () => {
        const res = await request.get('/api/v1/ice-config')
        for (const s of res.body.iceServers) {
            assert.ok(s.urls)
        }
    })
})

// ── POST /api/v1/users/register ────────────────────────────────────────────

describe('POST /register', () => {
    it('creates a new user and returns 201', async () => {
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'alice', password: 'pass123' })
        assert.equal(res.status, 201)
        assert.match(res.body.message, /created/i)
    })

    it('returns 409 when username is already taken', async () => {
        await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'alice', password: 'pass123' })
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice2', username: 'alice', password: 'pass456' })
        assert.equal(res.status, 409)
    })

    it('returns 400 for missing name', async () => {
        const res = await request.post('/api/v1/users/register')
            .send({ username: 'alice', password: 'pass123' })
        assert.equal(res.status, 400)
    })

    it('returns 400 for short password', async () => {
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'alice', password: '123' })
        assert.equal(res.status, 400)
    })

    it('returns 400 for invalid username characters', async () => {
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'alice!', password: 'pass123' })
        assert.equal(res.status, 400)
    })

    it('returns 400 for username shorter than 3 chars', async () => {
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'ab', password: 'pass123' })
        assert.equal(res.status, 400)
    })
})

// ── POST /api/v1/users/login ───────────────────────────────────────────────

describe('POST /login', () => {
    it('returns 200 and a token on valid credentials', async () => {
        const { token, username } = await registerAndLogin()
        assert.ok(token)
        assert.ok(username)
    })

    it('token is a 3-part JWT string', async () => {
        const { token } = await registerAndLogin()
        assert.equal(token.split('.').length, 3)
    })

    it('returns 401 for wrong password', async () => {
        const { username } = await registerAndLogin()
        const res = await request.post('/api/v1/users/login')
            .send({ username, password: 'wrongpass' })
        assert.equal(res.status, 401)
    })

    it('returns 404 for unknown username', async () => {
        const res = await request.post('/api/v1/users/login')
            .send({ username: `nonexistent_${uid()}`, password: 'pass123' })
        assert.equal(res.status, 404)
    })

    it('returns 400 when username is missing', async () => {
        const res = await request.post('/api/v1/users/login')
            .send({ password: 'pass123' })
        assert.equal(res.status, 400)
    })

    it('returns username and name in login response', async () => {
        const u = uid()
        await request.post('/api/v1/users/register')
            .send({ name: 'Bob Jones', username: u, password: 'pass123' })
        const res = await request.post('/api/v1/users/login')
            .send({ username: u, password: 'pass123' })
        assert.equal(res.body.username, u)
        assert.equal(res.body.name, 'Bob Jones')
    })
})

// ── GET /api/v1/users/get_all_activity ────────────────────────────────────

describe('GET /get_all_activity (protected)', () => {
    it('returns 401 without token', async () => {
        const res = await request.get('/api/v1/users/get_all_activity')
        assert.equal(res.status, 401)
    })

    it('returns empty array when no history', async () => {
        const { token } = await registerAndLogin()
        const res = await request.get('/api/v1/users/get_all_activity')
            .set('x-auth-token', token)
        assert.equal(res.status, 200)
        assert.deepEqual(res.body, [])
    })

    it('returns 401 for invalid token', async () => {
        const res = await request.get('/api/v1/users/get_all_activity')
            .set('x-auth-token', 'bad.token.here')
        assert.equal(res.status, 401)
    })
})

// ── POST /api/v1/users/add_to_activity ────────────────────────────────────

describe('POST /add_to_activity (protected)', () => {
    it('returns 401 without token', async () => {
        const res = await request.post('/api/v1/users/add_to_activity')
            .send({ meeting_code: 'room-abc' })
        assert.equal(res.status, 401)
    })

    it('adds meeting to history and returns 201', async () => {
        const { token } = await registerAndLogin()
        const res = await request.post('/api/v1/users/add_to_activity')
            .set('x-auth-token', token)
            .send({ meeting_code: 'room-xyz' })
        assert.equal(res.status, 201)
    })

    it('meeting appears in history after adding', async () => {
        const { token } = await registerAndLogin()
        await request.post('/api/v1/users/add_to_activity')
            .set('x-auth-token', token)
            .send({ meeting_code: 'room-123' })
        const history = await request.get('/api/v1/users/get_all_activity')
            .set('x-auth-token', token)
        assert.equal(history.body.length, 1)
        assert.equal(history.body[0].meetingCode, 'room-123')
    })

    it('returns 400 when meeting_code is missing', async () => {
        const { token } = await registerAndLogin()
        const res = await request.post('/api/v1/users/add_to_activity')
            .set('x-auth-token', token)
            .send({})
        assert.equal(res.status, 400)
    })
})

// ── DELETE /api/v1/users/delete_from_activity ─────────────────────────────

describe('DELETE /delete_from_activity (protected)', () => {
    it('returns 401 without token', async () => {
        const res = await request.delete('/api/v1/users/delete_from_activity')
            .send({ meeting_id: '64f1a2b3c4d5e6f7a8b9c0d1' })
        assert.equal(res.status, 401)
    })

    it('deletes a meeting and removes it from history', async () => {
        const { token } = await registerAndLogin()
        await request.post('/api/v1/users/add_to_activity')
            .set('x-auth-token', token).send({ meeting_code: 'room-del' })
        const history = await request.get('/api/v1/users/get_all_activity')
            .set('x-auth-token', token)
        const meetingId = history.body[0]._id
        const del = await request.delete('/api/v1/users/delete_from_activity')
            .set('x-auth-token', token).send({ meeting_id: meetingId })
        assert.equal(del.status, 200)
        const after = await request.get('/api/v1/users/get_all_activity')
            .set('x-auth-token', token)
        assert.equal(after.body.length, 0)
    })

    it('returns 404 when meeting does not exist', async () => {
        const { token } = await registerAndLogin()
        const res = await request.delete('/api/v1/users/delete_from_activity')
            .set('x-auth-token', token).send({ meeting_id: '64f1a2b3c4d5e6f7a8b9c0d1' })
        assert.equal(res.status, 404)
    })

    it('returns 400 when meeting_id is missing', async () => {
        const { token } = await registerAndLogin()
        const res = await request.delete('/api/v1/users/delete_from_activity')
            .set('x-auth-token', token).send({})
        assert.equal(res.status, 400)
    })

    it("cannot delete another user's meeting", async () => {
        const { token: tokenA } = await registerAndLogin()
        const { token: tokenB } = await registerAndLogin()
        await request.post('/api/v1/users/add_to_activity')
            .set('x-auth-token', tokenA).send({ meeting_code: 'room-private' })
        const histA = await request.get('/api/v1/users/get_all_activity')
            .set('x-auth-token', tokenA)
        const meetingId = histA.body[0]._id
        const res = await request.delete('/api/v1/users/delete_from_activity')
            .set('x-auth-token', tokenB).send({ meeting_id: meetingId })
        assert.equal(res.status, 404)
    })
})

// ── Response headers ───────────────────────────────────────────────────────

describe('Response headers', () => {
    it('includes x-request-id on every response', async () => {
        const res = await request.get('/health')
        assert.ok(res.headers['x-request-id'])
    })

    it('echoes provided x-request-id back', async () => {
        const id = 'my-trace-id-123'
        const res = await request.get('/health').set('x-request-id', id)
        assert.equal(res.headers['x-request-id'], id)
    })
})
