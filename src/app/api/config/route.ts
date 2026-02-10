import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { getSystemConfig } from '@/lib/config';

// Force dynamic to ensure we don't cache stale config on Vercel
export const dynamic = 'force-dynamic';

const CONFIG_BUCKET = 'data-repository';
const CONFIG_FILE = 'system/dashboard-config.json';
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'config', 'dashboard-data.json');

// Response headers to prevent any browser/CDN caching of config
const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
};

// GET: Retrieve configuration from Supabase, fallback to local
export async function GET() {
    const config = await getSystemConfig();
    return NextResponse.json(config, { headers: NO_CACHE_HEADERS });
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
