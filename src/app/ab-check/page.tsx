"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, GitCompareArrows, Download, Settings2, ArrowUpDown, Eye, EyeOff } from "lucide-react";
import papa from 'papaparse';
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
    weeklyCheck?: {
        minTotalUser?: number;
        minLevel?: number;
        minDaysSinceEvent?: number;
    };
    abCheck?: {
        minTotalUser?: number;
        minLevel?: number;
        minDaysSinceEvent?: number;
        showOnly9xx?: boolean;
        columnOrder?: string[];
        hiddenColumns?: string[];
    };
}

const normalizeHeader = (h: string) => h.toLowerCase().trim();

const getCol = (row: any, ...names: string[]) => {
    const keys = Object.keys(row);
    for (const name of names) {
        const normalizedCandidate = normalizeHeader(name);
        const actualKey = keys.find(k => {
            const normKey = normalizeHeader(k);
            return normKey === normalizedCandidate || normKey.includes(normalizedCandidate);
        });
        if (actualKey && row[actualKey] !== undefined) return row[actualKey];
    }
    return '';
};

// Metric columns to display for each A/B group
const AB_METRICS = [
    { id: 'TotalUser', label: 'Users', aliases: ['totaluser', 'total user', 'total users'] },
    { id: '3 Days Churn', label: '3 Day Churn', aliases: ['3 days churn', '3 day churn', '3daychurn'] },
    { id: 'Instant Churn', label: 'Instant Churn', aliases: ['instant churn', 'instantchurn'] },
    { id: '7 Days Churn', label: '7 Day Churn', aliases: ['7 days churn', '7 day churn', '7daychurn'] },
    { id: 'Playon per User', label: 'Playon/User', aliases: ['playon per user', 'playonperuser'] },
    { id: 'Repeat Rate', label: 'Repeat', aliases: ['avg. repeat rate', 'avg repeat rate', 'repeat rate', 'repeat ratio', 'avg. repeat ratio'] },
    { id: 'In App Value', label: 'In App Value', aliases: ['inapp value', 'in app value', 'inappvalue', 'in-app value', 'in app values'] },
    { id: 'Avg. FirstTryWin', label: '1st Try Win', aliases: ['avg. firsttrywin', 'firsttrywin', 'avg. firsttrywinpercent', 'firsttrywinpercent', 'first try win', 'avg first try win'] },
    { id: 'Level Play Time', label: 'Play Time', aliases: ['avg. level play', 'avg level play', 'level play time', 'levelplaytime', 'avg level play time', 'avg. level play time'] },
    { id: 'Total Move', label: 'Moves', aliases: ['avg. total moves', 'avg total moves', 'total move', 'totalmove', 'total moves'] },
    { id: 'RM Fixed', label: 'RM', aliases: ['avg. rm fixed', 'avg rm fixed', 'rm fixed', 'rm total', 'average remaining move', 'remaining move', 'remaining moves'] },
    { id: 'Engagement Score', label: 'Engagement', aliases: ['engagement score', 'engagement_score', 'engagement'] },
    { id: 'Monetization Score', label: 'Monetization', aliases: ['monetization score', 'monetization_score', 'monetization'] },
    { id: 'Satisfaction Score', label: 'Satisfaction', aliases: ['satisfaction score', 'satisfaction_score', 'satisfaction'] },
    { id: 'RevisionNumber', label: 'Rev#', aliases: ['revision number', 'revisionnumber', 'revision'] },
];

function findMetricInRow(row: any, metric: typeof AB_METRICS[0]): string {
    const keys = Object.keys(row);
    for (const alias of metric.aliases) {
        const matchKey = keys.find(k => normalizeHeader(k) === alias);
        if (matchKey && row[matchKey] !== undefined && row[matchKey] !== '') return String(row[matchKey]);
    }
    for (const alias of metric.aliases) {
        const matchKey = keys.find(k => normalizeHeader(k).includes(alias) || alias.includes(normalizeHeader(k)));
        if (matchKey && row[matchKey] !== undefined && row[matchKey] !== '') return String(row[matchKey]);
    }
    return '-';
}

function getNumericValue(value: string): number {
    if (value === '-' || value === '' || value === 'undefined' || value === 'null') return NaN;
    return parseFloat(value.replace(/[%,]/g, ''));
}

function formatMetricValue(value: string, metricId: string): string {
    if (value === '-' || value === '' || value === 'undefined' || value === 'null') return '-';
    const num = parseFloat(value.replace(/[%,]/g, ''));
    if (isNaN(num)) return value;

    if (metricId.includes('Churn')) {
        return num > 1 ? `${num.toFixed(2)}%` : `${(num * 100).toFixed(2)}%`;
    }
    if (metricId === 'TotalUser') return Math.round(num).toLocaleString();
    if (metricId === 'RevisionNumber') return String(Math.round(num));
    return num.toFixed(2);
}

// Auto-detect grouping column
function detectGroupingColumn(data: any[], headers: string[]): string | null {
    const knownNames = ['level variant', 'variant', 'ab_test', 'ab test', 'group', 'test group', 'test_group', 'experiment', 'cohort', 'segment', 'version', 'ab', 'a/b'];

    for (const header of headers) {
        const lower = normalizeHeader(header);
        if (knownNames.includes(lower)) return header;
    }

    for (const header of headers) {
        const lower = normalizeHeader(header);
        if (lower.includes('variant') || lower.includes('ab_test') || lower.includes('ab test') ||
            lower.includes('test group') || lower.includes('experiment') || lower.includes('a/b')) {
            return header;
        }
    }

    for (const header of headers) {
        const lower = normalizeHeader(header);
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
            if (val && val !== 'null' && val !== 'undefined' && isNaN(Number(val))) {
                uniqueValues.add(val);
            }
        }
        if (uniqueValues.size === 2) return header;
    }

    return null;
}

type ViewMode = 'split' | 'interleaved';

export default function ABCheckPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Raw A/B data
    const [groupAData, setGroupAData] = useState<any[]>([]);
    const [groupBData, setGroupBData] = useState<any[]>([]);
    const [groupALabel, setGroupALabel] = useState("A");
    const [groupBLabel, setGroupBLabel] = useState("B");
    const [groupingColumn, setGroupingColumn] = useState<string | null>(null);

    // View mode
    const [viewMode, setViewMode] = useState<ViewMode>('split');

    // Filters
    const [minTotalUser, setMinTotalUser] = useState(50);
    const [minLevel, setMinLevel] = useState(0);
    const [minDaysSinceEvent, setMinDaysSinceEvent] = useState(0);
    const [finalClusters, setFinalClusters] = useState<string[]>(['1', '2', '3', '4', 'None']);
    const [showOnly9xx, setShowOnly9xx] = useState(false);

    // Column customization
    const [visibleMetrics, setVisibleMetrics] = useState<string[]>(AB_METRICS.map(m => m.id));
    const [showColumnSettings, setShowColumnSettings] = useState(false);

    // Bigger function
    const [biggerMetric, setBiggerMetric] = useState<string | null>(null);

    // Cache dialog
    const [showCacheDialog, setShowCacheDialog] = useState(false);
    const [cachedFileName, setCachedFileName] = useState("");
    const [cachedDate, setCachedDate] = useState<Date | null>(null);

    useEffect(() => {
        fetch("/api/config")
            .then(res => res.json())
            .then((data: Config) => {
                setConfig(data);
                const abCfg = data.abCheck;
                const wcCfg = data.weeklyCheck;
                setMinTotalUser(abCfg?.minTotalUser ?? wcCfg?.minTotalUser ?? 50);
                setMinLevel(abCfg?.minLevel ?? wcCfg?.minLevel ?? 0);
                setMinDaysSinceEvent(abCfg?.minDaysSinceEvent ?? wcCfg?.minDaysSinceEvent ?? 0);
                if (abCfg?.showOnly9xx !== undefined) setShowOnly9xx(abCfg.showOnly9xx);
                setLoadingConfig(false);
            })
            .catch(e => console.error(e));
    }, []);

    const availableGames = useMemo(() => {
        return config?.games.filter(g => g.viewMappings?.["Level A-B"]) || [];
    }, [config]);

    const activeMetrics = useMemo(() => {
        return AB_METRICS.filter(m => visibleMetrics.includes(m.id));
    }, [visibleMetrics]);

    const handleLoad = async () => {
        if (!selectedGameId || !config) return;
        const game = config.games.find(g => g.id === selectedGameId);
        if (!game) return;

        setLoading(true);
        setError(null);

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
            processCSVData(await fileData.text());
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
        setGroupAData([]);
        setGroupBData([]);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch("/api/sync-tableau", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ viewId, tableName: "level_ab_data" }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                let msg = `Server error (${response.status})`;
                try { const r = await response.json(); msg = r.error || msg; } catch { }
                throw new Error(msg);
            }

            const result = await response.json();
            if (!result.data) throw new Error("No data returned from Tableau.");

            try {
                const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
                const fileName = `${game.name} - Level A-B - ${timestamp}.csv`;
                await supabase.storage.from('data-repository').upload(fileName, result.data, { contentType: 'text/csv', upsert: false });
            } catch { }

            processCSVData(result.data);
        } catch (err: any) {
            if (err.name === 'AbortError') {
                setError("Request timed out. Try again or use cached data.");
            } else if (err.message === 'Failed to fetch') {
                setError("Network error: Could not connect to the server.");
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const processCSVData = (csvData: string) => {
        const parsed = papa.parse(csvData, { header: true, skipEmptyLines: true });
        const rawData = parsed.data as any[];
        const headers = parsed.meta.fields || [];

        const detected = detectGroupingColumn(rawData, headers);
        if (!detected) {
            setError("Could not detect A/B grouping column in the data.");
            return;
        }

        setGroupingColumn(detected);
        const uniqueValues = [...new Set(rawData.map(r => String(r[detected] || '').trim()).filter(v => v !== ''))];
        if (uniqueValues.length < 2) {
            setError(`Grouping column "${detected}" has less than 2 unique values.`);
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
                if (!levelMap.has(level)) levelMap.set(level, row);
            }
            return Array.from(levelMap.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([level, row]) => ({ Level: level, ...row }));
        };

        setGroupAData(processGroup(rawData.filter(r => String(r[detected] || '').trim() === labelA)));
        setGroupBData(processGroup(rawData.filter(r => String(r[detected] || '').trim() === labelB)));
        setError(null);
    };

    // Build merged table data: match A/B by level
    const tableData = useMemo(() => {
        const allLevels = new Set<number>();
        groupAData.forEach(r => allLevels.add(r.Level));
        groupBData.forEach(r => allLevels.add(r.Level));

        return Array.from(allLevels)
            .sort((a, b) => a - b)
            .filter(level => level >= minLevel)
            .map(level => {
                const rowA = groupAData.find(r => r.Level === level);
                const rowB = groupBData.find(r => r.Level === level);
                return { level, rowA, rowB };
            })
            .filter(({ level, rowA, rowB }) => {
                const getUserCount = (row: any) => {
                    if (!row) return 0;
                    const val = findMetricInRow(row, AB_METRICS[0]);
                    return parseInt(String(val).replace(/[.,]/g, '')) || 0;
                };
                const usersA = getUserCount(rowA);
                const usersB = getUserCount(rowB);
                if (usersA < minTotalUser && usersB < minTotalUser) return false;

                if (minDaysSinceEvent > 0) {
                    const getDate = (row: any) => {
                        if (!row) return null;
                        const val = getCol(row, 'Min. Time Event', 'Min Time Event', 'Min Event Time');
                        if (!val) return null;
                        const str = String(val).trim();
                        const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                        if (slashMatch) return new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
                        const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                        if (dashMatch) return new Date(parseInt(dashMatch[1]), parseInt(dashMatch[2]) - 1, parseInt(dashMatch[3]));
                        return null;
                    };
                    const dateA = getDate(rowA);
                    const dateB = getDate(rowB);
                    const now = new Date();
                    const daysSince = (d: Date | null) => d ? Math.floor((now.getTime() - d.getTime()) / 86400000) : 999;
                    if (daysSince(dateA) < minDaysSinceEvent && daysSince(dateB) < minDaysSinceEvent) return false;
                }

                if (finalClusters.length < 5) {
                    const getCluster = (row: any) => {
                        if (!row) return '';
                        return String(getCol(row, 'Final Cluster', 'FinalCluster', 'Clu', 'cluster') || '').trim();
                    };
                    const cluA = getCluster(rowA);
                    const cluB = getCluster(rowB);
                    const passesCluster = (c: string) => {
                        if (!c) return finalClusters.includes('None');
                        return finalClusters.includes(c);
                    };
                    if (!passesCluster(cluA) && !passesCluster(cluB)) return false;
                }

                // Rev 9xx filter: "Show only 9xx" mode
                if (showOnly9xx) {
                    const revMetric = AB_METRICS.find(m => m.id === 'RevisionNumber')!;
                    const getRevision = (row: any) => {
                        if (!row) return '';
                        return findMetricInRow(row, revMetric);
                    };
                    const revA = getRevision(rowA);
                    const revB = getRevision(rowB);
                    const is9xx = (r: string) => {
                        const num = parseInt(r);
                        return !isNaN(num) && num >= 900 && num <= 999;
                    };
                    // When showOnly9xx is ON, ONLY keep rows where at least one has 9xx
                    if (!is9xx(revA) && !is9xx(revB)) return false;
                }

                return true;
            });
    }, [groupAData, groupBData, minLevel, minTotalUser, minDaysSinceEvent, finalClusters, showOnly9xx]);

    // Determine which variant is "bigger" for each level
    const biggerMap = useMemo(() => {
        if (!biggerMetric) return {};
        const metric = AB_METRICS.find(m => m.id === biggerMetric);
        if (!metric) return {};

        const result: Record<number, 'A' | 'B' | null> = {};
        tableData.forEach(({ level, rowA, rowB }) => {
            const valA = rowA ? getNumericValue(findMetricInRow(rowA, metric)) : NaN;
            const valB = rowB ? getNumericValue(findMetricInRow(rowB, metric)) : NaN;
            if (isNaN(valA) && isNaN(valB)) { result[level] = null; return; }
            if (isNaN(valA)) { result[level] = 'B'; return; }
            if (isNaN(valB)) { result[level] = 'A'; return; }
            if (valA > valB) result[level] = 'A';
            else if (valB > valA) result[level] = 'B';
            else result[level] = null;
        });
        return result;
    }, [biggerMetric, tableData]);

    if (loadingConfig) return <div className="p-8 animate-pulse text-muted-foreground">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-destructive">Failed to load configuration.</div>;

    const toggleMetric = (metricId: string) => {
        setVisibleMetrics(prev =>
            prev.includes(metricId) ? prev.filter(m => m !== metricId) : [...prev, metricId]
        );
    };

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
                        <p className="text-sm text-muted-foreground mb-4">Use saved data or fetch fresh from Tableau?</p>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={loadCachedData}>Use Saved Data</Button>
                            <Button className="flex-1" onClick={fetchFreshData}>Fetch New Data</Button>
                        </div>
                        <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground"
                            onClick={() => { setShowCacheDialog(false); setLoading(false); }}>Cancel</Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <GitCompareArrows className="h-6 w-6" />
                    AB Check
                </h1>
                <p className="text-muted-foreground">Compare A vs B variant data per level</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/40 rounded-xl border shadow-sm">
                <div className="space-y-1.5 w-full sm:w-[220px]">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Game</label>
                    <Select value={selectedGameId || ""} onValueChange={setSelectedGameId}>
                        <SelectTrigger className="bg-background shadow-sm">
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

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Min Users</label>
                    <Input type="number" value={minTotalUser} onChange={e => setMinTotalUser(parseInt(e.target.value) || 0)}
                        className="w-[80px] bg-background shadow-sm" />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Min Level</label>
                    <Input type="number" value={minLevel} onChange={e => setMinLevel(parseInt(e.target.value) || 0)}
                        className="w-[80px] bg-background shadow-sm" />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Min Days</label>
                    <Input type="number" value={minDaysSinceEvent} onChange={e => setMinDaysSinceEvent(parseInt(e.target.value) || 0)}
                        className="w-[80px] bg-background shadow-sm" />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clusters</label>
                    <div className="flex gap-1">
                        {['1', '2', '3', '4', 'None'].map(c => (
                            <Button
                                key={c}
                                variant={finalClusters.includes(c) ? "default" : "outline"}
                                size="sm"
                                className="h-8 w-8 p-0 text-xs"
                                onClick={() => {
                                    setFinalClusters(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
                                }}
                            >
                                {c === 'None' ? '-' : c}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Rev 9xx: Show Only 9xx */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Only 9xx</label>
                    <Button
                        variant={showOnly9xx ? "default" : "outline"}
                        size="sm"
                        className={cn("h-9", showOnly9xx && "bg-violet-600 hover:bg-violet-700")}
                        onClick={() => setShowOnly9xx(!showOnly9xx)}
                    >
                        {showOnly9xx ? "Active" : "Off"}
                    </Button>
                </div>

                <Button onClick={handleLoad} disabled={loading || !selectedGameId} className="shadow-sm">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompareArrows className="mr-2 h-4 w-4" />}
                    Load Data
                </Button>
            </div>

            {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">{error}</div>
            )}

            {/* View mode tabs + Column settings + Bigger function */}
            {(groupAData.length > 0 || groupBData.length > 0) && (
                <div className="space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Stats */}
                        <span className="font-medium text-blue-600 text-sm">{groupALabel}: {groupAData.length} levels</span>
                        <span className="font-medium text-amber-600 text-sm">{groupBLabel}: {groupBData.length} levels</span>
                        <span className="text-muted-foreground text-sm">|</span>
                        <span className="text-muted-foreground text-sm">Showing {tableData.length} levels</span>

                        <div className="ml-auto flex items-center gap-2">
                            {/* Column Settings Toggle */}
                            <Button
                                variant={showColumnSettings ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowColumnSettings(!showColumnSettings)}
                                className="gap-1.5"
                            >
                                <Settings2 className="h-3.5 w-3.5" />
                                Columns
                            </Button>

                            {/* View mode toggle */}
                            <div className="flex rounded-lg border overflow-hidden">
                                <button
                                    className={cn("px-3 py-1.5 text-xs font-medium transition-colors",
                                        viewMode === 'split' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                                    onClick={() => setViewMode('split')}
                                >
                                    Split View
                                </button>
                                <button
                                    className={cn("px-3 py-1.5 text-xs font-medium transition-colors border-l",
                                        viewMode === 'interleaved' ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                                    onClick={() => setViewMode('interleaved')}
                                >
                                    A|B View
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Column visibility settings */}
                    {showColumnSettings && (
                        <div className="p-3 bg-muted/30 rounded-lg border animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Visible Columns</span>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setVisibleMetrics(AB_METRICS.map(m => m.id))}>All</Button>
                                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setVisibleMetrics([])}>None</Button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {AB_METRICS.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => toggleMetric(m.id)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                                            visibleMetrics.includes(m.id)
                                                ? "bg-primary text-primary-foreground shadow-sm"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                                        )}
                                    >
                                        {visibleMetrics.includes(m.id) ? <Eye className="inline h-3 w-3 mr-1" /> : <EyeOff className="inline h-3 w-3 mr-1" />}
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bigger function */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Bigger</span>
                        </div>
                        <Select value={biggerMetric || "none"} onValueChange={v => setBiggerMetric(v === "none" ? null : v)}>
                            <SelectTrigger className="w-[200px] h-8 text-xs bg-background shadow-sm">
                                <SelectValue placeholder="Select Metric..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None (Off)</SelectItem>
                                {activeMetrics.map(m => (
                                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {biggerMetric && (
                            <div className="flex items-center gap-3 text-xs">
                                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500"></span> {groupALabel} bigger</span>
                                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500/20 border border-red-500"></span> {groupBLabel} bigger</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* =================== SPLIT VIEW =================== */}
            {viewMode === 'split' && tableData.length > 0 && (
                <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
                    <div className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                                    <TableHead rowSpan={2} className="font-bold text-foreground bg-muted/50 border-r"
                                        style={{ position: 'sticky', left: 0, zIndex: 40 }}>Level</TableHead>
                                    <TableHead colSpan={activeMetrics.length} className="text-center font-bold bg-blue-50 text-blue-700 border-r">
                                        {groupALabel}
                                    </TableHead>
                                    <TableHead colSpan={activeMetrics.length} className="text-center font-bold bg-amber-50 text-amber-700">
                                        {groupBLabel}
                                    </TableHead>
                                </TableRow>
                                <TableRow className="bg-muted/30" style={{ position: 'sticky', top: 33, zIndex: 30 }}>
                                    {activeMetrics.map(m => (
                                        <TableHead key={`A_${m.id}`} className="font-semibold text-xs whitespace-nowrap bg-blue-50/50 text-blue-600">
                                            {m.label}
                                        </TableHead>
                                    ))}
                                    {activeMetrics.map(m => (
                                        <TableHead key={`B_${m.id}`} className="font-semibold text-xs whitespace-nowrap bg-amber-50/50 text-amber-600 first:border-l">
                                            {m.label}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableData.map(({ level, rowA, rowB }) => {
                                    const bigger = biggerMetric ? biggerMap[level] : null;
                                    return (
                                        <TableRow key={level} className={cn("hover:bg-muted/30",
                                            bigger === 'A' && "bg-emerald-50/40",
                                            bigger === 'B' && "bg-red-50/40"
                                        )}>
                                            <TableCell className={cn("font-bold bg-card border-r",
                                                bigger === 'A' && "bg-emerald-50/60",
                                                bigger === 'B' && "bg-red-50/60"
                                            )} style={{ position: 'sticky', left: 0, zIndex: 10 }}>
                                                {level}
                                                {bigger && (
                                                    <span className={cn("ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded",
                                                        bigger === 'A' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                                    )}>
                                                        {bigger === 'A' ? groupALabel : groupBLabel}
                                                    </span>
                                                )}
                                            </TableCell>
                                            {activeMetrics.map(m => {
                                                const val = rowA ? findMetricInRow(rowA, m) : '-';
                                                const isBiggerCol = biggerMetric === m.id;
                                                return (
                                                    <TableCell key={`A_${m.id}`} className={cn("text-xs font-mono bg-blue-50/10",
                                                        isBiggerCol && bigger === 'A' && "bg-emerald-100/50 font-bold text-emerald-800",
                                                        isBiggerCol && bigger === 'B' && "opacity-60"
                                                    )}>
                                                        {formatMetricValue(val, m.id)}
                                                    </TableCell>
                                                );
                                            })}
                                            {activeMetrics.map(m => {
                                                const val = rowB ? findMetricInRow(rowB, m) : '-';
                                                const isBiggerCol = biggerMetric === m.id;
                                                return (
                                                    <TableCell key={`B_${m.id}`} className={cn("text-xs font-mono bg-amber-50/10 first:border-l",
                                                        isBiggerCol && bigger === 'B' && "bg-red-100/50 font-bold text-red-800",
                                                        isBiggerCol && bigger === 'A' && "opacity-60"
                                                    )}>
                                                        {formatMetricValue(val, m.id)}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* =================== INTERLEAVED A|B VIEW =================== */}
            {viewMode === 'interleaved' && tableData.length > 0 && (
                <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
                    <div className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader>
                                {/* Metric group headers */}
                                <TableRow className="bg-muted/50" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                                    <TableHead rowSpan={2} className="font-bold text-foreground bg-muted/50 border-r"
                                        style={{ position: 'sticky', left: 0, zIndex: 40 }}>Level</TableHead>
                                    {activeMetrics.map(m => (
                                        <TableHead key={m.id} colSpan={2} className={cn(
                                            "text-center font-bold text-xs border-r",
                                            biggerMetric === m.id ? "bg-violet-50 text-violet-700" : "bg-muted/30"
                                        )}>
                                            {m.label}
                                        </TableHead>
                                    ))}
                                </TableRow>
                                {/* A/B sub-headers */}
                                <TableRow className="bg-muted/30" style={{ position: 'sticky', top: 33, zIndex: 30 }}>
                                    {activeMetrics.map(m => (
                                        <>
                                            <TableHead key={`${m.id}_A`} className="font-semibold text-[10px] whitespace-nowrap bg-blue-50/50 text-blue-700 text-center w-[60px]">
                                                {groupALabel}
                                            </TableHead>
                                            <TableHead key={`${m.id}_B`} className="font-semibold text-[10px] whitespace-nowrap bg-amber-50/50 text-amber-700 text-center border-r w-[60px]">
                                                {groupBLabel}
                                            </TableHead>
                                        </>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableData.map(({ level, rowA, rowB }) => {
                                    const bigger = biggerMetric ? biggerMap[level] : null;
                                    return (
                                        <TableRow key={level} className={cn("hover:bg-muted/30",
                                            bigger === 'A' && "bg-emerald-50/30",
                                            bigger === 'B' && "bg-red-50/30"
                                        )}>
                                            <TableCell className={cn("font-bold bg-card border-r",
                                                bigger === 'A' && "bg-emerald-50/60",
                                                bigger === 'B' && "bg-red-50/60"
                                            )} style={{ position: 'sticky', left: 0, zIndex: 10 }}>
                                                {level}
                                                {bigger && (
                                                    <span className={cn("ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded",
                                                        bigger === 'A' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                                    )}>
                                                        {bigger === 'A' ? groupALabel : groupBLabel}
                                                    </span>
                                                )}
                                            </TableCell>
                                            {activeMetrics.map(m => {
                                                const valA = rowA ? findMetricInRow(rowA, m) : '-';
                                                const valB = rowB ? findMetricInRow(rowB, m) : '-';
                                                const isBiggerCol = biggerMetric === m.id;

                                                // Per-cell bigger comparison for this specific metric
                                                const numA = getNumericValue(valA);
                                                const numB = getNumericValue(valB);
                                                let cellBigger: 'A' | 'B' | null = null;
                                                if (!isNaN(numA) && !isNaN(numB)) {
                                                    if (numA > numB) cellBigger = 'A';
                                                    else if (numB > numA) cellBigger = 'B';
                                                }

                                                return (
                                                    <>
                                                        <TableCell key={`${m.id}_A_${level}`} className={cn(
                                                            "text-xs font-mono text-center",
                                                            isBiggerCol && cellBigger === 'A' && "bg-emerald-100/60 font-bold text-emerald-800",
                                                            isBiggerCol && cellBigger === 'B' && "opacity-50"
                                                        )}>
                                                            {formatMetricValue(valA, m.id)}
                                                        </TableCell>
                                                        <TableCell key={`${m.id}_B_${level}`} className={cn(
                                                            "text-xs font-mono text-center border-r",
                                                            isBiggerCol && cellBigger === 'B' && "bg-red-100/60 font-bold text-red-800",
                                                            isBiggerCol && cellBigger === 'A' && "opacity-50"
                                                        )}>
                                                            {formatMetricValue(valB, m.id)}
                                                        </TableCell>
                                                    </>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {groupAData.length === 0 && groupBData.length === 0 && !loading && (
                <div className="rounded-xl border-dashed border-2 p-16 text-center">
                    <GitCompareArrows className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">Select a game with A/B data and click "Load Data"</p>
                    {availableGames.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                            No games have "Level A-B" view mapping configured.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
