"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Download } from "lucide-react";
import papa from 'papaparse';
import { cn } from "@/lib/utils";
import { generateLevelScoreTopUnsuccessful, generate3DayChurnTopUnsuccessful, formatTableValue } from "@/lib/table-reports";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

const HEADER_DEFINITIONS = [
    { name: "Total Move", aliases: ["total move", "totalmove", "total moves", "move count", "avg. total moves", "avg total moves"] },
    { name: "Average remaining move", aliases: ["average remaining move", "avg remaining move", "avg. remaining move", "remaining moves", "avg remaining moves", "remaining move"] },
    { name: "In app value", aliases: ["in app value", "inappvalue", "in-app value", "in app values", "inapp value", "inapp_value"] },
    { name: "Level Score", aliases: ["level score", "levelscore", "level_score"] },
    { name: "3 Days Churn", aliases: ["3 days churn", "3 day churn", "3daychurn", "3_days_churn"] },
    { name: "Min. Time Event", aliases: ["min. time event", "min time event", "min event time", "mineventtime", "min_time_event", "minimum time event"] }
];

// Helper to normalize header for comparison
const normalizeHeader = (h: string) => h.toLowerCase().trim();

function processHeaders(allHeaders: string[]): string[] {
    let headers = [...allHeaders];

    // 1. Deduplicate Level Score (remove "Level Score Along", etc.)
    const hasLevelScore = headers.some(h => {
        const normalized = normalizeHeader(h);
        return normalized.includes('level score');
    });

    if (hasLevelScore) {
        headers = headers.filter(h => {
            const normalized = normalizeHeader(h);
            return normalized !== 'level score along' &&
                normalized !== 'level score-' &&
                normalized !== 'level score 29072024';
        });
    }

    // 2. Identify available priority headers using aliases
    const presentPriorityHeaders: string[] = [];

    HEADER_DEFINITIONS.forEach(def => {
        // Find if any alias matches an available header
        const match = headers.find(h => {
            const normalized = normalizeHeader(h);
            return def.aliases.some(alias => normalized === alias || normalized.includes(alias));
        });

        if (match) {
            presentPriorityHeaders.push(match);
        }
    });

    // 3. Separate priority and other headers
    // Filter out priority headers from the main list so we don't duplicate them
    const otherHeaders = headers.filter(h =>
        !presentPriorityHeaders.includes(h)
    );

    // 4. Combine: Priority + Others
    return [...presentPriorityHeaders, ...otherHeaders];
}

function sortHeaders(headers: string[], order: string[]): string[] {
    if (!order || order.length === 0) return headers;

    // Create a map for quick lookup of order index
    const orderMap = new Map(order.map((h, i) => [normalizeHeader(h), i]));

    // Separate headers that are in the order list vs those that aren't
    // Helper to find index in order list, supporting aliases
    const getOrderIndex = (header: string) => {
        const normalizedH = normalizeHeader(header);

        // 1. Try exact match in orderMap
        if (orderMap.has(normalizedH)) return orderMap.get(normalizedH)!;

        // 2. Try alias match
        // Find which config header corresponds to this CSV header
        const matchedConfigHeader = order.find(configH => {
            // Does configH match this header via aliases?
            const def = HEADER_DEFINITIONS.find(d => normalizeHeader(d.name) === normalizeHeader(configH));
            if (def) {
                return def.aliases.some(alias => normalizedH === alias || normalizedH.includes(alias));
            }
            return false;
        });

        if (matchedConfigHeader) {
            return orderMap.get(normalizeHeader(matchedConfigHeader));
        }

        return -1;
    };

    // Sort the headers
    const headersWithIndex = headers.map(h => ({ h, idx: getOrderIndex(h) }));

    const ordered = headersWithIndex.filter(x => x.idx !== -1 && x.idx !== undefined).sort((a, b) => a.idx! - b.idx!).map(x => x.h);
    const remaining = headersWithIndex.filter(x => x.idx === -1 || x.idx === undefined).map(x => x.h);

    return [...ordered, ...remaining];
}

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
    weeklyCheck?: {
        minTotalUser?: number;
        minTotalUserLast30?: number;
        minLevel?: number;
        columnOrder?: string[];
        columnRenames?: Record<string, string>;
    };
}

interface TableSection {
    id: string;
    title: string;
    data: any[];
    headers: string[];
    expanded: boolean;
    sortColumn: string;
    sortOrder: 'asc' | 'desc';
}

export default function WeeklyCheckPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter State (Local)
    const [minTotalUser, setMinUsers] = useState<number>(50);
    const [minTotalUserLast30, setMinUsersLast30] = useState<number>(50);
    const [minLevel, setMinLevel] = useState<number>(0);

    // Raw Data State (to support client-side re-filtering)
    const [rawData, setRawData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);

    // Derived Sections
    const [sections, setSections] = useState<TableSection[]>([
        { id: 'levelScore', title: 'Level Score Top Unsuccessful', data: [], headers: [], expanded: true, sortColumn: 'Level Score', sortOrder: 'asc' },
        { id: 'churn', title: '3 Day Churn Top Unsuccessful', data: [], headers: [], expanded: true, sortColumn: '3 Days Churn', sortOrder: 'asc' },
        { id: 'last30', title: 'Last 30 Levels', data: [], headers: [], expanded: true, sortColumn: 'Level', sortOrder: 'desc' },
    ]);

    // New Move values - keyed by sectionId-level
    const [newMoveValues, setNewMoveValues] = useState<Record<string, string>>({});

    // Cache dialog state
    const [showCacheDialog, setShowCacheDialog] = useState(false);
    const [cachedDataInfo, setCachedDataInfo] = useState<{ fileName: string; createdAt: Date } | null>(null);

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                if (data.weeklyCheck) {
                    if (data.weeklyCheck.minTotalUser !== undefined) setMinUsers(data.weeklyCheck.minTotalUser);
                    else setMinUsers(50); // Default to 50 if missing

                    if (data.weeklyCheck.minTotalUserLast30 !== undefined) setMinUsersLast30(data.weeklyCheck.minTotalUserLast30);
                    else setMinUsersLast30(50);

                    if (data.weeklyCheck.minLevel !== undefined) setMinLevel(data.weeklyCheck.minLevel);
                    else setMinLevel(0);
                }
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));
    }, []);

    // Re-process data when filters, rawData, or headers change
    useEffect(() => {
        if (!rawData.length || !headers.length) return;

        // Find level column for filtering
        const sampleRow = rawData[0] || {};
        const levelCol = Object.keys(sampleRow).find(k => {
            const n = normalizeHeader(k);
            return n === 'level' || n === 'level number' || n === 'level_number';
        }) || 'Level';

        // 1. General Filter (Level Score & Churn) - apply minLevel filter
        const generalFiltered = rawData.filter(row => {
            // Check level
            const levelVal = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            if (levelVal < minLevel) return false;

            // Check total users
            const totalUserVal = row['TotalUser'] || row['Total User'] || row['TotalUsers'] || row['total_user'];
            if (!totalUserVal) return false;
            const num = parseInt(String(totalUserVal).replace(/[.,]/g, ''), 10);
            return !isNaN(num) && num >= minTotalUser;
        });

        // 2. Last 30 Levels Logic

        // Filter rawData by minTotalUserLast30 FIRST
        const candidates = rawData.filter(row => {
            const totalUserVal = row['TotalUser'] || row['Total User'] || row['TotalUsers'] || row['total_user'];
            if (!totalUserVal) return false;
            const num = parseInt(String(totalUserVal).replace(/[.,]/g, ''), 10);
            return !isNaN(num) && num >= minTotalUserLast30;
        });

        // Sort candidates by Level descending
        const sortedByLevel = [...candidates].sort((a, b) => {
            const levelA = parseInt(String(a[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            const levelB = parseInt(String(b[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            return levelB - levelA;
        });

        // Take top 30
        const last30Filtered = sortedByLevel.slice(0, 30);

        // Generate reports
        const levelScoreData = generateLevelScoreTopUnsuccessful(generalFiltered);
        const churnData = generate3DayChurnTopUnsuccessful(generalFiltered);

        setSections(prev => [
            { ...prev.find(s => s.id === 'levelScore')!, data: levelScoreData.slice(0, 50), headers },
            { ...prev.find(s => s.id === 'churn')!, data: churnData.slice(0, 50), headers },
            { ...prev.find(s => s.id === 'last30')!, data: last30Filtered, headers },
        ]);

    }, [rawData, headers, minTotalUser, minTotalUserLast30, minLevel]);

    // Get games that have Level Revize view mapping
    const availableGames = config?.games.filter(
        (g) => g.viewMappings && g.viewMappings["Level Revize"]
    );

    const handleLoad = async () => {
        if (!selectedGameId || !config) return;

        const game = config.games.find(g => g.id === selectedGameId);
        const viewId = game?.viewMappings?.["Level Revize"];

        if (!viewId) {
            setError("No Level Revize view found for this game.");
            return;
        }

        // Check for cached data first
        const gameName = game ? game.name : selectedGameId;
        const { data: files } = await supabase.storage
            .from('data-repository')
            .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        const matchingFile = files?.find(f =>
            f.name.includes(gameName) && f.name.includes("Level Revize")
        );

        if (matchingFile) {
            setCachedDataInfo({
                fileName: matchingFile.name,
                createdAt: new Date(matchingFile.created_at)
            });
            setShowCacheDialog(true);
        } else {
            // No cached data, fetch fresh
            await loadData(true);
        }
    };

    // Load data with option to use cache or fetch fresh
    const loadData = async (forceFresh: boolean) => {
        if (!selectedGameId || !config) return;

        const game = config.games.find(g => g.id === selectedGameId);
        const viewId = game?.viewMappings?.["Level Revize"];

        if (!viewId) {
            setError("No Level Revize view found for this game.");
            return;
        }

        setLoading(true);
        setError(null);
        setShowCacheDialog(false);

        try {
            const gameName = game ? game.name : selectedGameId;
            let csvData: string | null = null;

            if (!forceFresh) {
                // Try to use cached data
                const { data: files } = await supabase.storage
                    .from('data-repository')
                    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

                const matchingFile = files?.find(f =>
                    f.name.includes(gameName) && f.name.includes("Level Revize")
                );

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
                const response = await fetch("/api/sync-tableau", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        viewId: viewId,
                        tableName: "level_design_data",
                    }),
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Failed to fetch data");
                csvData = result.data;

                // Save to repository
                if (csvData) {
                    const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
                    const fileName = `${gameName} - Level Revize - ${timestamp}.csv`;
                    await supabase.storage
                        .from('data-repository')
                        .upload(fileName, csvData, { contentType: 'text/csv', upsert: false });
                }
            }

            // Parse CSV (ensure csvData is not null)
            if (!csvData) {
                throw new Error("No data available to parse");
            }


            const parsed = papa.parse(csvData, { header: true, skipEmptyLines: true });
            const parsedRaw = parsed.data as any[];
            setRawData(parsedRaw);

            const rawHeaders = parsed.meta.fields || [];

            // Process and Sort Headers
            let processedHeaders = processHeaders(rawHeaders);
            console.log('Raw headers from Tableau:', rawHeaders);
            console.log('Processed headers:', processedHeaders);

            // Apply custom column order if defined
            if (config?.weeklyCheck?.columnOrder && config.weeklyCheck.columnOrder.length > 0) {
                processedHeaders = sortHeaders(processedHeaders, config.weeklyCheck.columnOrder);
                console.log('Sorted headers:', processedHeaders);
            }
            setHeaders(processedHeaders);

            // Initial data processing is now handled by the useEffect above reacting to setRawData

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle new move value change
    const handleNewMoveChange = (sectionId: string, level: number, value: string) => {
        const key = `${sectionId}-${level}`;
        setNewMoveValues(prev => ({
            ...prev,
            [key]: value
        }));
    };

    // Export new moves to TXT file
    const exportNewMoves = (sectionId: string) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;

        const lines: string[] = [];
        section.data.forEach(row => {
            const level = row['Level'];
            if (level === undefined) return;

            const key = `${sectionId}-${level}`;
            const newMove = newMoveValues[key];

            if (newMove && newMove.trim() !== '') {
                // Get current revision number and add 1
                const currentRevision = parseInt(row['RevisionNumber'] || row['Revision Number'] || '0') || 0;
                const newRevision = currentRevision + 1;
                lines.push(`${level}\t${newRevision}\t${newMove}`);
            }
        });

        if (lines.length === 0) {
            alert('No new move values entered. Please enter values in the "New Move" column.');
            return;
        }

        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${section.title.replace(/\s+/g, '_')}_NewMoves.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const toggleSection = (id: string) => {
        setSections(prev => prev.map(s =>
            s.id === id ? { ...s, expanded: !s.expanded } : s
        ));
    };

    if (loadingConfig) return <div className="p-8 animate-pulse text-muted-foreground">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-destructive">Failed to load configuration.</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Cache Dialog */}
            {showCacheDialog && cachedDataInfo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-2">Existing Data Found</h3>
                        <p className="text-muted-foreground mb-4">
                            Data for this selection was saved on:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-3 mb-4">
                            <p className="font-medium text-sm">{cachedDataInfo.fileName}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {format(cachedDataInfo.createdAt, "MMMM d, yyyy 'at' HH:mm")}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Would you like to use this saved data or fetch new data from Tableau?
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
                            onClick={() => { setShowCacheDialog(false); setCachedDataInfo(null); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">Weekly Check</h1>
                        <p className="text-muted-foreground">Review key metrics from Level Revize data</p>
                    </div>

                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Level</label>
                            <Input
                                type="number"
                                value={minLevel}
                                onChange={(e) => setMinLevel(Number(e.target.value))}
                                className="w-20 h-8 bg-background"
                                min={0}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Users (General)</label>
                            <Input
                                type="number"
                                value={minTotalUser}
                                onChange={(e) => setMinUsers(Number(e.target.value))}
                                className="w-24 h-8 bg-background"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Users (Last 30)</label>
                            <Input
                                type="number"
                                value={minTotalUserLast30}
                                onChange={(e) => setMinUsersLast30(Number(e.target.value))}
                                className="w-24 h-8 bg-background"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4 p-4 bg-muted/40 rounded-xl border shadow-sm">
                <div className="space-y-1.5 w-full sm:w-[250px]">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Game</label>
                    <Select value={selectedGameId || ""} onValueChange={setSelectedGameId}>
                        <SelectTrigger className="bg-background shadow-sm">
                            <SelectValue placeholder="Select a Game..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableGames?.map(g => (
                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                            {availableGames?.length === 0 && <SelectItem value="none" disabled>No games available</SelectItem>}
                        </SelectContent>
                    </Select>
                </div>

                <Button onClick={handleLoad} disabled={loading || !selectedGameId} className="shadow-sm w-full sm:w-auto">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Load Data
                </Button>
            </div>

            {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                    {error}
                </div>
            )}

            {/* Table Sections */}
            {sections.map(section => (
                <div key={section.id} className="rounded-xl border shadow-sm bg-card overflow-hidden">
                    <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                        <h2 className="text-lg font-semibold">{section.title}</h2>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-sm">{section.data.length} rows</span>
                            {section.expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                    </button>

                    {section.expanded && section.data.length > 0 && (
                        <div>
                            <div className="max-h-[400px] overflow-auto relative">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                                            <TableHead className="whitespace-nowrap font-bold text-foreground bg-muted" style={{ position: 'sticky', left: 0, zIndex: 30 }}>
                                                New Move
                                            </TableHead>
                                            {section.headers.slice(0, 50).map((header) => (
                                                <TableHead key={header} className="whitespace-nowrap font-bold text-foreground bg-muted">
                                                    {config?.weeklyCheck?.columnRenames?.[header] || header}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {section.data.map((row, i) => {
                                            const level = row['Level'];
                                            const key = `${section.id}-${level}`;
                                            return (
                                                <TableRow key={i} className="hover:bg-muted/30">
                                                    <TableCell className="whitespace-nowrap sticky left-0 bg-card z-10">
                                                        <Input
                                                            type="number"
                                                            min={-3}
                                                            max={3}
                                                            className="w-16 h-8 text-center"
                                                            value={newMoveValues[key] || ''}
                                                            onChange={(e) => handleNewMoveChange(section.id, level, e.target.value)}
                                                            placeholder="0"
                                                        />
                                                    </TableCell>
                                                    {section.headers.slice(0, 50).map((header) => (
                                                        <TableCell key={`${i}-${header}`} className="whitespace-nowrap font-medium text-muted-foreground">
                                                            {formatTableValue(row[header], header)}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="p-3 border-t bg-muted/20 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => exportNewMoves(section.id)}
                                    className="gap-2"
                                >
                                    <Download className="h-4 w-4" />
                                    Export New Moves
                                </Button>
                            </div>
                        </div>
                    )}

                    {section.expanded && section.data.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                            No data loaded. Select a game and click "Load Data".
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
