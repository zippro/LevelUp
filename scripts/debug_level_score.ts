
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

import papa from 'papaparse';

// ... (existing imports)

// Helper to pivot "Tall" data (Measure Names/Values) to "Wide" (Crosstab)
function pivotTableauData(csvText: string): string {
    const parseResult = papa.parse(csvText, { header: true, skipEmptyLines: true });

    if (parseResult.errors.length > 0) {
        console.error("CSV Parse Errors:", parseResult.errors);
        return csvText; // Return original if parsing fails
    }

    const data = parseResult.data as Record<string, any>[];
    const meta = parseResult.meta;

    // Check if pivoting is needed
    if (!meta.fields?.includes("Measure Names") || !meta.fields?.includes("Measure Values")) {
        console.log("Pivot NOT needed: Measure Names/Values not found in headers:", meta.fields);
        return csvText;
    }

    console.log("Pivoting Tableau Data...");

    // Identify Dimensions (all columns except Measure Names/Values)
    const dimensions = meta.fields.filter(f => f !== "Measure Names" && f !== "Measure Values");
    console.log("Dimensions:", dimensions);

    // Group by Dimensions
    const groupedData: Record<string, any> = {};

    data.forEach(row => {
        // Create a unique key for the row based on dimensions
        const key = dimensions.map(d => row[d]).join("|||");

        if (!groupedData[key]) {
            // Initialize row with dimension values
            const newRow: Record<string, any> = {};
            dimensions.forEach(d => newRow[d] = row[d]);
            groupedData[key] = newRow;
        }

        // Add the measure value
        const measureName = row["Measure Names"];
        const measureValue = row["Measure Values"];
        if (measureName) {
            groupedData[key][measureName] = measureValue;
        }
    });

    // Convert back to array
    const pivotedData = Object.values(groupedData);
    console.log("Pivoted Rows Count:", pivotedData.length);
    if (pivotedData.length > 0) console.log("First Pivoted Row Keys:", Object.keys(pivotedData[0]));
    if (pivotedData.length > 0) console.log("First Pivoted Row:", pivotedData[0]);

    // Unparse back to CSV
    return papa.unparse(pivotedData);
}
const envPath = path.resolve(process.cwd(), '.env.local');
let env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
    });
} else {
    console.warn('.env.local not found, relying on process.env');
    env = process.env as Record<string, string>;
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const tableauServer = env.NEXT_PUBLIC_TABLEAU_SERVER_URL || env.TABLEAU_SERVER_URL || process.env.NEXT_PUBLIC_TABLEAU_SERVER_URL;
const tableauPatName = env.TABLEAU_PAT_NAME || process.env.TABLEAU_PAT_NAME;
const tableauPatSecret = env.TABLEAU_PAT_SECRET || process.env.TABLEAU_PAT_SECRET;
const tableauSite = env.TABLEAU_SITE_ID || process.env.TABLEAU_SITE_ID || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    // process.exit(1); 
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function debugTableau() {
    console.log('--- Debugging Tableau ---');
    console.log(`Server: ${tableauServer}`);
    console.log(`PAT Name: ${tableauPatName}`);
    console.log(`Site: ${tableauSite}`);

    if (!tableauServer || !tableauPatName || !tableauPatSecret) {
        console.error('Missing Tableau credentials (PAT)');
        return;
    }

    try {
        // 1. Authenticate
        console.log('Authenticating with PAT...');
        const authUrl = `${tableauServer}/api/3.22/auth/signin`;
        const authBody = {
            credentials: {
                personalAccessTokenName: tableauPatName,
                personalAccessTokenSecret: tableauPatSecret,
                site: { contentUrl: tableauSite }
            }
        };

        const authRes = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(authBody)
        });

        if (!authRes.ok) {
            const err = await authRes.text();
            throw new Error(`Auth failed: ${authRes.status} ${err}`);
        }

        const authData = await authRes.json();
        const token = authData.credentials.token;
        const siteId = authData.credentials.site.id;
        console.log('Authenticated! Token:', token.substring(0, 10) + '...', 'SiteID:', siteId);

        // 2. Fetch Data
        const viewId = '99b6db23-884c-45e2-a56b-2e1322f90129'; // Christmas Puzzle / Level Revize
        console.log(`Fetching data for View ID: ${viewId}`);

        const dataUrl = `${tableauServer}/api/3.22/sites/${siteId}/views/${viewId}/data`;
        const dataRes = await fetch(dataUrl, {
            method: 'GET',
            headers: { 'X-Tableau-Auth': token }
        });

        if (!dataRes.ok) {
            const err = await dataRes.text();
            throw new Error(`Data fetch failed: ${dataRes.status} ${err}`);
        }

        const dataText = await dataRes.text();
        console.log('Data fetched successfully!');

        // Test Pivot
        const pivotedCsv = pivotTableauData(dataText);
        // console.log('Pivoted CSV Preview:', pivotedCsv.substring(0, 500));


    } catch (error: any) {
        console.error('Tableau Error:', error.message);
    }
}

async function debugSupabase() {
    console.log('\n--- Debugging Supabase ---');
    const gameId = 'game-1';
    console.log(`Fetching level scores for gameId: ${gameId}`);

    const { data, error } = await supabase
        .from('level_scores')
        .select('*')
        .eq('game_id', gameId)
        .limit(5);

    if (error) {
        console.error('Supabase Error:', error.message);
    } else {
        console.log('Supabase Data (first 5 items):', data);
    }
}

async function run() {
    await debugTableau();
    await debugSupabase();
}

run();
