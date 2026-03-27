"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, BarChart3, GitCompareArrows } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import papa from 'papaparse';
import { supabase } from "@/lib/supabase";
import { formatTableValue } from "@/lib/table-reports";
import { format } from "date-fns";

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
}

const METRICS = [
    { id: 'Instant Churn', label: 'Instant Churn' },
    { id: '3 Days Churn', label: '3 Day Churn' },
    { id: '7 Days Churn', label: '7 Day Churn' },
    { id: 'In App Value', label: 'In App Value' },
    { id: 'Playon per User', label: 'Playon per User' },
    { id: 'Repeat Rate', label: 'Average Repeat' },
    { id: 'Avg. FirstTryWinPercent', label: 'Avg First Try Win' },
    { id: 'Level Play Time', label: 'Avg Level Play Time' },
];

const AB_COLORS = {
    A: '#3B82F6', // blue
    B: '#F59E0B', // amber
};

// Line styles for multiple metrics
const LINE_STYLES = [
    '',           // solid
    '8 4',        // dashed
    '2 2',        // dotted
    '12 4 2 4',   // dash-dot
    '4 4',        // short dashed
    '1 3',        // sparse dotted
];

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-popover/95 backdrop-blur-sm border rounded-xl shadow-xl p-3 text-sm z-50 max-w-[400px]">
                <p className="font-bold mb-2 pb-1 border-b">Level {label}</p>
                <div className="space-y-1">
                    {payload.map((entry: any, index: number) => {
                        const name = entry.name;
                        const value = entry.value;
                        const color = entry.color;

                        // Extract group name from series name
                        const groupName = name.split(' - ')[0];
                        const totalUsers = entry.payload[`${groupName}_TotalUser`];
                        const userSuffix = totalUsers ? ` (${Math.round(totalUsers).toLocaleString()} users)` : '';

                        let formattedValue = `${Number(value).toFixed(4)}`;

                        if (name.includes('Churn')) {
                            formattedValue = `${(Number(value) * 100).toFixed(2)}%`;
                        } else if (name.includes('In App Value')) {
                            formattedValue = `${Number(value).toFixed(2)}`;
                        }

                        return (
                            <div key={index} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                <span className="font-medium text-muted-foreground">{name}:</span>
                                <span className="font-mono font-bold">
                                    {formattedValue}
                                    <span className="text-xs text-muted-foreground font-normal ml-1">{userSuffix}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

// Try to auto-detect the A/B grouping column
function detectGroupingColumn(data: any[], headers: string[]): string | null {
    // Known A/B grouping column names
    const knownNames = [
        'ab_test', 'ab test', 'variant', 'group', 'test group', 'test_group',
        'experiment', 'cohort', 'segment', 'version', 'ab', 'a/b',
        'ab_group', 'ab group', 'test', 'bucket'
    ];

    // 1. First try exact match with known names
    for (const header of headers) {
        const lower = header.toLowerCase().trim();
        if (knownNames.includes(lower)) {
            return header;
        }
    }

    // 2. Try partial match
    for (const header of headers) {
        const lower = header.toLowerCase().trim();
        if (lower.includes('variant') || lower.includes('ab_test') || lower.includes('ab test') ||
            lower.includes('test group') || lower.includes('experiment') || lower.includes('cohort') ||
            lower.includes('segment') || lower.includes('a/b')) {
            return header;
        }
    }

    // 3. Auto-detect: find columns with exactly 2 unique non-numeric, non-empty values
    for (const header of headers) {
        // Skip common dimension/metric columns
        const lower = header.toLowerCase();
        if (lower === 'level' || lower.includes('churn') || lower.includes('user') ||
            lower.includes('value') || lower.includes('score') || lower.includes('time') ||
            lower.includes('date') || lower.includes('playon') || lower.includes('repeat') ||
            lower.includes('firsttry') || lower.includes('play time') ||
            lower === 'measure names' || lower === 'measure values') {
            continue;
        }

        const uniqueValues = new Set<string>();
        for (const row of data) {
            const val = String(row[header] || '').trim();
            if (val !== '' && val !== 'null' && val !== 'undefined') {
                // Skip purely numeric values
                if (!isNaN(Number(val))) continue;
                uniqueValues.add(val);
            }
        }

        if (uniqueValues.size === 2) {
            return header;
        }
    }

    return null;
}

// Helper to find metric value
function findMetricValue(row: any, metricName: string): number {
    const keys = Object.keys(row);
    const lowerMetric = metricName.toLowerCase();

    const alternatives: Record<string, string[]> = {
        'repeat rate': ['repeat rate', 'repeat ratio', 'avg. repeat rate', 'avg. repeat ratio', 'repeatrate', 'repeatratio'],
        'total user': ['total user', 'total users', 'user count', 'users', 'count of users', 'distinct count of user id', 'cntd(user id)', 'user_count', 'totaluser'],
        'instant churn': ['instant churn', 'instantchurn', 'instant_churn', 'churn instant'],
        '3 days churn': ['3 days churn', '3 day churn', '3daychurn', '3_days_churn'],
        '7 days churn': ['7 days churn', '7 day churn', '7daychurn', '7_days_churn'],
        'in app value': ['in app value', 'inappvalue', 'in-app value', 'inapp_value', 'in app values'],
        'avg. firsttrywinpercent': ['avg. firsttrywinpercent', 'firsttrywinpercent', 'first try win', 'firsttrywins', 'avg first try', 'first try'],
        'level play time': ['level play time', 'levelplaytime', 'play time', 'avg level play time', 'avg. level play time'],
    };

    const searchTerms = [lowerMetric];
    for (const [key, alts] of Object.entries(alternatives)) {
        if (lowerMetric.includes(key.split(' ')[0])) {
            searchTerms.push(...alts);
        }
    }

    for (const key of keys) {
        const lowerKey = key.toLowerCase();
        const cleanLowerKey = lowerKey.replace(/\s+/g, '');
        for (const term of searchTerms) {
            const cleanTerm = term.replace(/\s+/g, '');
            if (lowerKey.includes(term) || term.includes(lowerKey.replace('avg. ', '')) || cleanLowerKey === cleanTerm) {
                const val = parseFloat(String(row[key]).replace(/[%,]/g, ''));
                return isNaN(val) ? 0 : val;
            }
        }
    }
    return 0;
}

export default function ABAnalyzePage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([METRICS[0].id]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // A/B data
    const [groupA, setGroupA] = useState<any[]>([]);
    const [groupB, setGroupB] = useState<any[]>([]);
    const [groupALabel, setGroupALabel] = useState<string>("A");
    const [groupBLabel, setGroupBLabel] = useState<string>("B");
    const [groupingColumn, setGroupingColumn] = useState<string | null>(null);
    const [availableGroupColumns, setAvailableGroupColumns] = useState<string[]>([]);
    const [allRawData, setAllRawData] = useState<any[]>([]);
    const [allHeaders, setAllHeaders] = useState<string[]>([]);

    // UI state
    const [showMetricDropdown, setShowMetricDropdown] = useState(false);
    const [minLevel, setMinLevel] = useState<number>(1);
    const [maxLevel, setMaxLevel] = useState<number>(100);

    // Cache dialog
    const [showCacheDialog, setShowCacheDialog] = useState(false);
    const [cachedFileName, setCachedFileName] = useState<string>("");
    const [cachedDate, setCachedDate] = useState<Date | null>(null);

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));
    }, []);

    // Games with Level A-B view mapping
    const availableGames = useMemo(() => {
        return config?.games.filter(g => g.viewMappings?.["Level A-B"]) || [];
    }, [config]);

    const toggleMetricSelection = (metricId: string) => {
        setSelectedMetrics(prev => {
            if (prev.includes(metricId)) {
                if (prev.length === 1) return prev;
                return prev.filter(id => id !== metricId);
            }
            return [...prev, metricId];
        });
    };

    // Split raw data into A/B groups
    const splitData = (data: any[], headers: string[], column: string) => {
        const uniqueValues = [...new Set(data.map(r => String(r[column] || '').trim()).filter(v => v !== ''))];

        if (uniqueValues.length < 2) {
            setError(`Grouping column "${column}" has less than 2 unique values.`);
            return;
        }

        const labelA = uniqueValues[0];
        const labelB = uniqueValues[1];

        setGroupALabel(labelA);
        setGroupBLabel(labelB);

        const processGroup = (rows: any[]) => {
            const levelMap = new Map<number, any>();
            for (const row of rows) {
                const level = parseInt(row['Level']);
                if (isNaN(level)) continue;
                if (!levelMap.has(level)) {
                    levelMap.set(level, row);
                }
            }
            return Array.from(levelMap.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([level, row]) => ({ Level: level, ...row }));
        };

        setGroupA(processGroup(data.filter(r => String(r[column] || '').trim() === labelA)));
        setGroupB(processGroup(data.filter(r => String(r[column] || '').trim() === labelB)));
        setGroupingColumn(column);
        setError(null);
    };

    // Check for cached data
    const handleLoad = async () => {
        if (!selectedGameId || !config) return;

        const game = config.games.find(g => g.id === selectedGameId);
        if (!game) return;

        setLoading(true);
        setError(null);

        // Check for cached data
        const { data: files } = await supabase.storage
            .from('data-repository')
            .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        const matchingFile = files?.find(f => {
            const lowerName = f.name.toLowerCase();
            return lowerName.includes(game.name.toLowerCase()) && lowerName.includes('level a-b');
        });

        if (matchingFile) {
            setLoading(false);
            setCachedFileName(matchingFile.name);
            setCachedDate(new Date(matchingFile.created_at));
            setShowCacheDialog(true);
        } else {
            await fetchFreshData();
        }
    };

    const loadCachedData = async () => {
        setShowCacheDialog(false);
        setLoading(true);
        setError(null);

        try {
            const { data: fileData } = await supabase.storage
                .from('data-repository')
                .download(cachedFileName);

            if (!fileData) throw new Error("Failed to download cached data");

            const csvText = await fileData.text();
            processCSVData(csvText);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchFreshData = async () => {
        setShowCacheDialog(false);
        if (!selectedGameId || !config) return;

        const game = config.games.find(g => g.id === selectedGameId);
        if (!game) return;

        const viewId = game.viewMappings?.["Level A-B"];
        if (!viewId) {
            setError("No Level A-B View ID configured for this game.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        setGroupA([]);
        setGroupB([]);

        try {
            const response = await fetch("/api/sync-tableau", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ viewId, tableName: "level_ab_data" }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to fetch data");

            // Auto-save to repository
            if (result.data) {
                const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
                const fileName = `${game.name} - Level A-B - ${timestamp}.csv`;
                await supabase.storage
                    .from('data-repository')
                    .upload(fileName, result.data, { contentType: 'text/csv', upsert: false });
            }

            processCSVData(result.data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const processCSVData = (csvData: string) => {
        const parsed = papa.parse(csvData, { header: true, skipEmptyLines: true });
        const rawData = parsed.data as any[];
        const headers = parsed.meta.fields || [];

        setAllRawData(rawData);
        setAllHeaders(headers);

        // Find candidate grouping columns
        const candidates: string[] = [];
        for (const header of headers) {
            const lower = header.toLowerCase();
            if (lower === 'level' || lower.includes('measure')) continue;

            const uniqueValues = new Set<string>();
            for (const row of rawData) {
                const val = String(row[header] || '').trim();
                if (val !== '' && val !== 'null' && val !== 'undefined' && isNaN(Number(val))) {
                    uniqueValues.add(val);
                }
            }
            if (uniqueValues.size >= 2 && uniqueValues.size <= 10) {
                candidates.push(header);
            }
        }
        setAvailableGroupColumns(candidates);

        // Auto-detect grouping column
        const detected = detectGroupingColumn(rawData, headers);

        if (detected) {
            splitData(rawData, headers, detected);
        } else if (candidates.length > 0) {
            // Use first candidate
            splitData(rawData, headers, candidates[0]);
        } else {
            setError("Could not auto-detect A/B grouping column. The data may not contain an A/B variant indicator.");
        }
    };

    // When user manually selects a grouping column
    const handleGroupingColumnChange = (column: string) => {
        if (allRawData.length > 0) {
            splitData(allRawData, allHeaders, column);
        }
    };

    // Prepare chart data - merge A/B by level
    const chartData = useMemo(() => {
        if (groupA.length === 0 && groupB.length === 0) return [];

        const allLevels = new Set<number>();
        groupA.forEach(row => allLevels.add(row.Level));
        groupB.forEach(row => allLevels.add(row.Level));

        return Array.from(allLevels)
            .sort((a, b) => a - b)
            .filter(level => level >= minLevel && level <= maxLevel)
            .map(level => {
                const point: any = { Level: level };
                const rowA = groupA.find(r => r.Level === level);
                const rowB = groupB.find(r => r.Level === level);

                if (rowA) {
                    selectedMetrics.forEach(metric => {
                        point[`${groupALabel}_${metric}`] = findMetricValue(rowA, metric);
                    });
                    point[`${groupALabel}_TotalUser`] = findMetricValue(rowA, 'Total User');
                }

                if (rowB) {
                    selectedMetrics.forEach(metric => {
                        point[`${groupBLabel}_${metric}`] = findMetricValue(rowB, metric);
                    });
                    point[`${groupBLabel}_TotalUser`] = findMetricValue(rowB, 'Total User');
                }

                return point;
            });
    }, [groupA, groupB, groupALabel, groupBLabel, selectedMetrics, minLevel, maxLevel]);

    const tableData = useMemo(() => chartData.slice(0, 50), [chartData]);

    // Calculate dynamic Y-axis domain
    const yAxisDomain = useMemo(() => {
        if (chartData.length === 0) return [0, 1];

        let min = Infinity;
        let max = -Infinity;

        chartData.forEach(point => {
            [groupALabel, groupBLabel].forEach(label => {
                selectedMetrics.forEach(metric => {
                    const key = `${label}_${metric}`;
                    const value = point[key];
                    if (value !== undefined && value !== null) {
                        min = Math.min(min, value);
                        max = Math.max(max, value);
                    }
                });
            });
        });

        if (min === Infinity || max === -Infinity) return [0, 1];
        const range = max - min;
        const padding = range * 0.05;
        return [Math.max(0, min - padding), max + padding];
    }, [chartData, groupALabel, groupBLabel, selectedMetrics]);

    if (loadingConfig) return <div className="p-8 animate-pulse text-muted-foreground">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-destructive">Failed to load configuration.</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Cache Dialog */}
            {showCacheDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-2">Existing Data Found</h3>
                        <div className="bg-muted/50 rounded-lg p-3 mb-4">
                            <p className="font-medium text-sm">{cachedFileName}</p>
                            {cachedDate && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    {format(cachedDate, "MMMM d, yyyy 'at' HH:mm")}
                                </p>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Would you like to use this saved data or fetch new data from Tableau?
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={loadCachedData}>
                                Use Saved Data
                            </Button>
                            <Button className="flex-1" onClick={fetchFreshData}>
                                Fetch New Data
                            </Button>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-muted-foreground"
                            onClick={() => { setShowCacheDialog(false); setLoading(false); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <GitCompareArrows className="h-6 w-6" />
                    A/B Compare
                </h1>
                <p className="text-muted-foreground">Compare A vs B variant metrics per level within a game</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/40 rounded-xl border shadow-sm">
                {/* Game Select */}
                <div className="space-y-1.5 w-full sm:w-[220px]">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Game</label>
                    <Select
                        value={selectedGameId || ""}
                        onValueChange={setSelectedGameId}
                    >
                        <SelectTrigger className="bg-background shadow-sm border-muted-foreground/20">
                            <SelectValue placeholder="Select a Game..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableGames.map(g => (
                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                            {availableGames.length === 0 && (
                                <SelectItem value="none" disabled>No games with A/B data</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                {/* Multi-select Metrics Dropdown */}
                <div className="space-y-1.5 relative">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metrics</label>
                    <Button
                        variant="outline"
                        onClick={() => setShowMetricDropdown(!showMetricDropdown)}
                        className="w-[200px] justify-between bg-background"
                    >
                        <span className="truncate">
                            {selectedMetrics.length === 0
                                ? "Select Metrics..."
                                : `${selectedMetrics.length} metric(s) selected`}
                        </span>
                    </Button>
                    {showMetricDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-[250px] bg-card border rounded-lg shadow-lg z-50 max-h-[300px] overflow-auto">
                            {METRICS.map(m => (
                                <label
                                    key={m.id}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={selectedMetrics.includes(m.id)}
                                        onChange={() => toggleMetricSelection(m.id)}
                                    />
                                    <span className="text-sm">{m.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Grouping Column Selector (shown after data loads) */}
                {availableGroupColumns.length > 0 && (
                    <div className="space-y-1.5 w-full sm:w-[200px]">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">A/B Column</label>
                        <Select
                            value={groupingColumn || ""}
                            onValueChange={handleGroupingColumnChange}
                        >
                            <SelectTrigger className="bg-background shadow-sm border-muted-foreground/20">
                                <SelectValue placeholder="Auto-detected" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableGroupColumns.map(col => (
                                    <SelectItem key={col} value={col}>{col}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Level Range */}
                <div className="flex items-end gap-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Min Level</label>
                        <Input
                            type="number"
                            value={minLevel}
                            onChange={(e) => setMinLevel(parseInt(e.target.value) || 1)}
                            min={1}
                            className="w-[80px] bg-background shadow-sm"
                        />
                    </div>
                    <span className="text-muted-foreground pb-2">-</span>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Max Level</label>
                        <Input
                            type="number"
                            value={maxLevel}
                            onChange={(e) => setMaxLevel(parseInt(e.target.value) || 100)}
                            min={1}
                            className="w-[80px] bg-background shadow-sm"
                        />
                    </div>
                </div>

                {/* Load Button */}
                <Button onClick={handleLoad} disabled={loading || !selectedGameId} className="shadow-sm">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                    Load & Compare
                </Button>
            </div>

            {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                    {error}
                </div>
            )}

            {/* Group Labels */}
            {(groupA.length > 0 || groupB.length > 0) && (
                <div className="flex items-center gap-4 px-1">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-1 rounded-full" style={{ backgroundColor: AB_COLORS.A }} />
                        <span className="text-sm font-medium">{groupALabel}</span>
                        <span className="text-xs text-muted-foreground">({groupA.length} levels)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-1 rounded-full" style={{ backgroundColor: AB_COLORS.B }} />
                        <span className="text-sm font-medium">{groupBLabel}</span>
                        <span className="text-xs text-muted-foreground">({groupB.length} levels)</span>
                    </div>
                    {groupingColumn && (
                        <span className="text-xs text-muted-foreground ml-auto">
                            Grouped by: <span className="font-mono font-medium">{groupingColumn}</span>
                        </span>
                    )}
                </div>
            )}

            {/* Chart */}
            {chartData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <GitCompareArrows className="h-5 w-5" />
                            {selectedMetrics.length === 1
                                ? `${METRICS.find(m => m.id === selectedMetrics[0])?.label}: ${groupALabel} vs ${groupBLabel}`
                                : `${selectedMetrics.length} Metrics: ${groupALabel} vs ${groupBLabel}`}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis
                                        dataKey="Level"
                                        tick={{ fontSize: 12 }}
                                        label={{ value: 'Level', position: 'bottom', offset: -5 }}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        domain={yAxisDomain}
                                        tickFormatter={(value) => {
                                            if (selectedMetrics.some(m => m.includes('Churn'))) {
                                                return `${(value * 100).toFixed(0)}%`;
                                            }
                                            return value.toFixed(2);
                                        }}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                    {selectedMetrics.flatMap((metric, metricIdx) => [
                                        <Line
                                            key={`A_${metric}`}
                                            type="monotone"
                                            dataKey={`${groupALabel}_${metric}`}
                                            name={`${groupALabel} - ${METRICS.find(m => m.id === metric)?.label}`}
                                            stroke={AB_COLORS.A}
                                            strokeWidth={metricIdx === 0 ? 3 : 2}
                                            strokeDasharray={LINE_STYLES[metricIdx % LINE_STYLES.length]}
                                            dot={false}
                                        />,
                                        <Line
                                            key={`B_${metric}`}
                                            type="monotone"
                                            dataKey={`${groupBLabel}_${metric}`}
                                            name={`${groupBLabel} - ${METRICS.find(m => m.id === metric)?.label}`}
                                            stroke={AB_COLORS.B}
                                            strokeWidth={metricIdx === 0 ? 3 : 2}
                                            strokeDasharray={LINE_STYLES[metricIdx % LINE_STYLES.length]}
                                            dot={false}
                                        />,
                                    ])}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Comparison Table */}
            {tableData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>A/B Comparison Data</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[400px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-bold">Level</TableHead>
                                        {/* A columns */}
                                        <TableHead className="font-bold border-l" style={{ color: AB_COLORS.A }}>
                                            {groupALabel} - Users
                                        </TableHead>
                                        {selectedMetrics.map(metric => (
                                            <TableHead key={`A_${metric}`} className="font-bold" style={{ color: AB_COLORS.A }}>
                                                {groupALabel} - {METRICS.find(m => m.id === metric)?.label}
                                            </TableHead>
                                        ))}
                                        {/* B columns */}
                                        <TableHead className="font-bold border-l" style={{ color: AB_COLORS.B }}>
                                            {groupBLabel} - Users
                                        </TableHead>
                                        {selectedMetrics.map(metric => (
                                            <TableHead key={`B_${metric}`} className="font-bold" style={{ color: AB_COLORS.B }}>
                                                {groupBLabel} - {METRICS.find(m => m.id === metric)?.label}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tableData.map((row, i) => (
                                        <TableRow key={i} className="hover:bg-muted/30">
                                            <TableCell className="font-medium">{row.Level}</TableCell>
                                            {/* A values */}
                                            <TableCell className="border-l bg-blue-50/30 font-mono text-xs">
                                                {row[`${groupALabel}_TotalUser`] !== undefined
                                                    ? Math.round(row[`${groupALabel}_TotalUser`]).toLocaleString()
                                                    : '-'}
                                            </TableCell>
                                            {selectedMetrics.map(metric => (
                                                <TableCell key={`A_${metric}`}>
                                                    {row[`${groupALabel}_${metric}`] !== undefined
                                                        ? formatTableValue(row[`${groupALabel}_${metric}`], metric)
                                                        : '-'}
                                                </TableCell>
                                            ))}
                                            {/* B values */}
                                            <TableCell className="border-l bg-amber-50/30 font-mono text-xs">
                                                {row[`${groupBLabel}_TotalUser`] !== undefined
                                                    ? Math.round(row[`${groupBLabel}_TotalUser`]).toLocaleString()
                                                    : '-'}
                                            </TableCell>
                                            {selectedMetrics.map(metric => (
                                                <TableCell key={`B_${metric}`}>
                                                    {row[`${groupBLabel}_${metric}`] !== undefined
                                                        ? formatTableValue(row[`${groupBLabel}_${metric}`], metric)
                                                        : '-'}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {groupA.length === 0 && groupB.length === 0 && !loading && (
                <Card className="border-dashed">
                    <CardContent className="text-center py-16">
                        <GitCompareArrows className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">
                            Select a game with A/B data and click "Load & Compare"
                        </p>
                        {availableGames.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                                No games have "Level A-B" view mapping configured. Add one in Settings → Data Configuration → Game → Configure IDs.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
