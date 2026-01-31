import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const APP_ID = process.env.DISCORD_APPLICATION_ID;
    const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

    if (!APP_ID || !BOT_TOKEN) {
        return NextResponse.json(
            { error: 'Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN' },
            { status: 500 }
        );
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
                    required: true,
                },
                {
                    name: 'game',
                    description: 'The game ID',
                    type: 3, // String
                    required: false,
                },
            ],
        },
    ];

    try {
        const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

        console.log(`Registering commands for App ID: ${APP_ID}...`);

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(commands),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: 'Failed to register commands', details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json({
            message: 'Successfully registered commands',
            data,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
