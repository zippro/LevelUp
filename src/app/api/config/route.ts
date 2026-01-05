import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Force dynamic to ensure we don't cache stale config on Vercel
export const dynamic = 'force-dynamic';

const CONFIG_BUCKET = 'data-repository';
const CONFIG_FILE = 'system/dashboard-config.json';
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'config', 'dashboard-data.json');

// Helper to read local default config
function readLocalConfig() {
    if (!fs.existsSync(LOCAL_CONFIG_PATH)) {
        return { variables: [], games: [] };
    }
    const fileContents = fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8');
    return JSON.parse(fileContents);
}

// GET: Retrieve configuration from Supabase, fallback to local
export async function GET() {
    try {
        // 1. Try Supabase
        const { data, error } = await supabase
            .storage
            .from(CONFIG_BUCKET)
            .download(CONFIG_FILE);

        if (!error && data) {
            const text = await data.text();
            try {
                const json = JSON.parse(text);
                return NextResponse.json(json);
            } catch (e) {
                console.error("Failed to parse Supabase config JSON", e);
            }
        }

        // 2. Fallback to Local
        console.log("Config not found in Supabase (or error), using local default.");
        const localData = readLocalConfig();
        return NextResponse.json(localData);

    } catch (error) {
        console.error("Config GET error:", error);
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

// POST: Update configuration to Supabase
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Use Service Role key for admin rights (bypass RLS)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        if (!supabaseServiceKey) {
            console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
            throw new Error("Server configuration error: Missing Service Role Key");
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Save to Supabase
        const { error } = await supabaseAdmin
            .storage
            .from(CONFIG_BUCKET)
            .upload(CONFIG_FILE, JSON.stringify(body, null, 2), {
                contentType: 'application/json',
                upsert: true
            });

        if (error) {
            // If upload fails, maybe bucket doesn't exist or permissions issue.
            // But we try local write as a fallback (which won't persist on Vercel but helps local dev)
            console.error("Supabase config save failed:", error);

            // Fallback for local dev
            try {
                fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(body, null, 2), 'utf8');
            } catch (fsErr) {
                console.error("Local save also failed", fsErr);
            }

            throw error;
        }

        // Also update local file if we can (for dev environment sync)
        try {
            if (process.env.NODE_ENV === 'development') {
                fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(body, null, 2), 'utf8');
            }
        } catch (e) {
            // Ignore local write error
        }

        return NextResponse.json({ message: 'Config saved' });
    } catch (error: any) {
        console.error("Config POST error:", error);
        return NextResponse.json({ error: 'Failed to save config: ' + error.message }, { status: 500 });
    }
}
