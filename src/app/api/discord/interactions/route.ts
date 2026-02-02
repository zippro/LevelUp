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

            // Resolve Game Name
            let matchedGameId = null;
            if (gameName) {
                // Import config helper
                const { getSystemConfig } = await import('@/lib/config');
                const config = await getSystemConfig();

                // Find game by ID or Name (case-insensitive)
                const game = config.games?.find((g: any) =>
                    g.id.toLowerCase() === gameName.toLowerCase() ||
                    g.name.toLowerCase() === gameName.toLowerCase()
                );

                if (game) {
                    matchedGameId = game.id;
                } else {
                    // If provided but not found, list available
                    const available = config.games?.map((g: any) => g.name).join(', ') || 'None';
                    return NextResponse.json({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: { content: `Game '${gameName}' not found. Available games: ${available}` },
                    });
                }
            }

            // Query level_scores
            // Assuming 'game_id' is constant or handled? The prompt implies specific game context is implicit or we query all?
            // Screenshot shows "Level Context: 2331".
            // We'll query across all games or filter if game_id is known. 
            // For now, let's just query by level range. If multiple games exist, this might return mix data.
            // But based on context, there's likely a main game. We'll order by level.

            let query = supabase
                .from('level_scores')
                .select('*')
                .gte('level', startLevel)
                .lte('level', endLevel)
                .order('level', { ascending: true });

            if (matchedGameId) {
                query = query.eq('game_id', matchedGameId);
            }

            const { data: scores, error } = await query;

            if (error) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `Error fetching data: ${error.message}` },
                });
            }

            if (!scores || scores.length === 0) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `No data found for level ${levelNum} (+/- 5)${gameName ? ` in game '${gameName}'` : ''}.` },
                });
            }

            // Format Table
            // Header: Lvl Churn Rep Playon Moves Time 1stWin Rem Clu
            const header = "Lvl   Churn   Rep   Playon  Moves  Time    1stWin  Rem   Clu";
            const rows = scores.map((s: any) => {
                const lvl = s.level.toString().padEnd(6);
                const churn = (s.churn_rate != null ? (s.churn_rate * 100).toFixed(2) + '%' : '-').padStart(7);
                const rep = (s.replay_rate != null ? s.replay_rate.toFixed(2) : '-').padStart(6);
                const playon = (s.play_on_rate != null ? s.play_on_rate.toFixed(2) : '-').padStart(7);
                const moves = (s.avg_moves != null ? s.avg_moves.toFixed(2) : '-').padStart(7);
                const time = (s.avg_time != null ? s.avg_time.toFixed(2) : '-').padStart(8);
                const win = (s.win_rate_1st != null ? (s.win_rate_1st * 100).toFixed(2) + '%' : '-').padStart(8);
                const rem = (s.avg_remaining_moves != null ? s.avg_remaining_moves.toFixed(2) : '-').padStart(6);
                const clu = (s.cluster || '-').padStart(4);

                // Highlight the requested level?
                const prefix = s.level === centerLevel ? '> ' : '  ';

                return `${lvl}${churn} ${rep} ${playon} ${moves} ${time} ${win} ${rem} ${clu}`;
            });

            const table = `**Level Context: ${levelNum} ${gameName ? `(${gameName})` : ''}**\n\`\`\`\n${header}\n${rows.join('\n')}\n\`\`\``;

            return NextResponse.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: table },
            });
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

            const gameList = config.games.map((g: any, i: number) =>
                `${i + 1}. **${g.name}** (ID: \`${g.id}\`)`
            ).join('\n');

            return NextResponse.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `**Available Games:**\n${gameList}\n\nUse: \`/level no:123 game:<id>\`` },
            });
        }

        return NextResponse.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: 'Unknown command' },
        });
    }

    return NextResponse.json({ error: 'Unknown Interaction Type' }, { status: 400 });
}
