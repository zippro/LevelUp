import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: List all planner cells
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('planner_cells')
            .select('*');

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Upsert a cell (game_id + column_id)
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { game_id, column_id, action_id, date } = body;

        if (!game_id || !column_id) {
            return NextResponse.json({ error: 'game_id and column_id are required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('planner_cells')
            .upsert(
                {
                    game_id,
                    column_id,
                    action_id: action_id || null,
                    date: date || null,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'game_id,column_id' }
            )
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
