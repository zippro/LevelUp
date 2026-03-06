import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST: Batch reorder items (columns, actions, or game order)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { items, type } = body;
        // items: { id: string, order: number }[]
        // type: 'column' | 'action' | 'game_order'

        if (!items || !Array.isArray(items) || !type) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const tableMap: Record<string, string> = {
            column: 'planner_columns',
            action: 'planner_actions',
            game_order: 'planner_game_order'
        };

        const table = tableMap[type];
        if (!table) {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        // Parallel individual updates (same pattern as update-list reorder)
        await Promise.all(
            items.map((item: any) =>
                supabase.from(table).update({ order: item.order }).eq('id', item.id)
            )
        );

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
