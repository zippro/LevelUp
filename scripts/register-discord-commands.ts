import 'dotenv/config';
import fetch from 'node-fetch';

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN || BOT_TOKEN === 'your-bot-token-here') {
    console.error('Error: DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN is missing in .env.local');
    process.exit(1);
}

const commands = [
    {
        name: 'level',
        description: 'Get level context and metrics',
        options: [
            {
                name: 'level_num',
                description: 'The level number',
                type: 4, // Integer
                required: true
            },
            {
                name: 'game',
                description: 'The game ID',
                type: 3, // String
                required: false
            }
        ]
    }
];

async function registerCommands() {
    console.log(`Registering commands for App ID: ${APP_ID}...`);

    const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
    });

    if (response.ok) {
        console.log('Successfully registered commands!');
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } else {
        console.error('Failed to register commands');
        const errorText = await response.text();
        console.error(errorText);
    }
}

registerCommands();
