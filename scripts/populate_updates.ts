import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 1. Load Local Env
function loadEnv() {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^['"]|['"]$/g, ""); // Remove quotes
                process.env[key] = value;
            }
        }
    }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase URL or Service Role Key in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- DATA FROM SCREENSHOT ---
const VERSIONS = [
    {
        title: "v0.3",
        done: false,
        todos: [
            { title: "Repeat Analyze da yanlış geliyor - zip", type: 'bug', done: true },
            { title: "Data Çekildimi onayını her yere koy - zip", type: 'new', done: true },
            { title: "Done Toggle", type: 'new', done: true },
            { title: "Authorization - zip", type: 'new', done: true },
            { title: "Todo sistemini paketle", type: 'new', done: true }
        ]
    },
    {
        title: "v0.4",
        done: false,
        todos: [
            { title: "Level AB lerdeDate ayrı çalışmıyor", type: 'bug', done: false },
            { title: "Responsive Mobile Friendly Design", type: 'new', done: true }
        ]
    },
    {
        title: "v0.5",
        done: false,
        todos: [
            { title: "Datayı direk google drive a yükle - zip", type: 'new', done: false },
            { title: "Level Assetlerini download et", type: 'new', done: false },
            { title: "Analyze başlıklarını genişlet. -zip", type: 'new', done: false },
            { title: "AI Analyze koy - zip", type: 'new', done: false }
        ]
    },
    {
        title: "v0.6",
        done: false,
        todos: []
    },
    // Done versions
    { title: "v0.2", done: true, todos: [] },
    { title: "v1.0", done: true, todos: [] }
];

const BACKLOG = [
    { title: "Level Scoreu olmayan oyunların clusterlanması", type: 'new' },
    { title: "Githubdan çek, github a pushla", type: 'new' },
    { title: "Level AB ye platform ve max revision ID ekle", type: 'new' }
];

async function main() {
    console.log("Start populating data...");

    // 1. Insert Versions & Todos
    for (let i = 0; i < VERSIONS.length; i++) {
        const v = VERSIONS[i];
        console.log(`Creating version: ${v.title}`);

        // Check if exists? defaulting to insert because ID generation is needed
        // Assuming clean state or allowing duplicates (user can delete)
        // To avoid duplicates, we check title.

        let versionId: string;

        const { data: existing } = await supabase.from('app_versions').select('id').eq('title', v.title).single();

        if (existing) {
            versionId = existing.id;
            console.log(`  Version ${v.title} already exists, skipping creation.`);
        } else {
            const { data: created, error } = await supabase
                .from('app_versions')
                .insert({
                    title: v.title,
                    is_done: v.done || false,
                    is_collapsed: v.done || false, // Collapse if done
                    position: i
                })
                .select()
                .single();

            if (error) {
                console.error(`  Error creating version ${v.title}:`, error);
                continue;
            }
            versionId = created.id;
        }

        if (v.todos && v.todos.length > 0) {
            for (let tIndex = 0; tIndex < v.todos.length; tIndex++) {
                const t = v.todos[tIndex];
                // Check duplicate
                const { count } = await supabase.from('app_todos')
                    .select('*', { count: 'exact', head: true })
                    .eq('version_id', versionId)
                    .eq('title', t.title);

                if (count && count > 0) continue;

                const { error: tError } = await supabase.from('app_todos').insert({
                    title: t.title,
                    type: t.type,
                    version_id: versionId,
                    is_done: t.done || false,
                    position: tIndex
                });

                if (tError) console.error(`  Error adding todo ${t.title}:`, tError);
            }
            console.log(`  Processed ${v.todos.length} todos.`);
        }
    }

    // 2. Insert Backlog
    console.log("Processing Backlog...");
    for (let i = 0; i < BACKLOG.length; i++) {
        const item = BACKLOG[i];
        // Check duplicate
        const { count } = await supabase.from('app_todos')
            .select('*', { count: 'exact', head: true })
            .is('version_id', null)
            .eq('title', item.title);

        if (count && count > 0) continue;

        const { error } = await supabase.from('app_todos').insert({
            title: item.title,
            type: item.type,
            version_id: null,
            position: i,
            is_done: false
        });
        if (error) console.error(`  Error adding backlog item ${item.title}:`, error);
    }

    console.log("Done!");
}

main();
