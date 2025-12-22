
import papa from 'papaparse';

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
 * Detects if data is in 'Long Format' (has Metrics and Value columns) and pivots it to 'Wide Format'.
 */
function transformToWideFormat(data: LevelRow[]): LevelRow[] {
    if (!data || data.length === 0) return [];

    // Check if it's long format
    const sample = data[0];
    const hasMetrics = 'Metrics' in sample || 'Metric Result' in sample; // 'Metric Result' is sometimes used by Tableau
    const hasValue = 'Value' in sample || 'Measure Values' in sample;

    if (!hasMetrics || !hasValue) {
        return data; // Assume already wide or unknown format
    }

    const valueKey = 'Value' in sample ? 'Value' : 'Measure Values';
    const metricsKey = 'Metrics' in sample ? 'Metrics' : 'Metric Result';
    const levelKey = 'LevelID' in sample ? 'LevelID' : ('Level' in sample ? 'Level' : null);

    if (!levelKey) return data; // Can't pivot without a grouping key

    const pivoted: Record<string, LevelRow> = {};

    for (const row of data) {
        const lvl = row[levelKey];
        if (typeof lvl === 'undefined') continue;

        if (!pivoted[lvl]) {
            pivoted[lvl] = { 'Level': lvl }; // Standardize on 'Level'
        }

        const metricName = row[metricsKey];
        const val = row[valueKey];

        if (metricName) {
            // Handle TotalUser specifically if it appears as a metric
            if (metricName === 'Total User' || metricName === 'TotalUser') {
                pivoted[lvl]['TotalUser'] = val;
            } else {
                pivoted[lvl][metricName] = val;
            }
        }
    }

    return Object.values(pivoted);
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

export function downloadCSV(data: any[], filename: string) {
    if (!data || data.length === 0) return;
    const csv = papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
