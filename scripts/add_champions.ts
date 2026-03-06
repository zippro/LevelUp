import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching config from Supabase...");
    const { data: signedData, error: signError } = await supabaseAdmin.storage.from('data-repository').createSignedUrl('system/dashboard-config.json', 60);

    if (signError) {
        console.error("Failed to sign url", signError);
        return;
    }

    const response = await fetch(signedData!.signedUrl);
    const config = await response.json();

    if (!config.variables) config.variables = [];

    if (!config.variables.includes('Champions')) {
        config.variables.push('Champions');
        console.log("Adding 'Champions' to variables...");
    } else {
        console.log("'Champions' already in variables.");
    }

    const { error } = await supabaseAdmin.storage.from('data-repository').upload('system/dashboard-config.json', JSON.stringify(config, null, 2), { contentType: 'application/json', upsert: true });
    if (error) {
        console.error("Error saving:", error);
    } else {
        console.log("Successfully updated config!");
    }
}
main();
