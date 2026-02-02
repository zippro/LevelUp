import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');

    if (!gameId) {
        return NextResponse.json({ error: 'gameId is required' }, { status: 400 });
    }

    // Supabase has a max of 1000 rows per query, so we need to paginate
    const allData: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('level_scores')
            .select('*')
            .eq('game_id', gameId)
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order('level', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data && data.length > 0) {
            allData.push(...data);
            page++;
        }

        // If we got less than pageSize, we've reached the end
        hasMore = data && data.length === pageSize;
    }

    return NextResponse.json(allData);
}

export async function POST(request: Request) {
    const body = await request.json();
    const { gameId, levels } = body;

    if (!gameId || !levels || !Array.isArray(levels)) {
        return NextResponse.json({ error: 'gameId and levels array required' }, { status: 400 });
    }

    // Upsert level scores (use explicit null check to handle 0 values)
    const upsertData = levels.map((item: any) => ({
        game_id: gameId,
        level: item.level,
        score: item.score !== undefined && item.score !== null ? item.score : null,
        cluster: item.cluster || null,
        churn_rate: item.churn_rate !== undefined && item.churn_rate !== null ? item.churn_rate : null,
        replay_rate: item.replay_rate !== undefined && item.replay_rate !== null ? item.replay_rate : null,
        play_on_rate: item.play_on_rate !== undefined && item.play_on_rate !== null ? item.play_on_rate : null,
        avg_moves: item.avg_moves !== undefined && item.avg_moves !== null ? item.avg_moves : null,
        avg_time: item.avg_time !== undefined && item.avg_time !== null ? item.avg_time : null,
        win_rate_1st: item.win_rate_1st !== undefined && item.win_rate_1st !== null ? item.win_rate_1st : null,
        avg_remaining_moves: item.avg_remaining_moves !== undefined && item.avg_remaining_moves !== null ? item.avg_remaining_moves : null,
        updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from('level_scores')
        .upsert(upsertData, { onConflict: 'game_id,level' })
        .select();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
}
