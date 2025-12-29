
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. Load Env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    console.log("Loading .env.local...");
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const firstEq = trimmed.indexOf('=');
        if (firstEq > -1) {
            const key = trimmed.substring(0, firstEq).trim();
            const value = trimmed.substring(firstEq + 1).trim();
            process.env[key] = value;
        }
    });
}

// 2. Define Data
const LEVEL_SCORE_AB = "Level Score AB";
const LEVEL_REVIZE = "Level Revize";
const BOLGESEL_RAPOR = "Bolgesel Rapor";

// Game Name to ID Mapping (based on dashboard-data.json)
const GAME_IDS: Record<string, string> = {
    "Christmas Design": "game-1", // "Christmas Puzzle" in config, assuming same
    "Garden Design": "garden-design",
    "Wish Wonder": "wish-wonder",
    "Dream Design": "dream-design",
    "Zen Master": "zen-master",
    "Friends Adventure": "friends-adventure",
    "Royal Decor": "royal-decor"
};

const URLS = [
    // Level Score AB
    { game: "Christmas Design", var: LEVEL_SCORE_AB, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/ChristmasDesignLevelScoreAnalysis/LevelScore-DiffSeed?:iid=1" },
    { game: "Dream Design", var: LEVEL_SCORE_AB, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/DreamDesignLevelScoreAnalysis/LevelScore-DiffSeed?:iid=1" },
    { game: "Zen Master", var: LEVEL_SCORE_AB, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/ZenMasterLevelScoreAnalysis/LevelScoreDiffSeed?:iid=1" },

    // Level Revize & Bolgesel Rapor (Same View)
    { game: "Garden Design", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/GardenDesignChurn/LevelRevize?:iid=2" },
    { game: "Garden Design", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/GardenDesignChurn/LevelRevize?:iid=2" },

    { game: "Wish Wonder", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/WishWonderChurn/LevelRevize?:iid=1" },
    { game: "Wish Wonder", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/WishWonderChurn/LevelRevize?:iid=1" },

    { game: "Christmas Design", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/ChristmasDesignLevelScoreAnalysis/LevelRevize" },
    { game: "Christmas Design", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/ChristmasDesignLevelScoreAnalysis/LevelRevize" },

    { game: "Dream Design", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/DreamDesignLevelScoreAnalysis/LevelRevize?:iid=1" },
    { game: "Dream Design", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/DreamDesignLevelScoreAnalysis/LevelRevize?:iid=1" },

    { game: "Zen Master", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/ZenMasterLevelScoreAnalysis/LevelRevize?:iid=1" },
    { game: "Zen Master", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/ZenMasterLevelScoreAnalysis/LevelRevize?:iid=1" },

    { game: "Friends Adventure", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/FAMLevelScoreAnalysis/LevelRevize?:iid=1" },
    { game: "Friends Adventure", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/FAMLevelScoreAnalysis/LevelRevize?:iid=1" },

    { game: "Royal Decor", var: LEVEL_REVIZE, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/RoyalDecorLevelScoreAnalysis/LevelRevize?:iid=1" },
    { game: "Royal Decor", var: BOLGESEL_RAPOR, url: "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/RoyalDecorLevelScoreAnalysis/LevelRevize?:iid=1" }
];

async function main() {
    // Dynamic import
    const { authenticateTableau, findViewByContentUrl } = await import('../src/lib/tableau');

    console.log("Authenticating Tableau...");
    const auth = await authenticateTableau();
    console.log("Authenticated.");

    const updates: Record<string, Record<string, string>> = {}; // gameId -> { var -> viewId }
    const urlUpdates: Record<string, Record<string, string>> = {}; // gameId -> { var -> url }

    for (const item of URLS) {
        const gameId = GAME_IDS[item.game];
        if (!gameId) {
            console.warn(`Unknown game "${item.game}", skipping.`);
            continue;
        }

        console.log(`Resolving ${item.game} - ${item.var}...`);

        // Clean URL for lookup function logic (remove query params if needed, though my logic handles parts)
        // Ensure /views/ is preserved or handled. URL logic in api route handled splitting.
        // My library findViewByContentUrl handles full URL string parsing in its updated version?
        // Wait, my `findViewByContentUrl` expects the `contentUrl` string (or URL-like string).
        // It splits by '/'.
        // Let's pass the full URL, the function splits by / and filters 'views', 'sheets' etc.


        try {
            // Clean URL: Remove Query Params (?:iid=1 etc)
            const cleanUrl = item.url.split('?')[0];
            // Also need to handle URL encoded chars if any, but split logic usually handles it.
            // Actually, findViewByContentUrl splits by '/' 

            const view = await findViewByContentUrl(cleanUrl, auth.token, auth.siteId);
            if (view) {
                console.log(`  -> Found ID: ${view.id} (${view.name})`);
                if (!updates[gameId]) updates[gameId] = {};
                updates[gameId][item.var] = view.id;

                if (!urlUpdates[gameId]) urlUpdates[gameId] = {};
                urlUpdates[gameId][item.var] = item.url;
            } else {
                console.error(`  -> NOT FOUND via URL: ${item.url}`);
            }
        } catch (e: any) {
            console.error(`  -> Error: ${e.message}`);
        }
    }

    console.log("--- Applying Updates to Supabase ---");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // Download Config
    const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('data-repository')
        .download('system/dashboard-config.json');

    let config: any = { variables: [], games: [] };
    if (!downloadError && fileData) {
        config = JSON.parse(await fileData.text());
    } else {
        console.log("Could not download config, starting fresh/local?");
        // Fallback to local if needed, but we expect it to exist
    }

    // Update Variables
    if (!config.variables.includes(LEVEL_SCORE_AB)) {
        config.variables.push(LEVEL_SCORE_AB);
    }
    if (!config.variables.includes(LEVEL_REVIZE)) {
        config.variables.push(LEVEL_REVIZE);
    }
    if (!config.variables.includes(BOLGESEL_RAPOR)) {
        config.variables.push(BOLGESEL_RAPOR);
    }

    // Update Mappings
    config.games = config.games.map((g: any) => {
        if (updates[g.id]) {
            g.viewMappings = { ...g.viewMappings, ...updates[g.id] };
        }
        if (urlUpdates[g.id]) {
            g.urlMappings = { ...(g.urlMappings || {}), ...urlUpdates[g.id] };
        }
        return g;
    });

    // Upload Config
    const { error: uploadError } = await supabase
        .storage
        .from('data-repository')
        .upload('system/dashboard-config.json', JSON.stringify(config, null, 2), {
            contentType: 'application/json',
            upsert: true
        });

    if (uploadError) {
        console.error("Supabase Upload Failed:", uploadError);
    } else {
        console.log("✅ Config successfully updated in Supabase!");
    }
}

main();
