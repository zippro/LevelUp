import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import papa from 'papaparse';

// Use longer timeout for Vercel
export const maxDuration = 60;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Send follow-up message to Discord
async function sendFollowUp(applicationId: string, token: string, content: string) {
    const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
    if (!response.ok) {
        console.error('[Discord] Follow-up failed:', response.status, await response.text());
    }
    return response.ok;
}

export async function POST(request: Request) {
    try {
        const { levelNum, gameName, applicationId, interactionToken } = await request.json();

        console.log(`[ProcessLevel] Starting processing for level ${levelNum}, game: ${gameName}`);

        const centerLevel = parseInt(String(levelNum));
        const startLevel = centerLevel - 5;
        const endLevel = centerLevel + 5;

        // Get config
        const { getSystemConfig } = await import('@/lib/config');
        const config = await getSystemConfig();

        let matchedGame: any = null;
        if (gameName) {
            const searchTerm = gameName.toLowerCase();
            matchedGame = config.games?.find((g: any) =>
                g.id.toLowerCase() === searchTerm ||
                g.name.toLowerCase() === searchTerm ||
                g.aliases?.some((alias: string) => alias.toLowerCase() === searchTerm)
            );

            if (!matchedGame) {
                const gameTable = config.games?.map((g: any) => {
                    const aliases = g.aliases?.length > 0 ? g.aliases.join(', ') : g.id;
                    return `• **${g.name}** → \`${aliases}\``;
                }).join('\n') || 'None';
                await sendFollowUp(applicationId, interactionToken,
                    `❌ Game '${gameName}' not found.\n\n**Available games & aliases:**\n${gameTable}`);
                return NextResponse.json({ success: true });
            }
        }

        // Find CSV file
        const { data: files, error: listError } = await supabase.storage
            .from('data-repository')
            .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        if (listError || !files) {
            await sendFollowUp(applicationId, interactionToken,
                `Error listing data: ${listError?.message || 'No files found'}`);
            return NextResponse.json({ success: true });
        }

        const gameNameToMatch = matchedGame?.name || gameName;
        console.log(`[ProcessLevel] Looking for files, game: ${gameNameToMatch}, files: ${files.length}`);

        let matchingFile = null;
        if (gameNameToMatch) {
            matchingFile = files.find((f: any) =>
                f.name.toLowerCase().includes(gameNameToMatch.toLowerCase()) &&
                f.name.toLowerCase().includes('level revize')
            );
        } else {
            matchingFile = files.find((f: any) =>
                f.name.toLowerCase().includes('level revize')
            );
        }

        if (!matchingFile) {
            await sendFollowUp(applicationId, interactionToken,
                `No Level Revize data found${gameNameToMatch ? ` for game '${gameNameToMatch}'` : ''}. Please load data from Weekly Check first.`);
            return NextResponse.json({ success: true });
        }

        console.log(`[ProcessLevel] Downloading: ${matchingFile.name}`);

        // Download CSV
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('data-repository')
            .download(matchingFile.name);

        if (downloadError || !fileData) {
            await sendFollowUp(applicationId, interactionToken,
                `Error downloading data: ${downloadError?.message || 'Unknown error'}`);
            return NextResponse.json({ success: true });
        }

        const csvText = await fileData.text();
        const parsed = papa.parse(csvText, { header: true, skipEmptyLines: true });
        const rows = parsed.data as any[];

        console.log(`[ProcessLevel] Parsed ${rows.length} rows`);

        // Find level column
        const sampleRow = rows[0] || {};
        const levelCol = Object.keys(sampleRow).find(k => {
            const n = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            return n === 'level' || n === 'levelnumber' || n === 'level_number';
        }) || 'Level';

        // Filter rows
        const filteredRows = rows.filter(row => {
            const lvl = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            return lvl >= startLevel && lvl <= endLevel;
        }).sort((a, b) => {
            const lvlA = parseInt(String(a[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            const lvlB = parseInt(String(b[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            return lvlA - lvlB;
        });

        if (filteredRows.length === 0) {
            await sendFollowUp(applicationId, interactionToken,
                `No data found for level ${levelNum} (+/- 5)${gameNameToMatch ? ` in game '${gameNameToMatch}'` : ''}.`);
            return NextResponse.json({ success: true });
        }

        // Fetch clusters from DB
        const gameIdForDb = matchedGame?.id || null;
        let clusterMap: Record<number, string> = {};
        if (gameIdForDb) {
            const { data: scoreData } = await supabase
                .from('level_scores')
                .select('level, cluster')
                .eq('game_id', gameIdForDb)
                .gte('level', startLevel)
                .lte('level', endLevel);
            if (scoreData) {
                scoreData.forEach((s: any) => {
                    if (s.cluster) clusterMap[s.level] = s.cluster;
                });
            }
        }

        // Helper
        const getCol = (row: any, ...names: string[]) => {
            for (const name of names) {
                const key = Object.keys(row).find(k =>
                    k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, ''))
                );
                if (key && row[key] !== undefined && row[key] !== '') return row[key];
            }
            return null;
        };

        // Format table
        const header = "    Lvl   Churn   Rep   Playon  Moves  Time    1stWin  Rem   Clu";
        const tableRows = filteredRows.map((row: any) => {
            const lvlNum = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            const isCenter = lvlNum === centerLevel;
            const prefix = isCenter ? '>>> ' : '    ';
            const lvl = String(row[levelCol] || '-').padEnd(6);

            const churnVal = getCol(row, '3daychurn', '3dayschurn', 'churn');
            const churn = churnVal !== null ? (parseFloat(churnVal) < 1 ? (parseFloat(churnVal) * 100).toFixed(1) + '%' : parseFloat(churnVal).toFixed(1) + '%') : '-';

            const repVal = getCol(row, 'repeat', 'repeatratio', 'avgrepeat');
            const rep = repVal !== null ? parseFloat(repVal).toFixed(2) : '-';

            const playonVal = getCol(row, 'playon', 'playonperuser');
            const playon = playonVal !== null ? parseFloat(playonVal).toFixed(2) : '-';

            const movesVal = getCol(row, 'totalmove', 'avgtotalmoves', 'moves');
            const moves = movesVal !== null ? parseFloat(movesVal).toFixed(1) : '-';

            const timeVal = getCol(row, 'levelplaytime', 'playtime', 'avglevelplay');
            const time = timeVal !== null ? parseFloat(timeVal).toFixed(1) : '-';

            const winVal = getCol(row, 'firsttrywin', 'avgfirsttrywin', 'win');
            const win = winVal !== null ? (parseFloat(winVal) < 1 ? (parseFloat(winVal) * 100).toFixed(1) + '%' : parseFloat(winVal).toFixed(1) + '%') : '-';

            const remVal = getCol(row, 'remainingmove', 'rmtotal', 'avgrm', 'rem');
            const rem = remVal !== null ? parseFloat(remVal).toFixed(1) : '-';

            const dbCluster = clusterMap[lvlNum];
            const csvCluster = getCol(row, 'clu', 'finalcluster', 'cluster');
            const clu = dbCluster || (csvCluster !== null ? String(csvCluster) : '-');

            return `${prefix}${lvl}${churn.padStart(7)} ${rep.padStart(5)} ${playon.padStart(7)} ${moves.padStart(6)} ${time.padStart(7)} ${win.padStart(7)} ${rem.padStart(5)} ${clu.padStart(4)}`;
        });

        const extractedGameName = matchingFile.name.split(' - ')[0] || 'Unknown';
        const result = `**Level Context: ${levelNum} (${extractedGameName})**\n\`\`\`\n${header}\n${tableRows.join('\n')}\n\`\`\``;

        console.log(`[ProcessLevel] Sending follow-up`);
        await sendFollowUp(applicationId, interactionToken, result);
        console.log(`[ProcessLevel] Done`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[ProcessLevel] Error:', error);
        try {
            const { applicationId, interactionToken } = await request.clone().json();
            if (applicationId && interactionToken) {
                await sendFollowUp(applicationId, interactionToken, `Error: ${error.message}`);
            }
        } catch { }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
