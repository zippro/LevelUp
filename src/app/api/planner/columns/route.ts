import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: List all columns ordered
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('planner_columns')
            .select('*')
            .order('order', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new column
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, order } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Column name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('planner_columns')
            .insert({ name: name.trim(), order: order ?? 0 })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a column
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, name, order } = body;

        if (!id) {
            return NextResponse.json({ error: 'Column id is required' }, { status: 400 });
        }

        const updates: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name.trim();
        if (order !== undefined) updates.order = order;

        const { data, error } = await supabase
            .from('planner_columns')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Remove a column
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Column id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('planner_columns')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
