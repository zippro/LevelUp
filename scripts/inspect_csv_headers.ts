import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import papa from "papaparse";

// Load env
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

async function inspect() {
    console.log("Listing files in data-repository...");
    const { data: files, error } = await supabase.storage.from('data-repository').list();

    if (error) {
        console.error("Error listing files:", error);
        return;
    }

    if (!files || files.length === 0) {
        console.log("No files found.");
        return;
    }

    // Pick the most recent one that looks like a report
    const file = files.find(f => f.name.includes("Bolgesel")) || files[0];
    console.log(`Inspecting file: ${file.name}`);

    const { data: blob } = await supabase.storage.from('data-repository').download(file.name);
    if (!blob) {
        console.error("Failed to download file.");
        return;
    }

    const text = await blob.text();
    const parsed = papa.parse(text, { header: true, preview: 1 }); // read only 1 row

    if (parsed.meta.fields) {
        console.log("--- HEADERS FOUND ---");
        console.log(parsed.meta.fields);
        console.log("---------------------");
    } else {
        console.log("No headers found or parse error.");
    }
}

inspect();
