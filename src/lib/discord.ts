// @ts-ignore - tweetnacl has no types
import * as nacl from 'tweetnacl';

/**
 * Verifies the Discord interaction request signature.
 */
export async function verifyDiscordRequest(req: Request, appPublicKey: string) {
    const signature = req.headers.get('x-signature-ed25519');
    const timestamp = req.headers.get('x-signature-timestamp');

    console.log('=== Discord Verification Debug ===');
    console.log('Public Key (first 10 chars):', appPublicKey?.substring(0, 10));
    console.log('Public Key Length:', appPublicKey?.length);
    console.log('Signature (first 10 chars):', signature?.substring(0, 10));
    console.log('Timestamp:', timestamp);

    if (!signature || !timestamp) {
        console.log('ERROR: Missing signature or timestamp headers');
        return { isValid: false, body: null };
    }

    const bodyText = await req.text();
    console.log('Body Length:', bodyText.length);
    console.log('Body Preview:', bodyText.substring(0, 100));

    try {
        const signatureBytes = hexToUint8Array(signature);
        const publicKeyBytes = hexToUint8Array(appPublicKey);
        const messageBytes = new TextEncoder().encode(timestamp + bodyText);

        console.log('Signature Bytes Length:', signatureBytes.length); // Should be 64
        console.log('Public Key Bytes Length:', publicKeyBytes.length); // Should be 32
        console.log('Message Bytes Length:', messageBytes.length);

        const isVerified = nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKeyBytes
        );

        console.log('Verification Result:', isVerified);
        console.log('=================================');

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
