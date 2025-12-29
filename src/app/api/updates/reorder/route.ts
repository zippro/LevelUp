import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: Batch update positions
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { items, type } = body; // items: { id, position }[], type: 'version' | 'todo'

        if (!items || !Array.isArray(items) || !type) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const table = type === 'version' ? 'app_versions' : 'app_todos';

        // Prepare updates
        const updates = items.map(item => ({
            id: item.id,
            position: item.position
        }));

        // Supabase doesn't have a direct "bulk update different values" easy syntax without RPC,
        // but we can loop or use upsert. Upsert is best.

        // We need to make sure we don't overwrite other fields. 
        // Upsert requires all non-nullable fields or it might fail if we don't provide them?
        // Actually, upsert works on primary key match. But if we only provide ID and position, 
        // will it erase title? YES, if we don't provide other fields.
        // So we can't use simple upsert unless we fetch first or use a comprehensive update.

        // Loop is safest for now without writing custom SQL RPC. 
        // Parallelizing promises is fine for small lists (<100 items).

        await Promise.all(updates.map((item: any) =>
            supabase.from(table).update({ position: item.position }).eq('id', item.id)
        ));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
