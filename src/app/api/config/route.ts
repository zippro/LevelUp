import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'config', 'dashboard-data.json');

// Helper to read config
function readConfig() {
    if (!fs.existsSync(configPath)) {
        // Default config if missing
        return { variables: [], games: [] };
    }
    const fileContents = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(fileContents);
}

// GET: Retrieve configuration
export async function GET() {
    try {
        const data = readConfig();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

// POST: Update configuration
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Basic validation could go here

        fs.writeFileSync(configPath, JSON.stringify(body, null, 2), 'utf8');
        return NextResponse.json({ message: 'Config saved' });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
