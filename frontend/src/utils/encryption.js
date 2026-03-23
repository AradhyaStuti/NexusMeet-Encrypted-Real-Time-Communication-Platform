/**
 * E2E Chat Encryption using Web Crypto API (AES-GCM)
 *
 * How it works:
 * - A room key is derived from the meeting URL hash fragment
 * - The hash fragment never leaves the browser (not sent to server)
 * - All chat messages are encrypted before sending to the server
 * - Server only sees ciphertext, can't read messages
 * - Other clients decrypt using the same key from their URL hash
 *
 * Key distribution: the meeting creator generates a random key and
 * appends it to the URL as a hash (#). When they share the link,
 * recipients get the key automatically. The server never sees the hash.
 */

const ALGO = "AES-GCM";
const KEY_LENGTH = 256;

/**
 * Generate a random encryption key and return it as a base64 string
 * @returns {Promise<string>}
 */
export async function generateRoomKey() {
    const key = await crypto.subtle.generateKey(
        { name: ALGO, length: KEY_LENGTH },
        true, // extractable
        ["encrypt", "decrypt"]
    );
    const raw = await crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/**
 * Import a base64 key string into a CryptoKey
 * @param {string} base64Key
 * @returns {Promise<CryptoKey>}
 */
async function importKey(base64Key) {
    const raw = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", raw, { name: ALGO }, false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt a plaintext message
 * @param {string} plaintext
 * @param {string} base64Key - the room encryption key
 * @returns {Promise<string>} base64-encoded IV + ciphertext
 */
export async function encryptMessage(plaintext, base64Key) {
    const key = await importKey(base64Key);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGO, iv },
        key,
        encoded
    );

    // Combine IV + ciphertext into a single buffer
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a message
 * @param {string} base64Data - base64-encoded IV + ciphertext
 * @param {string} base64Key - the room encryption key
 * @returns {Promise<string>} decrypted plaintext
 */
export async function decryptMessage(base64Data, base64Key) {
    try {
        const key = await importKey(base64Key);
        const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: ALGO, iv },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch {
        return "[encrypted message]";
    }
}

/**
 * Get the E2E key from the current URL hash, or generate one
 * The hash is never sent to the server by the browser
 * @returns {Promise<{ key: string, isNew: boolean }>}
 */
export async function getOrCreateRoomKey() {
    const hash = window.location.hash.slice(1); // remove #

    if (hash && hash.length >= 20) {
        return { key: hash, isNew: false };
    }

    // generate new key and set it in the URL hash
    const key = await generateRoomKey();
    window.history.replaceState(null, "", window.location.pathname + "#" + key);
    return { key, isNew: true };
}
