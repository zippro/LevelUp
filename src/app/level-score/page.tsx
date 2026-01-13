"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Save, Download } from "lucide-react";
import Papa from "papaparse";
import { DEFAULT_REPORT_SETTINGS, LevelScoreTableSettings, ColumnConfig } from "@/lib/report-settings";

interface Config {
    variables: string[];
    games: {
        id: string;
        name: string;
        viewMappings: Record<string, string>;
        scoreMultipliers?: ScoreMultipliers;
    }[];
    reportSettings?: {
        levelScoreTable?: LevelScoreTableSettings;
    };
}

interface ScoreMultipliers {
    cluster1?: { monetization: number; engagement: number; satisfaction: number };
    cluster2?: { monetization: number; engagement: number; satisfaction: number };
    cluster3?: { monetization: number; engagement: number; satisfaction: number };
    cluster4?: { monetization: number; engagement: number; satisfaction: number };
    default?: { monetization: number; engagement: number; satisfaction: number };
}

interface LevelData {
    level: number;
    levelScore: number;
    monetizationScore: number;
    engagementScore: number;
    satisfactionScore: number;
    finalCluster: string;
    calculatedScore: number;
    editableCluster: string;
}

interface SavedScore {
    level: number;
    score: number;
    cluster: string | null;
}

// Mapping from Original Name (in Settings) to Data Property
const DATA_MAPPING: Record<string, keyof LevelData> = {
    'Level': 'level',
    'Level Score': 'levelScore',
    'Monetization Score': 'monetizationScore',
    'Engagement Score': 'engagementScore',
    'Satisfaction Score': 'satisfactionScore',
    'FinalCluster': 'finalCluster',
    'Calculated Score': 'calculatedScore',
    'Editable Cluster': 'editableCluster'
};

const DEFAULT_MULTIPLIERS: ScoreMultipliers = {
    cluster1: { monetization: 0.20, engagement: 0.20, satisfaction: 0.60 },
    cluster2: { monetization: 0.25, engagement: 0.25, satisfaction: 0.50 },
    cluster3: { monetization: 0.30, engagement: 0.35, satisfaction: 0.35 },
    cluster4: { monetization: 0.35, engagement: 0.35, satisfaction: 0.30 },
    default: { monetization: 0.30, engagement: 0.30, satisfaction: 0.40 },
};

const DEFAULT_TABLE_SETTINGS = DEFAULT_REPORT_SETTINGS.levelScoreTable!;

export default function LevelScorePage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [data, setData] = useState<LevelData[]>([]);
    const [savedScores, setSavedScores] = useState<Record<number, SavedScore>>({});
    // Debug keys removed
    const [tableSettings, setTableSettings] = useState<LevelScoreTableSettings>(DEFAULT_TABLE_SETTINGS);

    // Go to level
    const [goToLevel, setGoToLevel] = useState<string>('');
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const scrollToLevel = (level: string) => {
        if (!level || !tableContainerRef.current) return;
        const rows = tableContainerRef.current.querySelectorAll('tr[data-level]');
        for (const row of rows) {
            if (row.getAttribute('data-level') === level) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                (row as HTMLElement).style.backgroundColor = 'hsl(var(--primary) / 0.2)';
                setTimeout(() => {
                    (row as HTMLElement).style.backgroundColor = '';
                }, 2000);
                break;
            }
        }
    };


    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                // Load table settings if present
                if (data.reportSettings?.levelScoreTable) {
                    setTableSettings({
                        ...DEFAULT_TABLE_SETTINGS,
                        ...data.reportSettings.levelScoreTable,
                        columns: {
                            ...DEFAULT_TABLE_SETTINGS.columns,
                            ...data.reportSettings.levelScoreTable.columns
                        }
                    });
                }
            })
            .catch((e) => console.error(e));
    }, []);

    const getMultipliers = (cluster: string): { monetization: number; engagement: number; satisfaction: number } => {
        const game = config?.games.find(g => g.id === selectedGameId);
        const multipliers = game?.scoreMultipliers || DEFAULT_MULTIPLIERS;

        switch (cluster) {
            case '1': return multipliers.cluster1 || DEFAULT_MULTIPLIERS.cluster1!;
            case '2': return multipliers.cluster2 || DEFAULT_MULTIPLIERS.cluster2!;
            case '3': return multipliers.cluster3 || DEFAULT_MULTIPLIERS.cluster3!;
            case '4': return multipliers.cluster4 || DEFAULT_MULTIPLIERS.cluster4!;
            default: return multipliers.default || DEFAULT_MULTIPLIERS.default!;
        }
    };

    const calculateScore = (row: LevelData, clusterOverride?: string): number => {
        const cluster = clusterOverride || row.editableCluster || row.finalCluster;
        const mult = getMultipliers(cluster);
        return (row.monetizationScore * mult.monetization) +
            (row.engagementScore * mult.engagement) +
            (row.satisfactionScore * mult.satisfaction);
    };

    const loadData = async () => {
        if (!selectedGameId || !config) return;

        setLoading(true);
        try {
            const game = config.games.find(g => g.id === selectedGameId);
            if (!game) throw new Error("Game not found");

            const viewId = game.viewMappings["Level Revize"];
            if (!viewId) throw new Error("Level Revize view not mapped for this game");

            // Fetch from Tableau
            const res = await fetch("/api/sync-tableau", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ viewId, tableName: "level_scores_data" }),
            });

            if (!res.ok) throw new Error("Failed to fetch data");

            const jsonResponse = await res.json();
            const csvText = jsonResponse.data;
            const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

            // Load saved scores from database
            const savedRes = await fetch(`/api/level-scores?gameId=${selectedGameId}&t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
            });
            let savedMap: Record<number, SavedScore> = {};

            if (savedRes.ok) {
                const savedData = await savedRes.json();
                if (Array.isArray(savedData)) {
                    savedData.forEach((s: any) => {
                        savedMap[s.level] = { level: s.level, score: s.score, cluster: s.cluster };
                    });
                }
            } else {
                const errText = await savedRes.text();
                // If it's 404/500, unlikely to be JSON if standard error page, but API returns JSON error usually
                try {
                    const errJson = JSON.parse(errText);
                    console.error("Saved Scores Error:", errJson);
                    alert("Error loading saved scores: " + (errJson.error || errText));
                } catch (e) {
                    console.error("Saved Scores Error:", errText);
                    alert("Error loading saved scores: " + errText);
                }
            }
            setSavedScores(savedMap);

            // Process data
            const processedData: LevelData[] = parsed.data.map((row: any) => {
                const level = parseInt(String(row['Level'] || 0).replace(/[^\d-]/g, '')) || 0;
                const levelScore = parseFloat(row['Level Score'] || row['LevelScore'] || '0');
                const monetizationScore = parseFloat(row['Monetization Score'] || row['MonetizationScore'] || '0');
                const engagementScore = parseFloat(row['Engagement Score'] || row['EngagementScore'] || '0');
                const satisfactionScore = parseFloat(row['Satisfaction Score'] || row['SatisfactionScore'] || '0');
                const finalCluster = row['Final Cluster'] || row['FinalCluster'] || '';

                const saved = savedMap[level];
                const editableCluster = saved?.cluster || finalCluster;

                const item: LevelData = {
                    level,
                    levelScore,
                    monetizationScore,
                    engagementScore,
                    satisfactionScore,
                    finalCluster,
                    calculatedScore: 0,
                    editableCluster,
                };

                item.calculatedScore = calculateScore(item);
                return item;
            }).filter(d => d.level > 0);

            // Apply Sort
            const { defaultSortColumn, defaultSortOrder } = tableSettings;
            const sortKey = DATA_MAPPING[defaultSortColumn] || 'level';

            processedData.sort((a, b) => {
                const valA = a[sortKey];
                const valB = b[sortKey];

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return defaultSortOrder === 'asc' ? valA - valB : valB - valA;
                }
                const strA = String(valA);
                const strB = String(valB);
                return defaultSortOrder === 'asc'
                    ? strA.localeCompare(strB)
                    : strB.localeCompare(strA);
            });

            setData(processedData);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateCluster = (level: number, cluster: string) => {
        setData(prev => prev.map(row => {
            if (row.level === level) {
                const updated = { ...row, editableCluster: cluster };
                updated.calculatedScore = calculateScore(updated, cluster);
                return updated;
            }
            return row;
        }));
    };

    const saveScores = async () => {
        if (!selectedGameId) return;
        setSaving(true);

        const levels = data.map(row => ({
            level: row.level,
            score: row.calculatedScore,
            cluster: row.editableCluster || row.finalCluster,
        }));

        try {
            await fetch("/api/level-scores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameId: selectedGameId, levels }),
            });
            alert("Scores saved successfully!");
        } catch (err: any) {
            alert("Failed to save: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const exportToExcel = () => {
        const headers = ['Level', 'Level Score', 'Monetization Score', 'Engagement Score', 'Satisfaction Score', 'Final Cluster', 'Calculated Score', 'Cluster'];
        const rows = data.map(row => [
            row.level,
            row.levelScore.toFixed(4),
            row.monetizationScore.toFixed(4),
            row.engagementScore.toFixed(4),
            row.satisfactionScore.toFixed(4),
            row.finalCluster,
            row.calculatedScore.toFixed(4),
            row.editableCluster || row.finalCluster,
        ]);

        const content = [headers, ...rows].map(r => r.join('\t')).join('\n');
        const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Level_Scores.xls';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Get Sorted and Visible Columns
    const getVisibleColumns = (): ColumnConfig[] => {
        return Object.values(tableSettings.columns)
            .filter(c => !c.hidden)
            .sort((a, b) => (a.order || 99) - (b.order || 99));
    };

    const visibleColumns = getVisibleColumns();

    if (!config) return <div className="p-8 animate-pulse">Loading...</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-bold">Level Score</h1>
                    <p className="text-muted-foreground">Calculate and manage level scores based on cluster multipliers</p>
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
                            {config.games?.map(g => (<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={loadData} disabled={loading || !selectedGameId} className="shadow-sm w-full sm:w-auto">
                    {loading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading...</> : "Load Data"}
                </Button>
                {data.length > 0 && (
                    <>
                        <Button variant="secondary" onClick={saveScores} disabled={saving} className="shadow-sm w-full sm:w-auto">
                            {saving ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Scores</>}
                        </Button>
                        <Button variant="outline" onClick={exportToExcel} className="shadow-sm w-full sm:w-auto">
                            <Download className="mr-2 h-4 w-4" /> Export XLS
                        </Button>
                    </>
                )}

                {/* Go to Level */}
                {data.length > 0 && (
                    <div className="space-y-1.5 w-full sm:w-[120px]">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Go to Level</label>
                        <Input
                            type="number"
                            placeholder="Level..."
                            value={goToLevel}
                            onChange={(e) => setGoToLevel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    scrollToLevel(goToLevel);
                                }
                            }}
                            className="bg-background shadow-sm"
                        />
                    </div>
                )}
            </div>

            {/* Table */}
            {data.length > 0 && (
                <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
                    <div ref={tableContainerRef} className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    {visibleColumns.map(col => (
                                        <TableHead key={col.originalName} className="font-bold whitespace-nowrap">
                                            {col.displayName || col.originalName}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((row) => (
                                    <TableRow key={row.level} data-level={String(row.level)} className="hover:bg-muted/30">
                                        {visibleColumns.map(col => {
                                            const dataKey = DATA_MAPPING[col.originalName];

                                            if (col.originalName === 'Editable Cluster') {
                                                return (
                                                    <TableCell key={col.originalName}>
                                                        <Select
                                                            value={row.editableCluster || row.finalCluster}
                                                            onValueChange={(val) => updateCluster(row.level, val)}
                                                        >
                                                            <SelectTrigger className="w-20 h-8">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="1">1</SelectItem>
                                                                <SelectItem value="2">2</SelectItem>
                                                                <SelectItem value="3">3</SelectItem>
                                                                <SelectItem value="4">4</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                );
                                            }

                                            let val = row[dataKey];
                                            if (typeof val === 'number') {
                                                if (col.originalName === 'Level') return <TableCell key={col.originalName} className="font-medium">{val}</TableCell>;
                                                return <TableCell key={col.originalName}>{val.toFixed(4)}</TableCell>;
                                            }

                                            return <TableCell key={col.originalName}>{val}</TableCell>;
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {data.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground">
                    Select a game and click "Load Data" to view level scores.
                </div>
            )}

        </div>
    );
}
