// import 'dotenv/config';
import fetch from 'node-fetch';

// Load env (requires dotenv to be installed if not using Next.js runtime, but we can rely on manual loading or just parsing)
// Actually Next.js doesn't run this script, so we need dotenv. 
// Or better, just read .env.local manually to avoid dep issues.

import fs from 'fs';
import path from 'path';

function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                if (key && value) {
                    process.env[key] = value;
                }
            }
        });
    } catch (e) {
        console.error("Could not load .env.local");
    }
}

loadEnv();

const TABLEAU_SERVER_URL = process.env.TABLEAU_SERVER_URL;
const TABLEAU_SITE_ID = process.env.TABLEAU_SITE_ID || '';
const TABLEAU_API_VERSION = '3.22';
const TABLEAU_PAT_NAME = process.env.TABLEAU_PAT_NAME;
const TABLEAU_PAT_SECRET = process.env.TABLEAU_PAT_SECRET;

async function authenticate() {
    if (!TABLEAU_SERVER_URL || !TABLEAU_PAT_NAME || !TABLEAU_PAT_SECRET) {
        throw new Error("Missing Credentials in .env.local");
    }

    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/auth/signin`;
    const body = {
        credentials: {
            personalAccessTokenName: TABLEAU_PAT_NAME,
            personalAccessTokenSecret: TABLEAU_PAT_SECRET,
            site: { contentUrl: TABLEAU_SITE_ID }
        }
    };

    console.log(`Authenticating to ${TABLEAU_SERVER_URL} (Site: ${TABLEAU_SITE_ID})...`);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Auth Failed: ${response.status} - ${txt}`);
    }

    const data: any = await response.json();
    return {
        token: data.credentials.token,
        siteId: data.credentials.site.id,
        userId: data.credentials.user.id
    };
}

async function listWorkbooks(token: string, siteId: string) {
    // List workbooks to find views
    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/workbooks`;
    const response = await fetch(endpoint, {
        headers: { 'X-Tableau-Auth': token, 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`List Workbooks Failed: ${response.statusText}`);
    const data: any = await response.json();
    return data.workbooks.workbook;
}

async function listViews(token: string, siteId: string) {
    let allViews: any[] = [];
    let pageNumber = 1;
    const pageSize = 100;

    while (true) {
        console.log(`Fetching page ${pageNumber}...`);
        const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/views?pageSize=${pageSize}&pageNumber=${pageNumber}`;
        const response = await fetch(endpoint, {
            headers: { 'X-Tableau-Auth': token, 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`List Views Failed: ${response.statusText}`);
        const data: any = await response.json();

        const views = data.views.view;
        if (!views || views.length === 0) break;

        allViews = allViews.concat(views);

        const totalAvailable = parseInt(data.pagination.totalAvailable);
        if (allViews.length >= totalAvailable) break;

        pageNumber++;
    }

    return allViews;
}

async function main() {
    try {
        const { token, siteId } = await authenticate();
        console.log("Authentication Successful!");
        console.log("Fetching Views...");

        const views = await listViews(token, siteId);

        console.log("\nFound valid Views (Copy the ID):");
        console.log("---------------------------------------------------");
        views.forEach((v: any) => {
            console.log(`Name: ${v.name}`);
            console.log(`Workbook: ${v.workbook.id}`); // API returns workbook object sometimes or just id
            console.log(`ID:   ${v.id}`); // THIS IS THE UUID
            console.log(`URL:  ${v.contentUrl}`);
            console.log("---------------------------------------------------");
        });

    } catch (error: any) {
        console.error("Error:", error.message);
    }
}

main();
