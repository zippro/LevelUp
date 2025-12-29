
const TABLEAU_SERVER_URL = process.env.TABLEAU_SERVER_URL!;
const TABLEAU_SITE_ID = process.env.TABLEAU_SITE_ID || '';
const TABLEAU_API_VERSION = '3.22'; // Adjust as needed
const TABLEAU_PAT_NAME = process.env.TABLEAU_PAT_NAME!;
const TABLEAU_PAT_SECRET = process.env.TABLEAU_PAT_SECRET!;

interface TableauAuthResponse {
    credentials: {
        token: string;
        site: {
            id: string;
            contentUrl: string;
        };
    };
}

const MOCK_MODE = process.env.MOCK_TABLEAU === 'true'; // Strict mock mode

export async function authenticateTableau(): Promise<{ token: string; siteId: string }> {
    if (MOCK_MODE) {
        console.log('Returning MOCK Tableau authentication');
        return { token: 'mock-token-123', siteId: 'mock-site-id' };
    }

    if (!TABLEAU_SERVER_URL) {
        throw new Error("Configuration Error: TABLEAU_SERVER_URL is missing or empty. Please check Vercel Environment Variables.");
    }

    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/auth/signin`;

    const body = {
        credentials: {
            personalAccessTokenName: TABLEAU_PAT_NAME,
            personalAccessTokenSecret: TABLEAU_PAT_SECRET,
            site: {
                contentUrl: TABLEAU_SITE_ID
            }
        }
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tableau Auth Failed: ${response.status} - ${errorText}`);
        throw new Error(`Tableau Authentication Failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as TableauAuthResponse;
    return {
        token: data.credentials.token,
        siteId: data.credentials.site.id
    };
}

export async function fetchTableauData(
    viewId: string,
    token: string,
    siteId: string,
    filters?: { startDate?: string; endDate?: string }
) {
    if (MOCK_MODE) {
        console.log(`Returning MOCK data for view ${viewId}`);
        // Return a mock Response object
        return new Response(`LevelID,Metrics,Value\n1,Difficulty,0.8\n1,WinRate,0.45\n2,Difficulty,0.6\n2,WinRate,0.60`, {
            status: 200,
            statusText: 'OK'
        });
    }

    // Build base URL
    let endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/views/${viewId}/data`;

    // Add date filters if provided (using Tableau's vf_ filter syntax)
    // Field name from Tableau: "Time Event" - must be URL encoded
    const params = new URLSearchParams();

    if (filters?.startDate && filters?.endDate) {
        // Use colon range format: vf_Time Event=2025-12-20:2025-12-23
        params.append('vf_Time Event', `${filters.startDate}:${filters.endDate}`);
        console.log(`[Tableau] Date filter range: ${filters.startDate}:${filters.endDate}`);
    } else if (filters?.startDate) {
        params.append('vf_Time Event', filters.startDate);
        console.log(`[Tableau] Date filter: start only ${filters.startDate}`);
    } else if (filters?.endDate) {
        params.append('vf_Time Event', filters.endDate);
        console.log(`[Tableau] Date filter: end only ${filters.endDate}`);
    }

    if (params.toString()) {
        endpoint += `?${params.toString()}`;
        console.log(`[Tableau] Fetching with filters: ${endpoint}`);
    }

    const response = await fetch(endpoint, {
        headers: {
            'X-Tableau-Auth': token
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tableau Fetch Data Failed: ${response.status} - ${errorText}`);
        throw new Error(errorText);
    }

    return response;
}

export async function findViewByContentUrl(contentUrl: string, token: string, siteId: string) {
    if (MOCK_MODE) {
        return { id: 'mock-view-id-' + Math.random(), name: 'Mock View' };
    }

    // List views with pagination to ensure we find everything (search up to 5000 views)
    const pageSize = 500;
    let pageNumber = 1;
    let found = null;

    while (!found && pageNumber <= 10) { // Safety limit of 10 pages (5000 views)
        const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/views?pageSize=${pageSize}&pageNumber=${pageNumber}`;

        const response = await fetch(endpoint, {
            headers: {
                'X-Tableau-Auth': token,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            // If page is out of range, some APIs return 400. Treat as end.
            if (response.status === 400 || response.status === 404) {
                break;
            }
            throw new Error(`Failed to list views page ${pageNumber}: ${response.status}`);
        }

        const data = await response.json();
        const views = data.views?.view || [];

        if (views.length === 0) break;

        // Parse input contentUrl (expected: "Workbook/Sheet" or "Workbook/sheets/Sheet")
        const parts = contentUrl.split('/').filter(p => p && p.toLowerCase() !== 'views' && p.toLowerCase() !== 'sheets');

        // If parsing fails, skip logic but prevent crash
        if (parts.length >= 2) {
            const targetSheet = decodeURIComponent(parts[parts.length - 1]).toLowerCase();
            const targetWorkbook = decodeURIComponent(parts[parts.length - 2]).toLowerCase();

            console.log(`[Tableau Lookup] Page ${pageNumber}: Searching for Workbook: "${targetWorkbook}", View: "${targetSheet}"`);

            found = views.find((v: any) => {
                const contentUrl = (v.contentUrl || "").toLowerCase();
                const workbookName = (v.workbook?.name || "").toLowerCase();
                const viewName = (v.name || "").toLowerCase();

                // 1. Direct contentUrl match
                if (contentUrl.includes(`${targetWorkbook}/sheets/${targetSheet}`)) return true;
                if (contentUrl.includes(`${targetWorkbook}/${targetSheet}`)) return true;

                // 2. Component match (Workbook name + View name)
                if (workbookName === targetWorkbook && viewName === targetSheet) return true;

                return false;
            });
        }

        pageNumber++;
    }

    if (!found) {
        console.log(`[Tableau Lookup] View not found after scanning ${pageNumber - 1} pages.`);
    }

    return found ? { id: found.id, name: found.name, contentUrl: found.contentUrl } : null;
}
