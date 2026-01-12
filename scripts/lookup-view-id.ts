const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    console.log("Loading .env.local...");
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line: string) => {
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

const TABLEAU_SERVER_URL = process.env.TABLEAU_SERVER_URL!;
const TABLEAU_SITE_ID = process.env.TABLEAU_SITE_ID || '';
const TABLEAU_API_VERSION = '3.22';
const TABLEAU_PAT_NAME = process.env.TABLEAU_PAT_NAME!;
const TABLEAU_PAT_SECRET = process.env.TABLEAU_PAT_SECRET!;

async function authenticateTableau(): Promise<{ token: string; siteId: string }> {
    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/auth/signin`;
    const body = {
        credentials: {
            personalAccessTokenName: TABLEAU_PAT_NAME,
            personalAccessTokenSecret: TABLEAU_PAT_SECRET,
            site: { contentUrl: TABLEAU_SITE_ID }
        }
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tableau Auth Failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return { token: data.credentials.token, siteId: data.credentials.site.id };
}

async function findViewByContentUrl(contentUrl: string, token: string, siteId: string) {
    const pageSize = 500;
    let pageNumber = 1;
    let found = null;

    while (!found && pageNumber <= 10) {
        const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/views?pageSize=${pageSize}&pageNumber=${pageNumber}`;
        const response = await fetch(endpoint, {
            headers: { 'X-Tableau-Auth': token, 'Accept': 'application/json' }
        });

        if (!response.ok) {
            if (response.status === 400 || response.status === 404) break;
            throw new Error(`Failed to list views page ${pageNumber}: ${response.status}`);
        }

        const data = await response.json();
        const views = data.views?.view || [];
        if (views.length === 0) break;

        const parts = contentUrl.split('/').filter((p: string) => p && p.toLowerCase() !== 'views' && p.toLowerCase() !== 'sheets');

        if (parts.length >= 2) {
            const targetSheet = decodeURIComponent(parts[parts.length - 1]).toLowerCase();
            const targetWorkbook = decodeURIComponent(parts[parts.length - 2]).toLowerCase();

            console.log(`[Page ${pageNumber}] Searching for Workbook: "${targetWorkbook}", View: "${targetSheet}"`);

            found = views.find((v: any) => {
                const vContentUrl = (v.contentUrl || "").toLowerCase();
                const workbookName = (v.workbook?.name || "").toLowerCase();
                const viewName = (v.name || "").toLowerCase();

                if (vContentUrl.includes(`${targetWorkbook}/sheets/${targetSheet}`)) return true;
                if (vContentUrl.includes(`${targetWorkbook}/${targetSheet}`)) return true;
                if (workbookName === targetWorkbook && viewName === targetSheet) return true;
                return false;
            });
        }
        pageNumber++;
    }
    return found ? { id: found.id, name: found.name, contentUrl: found.contentUrl } : null;
}

async function main() {
    const url = "https://eu-west-1a.online.tableau.com/#/site/narcadegames/views/GardenDesignChurn/LevelRevize";

    console.log("Authenticating with Tableau...");
    const auth = await authenticateTableau();
    console.log("✅ Authenticated successfully");

    console.log(`\nLooking up view: ${url}`);
    const cleanUrl = url.split('?')[0];

    const view = await findViewByContentUrl(cleanUrl, auth.token, auth.siteId);

    if (view) {
        console.log("\n✅ Found View:");
        console.log(`   ID: ${view.id}`);
        console.log(`   Name: ${view.name}`);
        console.log(`   Content URL: ${view.contentUrl}`);
        console.log(`\n📋 Copy this ID to your settings: ${view.id}`);
    } else {
        console.log("\n❌ View not found. The view may not exist or may have a different name.");
    }
}

main().catch(console.error);
