// Table Report Generators - transforms raw data into report views
// Used by Tables page to display different report sheets

import { ReportSettings, DEFAULT_REPORT_SETTINGS } from './report-settings';

interface LevelRow {
    [key: string]: any;
}

// Helper to safely parse numeric values
function toNum(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const cleaned = val.replace(/[%,]/g, '').trim();
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    return 0;
}

// Helper to find metric value with pattern matching
function findMetricValue(row: LevelRow, metricName: string): number {
    if (row[metricName] !== undefined) return toNum(row[metricName]);

    const keys = Object.keys(row);
    const lowerMetric = metricName.toLowerCase();

    // Case-insensitive exact match
    for (const key of keys) {
        if (key.toLowerCase() === lowerMetric) return toNum(row[key]);
    }

    // Comprehensive partial matching - synced with excel-report.ts
    const metricPatterns: Record<string, string[]> = {
        'level score': ['level score along', 'level score', 'levelscore', 'level_score'],
        'score': ['score'],
        // Churn columns - various naming conventions per game
        'instant churn': ['instant churn', 'instantchurn', 'instant_churn', '0 day churn', '0day churn', 'churn instant'],
        '3 days churn': ['3 days churn', '3 day churn', '3daychurn', '3dayschurn', '3_days_churn', 'd3 churn', 'churn 3 days', 'churn 3 day'],
        '7 days churn': ['7 days churn', '7 day churn', '7daychurn', '7dayschurn', '7_days_churn', 'd7 churn', 'churn 7 days', 'churn 7 day', 'week churn', '1 week churn'],
        // Repeat - different views/games use different names
        'avg. repeat ratio': [
            'avg. repeat ratio (birleşik)', 'avg. repeat ratio', 'avg. repeat rate',
            'repeat rate', 'repeat ratio', 'avg repeat ratio', 'avg repeat rate',
            'repeatratio', 'repeat_ratio', 'repeat_rate', 'repeatrate'
        ],
        // TotalUser
        'totaluser': ['totaluser', 'total user', 'total_user', 'user count', 'users'],
        // FirstTryWin
        'avg. firsttrywin': ['avg. firsttrywinpercent', 'avg. firsttrywin', 'firsttrywin', 'first try win', 'firsttrywins'],
    };

    const patterns = metricPatterns[lowerMetric] || [lowerMetric];
    for (const key of keys) {
        const lowerKey = key.toLowerCase();
        for (const pattern of patterns) {
            if (lowerKey.includes(pattern)) {
                return toNum(row[key]);
            }
        }
    }

    return 0;
}

// Generate Level Score Top Unsuccessful - sorted by Level Score ASC (lowest first)
export function generateLevelScoreTopUnsuccessful(
    data: LevelRow[],
    settings?: ReportSettings
): LevelRow[] {
    const sortOrder = settings?.threeDayChurn?.sheets?.levelScoreUnsuccess?.sortOrder || 'asc';

    return [...data]
        // .filter(r => {
        //     const levelScore = findMetricValue(r, 'Level Score');
        //     return levelScore > 0;
        // })
        .sort((a, b) => {
            // Sort by Score column (not Level Score)
            const aScore = findMetricValue(a, 'Score');
            const bScore = findMetricValue(b, 'Score');
            return sortOrder === 'asc' ? aScore - bScore : bScore - aScore;
        });
}

// Generate Level Score Top Successful - sorted by Score DESC (highest first)
export function generateLevelScoreTopSuccessful(
    data: LevelRow[],
    settings?: ReportSettings
): LevelRow[] {
    const sortOrder = settings?.threeDayChurn?.sheets?.levelScoreSuccess?.sortOrder || 'desc';

    return [...data]
        // .filter(r => {
        //     const levelScore = findMetricValue(r, 'Level Score');
        //     return levelScore > 0;
        // })
        .sort((a, b) => {
            // Sort by Score column (not Level Score)
            const aScore = findMetricValue(a, 'Score');
            const bScore = findMetricValue(b, 'Score');
            return sortOrder === 'desc' ? bScore - aScore : aScore - bScore;
        });
}

// Generate 3 Day Churn Top Unsuccessful - sorted by 3 Days Churn ASC (lowest retention first)
export function generate3DayChurnTopUnsuccessful(
    data: LevelRow[],
    settings?: ReportSettings
): LevelRow[] {
    const sortOrder = settings?.threeDayChurn?.sheets?.churnUnsuccess?.sortOrder || 'asc';

    return [...data]
        .filter(r => {
            const churn = findMetricValue(r, '3 Days Churn');
            return churn > 0;
        })
        .sort((a, b) => {
            const aChurn = findMetricValue(a, '3 Days Churn');
            const bChurn = findMetricValue(b, '3 Days Churn');
            return sortOrder === 'asc' ? aChurn - bChurn : bChurn - aChurn;
        });
}

// Generate 3 Day Churn Top Successful - sorted by 3 Days Churn DESC (highest churn first = worst retention)
export function generate3DayChurnTopSuccessful(
    data: LevelRow[],
    settings?: ReportSettings
): LevelRow[] {
    const sortOrder = settings?.threeDayChurn?.sheets?.churnSuccess?.sortOrder || 'desc';

    return [...data]
        .filter(r => {
            const churn = findMetricValue(r, '3 Days Churn');
            return churn > 0;
        })
        .sort((a, b) => {
            const aChurn = findMetricValue(a, '3 Days Churn');
            const bChurn = findMetricValue(b, '3 Days Churn');
            return sortOrder === 'desc' ? bChurn - aChurn : aChurn - bChurn;
        });
}

// Get the appropriate report generator function name -> function mapping
export const TABLE_REPORT_GENERATORS: Record<string, (data: LevelRow[], settings?: ReportSettings) => LevelRow[]> = {
    'Level Score Top Unsuccessful': generateLevelScoreTopUnsuccessful,
    'Level Score Top Successful': generateLevelScoreTopSuccessful,
    '3 Day Churn Top Unsuccessful': generate3DayChurnTopUnsuccessful,
    '3 Day Churn Top Successful': generate3DayChurnTopSuccessful,
};

// Define which reports are available for each variable
export const VARIABLE_TABLE_REPORTS: Record<string, string[]> = {
    'Level Revize': [
        'Level Score Top Unsuccessful',
        'Level Score Top Successful',
        '3 Day Churn Top Unsuccessful',
    ],
    'Level Score AB': [
        'Level Score Top Unsuccessful',
        'Level Score Top Successful',
        '3 Day Churn Top Unsuccessful',
    ],
    'Bölgesel Rapor': [
        'Level Score Top Unsuccessful',
        'Level Score Top Successful',
        '3 Day Churn Top Unsuccessful',
    ],
};

// Columns that should be formatted as percentages
export const PERCENTAGE_COLUMNS = [
    'Churn',       // Matches any column with "Churn" in it (Instant Churn, 3 Days Churn, 7 Days Churn)
    'Instant Churn',
    '3 Days Churn',
    '7 Days Churn',
    'FirstTryWin', // Matches FirstTryWinPercent, Avg. FirstTryWin, etc.
    'Avg. FirstTryWinPercent',
    'Avg. FirstTryWin',
    'PlayOnWinRatio',
];

// Columns that contain date values - should not be parsed as numbers
export const DATE_COLUMNS = [
    'Time Event',
    'Min. Time Event',
    'Min Time Event',
    'Date',
    'Event Date',
    'Created',
    'Updated',
];

// Check if a string looks like a date (contains / or - as date separators)
function isDateLikeString(value: string): boolean {
    // Matches patterns like: 24/03/2025, 2025-03-24, 03/24/2025, etc.
    return /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(value.trim());
}

// Format value for table display (converts decimals to percentages)
export function formatTableValue(value: any, columnName: string): string {
    if (value === null || value === undefined || value === '') return '';

    const lowerCol = columnName.toLowerCase();

    // Check if this is a date column - preserve date values as-is
    const isDateColumn = DATE_COLUMNS.some(d => lowerCol.includes(d.toLowerCase()));
    if (isDateColumn && typeof value === 'string') {
        return value; // Return date string as-is
    }

    // Check if value looks like a date string - preserve it
    if (typeof value === 'string' && isDateLikeString(value)) {
        return value; // Return date string as-is
    }

    const isPercentage = PERCENTAGE_COLUMNS.some(p => lowerCol.includes(p.toLowerCase()));

    // Parse numeric value (handle both number and string types)
    let numValue: number | null = null;
    if (typeof value === 'number') {
        numValue = value;
    } else if (typeof value === 'string') {
        const cleaned = value.replace(/[%,]/g, '').trim();
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) {
            numValue = parsed;
        }
    }

    if (isPercentage && numValue !== null) {
        // If value is already > 1, it's probably already a percentage
        if (numValue <= 1) {
            return `${(numValue * 100).toFixed(2)}%`;
        }
        return `${numValue.toFixed(2)}%`;
    }

    if (numValue !== null) {
        // Format other numbers with 2 decimal places if they have decimals
        return Number.isInteger(numValue) ? String(numValue) : numValue.toFixed(2);
    }

    return String(value);
}
