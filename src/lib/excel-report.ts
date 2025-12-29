import ExcelJS from 'exceljs';

interface LevelRow {
    [key: string]: any;
}

// Columns that contain percentage values (stored as decimals 0-1)
const PERCENT_METRICS = [
    'instant churn', '3 days churn', '7 days churn',
    'firsttrywin', 'repeat rate', 'complete ratio',
    'playonwinratio', 'churn diff', 'inapp user'
];

function isPercentMetric(colName: string): boolean {
    const lower = colName.toLowerCase();
    return PERCENT_METRICS.some(p => lower.includes(p));
}

function toNum(v: any): number {
    if (v === null || v === '' || typeof v === 'undefined') return NaN;
    if (typeof v === 'number') return v;
    const n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? NaN : n;
}

// Format value: convert decimal to percentage string if needed
function formatValue(value: any, colName: string): any {
    if (value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value))) {
        return '';
    }

    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));

    if (isNaN(num)) return value;

    // Check if this is a percentage metric
    if (isPercentMetric(colName)) {
        // If value is between -1 and 1, it's a decimal percentage
        if (num >= -1 && num <= 1) {
            return `${(num * 100).toFixed(2)}%`;
        } else if (num >= -100 && num <= 100) {
            // Already in percentage form
            return `${num.toFixed(2)}%`;
        }
    }

    // Round other decimals to 2 places
    if (!Number.isInteger(num)) {
        return Math.round(num * 100) / 100;
    }

    return num;
}

// Apply header styling with configurable background color
function styleHeaderRow(worksheet: ExcelJS.Worksheet, rowNumber: number, headerColor: string = 'FFFF00'): void {
    const row = worksheet.getRow(rowNumber);
    row.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${headerColor}` } // Add FF for alpha
        };
        cell.font = {
            bold: true,
            size: 11
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    row.height = 20;
}

// Set column widths
function setColumnWidths(worksheet: ExcelJS.Worksheet): void {
    worksheet.columns.forEach((column) => {
        const header = column.header as string;
        if (!header) return;
        const width = Math.min(Math.max(header.length + 2, 10), 25);
        column.width = width;
    });
}

// Add data to worksheet with formatting
function addDataToSheet(worksheet: ExcelJS.Worksheet, data: any[], headers: string[], headerColor: string = 'FFFF00'): void {
    // Always add headers (even for empty data)
    worksheet.addRow(headers);
    styleHeaderRow(worksheet, 1, headerColor);

    // Add data rows
    data.forEach((row) => {
        const rowValues = headers.map(header => formatValue(row[header], header));
        const excelRow = worksheet.addRow(rowValues);

        excelRow.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
    });

    setColumnWidths(worksheet);
}

// Helper functions for data extraction
function findMetricValue(row: LevelRow, metricName: string): number {
    // Exact match first
    if (row[metricName] !== undefined) return toNum(row[metricName]);

    const keys = Object.keys(row);
    const lowerMetric = metricName.toLowerCase();

    // Case-insensitive exact match
    for (const key of keys) {
        if (key.toLowerCase() === lowerMetric) return toNum(row[key]);
    }

    // Partial matching with special cases for common variations
    // Based on actual Tableau column names from different views
    const metricPatterns: Record<string, string[]> = {
        // Repeat - different views use different names
        'avg. repeat ratio': ['avg. repeat ratio (birleşik)', 'avg. repeat ratio', 'avg. repeat rate', 'repeat rate', 'repeat ratio'],
        // Level Play Time - Bölgesel uses "fixed", Level Score AB uses "Avg.", might also be just "Level Play"
        'level play time': ['level play time fixed', 'avg. level play time', 'level play time', 'level play'],
        'avg. level play time': ['level play time fixed', 'avg. level play time', 'level play time', 'level play'],
        // FirstTryWin
        'avg. firsttrywinpercent': ['avg. firsttrywinpercent', 'avg. firsttrywin', 'firsttrywin'],
        // Churn columns
        'instant churn': ['instant churn'],
        '3 days churn': ['3 days churn', '3 day churn'],
        '7 days churn': ['7 days churn', '7 day churn'],
        // Level Score - Bölgesel has long name
        'level score': ['level score along', 'level score'],
        // User metrics
        'totaluser': ['totaluser', 'total user'],
        'playon per user': ['playon per user'],
        'playonwinratio': ['playonwinratio', 'playon win ratio'],
        // RM - Bölgesel uses "Fixed", Level Score AB uses "Total"
        'rm fixed': ['rm fixed', 'rm total'],
        'rm total': ['rm total', 'rm fixed'],
        // Moves
        'avg. total moves': ['avg. total moves', 'total moves'],
        // Inapp
        'inapp value': ['inapp value'],
    };

    // Get patterns for this metric
    const patterns = metricPatterns[lowerMetric] || [lowerMetric];

    for (const key of keys) {
        const lowerKey = key.toLowerCase();
        for (const pattern of patterns) {
            if (lowerKey.includes(pattern)) {
                return toNum(row[key]);
            }
        }
    }

    return NaN;
}

function getStrVal(row: any, patterns: string[]): string {
    const keys = Object.keys(row);
    for (const pattern of patterns) {
        if (row[pattern] !== undefined) return String(row[pattern]);
        const match = keys.find(k => k.toLowerCase() === pattern.toLowerCase());
        if (match && row[match] !== undefined) return String(row[match]);
    }
    return '';
}

function getVal(row: any, patterns: string[]): number {
    const keys = Object.keys(row);
    for (const pattern of patterns) {
        if (row[pattern] !== undefined) return toNum(row[pattern]);
        const match = keys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
        if (match && row[match] !== undefined) return toNum(row[match]);
    }
    return NaN;
}

// Transform raw data (with Baseline/Variant rows) to wide format
function transformToWideFormat(data: LevelRow[]): LevelRow[] {
    if (!data || data.length === 0) return [];

    const sample = data[0];
    const keys = Object.keys(sample);

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

    if (!variantCol) return data;

    const METRICS_TO_PIVOT = [
        'Level Score', 'TotalUser', 'Instant Churn', '3 Days Churn', '7 Days Churn',
        'Avg. FirstTryWin', 'Avg. Repeat Rate', 'Playon per User', 'Avg. Level Play Time',
        'PlayOnWinRatio', 'RM Total', 'Avg. Total Moves', 'Inapp Value', 'Playon Sink per User'
    ];

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

        if (isBaseline) grouped[level].baseline = row;
        else if (isVariant) grouped[level].variant = row;
    }

    const result: LevelRow[] = [];
    for (const levelKey of Object.keys(grouped).sort((a, b) => Number(a) - Number(b))) {
        const g = grouped[levelKey];
        const wideRow: LevelRow = {
            Level: g.meta.Level,
            FinalCluster: g.meta.FinalCluster,
            RevisionNumber: g.meta.RevisionNumber,
        };

        for (const metric of METRICS_TO_PIVOT) {
            const baseVal = g.baseline ? findMetricValue(g.baseline, metric) : NaN;
            const variantVal = g.variant ? findMetricValue(g.variant, metric) : NaN;
            wideRow[`${metric} Baseline`] = baseVal;
            wideRow[`${metric} Variant A`] = variantVal;
        }
        result.push(wideRow);
    }
    return result;
}

// Main export: Takes raw CSV data and generates styled Excel with all sheets
export async function generateLevelScoreExcelJSFromRaw(rawData: LevelRow[]): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LevelUp Dashboard';
    workbook.created = new Date();

    // Transform to wide format
    let transformed = transformToWideFormat(rawData);
    if (!transformed || transformed.length === 0) transformed = rawData;

    // Sort by Level ascending for RAW DATA
    const sortedData = [...transformed].sort((a, b) => (a.Level || 0) - (b.Level || 0));

    // Build abData with Time column included
    const abData = sortedData.map(row => ({
        Level: getVal(row, ['Level', 'LevelID']),
        FinalCluster: getStrVal(row, ['FinalCluster', 'Cluster']),
        RevisionNumber: getStrVal(row, ['RevisionNumber', 'Revision']),
        'Müdahale Yapılanlar': '',
        'LevelScore Baseline': getVal(row, ['Level Score Baseline']),
        'LevelScore Variant A': getVal(row, ['Level Score Variant A']),
        'LevelScore Diff': (() => {
            const b = getVal(row, ['Level Score Baseline']);
            const v = getVal(row, ['Level Score Variant A']);
            return isNaN(b) || isNaN(v) ? NaN : v - b;
        })(),
        'TotalUser Baseline': getVal(row, ['TotalUser Baseline']),
        'TotalUser Variant A': getVal(row, ['TotalUser Variant A']),
        'Instant Churn Baseline': getVal(row, ['Instant Churn Baseline']),
        'Instant Churn Variant A': getVal(row, ['Instant Churn Variant A']),
        'Instant Churn Diff': (() => {
            const b = getVal(row, ['Instant Churn Baseline']);
            const v = getVal(row, ['Instant Churn Variant A']);
            return isNaN(b) || isNaN(v) ? NaN : v - b;
        })(),
        '3 Days Churn Baseline': getVal(row, ['3 Days Churn Baseline']),
        '3 Days Churn Variant A': getVal(row, ['3 Days Churn Variant A']),
        '3 Days Churn Diff': (() => {
            const b = getVal(row, ['3 Days Churn Baseline']);
            const v = getVal(row, ['3 Days Churn Variant A']);
            return isNaN(b) || isNaN(v) ? NaN : v - b;
        })(),
        'Avg. Level Play Time Baseline': getVal(row, ['Avg. Level Play Time Baseline']),
        'Avg. Level Play Time Variant A': getVal(row, ['Avg. Level Play Time Variant A']),
        'Time Diff': (() => {
            const b = getVal(row, ['Avg. Level Play Time Baseline']);
            const v = getVal(row, ['Avg. Level Play Time Variant A']);
            return isNaN(b) || isNaN(v) ? NaN : v - b;
        })(),
    }));

    // Build variantBData
    const variantBData = sortedData.map(row => ({
        Level: getVal(row, ['Level', 'LevelID']),
        FinalCluster: getStrVal(row, ['FinalCluster', 'Cluster']),
        RevisionNumber: getStrVal(row, ['RevisionNumber', 'Revision']),
        'Müdahale Yapılanlar': '',
        'Level Score': getVal(row, ['Level Score Variant A']),
        'TotalUser': getVal(row, ['TotalUser Variant A']),
        'Instant Churn': getVal(row, ['Instant Churn Variant A']),
        '3 Days Churn': getVal(row, ['3 Days Churn Variant A']),
        'Avg. FirstTryWinPercent': getVal(row, ['Avg. FirstTryWin Variant A']),
        'Avg. Level Play Time': getVal(row, ['Avg. Level Play Time Variant A']),
    }));

    // Define headers
    const rawHeaders = Object.keys(sortedData[0] || {});
    const abHeaders = Object.keys(abData[0] || {});
    const variantBHeaders = Object.keys(variantBData[0] || {});

    // Sheet 1: RAW DATA (sorted by Level ascending)
    const rawSheet = workbook.addWorksheet('RAW DATA');
    addDataToSheet(rawSheet, sortedData, ['Level', ...rawHeaders.filter(h => h !== 'Level')]);

    // Sheet 2: Level Score AB
    const abSheet = workbook.addWorksheet('Level Score AB');
    addDataToSheet(abSheet, abData, abHeaders);

    // Sheet 3: Level Score (sorted by LevelScore Diff DESCENDING)
    const levelScoreFiltered = abData
        .filter(r => typeof r['LevelScore Diff'] === 'number' && Math.abs(r['LevelScore Diff']) > 2)
        .sort((a, b) => (b['LevelScore Diff'] || 0) - (a['LevelScore Diff'] || 0)); // DESCENDING
    const levelScoreSheet = workbook.addWorksheet('Level Score');
    addDataToSheet(levelScoreSheet, levelScoreFiltered, abHeaders);

    // Sheet 4: Instant Churn
    const instantChurnFiltered = abData
        .filter(r => typeof r['Instant Churn Diff'] === 'number' && Math.abs(r['Instant Churn Diff']) > 0.01)
        .sort((a, b) => (b['Instant Churn Diff'] || 0) - (a['Instant Churn Diff'] || 0));
    const instantChurnSheet = workbook.addWorksheet('Instant Churn');
    addDataToSheet(instantChurnSheet, instantChurnFiltered, abHeaders);

    // Sheet 5: 3 Day
    const threeDayFiltered = abData
        .filter(r => typeof r['3 Days Churn Diff'] === 'number' && Math.abs(r['3 Days Churn Diff']) > 0.01)
        .sort((a, b) => (b['3 Days Churn Diff'] || 0) - (a['3 Days Churn Diff'] || 0));
    const threeDaySheet = workbook.addWorksheet('3 Day');
    addDataToSheet(threeDaySheet, threeDayFiltered, abHeaders);

    // Sheet 6: Time (sorted by Time Diff descending)
    const timeFiltered = abData
        .filter(r => typeof r['Time Diff'] === 'number')
        .sort((a, b) => (b['Time Diff'] || 0) - (a['Time Diff'] || 0));
    const timeSheet = workbook.addWorksheet('Time');
    addDataToSheet(timeSheet, timeFiltered, abHeaders);

    // Sheet 7: Level Score B
    const levelScoreBSheet = workbook.addWorksheet('Level Score B');
    addDataToSheet(levelScoreBSheet, variantBData, variantBHeaders);

    // Sheet 8: B Level Score Top Successful
    const topSuccessful = variantBData
        .filter(r => typeof r['Level Score'] === 'number' && r['Level Score'] >= 50)
        .sort((a, b) => (b['Level Score'] || 0) - (a['Level Score'] || 0))
        .slice(0, 100);
    const topSuccessSheet = workbook.addWorksheet('B Level Score Top Succesfull');
    addDataToSheet(topSuccessSheet, topSuccessful, variantBHeaders);

    // Sheet 9: B Churn Bottom Unsuccessful (sorted by Level Score ascending)
    const bottomUnsuccess = variantBData
        .filter(r => typeof r['Level Score'] === 'number')
        .sort((a, b) => (a['Level Score'] || Infinity) - (b['Level Score'] || Infinity))
        .slice(0, 100);
    const bottomUnsuccessSheet = workbook.addWorksheet('B Churn Bottom Unsuccesfull');
    addDataToSheet(bottomUnsuccessSheet, bottomUnsuccess, variantBHeaders);

    // Sheet 10: Müdahale Listesi
    const mudahaleSheet = workbook.addWorksheet('Müdahale Listesi');
    addDataToSheet(mudahaleSheet, [{ Level: '', 'Müdahale Açıklaması': '', 'Öncelik': '', 'Durum': '' }],
        ['Level', 'Müdahale Açıklaması', 'Öncelik', 'Durum']);

    // Sheet 11: Uygulama Plani
    const uygulamaSheet = workbook.addWorksheet('Uygulama Plani');
    addDataToSheet(uygulamaSheet, [{ Level: '', 'Yapılacak İşlem': '', 'Sorumlu': '', 'Tarih': '', 'Durum': '' }],
        ['Level', 'Yapılacak İşlem', 'Sorumlu', 'Tarih', 'Durum']);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ========== BÖLGESEL REVIZE REPORT ==========

// Generate level ranges for aggregation
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

// Metrics to aggregate for Bölgesel Rapor
const BOLGESEL_METRICS = [
    'Instant Churn', '3 Days Churn', '7 Days Churn',
    'Avg. FirstTryWin', 'Avg. Repeat Ratio', 'Level Play Time',
    'Playon per User', 'RM Fixed', 'Avg. Total Moves', 'Inapp Value'
];

// Bölgesel report generator with ExcelJS styling
export async function generateBolgeselExcelJSFromRaw(rawData: LevelRow[]): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LevelUp Dashboard';
    workbook.created = new Date();

    // Sort raw data by Level ascending
    const sortedData = [...rawData].sort((a, b) => {
        const levelA = toNum(a['Level']) || 0;
        const levelB = toNum(b['Level']) || 0;
        return levelA - levelB;
    });

    // Prepare RAW DATA with proper columns
    const rawHeaders = [
        'Level', 'FinalCluster', 'RevisionNumber', 'Level Score',
        'TotalUser', 'Instant Churn', '3 Days Churn', '7 Days Churn',
        'Avg. FirstTryWinPercent', 'Avg. Repeat Ratio', 'Level Play Time',
        'Playon per User', 'RM Fixed', 'Avg. Total Moves', 'Inapp Value'
    ];

    const rawDataFormatted = sortedData.map(row => {
        const result: any = {};
        // Direct column mapping with fallbacks based on actual Tableau column names
        result['Level'] = toNum(row['Level']);
        result['FinalCluster'] = row['FinalCluster'] || row['FinalClusters'] || '';
        result['RevisionNumber'] = row['RevisionNumber'] || '';
        result['Level Score'] = findMetricValue(row, 'Level Score');
        result['TotalUser'] = findMetricValue(row, 'TotalUser');
        result['Instant Churn'] = findMetricValue(row, 'Instant Churn');
        result['3 Days Churn'] = findMetricValue(row, '3 Days Churn');
        result['7 Days Churn'] = findMetricValue(row, '7 Days Churn');
        result['Avg. FirstTryWinPercent'] = findMetricValue(row, 'Avg. FirstTryWinPercent') || findMetricValue(row, 'Avg. FirstTryWin');
        // Bölgesel uses "Avg. Repeat Ratio (birleşik)", Level Score AB uses "Avg. Repeat Rate"
        result['Avg. Repeat Ratio'] = findMetricValue(row, 'Avg. Repeat Ratio') || findMetricValue(row, 'Avg. Repeat Rate');
        // Bölgesel uses "Level Play Time fixed", Level Score AB uses "Avg. Level Play Time"
        result['Level Play Time'] = findMetricValue(row, 'Level Play Time') || findMetricValue(row, 'Avg. Level Play Time');
        result['Playon per User'] = findMetricValue(row, 'Playon per User');
        // Bölgesel uses "RM Fixed", Level Score AB uses "RM Total"
        result['RM Fixed'] = findMetricValue(row, 'RM Fixed') || findMetricValue(row, 'RM Total');
        result['Avg. Total Moves'] = findMetricValue(row, 'Avg. Total Moves');
        result['Inapp Value'] = findMetricValue(row, 'Inapp Value');
        return result;
    }).filter(r => !isNaN(r['Level']));

    // Sheet 1: RAW DATA
    const rawSheet = workbook.addWorksheet('RAW DATA');
    addDataToSheet(rawSheet, rawDataFormatted, rawHeaders);

    // Generate Bölgesel aggregations
    const maxLevel = Math.max(...rawDataFormatted.map(r => r['Level'] || 0));
    const ranges = makeRangesByRules(maxLevel);

    const bolgeselData = ranges.map(([start, end]) => {
        const rowsInRange = rawDataFormatted.filter(r => r['Level'] >= start && r['Level'] <= end);
        const rowCount = rowsInRange.length;
        const totalUsers = rowsInRange.reduce((sum, r) => sum + (toNum(r['TotalUser']) || 0), 0);

        const aggregated: any = {
            'Range Start': start,
            'Range End': end,
            'Row Count': rowCount,
            'Total Users': totalUsers,
        };

        // Calculate averages for each metric
        for (const metric of BOLGESEL_METRICS) {
            const values = rowsInRange.map(r => findMetricValue(r, metric)).filter(v => !isNaN(v));
            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            aggregated[metric] = Math.round(avg * 10000) / 10000; // Round to 4 decimal places
        }

        // Add empty DS columns
        aggregated['DS Harden'] = '';
        aggregated['DS Soften'] = '';

        return aggregated;
    }).filter(r => r['Row Count'] > 0);

    // Sheet 2: Bölgesel Rapor
    const bolgeselHeaders = [
        'Range Start', 'Range End', 'Row Count', 'Total Users',
        ...BOLGESEL_METRICS, 'DS Harden', 'DS Soften'
    ];
    const bolgeselSheet = workbook.addWorksheet('Bölgesel Rapor');
    addDataToSheet(bolgeselSheet, bolgeselData, bolgeselHeaders);

    // Sheet 3: Müdahale Listesi (empty with headers)
    const mudahaleHeaders = [
        'Level', 'FinalCluster', 'RevisionNumber', 'Level Score',
        'TotalUser', 'Instant Churn', '3 Days Churn', '7 Days Churn',
        'Avg. FirstTryWinPercent', 'Avg. Repeat Ratio', 'Level Play Time',
        'Playon per User', 'RM Fixed', 'Avg. Total Moves', 'Inapp Value', 'Sıkıntısı'
    ];
    const mudahaleSheet = workbook.addWorksheet('Müdahale Listesi');
    // Add headers only
    mudahaleSheet.addRow(mudahaleHeaders);
    styleHeaderRow(mudahaleSheet, 1);
    setColumnWidths(mudahaleSheet);

    // Sheet 4: Uygulama Planı (empty with headers)
    const uygulamaHeaders = ['Level', 'Yapılacak'];
    const uygulamaSheet = workbook.addWorksheet('Uygulama Planı');
    uygulamaSheet.addRow(uygulamaHeaders);
    styleHeaderRow(uygulamaSheet, 1);
    setColumnWidths(uygulamaSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ========== 3 DAY CHURN ANALYSIS REPORT ==========

// 3 Day Churn report generator with ExcelJS styling
export async function generate3DayChurnExcelJSFromRaw(rawData: LevelRow[]): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LevelUp Dashboard';
    workbook.created = new Date();

    // Sort raw data by Level ascending
    const sortedData = [...rawData].sort((a, b) => {
        const levelA = toNum(a['Level']) || 0;
        const levelB = toNum(b['Level']) || 0;
        return levelA - levelB;
    });

    // Define headers for data sheets
    const dataHeaders = [
        'Level', 'FinalCluster', 'RevisionNumber', 'Müdahale Yapılanlar',
        'Level Score', 'TotalUser', 'Instant Churn', '3 Days Churn', '7 Days Churn',
        'Avg. FirstTryWinPercent', 'Avg. Repeat Ratio', 'Avg. Level Play Time',
        'Playon per User', 'PlayOnWinRatio', 'RM Total', 'Avg. Total Moves', 'Inapp Value'
    ];

    // Format data with proper columns
    const formattedData = sortedData.map(row => {
        const result: any = {};
        result['Level'] = toNum(row['Level']);
        result['FinalCluster'] = row['FinalCluster'] || row['FinalClusters'] || '';
        result['RevisionNumber'] = row['RevisionNumber'] || '';
        result['Müdahale Yapılanlar'] = '';
        result['Level Score'] = findMetricValue(row, 'Level Score');
        result['TotalUser'] = findMetricValue(row, 'TotalUser');
        result['Instant Churn'] = findMetricValue(row, 'Instant Churn');
        result['3 Days Churn'] = findMetricValue(row, '3 Days Churn');
        result['7 Days Churn'] = findMetricValue(row, '7 Days Churn');
        result['Avg. FirstTryWinPercent'] = findMetricValue(row, 'Avg. FirstTryWin') || findMetricValue(row, 'FirstTryWin');
        result['Avg. Repeat Ratio'] = findMetricValue(row, 'Avg. Repeat Rate') || findMetricValue(row, 'Repeat Rate');
        // Level Play Time - reference uses "Avg. Level Play Time", add "Level Play" as fallback
        result['Avg. Level Play Time'] = findMetricValue(row, 'Avg. Level Play Time') || findMetricValue(row, 'Level Play Time') || findMetricValue(row, 'Level Play');
        result['Playon per User'] = findMetricValue(row, 'Playon per User');
        // PlayOnWinRatio - just read from source data (it exists as column in Tableau)
        const playOnWinRatio = findMetricValue(row, 'PlayOnWinRatio');
        result['PlayOnWinRatio'] = isNaN(playOnWinRatio) ? '' : playOnWinRatio;
        result['RM Total'] = findMetricValue(row, 'RM Total') || findMetricValue(row, 'RM Fixed');
        result['Avg. Total Moves'] = findMetricValue(row, 'Avg. Total Moves');
        result['Inapp Value'] = findMetricValue(row, 'Inapp Value');
        return result;
    }).filter(r => !isNaN(r['Level']));

    // Sheet 1: RAW DATA (sorted by Level ascending)
    const rawSheet = workbook.addWorksheet('RAW DATA');
    addDataToSheet(rawSheet, formattedData, dataHeaders);

    // Sheet 2: Level Score Top Unsuccesfull (sorted by Level Score ASCENDING - lowest first)
    const levelScoreUnsuccess = [...formattedData]
        .filter(r => typeof r['Level Score'] === 'number' && !isNaN(r['Level Score']))
        .sort((a, b) => (a['Level Score'] || Infinity) - (b['Level Score'] || Infinity));
    const levelScoreUnsuccessSheet = workbook.addWorksheet('Level Score Top Unsuccesfull');
    addDataToSheet(levelScoreUnsuccessSheet, levelScoreUnsuccess, dataHeaders);

    // Sheet 3: Level Score Top Succesfull (sorted by Level Score DESCENDING - highest first)
    const levelScoreSuccess = [...formattedData]
        .filter(r => typeof r['Level Score'] === 'number' && !isNaN(r['Level Score']))
        .sort((a, b) => (b['Level Score'] || 0) - (a['Level Score'] || 0));
    const levelScoreSuccessSheet = workbook.addWorksheet('Level Score Top Succesfull');
    addDataToSheet(levelScoreSuccessSheet, levelScoreSuccess, dataHeaders);

    // Sheet 4: 3 Day Churn Top Unsuccesfull (sorted by 3 Days Churn ASCENDING - lowest churn first, meaning worst retention)
    const dayChurnUnsuccess = [...formattedData]
        .filter(r => typeof r['3 Days Churn'] === 'number' && !isNaN(r['3 Days Churn']))
        .sort((a, b) => (a['3 Days Churn'] || Infinity) - (b['3 Days Churn'] || Infinity));
    const dayChurnUnsuccessSheet = workbook.addWorksheet('3 Day Churn Top Unsuccesfull');
    addDataToSheet(dayChurnUnsuccessSheet, dayChurnUnsuccess, dataHeaders);

    // Sheet 5: Müdahale Listesi (empty with headers)
    const mudahaleHeaders = [
        'Level', 'FinalCluster', 'RevisionNumber', 'Müdahale Yapılanlar',
        'Level Score', 'TotalUser', 'Instant Churn', '3 Days Churn', '7 Days Churn',
        'Avg. FirstTryWinPercent', 'Avg. Repeat Ratio', 'Avg. Level Play Time',
        'Playon per User', 'PlayOnWinRatio', 'RM Total', 'Avg. Total Moves',
        'Inapp Value', 'Sıkıntısı', 'Yapılacak'
    ];
    const mudahaleSheet = workbook.addWorksheet('Müdahale Listesi');
    mudahaleSheet.addRow(mudahaleHeaders);
    styleHeaderRow(mudahaleSheet, 1);
    setColumnWidths(mudahaleSheet);

    // Sheet 6: Uygulama Planı (empty with headers)
    const uygulamaHeaders = ['Level', 'Yapılacak'];
    const uygulamaSheet = workbook.addWorksheet('Uygulama Planı');
    uygulamaSheet.addRow(uygulamaHeaders);
    styleHeaderRow(uygulamaSheet, 1);
    setColumnWidths(uygulamaSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
