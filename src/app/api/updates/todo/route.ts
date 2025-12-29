import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: Create a new todo
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, type, versionId, position } = body;

        if (!title || !type) {
            return NextResponse.json({ error: 'Title and type are required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('app_todos')
            .insert({
                title,
                type,
                version_id: versionId || null, // null means backlog
                position: position || 0,
                is_done: false
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            ...data,
            done: data.is_done
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Update a todo (title, done, position, version_id via move)
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, title, done, position, versionId } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const updates: any = {};
        if (title !== undefined) updates.title = title;
        if (done !== undefined) updates.is_done = done;
        if (position !== undefined) updates.position = position;
        // Allow explicitly setting versionId (including to null)
        if (versionId !== undefined) updates.version_id = versionId;

        const { data, error } = await supabase
            .from('app_todos')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            ...data,
            done: data.is_done
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Delete a todo
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('app_todos')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
