/**
 * Tests for E2E encryption utilities (AES-256-GCM)
 */
import { generateRoomKey, encryptMessage, decryptMessage, getOrCreateRoomKey } from '../utils/encryption'

const MOCK_KEY = { type: 'secret' }
const MOCK_RAW = new Uint8Array(32).fill(1)
const MOCK_IV = new Uint8Array(12).fill(2)
const MOCK_CIPHERTEXT = new Uint8Array(20).fill(3)
const MOCK_COMBINED = new Uint8Array([...MOCK_IV, ...MOCK_CIPHERTEXT])

// Rebuild crypto mock before each test so mocks are never stale
let subtle, mockCrypto
beforeEach(() => {
    subtle = {
        generateKey: jest.fn().mockResolvedValue(MOCK_KEY),
        exportKey: jest.fn().mockResolvedValue(MOCK_RAW.buffer),
        importKey: jest.fn().mockResolvedValue(MOCK_KEY),
        encrypt: jest.fn().mockResolvedValue(MOCK_CIPHERTEXT.buffer),
        decrypt: jest.fn().mockResolvedValue(new TextEncoder().encode('hello world').buffer),
    }
    mockCrypto = {
        subtle,
        getRandomValues: jest.fn(arr => { arr.set(MOCK_IV.slice(0, arr.length)); return arr }),
    }
    Object.defineProperty(global, 'crypto', { configurable: true, value: mockCrypto })
})

// ── generateRoomKey ──────────────────────────────────────────────────────────

describe('generateRoomKey', () => {
    it('calls subtle.generateKey with AES-GCM 256', async () => {
        await generateRoomKey()
        expect(subtle.generateKey).toHaveBeenCalledWith(
            { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        )
    })

    it('returns a base64 string', async () => {
        const key = await generateRoomKey()
        expect(typeof key).toBe('string')
        expect(() => atob(key)).not.toThrow()
    })

    it('exports the key as raw bytes', async () => {
        await generateRoomKey()
        expect(subtle.exportKey).toHaveBeenCalledWith('raw', MOCK_KEY)
    })
})

// ── encryptMessage ───────────────────────────────────────────────────────────

describe('encryptMessage', () => {
    const base64Key = btoa(String.fromCharCode(...MOCK_RAW))

    it('calls subtle.importKey with the provided key', async () => {
        await encryptMessage('test message', base64Key)
        expect(subtle.importKey).toHaveBeenCalled()
    })

    it('calls subtle.encrypt with AES-GCM', async () => {
        await encryptMessage('hello', base64Key)
        expect(subtle.encrypt).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'AES-GCM' }), MOCK_KEY, expect.anything()
        )
    })

    it('returns a base64 string', async () => {
        const result = await encryptMessage('hello', base64Key)
        expect(typeof result).toBe('string')
        expect(() => atob(result)).not.toThrow()
    })

    it('prepends 12-byte IV to ciphertext in output', async () => {
        const result = await encryptMessage('hello', base64Key)
        const decoded = Uint8Array.from(atob(result), c => c.charCodeAt(0))
        expect(decoded.length).toBeGreaterThan(12)
    })
})

// ── decryptMessage ───────────────────────────────────────────────────────────

describe('decryptMessage', () => {
    const base64Key = btoa(String.fromCharCode(...MOCK_RAW))
    const base64Data = btoa(String.fromCharCode(...MOCK_COMBINED))

    it('returns decrypted plaintext', async () => {
        const result = await decryptMessage(base64Data, base64Key)
        expect(result).toBe('hello world')
    })

    it('calls subtle.decrypt with AES-GCM', async () => {
        await decryptMessage(base64Data, base64Key)
        expect(subtle.decrypt).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'AES-GCM' }), MOCK_KEY, expect.any(Uint8Array)
        )
    })

    it('returns fallback string on decryption failure', async () => {
        subtle.decrypt.mockRejectedValueOnce(new Error('bad key'))
        const result = await decryptMessage('invaliddata', base64Key)
        expect(result).toBe('[encrypted message]')
    })

    it('extracts IV from first 12 bytes', async () => {
        await decryptMessage(base64Data, base64Key)
        const callArgs = subtle.decrypt.mock.calls[0]
        expect(callArgs[0].iv.length).toBe(12)
    })
})

// ── getOrCreateRoomKey ───────────────────────────────────────────────────────

describe('getOrCreateRoomKey', () => {
    const originalLocation = window.location

    beforeEach(() => {
        window.history.replaceState = jest.fn()
    })

    it('returns existing key from URL hash when long enough', async () => {
        const fakeKey = 'a'.repeat(30)
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, hash: '#' + fakeKey, pathname: '/meeting/123' },
        })
        const { key, isNew } = await getOrCreateRoomKey()
        expect(key).toBe(fakeKey)
        expect(isNew).toBe(false)
    })

    it('generates a new key when hash is absent', async () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, hash: '', pathname: '/meeting/123' },
        })
        const { isNew } = await getOrCreateRoomKey()
        expect(isNew).toBe(true)
        expect(window.history.replaceState).toHaveBeenCalled()
    })

    it('generates a new key when hash is too short', async () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, hash: '#short', pathname: '/meeting/123' },
        })
        const { isNew } = await getOrCreateRoomKey()
        expect(isNew).toBe(true)
    })

    it('sets key in URL hash when generating new key', async () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, hash: '', pathname: '/meeting/abc' },
        })
        await getOrCreateRoomKey()
        expect(window.history.replaceState).toHaveBeenCalledWith(
            null, '', expect.stringMatching(/^\/meeting\/abc#/)
        )
    })
})
