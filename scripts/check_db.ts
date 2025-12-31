import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnv() {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
            }
        }
    }
}
loadEnv();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    console.log("Checking database tables...");

    const { error } = await supabase.from('app_versions').select('id').limit(1);

    if (error) {
        console.error("Check Failed:", error.message); // Should say "relation ... does not exist"
        process.exit(1);
    } else {
        console.log("Success: Table app_versions exists.");
    }
}

check();
