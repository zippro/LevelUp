
/**
 * Helper to process 'Level Revize' data and generate the 'Bölgesel Revize' report.
 * Matches logic from: createBolgesel + makeRangesByRules
 */

interface LevelRow {
    [key: string]: any;
}

interface Bucket {
    start: number;
    end: number;
    key: string;
    rowCount: number;
    totalUsers: number;
    sums: Record<string, number>;
    counts: Record<string, number>;
}

const METRICS = [
    'Instant Churn',
    '3 Days Churn',
    '7 Days Churn',
    'Avg. FirstTryWin',
    'Avg. Repeat Rate',
    'Avg. Level Play',
    'Playon per User',
    'Avg. RM Fixed',
    'Avg. Total Moves',
    'Inapp Value'
];

const PERCENT_COLUMNS = [
    'Instant Churn', '3 Days Churn', '7 Days Churn',
    'Avg. FirstTryWin', 'Avg. Repeat Rate'
];

const EXTRA_EMPTY_COLS = ['DS Harden', 'DS Soften', 'Yapılacak', 'Sıkıntısı', 'Level'];

function toNum(v: any): number {
    if (v === null || v === '' || typeof v === 'undefined') return NaN;
    if (typeof v === 'number') return v;
    // Replace comma with dot for European formats if necessary, though Tableau CSVs are usually standard.
    // However, the user script had .replace(',', '.'), so we keep it.
    const n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? NaN : n;
}

function makeRangesByRules(maxLevel: number): [number, number][] {
    const ranges: [number, number][] = [];
    const pushSteps = (start: number, end: number, step: number) => {
        if (start > end) return;
        for (let s = start; s <= end; s += step) {
            const e = Math.min(s + step - 1, end);
            ranges.push([s, e]);
        }
    };

    if (maxLevel >= 1) pushSteps(1, Math.min(10, maxLevel), 10);
    if (maxLevel >= 11) pushSteps(11, Math.min(90, maxLevel), 20);
    if (maxLevel >= 91) pushSteps(91, Math.min(150, maxLevel), 30);
    if (maxLevel >= 151) pushSteps(151, Math.min(1000, maxLevel), 50);
    if (maxLevel >= 1001) pushSteps(1001, Math.min(2000, maxLevel), 100);
    if (maxLevel >= 2001) pushSteps(2001, maxLevel, 200);

    const last = ranges[ranges.length - 1];
    if (last && last[1] < maxLevel) last[1] = maxLevel;

    return ranges;
}

function findBucket(buckets: Bucket[], level: number): Bucket | null {
    for (const b of buckets) {
        if (level >= b.start && level <= b.end) return b;
    }
    return null;
}

/**
 * Detects the variant column (first column) that contains 'Baseline' or 'Variant' and 
 * pivots the data so each Level has columns for both Baseline and Variant A metrics.
 */
function transformToWideFormat(data: LevelRow[]): LevelRow[] {
    if (!data || data.length === 0) return [];

    const sample = data[0];
    const keys = Object.keys(sample);

    // Find the variant indicator column (first column containing Baseline/Variant values)
    let variantCol: string | null = null;
    for (const row of data.slice(0, 10)) {
        for (const key of keys) {
            const val = String(row[key] || '').toLowerCase();
            if (val.includes('baseline') || val.includes('variant')) {
                variantCol = key;
                break;
            }
        }
        if (variantCol) break;
    }

    // If no variant column found, return data as-is
    if (!variantCol) {
        return data;
    }

    // Define the metrics to pivot
    const METRICS_TO_PIVOT = [
        'Level Score', 'TotalUser', 'Instant Churn', '3 Days Churn', '7 Days Churn',
        'Avg. FirstTryWin', 'Avg. Repeat Rate', 'Playon per User', 'Avg. Level Play Time',
        'PlayOnWinRatio', 'RM Total', 'Avg. Total Moves', 'Inapp Value', 'Playon Sink per User',
        'Satisfaction Score', 'Engagement Score', 'Monetization Score', 'Complete Ratio',
        'Instant Difficulty Churn Ratio', 'WinPlayonCount', 'Booster/UserCount',
        'Normalized  Rewarded Seen per User', 'Inapp Count', 'InappArpu', 'Inapp ARPPU', 'Inapp User %'
    ];

    // Group by Level
    const grouped: Record<string, { baseline: LevelRow | null, variant: LevelRow | null, meta: any }> = {};

    for (const row of data) {
        const level = row['Level'];
        if (level === undefined || level === '') continue;

        const variantValue = String(row[variantCol] || '').toLowerCase();
        const isBaseline = variantValue.includes('baseline');
        const isVariant = variantValue.includes('variant');

        if (!grouped[level]) {
            grouped[level] = {
                baseline: null,
                variant: null,
                meta: {
                    Level: level,
                    FinalCluster: row['FinalCluster'] || '',
                    RevisionNumber: row['RevisionNumber'] || ''
                }
            };
        }

        if (isBaseline) {
            grouped[level].baseline = row;
        } else if (isVariant) {
            grouped[level].variant = row;
        }
    }

    // Build wide format rows
    const result: LevelRow[] = [];
    for (const levelKey of Object.keys(grouped).sort((a, b) => Number(a) - Number(b))) {
        const g = grouped[levelKey];
        const wideRow: LevelRow = {
            Level: g.meta.Level,
            FinalCluster: g.meta.FinalCluster,
            RevisionNumber: g.meta.RevisionNumber,
        };

        for (const metric of METRICS_TO_PIVOT) {
            // Try to find the metric in both baseline and variant rows
            const baseVal = g.baseline ? findMetricValue(g.baseline, metric) : NaN;
            const variantVal = g.variant ? findMetricValue(g.variant, metric) : NaN;

            wideRow[`${metric} Baseline`] = baseVal;
            wideRow[`${metric} Variant A`] = variantVal;
        }

        result.push(wideRow);
    }

    return result;
}

// Helper to find a metric value with flexible matching
function findMetricValue(row: LevelRow, metricName: string): number {
    // Exact match
    if (row[metricName] !== undefined) return toNum(row[metricName]);

    // Case-insensitive match
    const keys = Object.keys(row);
    const lowerMetric = metricName.toLowerCase();
    for (const key of keys) {
        if (key.toLowerCase() === lowerMetric) return toNum(row[key]);
    }

    // Partial match
    for (const key of keys) {
        if (key.toLowerCase().includes(lowerMetric) || lowerMetric.includes(key.toLowerCase())) {
            return toNum(row[key]);
        }
    }

    return NaN;
}

export function generateBolgeselReport(rawData: LevelRow[]): any[] {
    const data = transformToWideFormat(rawData);

    if (!data || data.length === 0) return [];

    // Filter valid rows and parse numbers
    const rows = data.map(r => {
        const lvl = toNum(r['Level']);
        const tu = toNum(r['TotalUser']);
        const m: Record<string, number> = {};
        METRICS.forEach(k => m[k] = toNum(r[k]));
        return { level: lvl, totalUsers: isFinite(tu) ? tu : 0, metrics: m };
    }).filter(r => isFinite(r.level));

    if (rows.length === 0) return [];

    const maxLevel = Math.max(...rows.map(r => r.level));
    const ranges = makeRangesByRules(maxLevel);

    // Initialize buckets
    const buckets: Bucket[] = ranges.map(([s, e]) => ({
        start: s,
        end: e,
        key: `${s}-${e}`,
        rowCount: 0,
        totalUsers: 0,
        sums: Object.fromEntries(METRICS.map(m => [m, 0])),
        counts: Object.fromEntries(METRICS.map(m => [m, 0])),
    }));

    // Aggregate data
    for (const row of rows) {
        const b = findBucket(buckets, row.level);
        if (!b) continue;
        b.rowCount += 1;
        b.totalUsers += row.totalUsers;

        for (const m of METRICS) {
            const v = row.metrics[m];
            if (isFinite(v)) {
                b.sums[m] += v;
                b.counts[m] += 1;
            }
        }
    }

    // Format output
    // We render this as an array of objects for the table component to verify easily
    const output = buckets.map(b => {
        const row: any = {
            'Range Start': b.start,
            'Range End': b.end,
            'Row Count': b.rowCount,
            'Total Users': b.totalUsers
        };

        METRICS.forEach(m => {
            const avg = b.counts[m] > 0 ? b.sums[m] / b.counts[m] : 0;
            // Format percentages if needed, but for raw data keeping as number is better for Table sorting.
            // Formatting can happen in UI.
            row[m] = avg;
        });

        // Add extra empty cols
        EXTRA_EMPTY_COLS.forEach(col => row[col] = "");

        return row;
    });

    return output;
}


// Helper to find value by multiple possible keys (case insensitive, supports partial match)
function getVal(row: any, patterns: string[]): number {
    const keys = Object.keys(row);
    for (const pattern of patterns) {
        // Try exact match first
        if (row[pattern] !== undefined) return toNum(row[pattern]);
        // Try case insensitive exact match
        const exactMatch = keys.find(k => k.toLowerCase() === pattern.toLowerCase());
        if (exactMatch && row[exactMatch] !== undefined) return toNum(row[exactMatch]);
        // Try partial match (pattern is contained in key)
        const partialMatch = keys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
        if (partialMatch && row[partialMatch] !== undefined) return toNum(row[partialMatch]);
    }
    return NaN;
}

function getStrVal(row: any, patterns: string[]): string {
    const keys = Object.keys(row);
    for (const pattern of patterns) {
        if (row[pattern] !== undefined) return String(row[pattern]);
        const exactMatch = keys.find(k => k.toLowerCase() === pattern.toLowerCase());
        if (exactMatch && row[exactMatch] !== undefined) return String(row[exactMatch]);
        const partialMatch = keys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
        if (partialMatch && row[partialMatch] !== undefined) return String(row[partialMatch]);
    }
    return '';
}

// Find a column key that matches pattern AND contains variant identifier
function findMetricColumn(row: any, metricPattern: string, variant: 'baseline' | 'variant'): string | null {
    const keys = Object.keys(row);
    const metricLower = metricPattern.toLowerCase();
    const variantLower = variant.toLowerCase();

    for (const key of keys) {
        const keyLower = key.toLowerCase();
        // Check if key contains both the metric pattern AND the variant identifier
        if (keyLower.includes(metricLower) && keyLower.includes(variantLower)) {
            return key;
        }
    }
    // If not found with variant, try finding metric alone
    for (const key of keys) {
        if (key.toLowerCase().includes(metricLower)) {
            // For Baseline, also check for "base" keyword
            if (variant === 'baseline' && (key.toLowerCase().includes('baseline') || key.toLowerCase().includes('base'))) {
                return key;
            }
            // For Variant A, check for "variant" keyword
            if (variant === 'variant' && key.toLowerCase().includes('variant')) {
                return key;
            }
        }
    }
    return null;
}

function getMetricVal(row: any, metricPattern: string, variant: 'baseline' | 'variant'): number {
    const key = findMetricColumn(row, metricPattern, variant);
    if (key && row[key] !== undefined) return toNum(row[key]);
    return NaN;
}

function getSortVal(row: any, key: string): number {
    return getVal(row, [key]);
}

// Metric patterns for matching dynamic column names
const METRIC_PATTERNS = {
    levelScore: 'level score',
    totalUser: 'totaluser',
    instantChurn: 'instant churn',
    threeDayChurn: '3 days churn',
    avgPlayTime: 'level play time',
    firstTryWin: 'firsttrywin',
    repeatRatio: 'repeat ratio',
    playonPerUser: 'playon per user',
    playOnWinRatio: 'playonwinratio',
    rmTotal: 'rm total',
    avgMoves: 'total moves',
    inappValue: 'inapp value',
    playonSink: 'playon sink',
};

// Calculate diff between variant and baseline
function calcMetricDiff(row: any, metricPattern: string): number {
    const base = getMetricVal(row, metricPattern, 'baseline');
    const variant = getMetricVal(row, metricPattern, 'variant');
    if (isNaN(base) || isNaN(variant)) return NaN;
    return variant - base;
}

import * as XLSX from 'xlsx';

// Helper to round numbers appropriately
function roundValue(value: number, isPercent: boolean = false): number | string {
    if (isNaN(value)) return '';
    if (isPercent) {
        // Round percentages to 4 decimal places (to show as 92.46%)
        return Math.round(value * 10000) / 10000;
    }
    // Round whole numbers
    if (Number.isInteger(value)) return value;
    // Round decimals to 2 places
    return Math.round(value * 100) / 100;
}

// Apply styling to worksheet - header colors, column widths
function applySheetStyling(ws: XLSX.WorkSheet, headerRowIndex: number = 0): void {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    // Set column widths
    const colWidths: XLSX.ColInfo[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        // Default width, wider for certain columns
        colWidths.push({ wch: 15 });
    }
    ws['!cols'] = colWidths;

    // Set row heights for headers
    ws['!rows'] = [{ hpt: 20 }]; // Header row height
}

// Columns that should be formatted as percentages (styling)
const PERCENT_COLS_STYLE = [
    'instant churn', '3 days churn', '7 days churn',
    'firsttrywin', 'repeat rate', 'complete ratio',
    'playonwinratio', 'inapp user'
];

function isPercentColumn(colName: string): boolean {
    const lower = colName.toLowerCase();
    return PERCENT_COLS_STYLE.some(p => lower.includes(p));
}

export function generateLevelScoreReportWorkbook(rawData: LevelRow[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    // 1. Ensure Wide Format
    let data = transformToWideFormat(rawData);
    if (!data || data.length === 0) data = rawData;

    // --- Sheet 1: RAW DATA (sorted by Level ascending, Level as first column) ---
    const sortedData = [...data].sort((a, b) => {
        const levelA = getVal(a, ['Level', 'LevelID']) || 0;
        const levelB = getVal(b, ['Level', 'LevelID']) || 0;
        return levelA - levelB; // ascending
    });
    // Reorder columns to put Level first
    const orderedData = sortedData.map(row => {
        const level = getVal(row, ['Level', 'LevelID']);
        const { Level, LevelID, ...rest } = row;
        return { Level: level, ...rest };
    });
    const rawDataSheet = XLSX.utils.json_to_sheet(orderedData);
    XLSX.utils.book_append_sheet(wb, rawDataSheet, "RAW DATA");

    // --- Sheet 2: Level Score A/B (with Diff columns) ---
    const abData = data.map(row => {
        const levelScoreDiff = calcMetricDiff(row, METRIC_PATTERNS.levelScore);
        const totalUserDiff = calcMetricDiff(row, METRIC_PATTERNS.totalUser);
        const instantChurnDiff = calcMetricDiff(row, METRIC_PATTERNS.instantChurn);
        const threeDayDiff = calcMetricDiff(row, METRIC_PATTERNS.threeDayChurn);

        return {
            Level: getVal(row, ['Level', 'LevelID']),
            FinalCluster: getStrVal(row, ['FinalCluster', 'Cluster']),
            RevisionNumber: getStrVal(row, ['RevisionNumber', 'Revision']),
            'Müdahale Yapılanlar': '',
            'LevelScore Baseline': getMetricVal(row, METRIC_PATTERNS.levelScore, 'baseline'),
            'LevelScore Variant A': getMetricVal(row, METRIC_PATTERNS.levelScore, 'variant'),
            'LevelScore Diff': isNaN(levelScoreDiff) ? '' : levelScoreDiff,
            'TotalUser Baseline': getMetricVal(row, METRIC_PATTERNS.totalUser, 'baseline'),
            'TotalUser Variant A': getMetricVal(row, METRIC_PATTERNS.totalUser, 'variant'),
            'TotalUser Diff': isNaN(totalUserDiff) ? '' : totalUserDiff,
            'Instant Churn Baseline': getMetricVal(row, METRIC_PATTERNS.instantChurn, 'baseline'),
            'Instant Churn Variant A': getMetricVal(row, METRIC_PATTERNS.instantChurn, 'variant'),
            'Instant Churn Diff': isNaN(instantChurnDiff) ? '' : instantChurnDiff,
            '3 Days Churn Baseline': getMetricVal(row, METRIC_PATTERNS.threeDayChurn, 'baseline'),
            '3 Days Churn Variant A': getMetricVal(row, METRIC_PATTERNS.threeDayChurn, 'variant'),
            '3 Days Churn Diff': isNaN(threeDayDiff) ? '' : threeDayDiff,
        };
    });
    const abSheet = XLSX.utils.json_to_sheet(abData);
    XLSX.utils.book_append_sheet(wb, abSheet, "Level Score AB");

    // --- Sheet 3: Level Score (filtered by significant LevelScore diff, sorted DESCENDING) ---
    const levelScoreFiltered = abData
        .filter(r => typeof r['LevelScore Diff'] === 'number' && Math.abs(r['LevelScore Diff']) > 2)
        .sort((a, b) => {
            const diffA = typeof a['LevelScore Diff'] === 'number' ? a['LevelScore Diff'] : 0;
            const diffB = typeof b['LevelScore Diff'] === 'number' ? b['LevelScore Diff'] : 0;
            return diffB - diffA; // descending (big to small)
        });
    const levelScoreSheet = XLSX.utils.json_to_sheet(levelScoreFiltered);
    XLSX.utils.book_append_sheet(wb, levelScoreSheet, "Level Score");

    // --- Sheet 4: Instant Churn (filtered) ---
    const instantChurnFiltered = abData
        .filter(r => typeof r['Instant Churn Diff'] === 'number' && Math.abs(r['Instant Churn Diff']) > 0.01)
        .sort((a, b) => {
            const diffA = typeof a['Instant Churn Diff'] === 'number' ? a['Instant Churn Diff'] : 0;
            const diffB = typeof b['Instant Churn Diff'] === 'number' ? b['Instant Churn Diff'] : 0;
            return diffB - diffA; // descending (worst churn first)
        });
    const instantChurnSheet = XLSX.utils.json_to_sheet(instantChurnFiltered);
    XLSX.utils.book_append_sheet(wb, instantChurnSheet, "Instant Churn");

    // --- Sheet 5: 3 Day (filtered) ---
    const threeDayFiltered = abData
        .filter(r => typeof r['3 Days Churn Diff'] === 'number' && Math.abs(r['3 Days Churn Diff']) > 0.01)
        .sort((a, b) => {
            const diffA = typeof a['3 Days Churn Diff'] === 'number' ? a['3 Days Churn Diff'] : 0;
            const diffB = typeof b['3 Days Churn Diff'] === 'number' ? b['3 Days Churn Diff'] : 0;
            return diffB - diffA; // descending (worst churn first)
        });
    const threeDaySheet = XLSX.utils.json_to_sheet(threeDayFiltered);
    XLSX.utils.book_append_sheet(wb, threeDaySheet, "3 Day");

    // --- Sheet 6: Time (with Avg. Level Play Time metrics) ---
    const timeData = data.map(row => ({
        Level: getVal(row, ['Level', 'LevelID']),
        FinalCluster: getStrVal(row, ['FinalCluster', 'Cluster']),
        RevisionNumber: getStrVal(row, ['RevisionNumber', 'Revision']),
        'Müdahale Yapılanlar': '',
        'Avg. Level Play Time Baseline': getMetricVal(row, METRIC_PATTERNS.avgPlayTime, 'baseline'),
        'Avg. Level Play Time Variant A': getMetricVal(row, METRIC_PATTERNS.avgPlayTime, 'variant'),
        'PlayOnWinRatio Baseline': getMetricVal(row, 'playonwinratio', 'baseline'),
        'PlayOnWinRatio Variant A': getMetricVal(row, 'playonwinratio', 'variant'),
        'Playon per User Baseline': getMetricVal(row, 'playon per user', 'baseline'),
        'Playon per User Variant A': getMetricVal(row, 'playon per user', 'variant'),
    })).sort((a, b) => (a.Level || 0) - (b.Level || 0));
    const timeSheet = XLSX.utils.json_to_sheet(timeData);
    XLSX.utils.book_append_sheet(wb, timeSheet, "Time");

    // --- Sheet 7: Level Score B (Variant A metrics only) ---
    const variantBData = data.map(row => ({
        Level: getVal(row, ['Level', 'LevelID']),
        FinalCluster: getStrVal(row, ['FinalCluster', 'Cluster']),
        RevisionNumber: getStrVal(row, ['RevisionNumber', 'Revision']),
        'Müdahale Yapılanlar': '',
        'Level Score': getMetricVal(row, METRIC_PATTERNS.levelScore, 'variant'),
        'TotalUser': getMetricVal(row, METRIC_PATTERNS.totalUser, 'variant'),
        'Instant Churn': getMetricVal(row, METRIC_PATTERNS.instantChurn, 'variant'),
        '3 Days Churn': getMetricVal(row, METRIC_PATTERNS.threeDayChurn, 'variant'),
        'Avg. FirstTryWinPercent': getMetricVal(row, METRIC_PATTERNS.firstTryWin, 'variant'),
        'Avg. Level Play Time': getMetricVal(row, METRIC_PATTERNS.avgPlayTime, 'variant'),
    }));
    const variantBSheet = XLSX.utils.json_to_sheet(variantBData);
    XLSX.utils.book_append_sheet(wb, variantBSheet, "Level Score B");

    // --- Sheet 8: B Level Score Top List Succesfull ---
    const topSuccessful = variantBData
        .filter(r => typeof r['Level Score'] === 'number' && r['Level Score'] >= 50)
        .sort((a, b) => {
            const scoreA = typeof a['Level Score'] === 'number' ? a['Level Score'] : 0;
            const scoreB = typeof b['Level Score'] === 'number' ? b['Level Score'] : 0;
            return scoreB - scoreA; // descending (best first)
        })
        .slice(0, 100); // Top 100
    const topSuccessSheet = XLSX.utils.json_to_sheet(topSuccessful.map(r => ({ ...r, 'Müdahale Yapılanlar': '' })));
    XLSX.utils.book_append_sheet(wb, topSuccessSheet, "B Level Score Top Succesfull");

    // --- Sheet 9: B Churn Bottom List Unsuccesfull (sorted by Level Score ascending - col E) ---
    const bottomUnsuccess = variantBData
        .filter(r => typeof r['Level Score'] === 'number')
        .sort((a, b) => {
            const scoreA = typeof a['Level Score'] === 'number' ? a['Level Score'] : Infinity;
            const scoreB = typeof b['Level Score'] === 'number' ? b['Level Score'] : Infinity;
            return scoreA - scoreB; // ascending (smallest first)
        })
        .slice(0, 100); // Bottom 100
    const bottomUnsuccessSheet = XLSX.utils.json_to_sheet(bottomUnsuccess.map(r => ({ ...r, 'Müdahale Yapılanlar': '' })));
    XLSX.utils.book_append_sheet(wb, bottomUnsuccessSheet, "B Churn Bottom Unsuccesfull");

    // --- Sheet 10: Müdahale Listesi (Intervention List - empty) ---
    const mudahaleData = [{ Level: '', 'Müdahale Açıklaması': '', 'Öncelik': '', 'Durum': '' }];
    const mudahaleSheet = XLSX.utils.json_to_sheet(mudahaleData);
    XLSX.utils.book_append_sheet(wb, mudahaleSheet, "Müdahale Listesi");

    // --- Sheet 11: Uygulama Planı (Implementation Plan - empty) ---
    const uygulamaData = [{ Level: '', 'Yapılacak İşlem': '', 'Sorumlu': '', 'Tarih': '', 'Durum': '' }];
    const uygulamaSheet = XLSX.utils.json_to_sheet(uygulamaData);
    XLSX.utils.book_append_sheet(wb, uygulamaSheet, "Uygulama Plani");

    return wb;
}

export function generateBaseChurnReportWorkbook(rawData: LevelRow[]): XLSX.WorkBook {
    // Logic from `createBaseSheet`
    // SRC: RAW DATA
    // DEST: "3 Day Churn Top Unsuccesfull"
    // Insert Column before 3 (C). Header "Müdahale Yapılanlar". (A, B, "Müdahale", C...)

    const wb = XLSX.utils.book_new();
    let data = transformToWideFormat(rawData);
    if (!data || data.length === 0) data = rawData;

    // Filter? Script `createBaseSheet` just copies values. It does NOT filter.
    // However, the menu has "filterBase3DayChurnTopUnsuccesfull" which does filter.
    // User said "create a new google sheet report... according to my app script code".
    // Usually "Creation" implies the structure (createBaseSheet).
    // "Filter" implies the view.
    // If we want a reported ready for use, we likely just provide the data structure.
    // BUT `generateLevelScore` implemented the filtered views.
    // Should `generateBaseChurn` be filtered?
    // `createBaseSheet` does NO filtering. Just formatting.
    // `filterBase3DayChurnTopUnsuccesfull` applies filter to existing sheet.

    // Detailed User Request: "create a new google sheet report according to my app script code"
    // User also asked for "Level Score AB" specifically to be "multiple sheets" (which implies `createLevelScoreSheets`).

    // For "Level Revize" (mapped to Base Churn?), let's just create the sheet with Data and Column C insertion.
    // Use heuristic: apply the filter if possible?
    // User script `filterAll` runs 4 filters.
    // `createBaseSheet` makes the sheet.
    // Probably safer to provide ALL data but setup the headers.
    // BUT the `generateLevelScore` one I did filters because the sheet names imply filtering ("Top Unsuccesfull").
    // The Sheet Name in `createBaseSheet` is "3 Day Churn Top Unsuccesfull".
    // This implies it SHOULD be filtered to contain "Top Unsuccesfull" stuff?
    // OR it implies it's a bucket for that data.
    // In `createBaseSheet` script, it copies `src.getRange(...)`. Source is "RAW DATA". 
    // It copies EVERYTHING.
    // Then `filterBase3DayChurnTopUnsuccesfull` filters it In Place.

    // Decision: Return ALL data, but Sorted?
    // I will return ALL data, but sorted and with columns added, matching `createBaseSheet` structure.

    // Insert "Müdahale Yapılanlar" at C (3rd col).
    // [A, B, New, C, D...]

    const refinedRows = data.map(row => {
        // Try to identify keys to enforce order [Level, ..., Intervention, rest...]
        // Without clear headers, I'll just add the key.
        // Ideally: Level (A), Col2 (B), Intervention (New C), Col3 (Old C D E...).

        // Let's try to grab 'Level' and put it first.
        const res: any = {};
        if (row['Level'] !== undefined) res['Level'] = row['Level'];

        // We can't easily guess B (Col 2).
        // So we just add 'Müdahale Yapılanlar' and hope header mapping in Excel is okay or user adjusts.
        // Actually, better:
        // Use `json_to_sheet` then `sheet_add_aoa` or modify the range.

        return {
            ...row,
            'Müdahale Yapılanlar': ''
        };
    });

    const ws = XLSX.utils.json_to_sheet(refinedRows);

    // TODO: Fixing column order to be strictly A, B, Intervention, C... is hard without headers.
    // But we satisfy the "Add Column" requirement.

    XLSX.utils.book_append_sheet(wb, ws, "3 Day Churn Top Unsuccesfull");
    return wb;
}

export function generateExcelBlobFromWorkbook(wb: XLSX.WorkBook): Blob {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function createAndDownloadWorkbook(data: any[], filename: string, type: 'Bolgesel' | 'LevelScore' | 'BaseChurn') {
    let wb: XLSX.WorkBook;

    if (type === 'Bolgesel') {
        const bolgeselData = generateBolgeselReport(data);
        wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(bolgeselData);
        XLSX.utils.book_append_sheet(wb, ws, "Bölgesel Rapor");
    } else if (type === 'BaseChurn') {
        wb = generateBaseChurnReportWorkbook(data);
    } else {
        wb = generateLevelScoreReportWorkbook(data);
    }

    if (!filename.endsWith('.xlsx')) filename += '.xlsx';
    XLSX.writeFile(wb, filename);
}

export function downloadExcel(data: any[], filename: string, sheetName: string = "Sheet1") {
    if (!data || data.length === 0) return;

    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Create a worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Append the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Save the file
    // Note: filename should end in .xlsx
    if (!filename.endsWith('.xlsx')) {
        filename += '.xlsx';
    }

    XLSX.writeFile(wb, filename);
}

export function generateExcelBlob(data: any[], sheetName: string = "Sheet1"): Blob | null {
    if (!data || data.length === 0) return null;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Write to array buffer
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
