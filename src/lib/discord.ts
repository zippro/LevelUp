// @ts-ignore - tweetnacl has no types
import * as nacl from 'tweetnacl';

/**
 * Verifies the Discord interaction request signature.
 */
export async function verifyDiscordRequest(req: Request, appPublicKey: string) {
    const signature = req.headers.get('x-signature-ed25519');
    const timestamp = req.headers.get('x-signature-timestamp');

    if (!signature || !timestamp) {
        console.log('Missing signature or timestamp headers');
        return { isValid: false, body: null };
    }

    const bodyText = await req.text();
    console.log('Verifying Discord request...');

    try {
        const signatureBytes = hexToUint8Array(signature);
        const publicKeyBytes = hexToUint8Array(appPublicKey);
        const messageBytes = new TextEncoder().encode(timestamp + bodyText);

        const isVerified = nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKeyBytes
        );

        console.log('Verification result:', isVerified);

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
