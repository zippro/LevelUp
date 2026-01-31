
// Usage: ts-node scripts/test-discord-interaction.ts
// Requires: npm install tweetnacl node-fetch dotenv
// Ensure .env has DISCORD_PUBLIC_KEY

import nacl from 'tweetnacl';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

if (!PUBLIC_KEY) {
    console.error("Error: DISCORD_PUBLIC_KEY not found in .env.local");
    process.exit(1);
}

async function sendTestRequest() {
    const url = 'http://localhost:3000/api/discord/interactions';

    // Mock Payload for /level 2331
    const body = JSON.stringify({
        type: 2, // APPLICATON_COMMAND
        data: {
            name: 'level',
            options: [
                { name: 'level_num', value: '2331' },
                { name: 'game', value: 'candy-crush' } // Example game ID
            ]
        }
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = Buffer.from(nacl.sign.detached(
        Buffer.from(timestamp + body),
        Buffer.from(PUBLIC_KEY!, 'hex')
    )).toString('hex');

    console.log(`Sending request to ${url}...`);
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Signature: ${signature}`);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-signature-ed25519': signature,
                'x-signature-timestamp': timestamp
            },
            body: body
        });

        if (!res.ok) {
            console.error(`Error: ${res.status} ${res.statusText}`);
            console.error(await res.text());
        } else {
            console.log("Success!");
            const json = await res.json();
            console.log(JSON.stringify(json, null, 2));
            if (json.data && json.data.content) {
                console.log("\n--- Preview ---");
                console.log(json.data.content);
            }
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

sendTestRequest();
