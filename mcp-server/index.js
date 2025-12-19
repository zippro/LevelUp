#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import process from "process";
// --- Tableau Logic (Inline for simplicity, can import from lib if compiled) ---
const TABLEAU_SERVER_URL = process.env.TABLEAU_SERVER_URL;
const TABLEAU_SITE_ID = process.env.TABLEAU_SITE_ID || "";
const TABLEAU_API_VERSION = "3.22";
const TABLEAU_PAT_NAME = process.env.TABLEAU_PAT_NAME;
const TABLEAU_PAT_SECRET = process.env.TABLEAU_PAT_SECRET;
const MOCK_MODE = process.env.MOCK_TABLEAU === "true" || !TABLEAU_SERVER_URL;
async function authenticateTableau() {
    if (MOCK_MODE) {
        return { token: "mock-token-mcp", siteId: "mock-site-id-mcp" };
    }
    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/auth/signin`;
    const body = {
        credentials: {
            personalAccessTokenName: TABLEAU_PAT_NAME,
            personalAccessTokenSecret: TABLEAU_PAT_SECRET,
            site: { contentUrl: TABLEAU_SITE_ID },
        },
    };
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        throw new Error(`Auth Failed: ${response.statusText}`);
    const data = await response.json();
    return {
        token: data.credentials.token,
        siteId: data.credentials.site.id,
    };
}
async function fetchViewData(viewId, token, siteId) {
    if (MOCK_MODE) {
        return `LevelID,Difficulty,WinRate\n${viewId}_1,0.8,0.45\n${viewId}_2,0.6,0.60 (Mock from MCP)`;
    }
    const endpoint = `${TABLEAU_SERVER_URL}/api/${TABLEAU_API_VERSION}/sites/${siteId}/views/${viewId}/data`;
    const response = await fetch(endpoint, {
        headers: { "X-Tableau-Auth": token },
    });
    if (!response.ok)
        throw new Error(`Fetch Failed: ${response.statusText}`);
    return await response.text();
}
// -----------------------------------------------------------------------------
const server = new Server({
    name: "tableau-mcp-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
const FETCH_TOOL = {
    name: "fetch_tableau_data",
    description: "Fetches CSV data from a specific Tableau View.",
    inputSchema: {
        type: "object",
        properties: {
            viewId: {
                type: "string",
                description: "The ID or 'workbook/sheet' path of the Tableau view to fetch.",
            },
            siteContentUrl: {
                type: "string",
                description: "Optional site content URL override.",
            },
        },
        required: ["viewId"],
    },
};
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [FETCH_TOOL],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "fetch_tableau_data") {
        try {
            const { viewId } = request.params.arguments;
            console.error(`Fetching data for view: ${viewId}`); // Log to stderr for debugging
            const auth = await authenticateTableau();
            const csvData = await fetchViewData(viewId, auth.token, auth.siteId);
            return {
                content: [
                    {
                        type: "text",
                        text: csvData,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }
    throw new Error("Tool not found");
});
server.connect(new StdioServerTransport());
//# sourceMappingURL=index.js.map