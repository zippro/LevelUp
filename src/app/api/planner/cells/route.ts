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

// POST: Create a new cell (supports multiple tasks per game+column)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { game_id, column_id, action_id, date } = body;

        if (!game_id || !column_id) {
            return NextResponse.json({ error: 'game_id and column_id are required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('planner_cells')
            .insert({
                game_id,
                column_id,
                action_id: action_id || null,
                date: date || null,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a specific cell by ID
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, action_id, date } = body;

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('planner_cells')
            .update({
                action_id: action_id || null,
                date: date || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Remove a specific cell by ID
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('planner_cells')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
