import { NextResponse } from 'next/server';
import { authenticateTableau, fetchTableauData } from '@/lib/tableau';
import papa from 'papaparse';

// Helper to pivot "Tall" data (Measure Names/Values) to "Wide" (Crosstab)
function pivotTableauData(csvText: string): string {
    const parseResult = papa.parse(csvText, { header: true, skipEmptyLines: true });

    if (parseResult.errors.length > 0) {
        console.error("CSV Parse Errors:", parseResult.errors);
        return csvText; // Return original if parsing fails
    }

    const data = parseResult.data as Record<string, any>[];
    const meta = parseResult.meta;

    // Check if pivoting is needed
    if (!meta.fields?.includes("Measure Names") || !meta.fields?.includes("Measure Values")) {
        return csvText;
    }

    console.log("Pivoting Tableau Data...");

    // Identify Dimensions (all columns except Measure Names/Values)
    const dimensions = meta.fields.filter(f => f !== "Measure Names" && f !== "Measure Values");

    // Group by Dimensions
    const groupedData: Record<string, any> = {};

    data.forEach(row => {
        // Create a unique key for the row based on dimensions
        const key = dimensions.map(d => row[d]).join("|||");

        if (!groupedData[key]) {
            // Initialize row with dimension values
            const newRow: Record<string, any> = {};
            dimensions.forEach(d => newRow[d] = row[d]);
            groupedData[key] = newRow;
        }

        // Add the measure value
        const measureName = row["Measure Names"];
        const measureValue = row["Measure Values"];
        if (measureName) {
            groupedData[key][measureName] = measureValue;
        }
    });

    // Convert back to array
    const pivotedData = Object.values(groupedData);

    // Unparse back to CSV
    return papa.unparse(pivotedData);
}

export async function POST(request: Request) {
    try {
        const { viewId, tableName } = await request.json();

        if (!viewId || !tableName) {
            return NextResponse.json({ error: 'Missing viewId or tableName' }, { status: 400 });
        }

        // 1. Authenticate with Tableau
        const { token, siteId } = await authenticateTableau();

        // 2. Fetch data (CSV)
        const response = await fetchTableauData(viewId, token, siteId);

        if (!response.ok) {
            throw new Error(`Failed to fetch data from Tableau: ${response.statusText}`);
        }

        const csvText = await response.text();

        // 3. Process Data (Pivot if necessary)
        const finalCsv = pivotTableauData(csvText);

        return NextResponse.json({ message: 'Data fetched successfully', data: finalCsv });

    } catch (error: any) {
        console.error('Sync Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
