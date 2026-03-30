import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { login, register, requireAuth }
    from '../src/controllers/user.controller.js'

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

describe('login — input validation', () => {
    it('returns 400 when both fields missing', async () => {
        const res = mockRes()
        await login({ body: {} }, res)
        assert.equal(res._status, 400)
        assert.ok(typeof res._json.message === 'string')
    })
})

describe('register — input validation', () => {
    it('returns 400 when username is missing', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', password: 'pass123' } }, res)
        assert.equal(res._status, 400)
    })

    it('returns 400 when password shorter than 6 chars', async () => {
        const res = mockRes()
        await register({ body: { name: 'Alice', username: 'alice', password: '12345' } }, res)
        assert.equal(res._status, 400)
        assert.match(res._json.message, /6 characters/i)
    })
})

describe('requireAuth — validation', () => {
    it('returns 401 when x-auth-token is absent', async () => {
        const res = mockRes()
        const next = mockNext()
        await requireAuth({ headers: {} }, res, next)
        assert.equal(res._status, 401)
    })

    it('returns 401 for a clearly invalid token', async () => {
        const res = mockRes()
        const next = mockNext()
        await requireAuth({ headers: { 'x-auth-token': 'not.a.jwt' } }, res, next)
        assert.equal(res._status, 401)
    })
})
