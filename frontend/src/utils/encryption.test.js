import { generateRoomKey, encryptMessage, decryptMessage } from '../utils/encryption'

const MOCK_KEY = { type: 'secret' }
const MOCK_RAW = new Uint8Array(32).fill(1)
const MOCK_IV = new Uint8Array(12).fill(2)
const MOCK_CIPHERTEXT = new Uint8Array(20).fill(3)
const MOCK_COMBINED = new Uint8Array([...MOCK_IV, ...MOCK_CIPHERTEXT])

let subtle
beforeEach(() => {
    subtle = {
        generateKey: jest.fn().mockResolvedValue(MOCK_KEY),
        exportKey: jest.fn().mockResolvedValue(MOCK_RAW.buffer),
        importKey: jest.fn().mockResolvedValue(MOCK_KEY),
        encrypt: jest.fn().mockResolvedValue(MOCK_CIPHERTEXT.buffer),
        decrypt: jest.fn().mockResolvedValue(new TextEncoder().encode('hello world').buffer),
    }
    Object.defineProperty(global, 'crypto', {
        configurable: true,
        value: {
            subtle,
            getRandomValues: jest.fn(arr => { arr.set(MOCK_IV.slice(0, arr.length)); return arr }),
        },
    })
})

describe('generateRoomKey', () => {
    it('generates AES-GCM 256 key and returns base64 string', async () => {
        const key = await generateRoomKey()
        expect(subtle.generateKey).toHaveBeenCalledWith(
            { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        )
        expect(typeof key).toBe('string')
        expect(() => atob(key)).not.toThrow()
    })
})

describe('encryptMessage', () => {
    it('encrypts with AES-GCM and returns base64', async () => {
        const base64Key = btoa(String.fromCharCode(...MOCK_RAW))
        const result = await encryptMessage('hello', base64Key)
        expect(subtle.encrypt).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'AES-GCM' }), MOCK_KEY, expect.anything()
        )
        expect(typeof result).toBe('string')
    })
})

describe('decryptMessage', () => {
    it('returns decrypted plaintext', async () => {
        const base64Key = btoa(String.fromCharCode(...MOCK_RAW))
        const base64Data = btoa(String.fromCharCode(...MOCK_COMBINED))
        const result = await decryptMessage(base64Data, base64Key)
        expect(result).toBe('hello world')
    })
})
