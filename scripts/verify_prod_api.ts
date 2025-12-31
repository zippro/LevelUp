
async function checkProdApi() {
    console.log("Fetching from PROD API...");
    try {
        const res = await fetch('https://levelupnarcade.vercel.app/api/updates');
        if (!res.ok) {
            console.error("API Error:", res.status, res.statusText);
            const text = await res.text();
            console.error("Body:", text);
            return;
        }

        const data = await res.json();
        const { versions, backlog } = data;

        console.log("--- PROD DATA ---");
        const doneVersions = versions.filter((v: any) => v.done);
        console.log(`Verified Versions: ${versions.length} total, ${doneVersions.length} done.`);
        if (doneVersions.length > 0) {
            console.log("Done Version Titles:", doneVersions.map((v: any) => v.title));
        }

        // Check Todos inside versions
        let doneTodosCount = 0;
        versions.forEach((v: any) => {
            v.todos.forEach((t: any) => {
                if (t.done) {
                    doneTodosCount++;
                    console.log(`Done Todo (in ${v.title}): ${t.title}`);
                }
            });
        });

        // Check Backlog
        const doneBacklog = backlog.filter((b: any) => b.done);
        console.log(`Backlog: ${backlog.length} total, ${doneBacklog.length} done.`);
        if (doneBacklog.length > 0) {
            console.log("Done Backlog Titles:", doneBacklog.map((b: any) => b.title));
        }

    } catch (err: any) {
        console.error("Fetch Failed:", err.message);
    }
}

checkProdApi();
