import { NextResponse } from 'next/server';
import { verifyDiscordRequest } from '@/lib/discord';
import { createClient } from '@supabase/supabase-js';
import papa from 'papaparse';

// Initialize Supabase Client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Interaction Types
const InteractionType = {
    PING: 1,
    APPLICATION_COMMAND: 2,
};

// Response Types
const InteractionResponseType = {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
};

// Helper to normalize column names for matching
const normalizeHeader = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

// Helper to get column value with aliases
const getCol = (row: any, ...names: string[]) => {
    for (const name of names) {
        // Try exact match first
        if (row[name] !== undefined && row[name] !== '') return row[name];
        // Try normalized match
        const key = Object.keys(row).find(k =>
            normalizeHeader(k).includes(normalizeHeader(name))
        );
        if (key && row[key] !== undefined && row[key] !== '') return row[key];
    }
    return null;
};

export async function POST(request: Request) {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    if (!publicKey) {
        console.error('Missing DISCORD_PUBLIC_KEY');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { isValid, body } = await verifyDiscordRequest(request, publicKey);

    if (!isValid) {
        return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
    }

    // Handle PING
    if (body.type === InteractionType.PING) {
        return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    // Handle Commands
    if (body.type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = body.data;

        if (name === 'level') {
            const levelNum = options?.find((o: any) => o.name === 'no')?.value;
            const gameName = options?.find((o: any) => o.name === 'game')?.value;

            if (!levelNum) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: 'Please provide a level number.' },
                });
            }

            const centerLevel = parseInt(levelNum);
            const startLevel = centerLevel - 5;
            const endLevel = centerLevel + 5;

            try {
                // Get config to find game name
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
                        return NextResponse.json({
                            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                            data: { content: `❌ Game '${gameName}' not found.\n\n**Available games & aliases:**\n${gameTable}\n\n**Usage:** \`/level no:123 game:<alias>\`` },
                        });
                    }
                }

                if (!matchedGame) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: 'Please specify a game. Use `/games` to see available options.' },
                    });
                }

                // Find the Level Revize CSV file for this game
                const { data: files, error: listError } = await supabase.storage
                    .from('data-repository')
                    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

                if (listError || !files) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `Error listing files: ${listError?.message || 'No files found'}` },
                    });
                }

                // Find matching file (game name + Level Revize)
                const matchingFile = files.find((f: any) =>
                    f.name.toLowerCase().includes(matchedGame.name.toLowerCase()) &&
                    f.name.toLowerCase().includes('level revize')
                );

                if (!matchingFile) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `No Level Revize data found for '${matchedGame.name}'. Please load data from Weekly Check first.` },
                    });
                }

                // Download the CSV file
                const { data: fileData, error: downloadError } = await supabase.storage
                    .from('data-repository')
                    .download(matchingFile.name);

                if (downloadError || !fileData) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `Error downloading data: ${downloadError?.message || 'Unknown error'}` },
                    });
                }

                const csvText = await fileData.text();
                const parsed = papa.parse(csvText, { header: true, skipEmptyLines: true });
                const rows = parsed.data as any[];

                // Find level column
                const sampleRow = rows[0] || {};
                const levelCol = Object.keys(sampleRow).find(k => {
                    const n = normalizeHeader(k);
                    return n === 'level' || n === 'levelnumber' || n === 'level_number';
                }) || 'Level';

                // Filter to level range
                const filteredRows = rows.filter(row => {
                    const lvl = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
                    return lvl >= startLevel && lvl <= endLevel;
                }).sort((a, b) => {
                    const lvlA = parseInt(String(a[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
                    const lvlB = parseInt(String(b[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
                    return lvlA - lvlB;
                });

                if (filteredRows.length === 0) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `No data found for level ${levelNum} (+/- 5) in '${matchedGame.name}'.` },
                    });
                }

                // Fetch clusters from level_scores table
                let clusterMap: Record<number, string> = {};
                const { data: scoreData } = await supabase
                    .from('level_scores')
                    .select('level, cluster')
                    .eq('game_id', matchedGame.id)
                    .gte('level', startLevel)
                    .lte('level', endLevel);

                if (scoreData) {
                    scoreData.forEach((s: any) => {
                        if (s.cluster) clusterMap[s.level] = s.cluster;
                    });
                }

                // Format Table
                const header = "    Lvl   Churn   Rep   Playon  Moves  Time    1stWin  Rem   Clu";
                const tableRows = filteredRows.map((row: any) => {
                    const lvlNum = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
                    const isCenter = lvlNum === centerLevel;
                    const prefix = isCenter ? '>>> ' : '    ';
                    const lvl = String(lvlNum).padEnd(6);

                    // 3 Day Churn
                    const churnVal = getCol(row, '3 Days Churn', '3 Day Churn', '3daychurn', 'churn');
                    const churn = churnVal !== null ? (parseFloat(churnVal) < 1 ? (parseFloat(churnVal) * 100).toFixed(1) + '%' : parseFloat(churnVal).toFixed(1) + '%') : '-';

                    // Repeat
                    const repVal = getCol(row, 'Avg. Repeat', 'Repeat', 'repeat', 'repeatratio');
                    const rep = repVal !== null ? parseFloat(repVal).toFixed(2) : '-';

                    // Playon
                    const playonVal = getCol(row, 'Playon per User', 'Playon', 'playon');
                    const playon = playonVal !== null ? parseFloat(playonVal).toFixed(2) : '-';

                    // Total Moves
                    const movesVal = getCol(row, 'Total Move', 'Avg. Total Moves', 'TotalMove', 'totalmove');
                    const moves = movesVal !== null ? parseFloat(movesVal).toFixed(1) : '-';

                    // Play Time
                    const timeVal = getCol(row, 'Avg. Level Play', 'Level Play Time', 'LevelPlayTime', 'playtime');
                    const time = timeVal !== null ? parseFloat(timeVal).toFixed(1) : '-';

                    // First Try Win
                    const winVal = getCol(row, 'Avg. First Try Win', 'First Try Win', 'firsttrywin');
                    const win = winVal !== null ? (parseFloat(winVal) < 1 ? (parseFloat(winVal) * 100).toFixed(1) + '%' : parseFloat(winVal).toFixed(1) + '%') : '-';

                    // Remaining Move
                    const remVal = getCol(row, 'RM Total', 'Avg. RM Fixed', 'Avg. RM', 'remaining', 'Rem');
                    const rem = remVal !== null ? parseFloat(remVal).toFixed(1) : '-';

                    // Cluster - first from DB, then from CSV
                    const dbCluster = clusterMap[lvlNum];
                    const csvCluster = getCol(row, 'Final Cluster', 'FinalCluster', 'Clu', 'cluster');
                    const clu = dbCluster || (csvCluster !== null ? String(csvCluster) : '-');

                    return `${prefix}${lvl}${churn.padStart(7)} ${rep.padStart(5)} ${playon.padStart(7)} ${moves.padStart(6)} ${time.padStart(7)} ${win.padStart(7)} ${rem.padStart(5)} ${clu.padStart(4)}`;
                });

                const table = `**Level Context: ${levelNum} (${matchedGame.name})**\n\`\`\`\n${header}\n${tableRows.join('\n')}\n\`\`\``;

                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: table },
                });

            } catch (error: any) {
                console.error('Level command error:', error);
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `Error: ${error.message}` },
                });
            }
        }

        // Handle /games command
        if (name === 'games') {
            const { getSystemConfig } = await import('@/lib/config');
            const config = await getSystemConfig();

            if (!config.games || config.games.length === 0) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: 'No games configured. Please add games in the Settings page.' },
                });
            }

            const gameTable = config.games.map((g: any) => {
                const aliases = g.aliases?.length > 0 ? g.aliases.join(', ') : g.id;
                return `• **${g.name}** → \`${aliases}\``;
            }).join('\n');

            return NextResponse.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `**🎮 Available Games & Aliases:**\n\n${gameTable}\n\n**Usage:** \`/level no:123 game:<alias>\`` },
            });
        }

        return NextResponse.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: 'Unknown command' },
        });
    }

    return NextResponse.json({ error: 'Unknown Interaction Type' }, { status: 400 });
}
