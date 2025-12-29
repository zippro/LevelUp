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

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
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

    // Table sections
    const [sections, setSections] = useState<TableSection[]>([
        { id: 'levelScore', title: 'Level Score Top Unsuccessful', data: [], headers: [], expanded: true, sortColumn: 'Level Score', sortOrder: 'asc' },
        { id: 'churn', title: '3 Day Churn Top Unsuccessful', data: [], headers: [], expanded: true, sortColumn: '3 Days Churn', sortOrder: 'asc' },
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
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));
    }, []);

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
            const rawData = parsed.data as any[];
            const headers = parsed.meta.fields || [];

            // Generate both report views
            const levelScoreData = generateLevelScoreTopUnsuccessful(rawData);
            const churnData = generate3DayChurnTopUnsuccessful(rawData);

            setSections([
                { id: 'levelScore', title: 'Level Score Top Unsuccessful', data: levelScoreData.slice(0, 50), headers, expanded: true, sortColumn: 'Level Score', sortOrder: 'asc' },
                { id: 'churn', title: '3 Day Churn Top Unsuccessful', data: churnData.slice(0, 50), headers, expanded: true, sortColumn: '3 Days Churn', sortOrder: 'asc' },
            ]);

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
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">Weekly Check</h1>
                <p className="text-muted-foreground">Review key metrics from Level Revize data</p>
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
                            <div className="max-h-[400px] overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="whitespace-nowrap font-bold text-foreground sticky left-0 bg-muted/50 z-10">
                                                New Move
                                            </TableHead>
                                            {section.headers.slice(0, 12).map((header) => (
                                                <TableHead key={header} className="whitespace-nowrap font-bold text-foreground">
                                                    {header}
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
                                                    {section.headers.slice(0, 12).map((header) => (
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
