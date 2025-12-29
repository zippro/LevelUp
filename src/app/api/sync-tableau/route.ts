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

// Helper to filter CSV data by date range
function filterByDateRange(csvText: string, startDate?: string, endDate?: string): string {
    if (!startDate && !endDate) {
        return csvText; // No filtering needed
    }

    const parseResult = papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (parseResult.errors.length > 0) {
        console.error("CSV Parse Errors during date filter:", parseResult.errors);
        return csvText;
    }

    const data = parseResult.data as Record<string, any>[];
    const headers = parseResult.meta.fields || [];

    // Find date column - try common names including Tableau's 'First Open', 'Time Event'
    const dateColumnNames = ['Date', 'Tarih', 'date', 'tarih', 'EventDate', 'Created Date', 'event_date',
        'First Open', 'Time Event', 'FirstOpen', 'TimeEvent', 'Event Time'];
    let dateColumn: string | null = null;

    // First try exact matches
    for (const name of dateColumnNames) {
        if (headers.includes(name)) {
            dateColumn = name;
            break;
        }
    }

    // If no exact match, try fuzzy matching
    if (!dateColumn) {
        dateColumn = headers.find(h =>
            h.toLowerCase().includes('date') ||
            h.toLowerCase().includes('time') ||
            h.toLowerCase().includes('open')
        ) || null;
    }

    if (!dateColumn) {
        console.log('[DateFilter] No date column found in:', headers.join(', '));
        return csvText; // No date column found
    }

    console.log(`[DateFilter] Using column: ${dateColumn}, Range: ${startDate} to ${endDate}`);

    // Parse filter dates
    const startTime = startDate ? new Date(startDate).getTime() : null;
    const endTime = endDate ? new Date(endDate).getTime() : null;

    // Filter data
    const filtered = data.filter(row => {
        const dateValue = row[dateColumn!];
        if (!dateValue) return true; // Keep rows without date

        const rowTime = new Date(dateValue).getTime();
        if (isNaN(rowTime)) return true; // Keep rows with unparseable dates

        if (startTime && rowTime < startTime) return false;
        if (endTime && rowTime > endTime) return false;
        return true;
    });

    console.log(`[DateFilter] Filtered from ${data.length} to ${filtered.length} rows`);

    return papa.unparse(filtered);
}

export async function POST(request: Request) {
    try {
        const { viewId, tableName, startDate, endDate } = await request.json();

        if (!viewId || !tableName) {
            return NextResponse.json({ error: 'Missing viewId or tableName' }, { status: 400 });
        }

        // 1. Authenticate with Tableau
        const { token, siteId } = await authenticateTableau();

        // 2. Fetch data (CSV) - with date filters at API level
        const response = await fetchTableauData(viewId, token, siteId, { startDate, endDate });

        if (!response.ok) {
            throw new Error(`Failed to fetch data from Tableau: ${response.statusText}`);
        }

        const csvText = await response.text();

        // 3. Process Data (Pivot if necessary)
        let finalCsv = pivotTableauData(csvText);

        // 4. Apply date filtering (client-side)
        finalCsv = filterByDateRange(finalCsv, startDate, endDate);

        return NextResponse.json({ message: 'Data fetched successfully', data: finalCsv });

    } catch (error: any) {
        console.error('Sync Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
