import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';

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
export async function getSystemConfig() {
    try {
        // 1. Try Supabase
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

        // 2. Fallback to Local
        console.log("Config not found in Supabase (or error), using local default.");
        return readLocalConfig();

    } catch (error) {
        console.error("Config fetch error:", error);
        return { variables: [], games: [] }; // Return empty config on failure
    }
}
