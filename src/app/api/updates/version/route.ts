import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: Create a new version
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, position } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('app_versions')
            .insert({
                title,
                position: position || 0,
                is_done: false,
                is_collapsed: false
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            ...data,
            done: data.is_done,
            collapsed: data.is_collapsed,
            todos: []
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a version (title, done, collapsed, position)
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, title, done, collapsed, position } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const updates: any = {};
        if (title !== undefined) updates.title = title;
        if (done !== undefined) updates.is_done = done;
        if (collapsed !== undefined) updates.is_collapsed = collapsed;
        if (position !== undefined) updates.position = position;

        const { data, error } = await supabase
            .from('app_versions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            ...data,
            done: data.is_done,
            collapsed: data.is_collapsed
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Delete a version
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('app_versions')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
