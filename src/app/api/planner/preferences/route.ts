import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('planner_preferences')
            .select('*')
            .eq('id', 'default')
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { hidden_game_ids, hidden_column_ids } = body;

        const { data, error } = await supabase
            .from('planner_preferences')
            .upsert({
                id: 'default',
                hidden_game_ids: hidden_game_ids || [],
                hidden_column_ids: hidden_column_ids || [],
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
