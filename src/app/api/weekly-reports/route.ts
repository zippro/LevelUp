import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    const reportId = searchParams.get('id');

    if (reportId) {
        // Get single report by ID
        const { data, error } = await supabase
            .from('weekly_reports')
            .select('*')
            .eq('id', reportId)
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(data);
    }

    // List all reports, optionally filtered by gameId
    let query = supabase
        .from('weekly_reports')
        .select('id, game_id, game_name, report_date, created_at')
        .order('report_date', { ascending: false })
        .limit(50);

    if (gameId) {
        query = query.eq('game_id', gameId);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
}

export async function POST(request: Request) {
    const body = await request.json();
    const { gameId, gameName, reportData } = body;

    if (!gameId || !gameName || !reportData) {
        return NextResponse.json({ error: 'gameId, gameName, and reportData required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('weekly_reports')
        .insert({
            game_id: gameId,
            game_name: gameName,
            report_data: reportData,
            report_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('weekly_reports')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
