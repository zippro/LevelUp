import { NextResponse } from 'next/server';
import { authenticateTableau, findViewByContentUrl } from '@/lib/tableau';

export async function POST(request: Request) {
    try {
        const { url } = await request.json();
        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Logic to extract relevant path from URL
        // Example: https://10az.online.tableau.com/#/site/my-site/views/MyWorkbook/MySheet?:iid=1
        // We want: MyWorkbook/MySheet

        let pathPart = "";
        try {
            const u = new URL(url);
            // Pathname usually: /#/site/siteName/views/Workbook/Sheet...
            // But hash routing makes it tricky. new URL(url).hash might act up.
            // Let's parse strictly string based if it contains '/views/'
            const idx = url.indexOf('/views/');
            if (idx === -1) throw new Error("Invalid Tableau URL: Must contain '/views/'");

            let temp = url.substring(idx + 7); // After '/views/'
            // Remove query params
            temp = temp.split('?')[0];
            pathPart = temp;
            // Now 'Workbook/Sheet' (encoded?)
            pathPart = decodeURIComponent(pathPart);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        const auth = await authenticateTableau();
        const view = await findViewByContentUrl(pathPart, auth.token, auth.siteId);

        if (!view) {
            return NextResponse.json({ error: 'View not found. Check the Workbook and View names.' }, { status: 404 });
        }

        return NextResponse.json({ id: view.id, name: view.name });

    } catch (error: any) {
        console.error("Tableau Lookup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
