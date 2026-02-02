import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
    try {
        const { data: files, error } = await supabase.storage
            .from('data-repository')
            .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Filter to just Level Revize files
        const levelRevizeFiles = files.filter((f: any) =>
            f.name.toLowerCase().includes('level revize')
        );

        return NextResponse.json({
            total: files.length,
            levelRevizeFiles: levelRevizeFiles.map((f: any) => ({
                name: f.name,
                created: f.created_at,
                size: f.metadata?.size
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
