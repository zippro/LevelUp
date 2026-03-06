import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: List all game order entries
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('planner_game_order')
            .select('*')
            .order('order', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Batch upsert game order
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { items } = body;
        // items: { game_id: string, order: number }[]

        if (!items || !Array.isArray(items)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        // Upsert each game order entry
        await Promise.all(
            items.map((item: any) =>
                supabase
                    .from('planner_game_order')
                    .upsert(
                        { game_id: item.game_id, order: item.order },
                        { onConflict: 'game_id' }
                    )
            )
        );

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
