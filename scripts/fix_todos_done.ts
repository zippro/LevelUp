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

const TITLES_TO_MARK_DONE = [
    "Repeat Analyze da yanlış geliyor - zip",
    "Data Çekildimi onayını her yere koy - zip",
    "Done Toggle",
    "Authorization - zip",
    "Todo sistemini paketle",
    "Responsive Mobile Friendly Design"
];

async function fix() {
    console.log("Marking todos as done...");

    for (const title of TITLES_TO_MARK_DONE) {
        const { error } = await supabase
            .from('app_todos')
            .update({ is_done: true })
            .eq('title', title);

        if (error) console.error(`Failed to update ${title}:`, error.message);
        else console.log(`Marked done: ${title}`);
    }

    console.log("Done.");
}

fix();
