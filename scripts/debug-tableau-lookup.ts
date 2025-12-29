import fs from 'fs';
import path from 'path';

// Load env logic manually FIRST
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
} else {
    console.warn("No .env.local found!");
}

async function main() {
    // Dynamic import AFTER env is set
    const { authenticateTableau, findViewByContentUrl } = await import('../src/lib/tableau');

    console.log("Authenticating...");
    try {
        const { token, siteId } = await authenticateTableau();
        console.log("Authenticated. Site ID:", siteId);

        const testUrl = "https://online.tableau.com/#/site/narcadegames/views/ChristmasDesignLevelScoreAnalysis/LevelRevize";
        console.log("\nTesting Lookup for URL:", testUrl);

        // 1. Run the actual function to see if it fails locally
        const result = await findViewByContentUrl(testUrl, token, siteId);
        if (result) {
            console.log("✅ SUCCESS! Found view:", result);
        } else {
            console.log("❌ FAILED! View not found by utility function.");
        }

        // 2. Fetch ALL views and dump them to see what's actually there
        console.log("\n--- Debugging: Fetching ALL pages to find the view ---");

        let foundView = null;
        let pageNumber = 1;
        const pageSize = 500;
        let totalFetched = 0;

        while (!foundView) {
            const endpoint = `${process.env.TABLEAU_SERVER_URL}/api/3.22/sites/${siteId}/views?pageSize=${pageSize}&pageNumber=${pageNumber}`;
            console.log(`Fetching page ${pageNumber}...`);

            const response = await fetch(endpoint, {
                headers: {
                    'X-Tableau-Auth': token,
                    'Accept': 'application/json'
                }
            });
            const data = await response.json();
            const views = data.views?.view || [];

            if (views.length === 0) break;

            totalFetched += views.length;

            // Find all matches for this workbook
            const matches = views.filter((v: any) =>
                (v.contentUrl && v.contentUrl.toLowerCase().includes('christmasdesignlevelscoreanalysis'))
            );

            if (matches.length > 0) {
                console.log(`\nFound ${matches.length} matches on page ${pageNumber}:`);
                matches.forEach((m: any) => console.log(JSON.stringify(m, null, 2)));
                // Don't break immediately if we want to see if it's split across pages (unlikely but possible)
            }

            console.log(`Scanned ${views.length} views on page ${pageNumber}. Total scanned: ${totalFetched}.`);
            pageNumber++;

            // Safety break
            if (totalFetched > 5000) {
                console.log("Reached safety limit. Stopping.");
                break;
            }
        }

    } catch (e: any) {
        console.error("Error:", e.message);
        if (e.cause) console.error(e.cause);
    }
}

main();
