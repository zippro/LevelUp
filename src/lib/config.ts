import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

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

// Exported helper for server-side usage
// Uses createSignedUrl to bypass Supabase Storage CDN cache,
// which otherwise returns stale config for minutes after an update.
export async function getSystemConfig() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        // 1. Try Supabase with signed URL to bypass CDN cache
        if (supabaseServiceKey && supabaseUrl) {
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
            const { data: signedData, error: signedError } = await supabaseAdmin
                .storage
                .from(CONFIG_BUCKET)
                .createSignedUrl(CONFIG_FILE, 60);

            if (!signedError && signedData?.signedUrl) {
                const response = await fetch(signedData.signedUrl, { cache: 'no-store' });
                if (response.ok) {
                    const text = await response.text();
                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        console.error("Failed to parse Supabase config JSON", e);
                    }
                }
            } else {
                console.error("Signed URL failed, falling back to download():", signedError);
            }
        }

        // 2. Fallback: try with anon client (may return CDN-cached data)
        const { data, error } = await supabase
            .storage
            .from(CONFIG_BUCKET)
            .download(CONFIG_FILE);

        if (!error && data) {
            const text = await data.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error("Failed to parse Supabase config JSON", e);
            }
        }

        // 3. Fallback to Local
        console.log("Config not found in Supabase (or error), using local default.");
        return readLocalConfig();

    } catch (error) {
        console.error("Config fetch error:", error);
        return { variables: [], games: [] }; // Return empty config on failure
    }
}
