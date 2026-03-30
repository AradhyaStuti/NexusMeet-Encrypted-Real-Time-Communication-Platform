import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import supertest from 'supertest'
import { app } from '../src/app.js'

let mongod
let request
let _uid = 0
const uid = () => `usr${++_uid}`

before(async () => {
    mongod = await MongoMemoryServer.create()
    await mongoose.connect(mongod.getUri())
    request = supertest(app)
})

after(async () => {
    await mongoose.disconnect()
    await mongod.stop()
})

async function registerAndLogin(username, password = 'pass123') {
    const u = username ?? uid()
    await request.post('/api/v1/users/register')
        .send({ name: 'Test User', username: u, password })
    const res = await request.post('/api/v1/users/login').send({ username: u, password })
    return { token: res.body.token, username: u }
}

describe('GET /health', () => {
    it('returns status ok', async () => {
        const res = await request.get('/health')
        assert.equal(res.status, 200)
        assert.equal(res.body.status, 'ok')
    })
})

describe('POST /register', () => {
    it('creates a new user and returns 201', async () => {
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'alice_int', password: 'pass123' })
        assert.equal(res.status, 201)
        assert.match(res.body.message, /created/i)
    })

    it('returns 409 when username is already taken', async () => {
        await request.post('/api/v1/users/register')
            .send({ name: 'Alice', username: 'alice_int', password: 'pass123' })
        const res = await request.post('/api/v1/users/register')
            .send({ name: 'Alice2', username: 'alice_int', password: 'pass456' })
        assert.equal(res.status, 409)
    })
})

describe('POST /login', () => {
    it('returns 200 and a token on valid credentials', async () => {
        const { token } = await registerAndLogin()
        assert.ok(token)
    })

    it('returns 401 for wrong password', async () => {
        const { username } = await registerAndLogin()
        const res = await request.post('/api/v1/users/login')
            .send({ username, password: 'wrongpass' })
        assert.equal(res.status, 401)
    })
})

describe('POST /add_to_activity (protected)', () => {
    it('adds meeting to history and returns 201', async () => {
        const { token } = await registerAndLogin()
        const res = await request.post('/api/v1/users/add_to_activity')
            .set('x-auth-token', token)
            .send({ meeting_code: 'room-xyz' })
        assert.equal(res.status, 201)
    })
})

describe('DELETE /delete_from_activity (protected)', () => {
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
})
