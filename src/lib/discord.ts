import nacl from 'tweetnacl';

/**
 * Verifies the Discord interaction request signature.
 * 
 * @param req The incoming Request object (standard Web Request)
 * @param appPublicKey The Discord Application Public Key from env
 * @returns Object containing verification status and parsed body (if verified)
 */
export async function verifyDiscordRequest(req: Request, appPublicKey: string) {
    const signature = req.headers.get('x-signature-ed25519');
    const timestamp = req.headers.get('x-signature-timestamp');

    if (!signature || !timestamp) {
        return { isValid: false, body: null };
    }

    // We need the raw body for verification
    const bodyText = await req.text();

    try {
        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + bodyText),
            Buffer.from(signature, 'hex'),
            Buffer.from(appPublicKey, 'hex')
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
