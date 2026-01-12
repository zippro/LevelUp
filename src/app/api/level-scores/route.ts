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

    // Upsert level scores
    const upsertData = levels.map((item: { level: number; score: number; cluster?: string }) => ({
        game_id: gameId,
        level: item.level,
        score: item.score,
        cluster: item.cluster || null,
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
