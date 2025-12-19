
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

const MOCK_MODE = process.env.MOCK_TABLEAU === 'true' || !TABLEAU_SERVER_URL;

export async function authenticateTableau(): Promise<{ token: string; siteId: string }> {
    if (MOCK_MODE) {
        console.log('Returning MOCK Tableau authentication');
        return { token: 'mock-token-123', siteId: 'mock-site-id' };
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

export async function fetchTableauData(viewId: string, token: string, siteId: string) {
    if (MOCK_MODE) {
        console.log(`Returning MOCK data for view ${viewId}`);
        // Return a mock Response object
        return new Response(`LevelID,Metrics,Value\n1,Difficulty,0.8\n1,WinRate,0.45\n2,Difficulty,0.6\n2,WinRate,0.60`, {
            status: 200,
            statusText: 'OK'
        });
    }

    // Example: Fetch data from a view as CSV
    // https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref.htm#query_view_data
    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/views/${viewId}/data`;

    const response = await fetch(endpoint, {
        headers: {
            'X-Tableau-Auth': token
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tableau Fetch Data Failed: ${response.status} - ${errorText}`);
        // Pass the error text up so the API route can return it
        // We construct a new Response to mimic fetch behavior for the caller, or throw.
        // Let's throw with detail.
        throw new Error(errorText);
    }

    return response;
}
