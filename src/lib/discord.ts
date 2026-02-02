/**
 * Verifies the Discord interaction request signature using Web Crypto API.
 * No external dependencies required.
 */
export async function verifyDiscordRequest(req: Request, appPublicKey: string) {
    const signature = req.headers.get('x-signature-ed25519');
    const timestamp = req.headers.get('x-signature-timestamp');

    if (!signature || !timestamp) {
        return { isValid: false, body: null };
    }

    const bodyText = await req.text();

    try {
        // Convert hex strings to Uint8Array
        const signatureBytes = hexToUint8Array(signature);
        const publicKeyBytes = hexToUint8Array(appPublicKey);
        const messageBytes = new TextEncoder().encode(timestamp + bodyText);

        // Import the public key
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            publicKeyBytes,
            { name: 'Ed25519' },
            false,
            ['verify']
        );

        // Verify the signature
        const isVerified = await crypto.subtle.verify(
            'Ed25519',
            cryptoKey,
            signatureBytes,
            messageBytes
        );

        if (!isVerified) {
            return { isValid: false, body: null };
        }

        return { isValid: true, body: JSON.parse(bodyText) };
    } catch (error) {
        console.error('Discord Verification Error:', error);
        return { isValid: false, body: null };
    }
}

function hexToUint8Array(hex: string): Uint8Array {
    const pairs = hex.match(/.{1,2}/g) || [];
    return new Uint8Array(pairs.map(byte => parseInt(byte, 16)));
}
