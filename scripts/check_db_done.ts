
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kkwlkobqkcozgfwcxtrw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrd2xrb2Jxa2Nvemdmd2N4dHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4OTIwNDMsImV4cCI6MjA4MTQ2ODA0M30.m8RSY8CFHBgvKViWtIZGh2aJhiXp-w7ovPMZhUmbwXk';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function checkDone() {
    console.log("Checking for DONE items...");

    // Check Versions
    const { data: versions, error: vError } = await supabase
        .from('app_versions')
        .select('id, title, is_done');

    if (vError) console.error("Version Error:", vError);
    else {
        const doneVersions = versions.filter(v => v.is_done);
        console.log(`Versions: ${versions.length} total, ${doneVersions.length} done.`);
        if (doneVersions.length > 0) console.log("Done Versions:", doneVersions.map(v => v.title));
    }

    // Check Todos
    const { data: todos, error: tError } = await supabase
        .from('app_todos')
        .select('id, title, is_done');

    if (tError) console.error("Todo Error:", tError);
    else {
        const doneTodos = todos.filter(t => t.is_done);
        console.log(`Todos: ${todos.length} total, ${doneTodos.length} done.`);
        if (doneTodos.length > 0) console.log("Done Todos:", doneTodos.map(t => t.title));
    }
}

checkDone();
