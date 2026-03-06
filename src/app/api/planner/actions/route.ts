import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: List all actions ordered
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('planner_actions')
            .select('*')
            .order('order', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new action
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, color, date_mode, order } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Action name is required' }, { status: 400 });
        }

        const validModes = ['none', 'optional', 'required'];
        if (date_mode && !validModes.includes(date_mode)) {
            return NextResponse.json({ error: 'date_mode must be one of: none, optional, required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('planner_actions')
            .insert({
                name: name.trim(),
                color: color || '#6b7280',
                date_mode: date_mode || 'none',
                order: order ?? 0
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update an action
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, name, color, date_mode, order } = body;

        if (!id) {
            return NextResponse.json({ error: 'Action id is required' }, { status: 400 });
        }

        const validModes = ['none', 'optional', 'required'];
        if (date_mode !== undefined && !validModes.includes(date_mode)) {
            return NextResponse.json({ error: 'date_mode must be one of: none, optional, required' }, { status: 400 });
        }

        const updates: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name.trim();
        if (color !== undefined) updates.color = color;
        if (date_mode !== undefined) updates.date_mode = date_mode;
        if (order !== undefined) updates.order = order;

        const { data, error } = await supabase
            .from('planner_actions')
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

// DELETE: Remove an action (cells/schedule with this action_id will have action_id set to NULL)
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Action id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('planner_actions')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
