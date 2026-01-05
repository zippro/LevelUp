"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import papa from 'papaparse';
import { supabase } from "@/lib/supabase";
import { formatTableValue } from "@/lib/table-reports";
import { format } from "date-fns";

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
}

interface GameData {
    gameId: string;
    gameName: string;
    data: any[];
    color: string;
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

const COLORS = [
    '#8B5CF6', // violet
    '#F59E0B', // amber
    '#10B981', // emerald
    '#EF4444', // red
    '#3B82F6', // blue
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#84CC16', // lime
];

// Line styles for different metrics (solid, dashed, dotted, etc.)
const LINE_STYLES = [
    '',           // solid
    '8 4',        // dashed
    '2 2',        // dotted
    '12 4 2 4',   // dash-dot
    '4 4',        // short dashed
    '1 3',        // sparse dotted
];

export default function AnalyzePage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [selectedGames, setSelectedGames] = useState<string[]>([]);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([METRICS[0].id]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [gameDataList, setGameDataList] = useState<GameData[]>([]);
    const [showGameDropdown, setShowGameDropdown] = useState(false);
    const [showMetricDropdown, setShowMetricDropdown] = useState(false);

    // Level range filter
    const [minLevel, setMinLevel] = useState<number>(1);
    const [maxLevel, setMaxLevel] = useState<number>(100);

    // Cache dialog state
    const [showCacheDialog, setShowCacheDialog] = useState(false);
    const [cachedFiles, setCachedFiles] = useState<{ gameId: string; gameName: string; fileName: string; createdAt: Date }[]>([]);
    const [pendingFreshFetch, setPendingFreshFetch] = useState(false);

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));
    }, []);

    // Get games that have Bolgesel Rapor view mapping
    const availableGames = config?.games.filter(
        (g) => g.viewMappings && g.viewMappings["Bolgesel Rapor"]
    ) || [];

    // Toggle game selection
    const toggleGameSelection = (gameId: string) => {
        setSelectedGames(prev =>
            prev.includes(gameId)
                ? prev.filter(id => id !== gameId)
                : [...prev, gameId]
        );
    };

    // Toggle metric selection
    const toggleMetricSelection = (metricId: string) => {
        setSelectedMetrics(prev => {
            if (prev.includes(metricId)) {
                // Don't allow deselecting if it's the only one
                if (prev.length === 1) return prev;
                return prev.filter(id => id !== metricId);
            }
            return [...prev, metricId];
        });
    };

    // Helper to find metric value - tries multiple variations
    const findMetricValue = (row: any, metricName: string): number => {
        const keys = Object.keys(row);
        const lowerMetric = metricName.toLowerCase();

        // Define alternative names for metrics
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

        // Get search terms - metric itself plus any alternatives
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
    };

    // Check for cached data before loading
    const handleLoad = async () => {
        if (selectedGames.length === 0 || !config) return;

        // Check for cached files for selected games
        const { data: files } = await supabase.storage
            .from('data-repository')
            .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        const foundCached: { gameId: string; gameName: string; fileName: string; createdAt: Date }[] = [];

        for (const gameId of selectedGames) {
            const game = config.games.find(g => g.id === gameId);
            if (!game) continue;

            // Find any cached file for this game (from Pull Data, Tables, Analyze, etc.)
            const matchingFile = files?.find(f => {
                const lowerName = f.name.toLowerCase();
                const lowerGameName = game.name.toLowerCase();
                return lowerName.includes(lowerGameName);
            });

            if (matchingFile) {
                foundCached.push({
                    gameId,
                    gameName: game.name,
                    fileName: matchingFile.name,
                    createdAt: new Date(matchingFile.created_at)
                });
            }
        }

        if (foundCached.length > 0) {
            setCachedFiles(foundCached);
            setShowCacheDialog(true);
        } else {
            // No cached data, fetch fresh
            await loadData(true);
        }
    };

    // Load data with option to use cache or fetch fresh
    const loadData = async (forceFresh: boolean) => {
        if (selectedGames.length === 0 || !config) return;

        setLoading(true);
        setError(null);
        setGameDataList([]);
        setShowCacheDialog(false);

        try {
            const results: GameData[] = [];

            for (let i = 0; i < selectedGames.length; i++) {
                const gameId = selectedGames[i];
                const game = config.games.find(g => g.id === gameId);
                if (!game) continue;

                const gameName = game.name;
                let csvData: string | null = null;

                if (!forceFresh) {
                    // Try to use cached data
                    const { data: files } = await supabase.storage
                        .from('data-repository')
                        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

                    // Find any cached file for this game
                    const matchingFile = files?.find(f => {
                        const lowerName = f.name.toLowerCase();
                        const lowerGameName = gameName.toLowerCase();
                        return lowerName.includes(lowerGameName);
                    });

                    if (matchingFile) {
                        const { data: fileData } = await supabase.storage
                            .from('data-repository')
                            .download(matchingFile.name);

                        if (fileData) {
                            csvData = await fileData.text();
                        }
                    }
                }

                // If no cached data or force fresh, fetch from Tableau
                if (!csvData) {
                    const viewId = game.viewMappings?.["Bolgesel Rapor"];
                    if (!viewId) continue;

                    const response = await fetch("/api/sync-tableau", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ viewId, tableName: "level_design_data" }),
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(`Failed to fetch ${gameName}: ${result.error}`);
                    csvData = result.data;

                    // Auto-save to repository for future use
                    if (csvData) {
                        const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
                        const fileName = `${gameName} - Bolgesel Rapor - ${timestamp}.csv`;
                        await supabase.storage
                            .from('data-repository')
                            .upload(fileName, csvData, { contentType: 'text/csv', upsert: false });
                        console.log(`[Analyze] Auto-saved: ${fileName}`);
                    }
                }

                if (!csvData) continue;

                // Parse CSV
                const parsed = papa.parse(csvData, { header: true, skipEmptyLines: true });
                const rawData = parsed.data as any[];

                // Process data - get unique levels and aggregate
                const levelMap = new Map<number, any>();
                for (const row of rawData) {
                    const level = parseInt(row['Level']);
                    if (isNaN(level)) continue;

                    if (!levelMap.has(level)) {
                        levelMap.set(level, row);
                    }
                }

                // Convert to sorted array
                const processedData = Array.from(levelMap.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([level, row]) => ({
                        Level: level,
                        ...row
                    }));

                results.push({
                    gameId,
                    gameName,
                    data: processedData,
                    color: COLORS[i % COLORS.length]
                });
            }

            setGameDataList(results);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Prepare chart data - merge all games by level
    const chartData = useMemo(() => {
        if (gameDataList.length === 0) return [];

        // Get all unique levels across all games
        const allLevels = new Set<number>();
        gameDataList.forEach(gd => {
            gd.data.forEach(row => allLevels.add(row.Level));
        });

        // Sort levels and filter by range
        return Array.from(allLevels)
            .sort((a, b) => a - b)
            .filter(level => level >= minLevel && level <= maxLevel)
            .map(level => {
                const point: any = { Level: level };
                gameDataList.forEach(gd => {
                    const row = gd.data.find(r => r.Level === level);
                    if (row) {
                        // Add data for each selected metric
                        selectedMetrics.forEach(metric => {
                            const key = `${gd.gameName}_${metric}`;
                            point[key] = findMetricValue(row, metric);
                        });
                        // Store total user count for tooltip
                        point[`${gd.gameName}_TotalUser`] = findMetricValue(row, 'Total User');
                    }
                });
                return point;
            });
    }, [gameDataList, selectedMetrics, minLevel, maxLevel]);

    // Table data - show selected metric by level
    const tableData = useMemo(() => {
        return chartData.slice(0, 50);
    }, [chartData]);

    // Calculate dynamic Y-axis domain based on actual data values
    const yAxisDomain = useMemo(() => {
        if (chartData.length === 0 || gameDataList.length === 0) return [0, 1];

        let min = Infinity;
        let max = -Infinity;

        chartData.forEach(point => {
            gameDataList.forEach(gd => {
                selectedMetrics.forEach(metric => {
                    const key = `${gd.gameName}_${metric}`;
                    const value = point[key];
                    if (value !== undefined && value !== null) {
                        min = Math.min(min, value);
                        max = Math.max(max, value);
                    }
                });
            });
        });

        if (min === Infinity || max === -Infinity) return [0, 1];

        // Add 5% padding on each side
        const range = max - min;
        const padding = range * 0.05;
        return [Math.max(0, min - padding), Math.min(1, max + padding)];
    }, [chartData, gameDataList, selectedMetrics]);

    if (loadingConfig) return <div className="p-8 animate-pulse text-muted-foreground">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-destructive">Failed to load configuration.</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Cache Dialog */}
            {showCacheDialog && cachedFiles.length > 0 && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-2">Existing Data Found</h3>
                        <p className="text-muted-foreground mb-4">
                            Cached data found for {cachedFiles.length} game(s):
                        </p>
                        <div className="bg-muted/50 rounded-lg p-3 mb-4 max-h-[150px] overflow-auto">
                            {cachedFiles.map((cf, i) => (
                                <div key={i} className="text-sm mb-1">
                                    <span className="font-medium">{cf.gameName}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                        {format(cf.createdAt, "MMM d, HH:mm")}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Would you like to use saved data or fetch new data from Tableau?
                        </p>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => loadData(false)}
                            >
                                Use Saved Data
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={() => loadData(true)}
                            >
                                Fetch New Data
                            </Button>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-muted-foreground"
                            onClick={() => { setShowCacheDialog(false); setCachedFiles([]); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">Bölgesel Analyze</h1>
                <p className="text-muted-foreground">Compare metrics across games using Bölgesel data</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/40 rounded-xl border shadow-sm">
                {/* Multi-select Games Dropdown */}
                <div className="space-y-1.5 relative">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Games</label>
                    <Button
                        variant="outline"
                        onClick={() => setShowGameDropdown(!showGameDropdown)}
                        className="w-[250px] justify-between bg-background"
                    >
                        <span className="truncate">
                            {selectedGames.length === 0
                                ? "Select Games..."
                                : `${selectedGames.length} game(s) selected`}
                        </span>
                    </Button>
                    {showGameDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-[250px] bg-card border rounded-lg shadow-lg z-50 max-h-[300px] overflow-auto">
                            {availableGames.map(g => (
                                <label
                                    key={g.id}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={selectedGames.includes(g.id)}
                                        onChange={() => toggleGameSelection(g.id)}
                                    />
                                    <span className="text-sm">{g.name}</span>
                                </label>
                            ))}
                            {availableGames.length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No games with Bolgesel Rapor</div>
                            )}
                        </div>
                    )}
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
                <Button onClick={handleLoad} disabled={loading || selectedGames.length === 0} className="shadow-sm">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                    Load & Compare
                </Button>
            </div>

            {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                    {error}
                </div>
            )}

            {/* Chart */}
            {chartData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            {selectedMetrics.length === 1
                                ? `${METRICS.find(m => m.id === selectedMetrics[0])?.label} by Level`
                                : `${selectedMetrics.length} Metrics by Level`}
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
                                            // Format as percentage for churn metrics
                                            if (selectedMetrics.some(m => m.includes('Churn'))) {
                                                return `${(value * 100).toFixed(0)}%`;
                                            }
                                            return value.toFixed(2);
                                        }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                        formatter={(value: any, name: any, props: any) => {
                                            if (value === undefined || value === null) return ['-', name];

                                            // Extract game name from series name (format: "GameName - MetricLabel")
                                            const gameName = name.split(' - ')[0];
                                            const totalUsers = props.payload[`${gameName}_TotalUser`];
                                            const userSuffix = totalUsers ? ` (${Math.round(totalUsers).toLocaleString()} users)` : '';

                                            // Format as percentage for churn metrics
                                            if (name.includes('Churn')) {
                                                return [`${(Number(value) * 100).toFixed(2)}%${userSuffix}`, name];
                                            }
                                            return [`${Number(value).toFixed(4)}${userSuffix}`, name];
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                    {gameDataList.flatMap((gd, gameIdx) =>
                                        selectedMetrics.map((metric, metricIdx) => (
                                            <Line
                                                key={`${gd.gameId}_${metric}`}
                                                type="monotone"
                                                dataKey={`${gd.gameName}_${metric}`}
                                                name={`${gd.gameName} - ${METRICS.find(m => m.id === metric)?.label}`}
                                                stroke={COLORS[gameIdx % COLORS.length]}
                                                strokeWidth={metricIdx === 0 ? 3 : 2}
                                                strokeDasharray={LINE_STYLES[metricIdx % LINE_STYLES.length]}
                                                dot={false}
                                            />
                                        ))
                                    )}
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
                        <CardTitle>Comparison Data</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[400px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-bold">Level</TableHead>
                                        {gameDataList.flatMap(gd =>
                                            selectedMetrics.map(metric => (
                                                <TableHead key={`${gd.gameId}_${metric}`} className="font-bold" style={{ color: gd.color }}>
                                                    {gd.gameName} - {METRICS.find(m => m.id === metric)?.label}
                                                </TableHead>
                                            ))
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tableData.map((row, i) => (
                                        <TableRow key={i} className="hover:bg-muted/30">
                                            <TableCell className="font-medium">{row.Level}</TableCell>
                                            {gameDataList.flatMap(gd =>
                                                selectedMetrics.map(metric => {
                                                    const key = `${gd.gameName}_${metric}`;
                                                    return (
                                                        <TableCell key={`${gd.gameId}_${metric}`}>
                                                            {row[key] !== undefined
                                                                ? formatTableValue(row[key], metric)
                                                                : '-'
                                                            }
                                                        </TableCell>
                                                    );
                                                })
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {gameDataList.length === 0 && !loading && (
                <Card className="border-dashed">
                    <CardContent className="text-center py-16">
                        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">
                            Select games and click "Load & Compare" to see comparison chart
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
