import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: List all schedule entries
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('planner_schedule')
            .select('*');

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Upsert a schedule entry (game_id + week_start)
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { game_id, week_start, action_id, date } = body;

        if (!game_id || !week_start) {
            return NextResponse.json({ error: 'game_id and week_start are required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('planner_schedule')
            .upsert(
                {
                    game_id,
                    week_start,
                    action_id: action_id || null,
                    date: date || null,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'game_id,week_start' }
            )
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
