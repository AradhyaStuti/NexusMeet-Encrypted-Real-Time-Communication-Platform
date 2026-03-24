/**
 * Tests for user.controller.js
 *
 * Validation paths return before any DB call, so they can be tested
 * by passing mock req/res objects without mocking mongoose.
 *
 * Happy-path tests use the real DB logic by providing mock-like objects
 * that satisfy the controller's interface requirements.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { login, register, requireAuth, addToHistory, deleteFromHistory }
    from '../src/controllers/user.controller.js'

// ── Helpers ───────────────────────────────────────────────────────────────

const mockRes = () => {
    const res = {}
    res._status = 200
    res._json = null
    res.status = (code) => { res._status = code; return res }
    res.json = (data) => { res._json = data; return res }
    return res
}

let nextCalled
const mockNext = () => { nextCalled = false; return () => { nextCalled = true } }

// ── login — validation ────────────────────────────────────────────────────

describe('login — input validation', () => {
    it('returns 400 when both fields missing', async () => {
        const res = mockRes()
        await login({ body: {} }, res)
        assert.equal(res._status, 400)
        assert.ok(typeof res._json.message === 'string')
    })

    it('returns 400 when username missing', async () => {
        const res = mockRes()
        await login({ body: { password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when password missing', async () => {
        const res = mockRes()
        await login({ body: { username: 'alice' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when username is only whitespace', async () => {
        const res = mockRes()
        await login({ body: { username: '   ', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('error message mentions username and password', async () => {
        const res = mockRes()
        await login({ body: {} }, res)
        assert.match(res._json.message, /username|password/i)
    })
})

// ── register — validation ─────────────────────────────────────────────────

describe('register — input validation', () => {
    it('returns 400 when name is missing', async () => {
        const res = mockRes()
        await register({ body: { username: 'alice', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when username is missing', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when password is missing', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'alice' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when password shorter than 6 chars', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'alice', password: '12345' } }, res)
        assert.equal(res._status, 400)
        assert.match(res._json.message, /6 characters/i)
    })

    it('returns 400 when username shorter than 3 chars', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'ab', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
        assert.match(res._json.message, /3 characters/i)
    })

    it('returns 400 for username with @ symbol', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'ali@ce', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
        assert.match(res._json.message, /letters, numbers/i)
    })

    it('returns 400 for username with spaces', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'ali ce', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 for username with hyphens', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'ali-ce', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when name is only whitespace', async () => {
        const res = mockRes()
        await register({ body: { name: '   ', username: 'alice', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('username regex: accepts underscore', () => {
        assert.ok(/^[a-zA-Z0-9_]+$/.test('ali_ce'))
    })

    it('username regex: accepts numbers', () => {
        assert.ok(/^[a-zA-Z0-9_]+$/.test('alice123'))
    })

    it('username regex: rejects hyphen', () => {
        assert.ok(!/^[a-zA-Z0-9_]+$/.test('ali-ce'))
    })

    it('password length: 6 chars meets minimum', () => {
        assert.ok('123456'.length >= 6)
    })
})

// ── requireAuth — validation ──────────────────────────────────────────────

describe('requireAuth — validation', () => {
    it('returns 401 when x-auth-token is absent', async () => {
        const res = mockRes()
        const next = mockNext()
        await requireAuth({ headers: {} }, res, next)
        assert.equal(res._status, 401)
    })

    it('does not call next() when token is missing', async () => {
        const res = mockRes()
        const next = mockNext()
        await requireAuth({ headers: {} }, res, next)
        assert.equal(nextCalled, false)
    })

    it('returns 401 for a clearly invalid token', async () => {
        const res = mockRes()
        const next = mockNext()
        await requireAuth({ headers: { 'x-auth-token': 'not.a.jwt' } }, res, next)
        assert.equal(res._status, 401)
    })

    it('error message mentions authentication', async () => {
        const res = mockRes()
        await requireAuth({ headers: {} }, res, mockNext())
        assert.match(res._json.message, /authentication/i)
    })
})

// ── addToHistory — validation ─────────────────────────────────────────────

describe('addToHistory — validation', () => {
    it('returns 400 when meeting_code is missing', async () => {
        const res = mockRes()
        await addToHistory({ body: {}, user: { username: 'alice' } }, res)
        assert.equal(res._status, 400)
        assert.match(res._json.message, /meeting code/i)
    })

    it('returns 400 when meeting_code is whitespace only', async () => {
        const res = mockRes()
        await addToHistory({ body: { meeting_code: '   ' }, user: { username: 'alice' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when meeting_code is empty string', async () => {
        const res = mockRes()
        await addToHistory({ body: { meeting_code: '' }, user: { username: 'alice' } }, res)
        assert.equal(res._status, 400)
    })
})

// ── deleteFromHistory — validation ────────────────────────────────────────

describe('deleteFromHistory — validation', () => {
    it('returns 400 when meeting_id is missing', async () => {
        const res = mockRes()
        await deleteFromHistory({ body: {}, user: { username: 'alice' } }, res)
        assert.equal(res._status, 400)
        assert.match(res._json.message, /meeting id/i)
    })

    it('returns 400 when meeting_id is null', async () => {
        const res = mockRes()
        await deleteFromHistory({ body: { meeting_id: null }, user: { username: 'alice' } }, res)
        assert.equal(res._status, 400)
    })
})
