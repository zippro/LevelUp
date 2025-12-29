import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Fetch versions 
        const { data: versions, error: versionsError } = await supabase
            .from('app_versions')
            .select('*')
            .order('position', { ascending: true });

        if (versionsError) throw versionsError;

        // Fetch all todos
        const { data: todos, error: todosError } = await supabase
            .from('app_todos')
            .select('*')
            .order('position', { ascending: true });

        if (todosError) throw todosError;

        // Structure the data
        // 1. Backlog (todos with no version_id)
        const backlog = todos.filter((t: any) => !t.version_id);

        // 2. Versions with their todos attached
        const versionsWithTodos = versions.map((v: any) => ({
            ...v,
            todos: todos
                .filter((t: any) => t.version_id === v.id)
                .map((t: any) => ({ ...t, done: t.is_done })),
            // Convert DB columns to frontend expected format if needed
            // is_done -> done, is_collapsed -> collapsed
            done: v.is_done,
            collapsed: v.is_collapsed
        }));

        // Map backlog to frontend format
        const formattedBacklog = backlog.map((t: any) => ({
            ...t,
            done: t.is_done
        }));

        return NextResponse.json({
            versions: versionsWithTodos,
            backlog: formattedBacklog
        });

    } catch (error: any) {
        console.error('Error fetching updates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch updates' },
            { status: 500 }
        );
    }
}
