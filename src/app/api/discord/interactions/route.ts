import { NextResponse } from 'next/server';
import { verifyDiscordRequest } from '@/lib/discord';
import { createClient } from '@supabase/supabase-js';

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

export async function POST(request: Request) {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    if (!publicKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { isValid, body } = await verifyDiscordRequest(request, publicKey);

    if (!isValid) {
        return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
    }

    if (body.type === InteractionType.PING) {
        return NextResponse.json({ type: InteractionResponseType.PONG });
    }

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
                            data: { content: `❌ Game '${gameName}' not found.\n\n**Available games:**\n${gameTable}` },
                        });
                    }
                }

                if (!matchedGame) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: 'Please specify a game. Use `/games` to see options.' },
                    });
                }

                // Query level_scores database directly (instant, no timeout!)
                const { data: levelData, error: queryError } = await supabase
                    .from('level_scores')
                    .select('level, cluster, churn_rate, replay_rate, play_on_rate, avg_moves, avg_time, win_rate_1st, avg_remaining_moves')
                    .eq('game_id', matchedGame.id)
                    .gte('level', startLevel)
                    .lte('level', endLevel)
                    .order('level', { ascending: true });

                if (queryError) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `Database error: ${queryError.message}` },
                    });
                }

                if (!levelData || levelData.length === 0) {
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `No data for level ${levelNum} in '${matchedGame.name}'.\n\n⚠️ **Data must be loaded first:**\n1. Go to Weekly Check page\n2. Select '${matchedGame.name}'\n3. Click 'Load Data'\n\nThis will sync data to the database.` },
                    });
                }

                // Format Table
                const header = "    Lvl   Churn   Rep   Playon  Moves  Time    1stWin  Rem   Clu";
                const tableRows = levelData.map((row: any) => {
                    const lvlNum = row.level;
                    const isCenter = lvlNum === centerLevel;
                    const prefix = isCenter ? '>>> ' : '    ';
                    const lvl = String(lvlNum).padEnd(6);

                    const churn = row.churn_rate !== null ? (row.churn_rate * 100).toFixed(1) + '%' : '-';
                    const rep = row.replay_rate !== null ? row.replay_rate.toFixed(2) : '-';
                    const playon = row.play_on_rate !== null ? row.play_on_rate.toFixed(2) : '-';
                    const moves = row.avg_moves !== null ? row.avg_moves.toFixed(1) : '-';
                    const time = row.avg_time !== null ? row.avg_time.toFixed(1) : '-';
                    const win = row.win_rate_1st !== null ? (row.win_rate_1st * 100).toFixed(1) + '%' : '-';
                    const rem = row.avg_remaining_moves !== null ? row.avg_remaining_moves.toFixed(1) : '-';
                    const clu = row.cluster || '-';

                    return `${prefix}${lvl}${churn.padStart(7)} ${rep.padStart(5)} ${playon.padStart(7)} ${moves.padStart(6)} ${time.padStart(7)} ${win.padStart(7)} ${rem.padStart(5)} ${clu.padStart(4)}`;
                });

                const table = `**Level Context: ${levelNum} (${matchedGame.name})**\n\`\`\`\n${header}\n${tableRows.join('\n')}\n\`\`\``;

                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: table },
                });

            } catch (error: any) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `Error: ${error.message}` },
                });
            }
        }

        if (name === 'games') {
            const { getSystemConfig } = await import('@/lib/config');
            const config = await getSystemConfig();

            if (!config.games || config.games.length === 0) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: 'No games configured.' },
                });
            }

            const gameTable = config.games.map((g: any) => {
                const aliases = g.aliases?.length > 0 ? g.aliases.join(', ') : g.id;
                return `• **${g.name}** → \`${aliases}\``;
            }).join('\n');

            return NextResponse.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `**🎮 Available Games:**\n\n${gameTable}\n\n**Usage:** \`/level no:123 game:<alias>\`` },
            });
        }

        return NextResponse.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: 'Unknown command' },
        });
    }

    return NextResponse.json({ error: 'Unknown Interaction Type' }, { status: 400 });
}
