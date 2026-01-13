"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Save, Download } from "lucide-react";
import Papa from "papaparse";
import { DEFAULT_REPORT_SETTINGS, LevelScoreTableSettings, ColumnConfig } from "@/lib/report-settings";
import { kmeans } from 'ml-kmeans';


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
    // Clustering fields
    avgRepeatRatio: number;
    avgTotalMoves: number;
    rmFixed: number;
    levelPlayTime: number;
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
    const [debugHeaders, setDebugHeaders] = useState<string[]>([]);

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

    // Cluster Renewer State
    const [clusterMinLevel, setClusterMinLevel] = useState<string>('');
    const [clusterMaxLevel, setClusterMaxLevel] = useState<string>('');
    const [clustering, setClustering] = useState(false);
    const [clusterResult, setClusterResult] = useState<string>('');
    const [clusterStatsResult, setClusterStatsResult] = useState<any[]>([]);


    const calculateConcept = (level: number): number => {
        if (level <= 10) return 1;
        if (level > 3000) return 49;

        if (level <= 20) return 2;
        if (level <= 40) return 3;
        if (level <= 60) return 4;
        if (level <= 80) return 5;
        if (level <= 100) return 6;
        if (level <= 120) return 7;
        if (level <= 140) return 8;
        if (level <= 160) return 9;
        if (level <= 180) return 10;
        if (level <= 200) return 11;

        if (level <= 230) return 12;
        if (level <= 260) return 13;
        if (level <= 300) return 14;
        if (level <= 350) return 15;
        if (level <= 400) return 16;
        if (level <= 450) return 17;
        if (level <= 500) return 18;
        if (level <= 550) return 19;
        if (level <= 600) return 20;
        if (level <= 650) return 21;
        if (level <= 700) return 22;
        if (level <= 750) return 23;
        if (level <= 800) return 24;
        if (level <= 850) return 25;
        if (level <= 900) return 26;
        if (level <= 950) return 27;
        if (level <= 1000) return 28;
        if (level <= 3000) return 30; // 2901-3000

        // Dynamic 50-level buckets for >3000
        // 3001-3050 -> 31
        // 3051-3100 -> 32
        // etc.
        return 31 + Math.floor((level - 3001) / 50);
    };

    const performClustering = () => {
        const minLvl = parseInt(clusterMinLevel) || 0;
        const maxLvl = parseInt(clusterMaxLevel) || 10000;

        if (minLvl <= 0) {
            alert("Please specify a valid minimum level > 0");
            return;
        }

        setClustering(true);
        setClusterResult("");

        try {
            // Filter data by range
            const relevantData = data.filter(d => d.level >= minLvl && d.level <= maxLvl);
            if (relevantData.length < 4) {
                throw new Error("Not enough levels in range to cluster (need at least 4)");
            }

            // Group by Concept
            const updates: { level: number, cluster: string }[] = [];
            const groupedByConcept = new Map<number, LevelData[]>();

            // Debug first item features
            if (relevantData.length > 0) {
                const d = relevantData[0];
                const repeat = d.avgRepeatRatio;
                const totalMoves = d.avgTotalMoves;
                const rmFixed = d.rmFixed;
                const playTime = d.levelPlayTime;
                // alert(`Debug Level ${d.level}:\nRepeat: ${repeat}\nTotal Moves: ${totalMoves}\nRM Fixed: ${rmFixed}\nPlayTime: ${playTime}`);
                if (repeat === 0 && totalMoves === 0 && rmFixed === 0 && playTime === 0) {
                    alert(`Warning: All clustering features are 0 for Level ${d.level}. Please check "Debug Headers" to ensure column names match.`);
                }
            }

            relevantData.forEach(d => {
                const concept = calculateConcept(d.level);
                if (!groupedByConcept.has(concept)) groupedByConcept.set(concept, []);
                groupedByConcept.get(concept)!.push(d);
            });

            // Process each concept group
            groupedByConcept.forEach((groupLevels, concept) => {
                if (groupLevels.length < 4) {
                    console.warn(`Concept ${concept} has too few levels (${groupLevels.length}), skipping clustering for this group.`);
                    return;
                }

                // Extract raw features
                const rawFeatures = groupLevels.map(d => {
                    const repeat = d.avgRepeatRatio || 0;
                    const rmRatio = d.avgTotalMoves > 0 ? (d.rmFixed / d.avgTotalMoves) : 0;
                    const playTime = d.levelPlayTime || 0;
                    return [repeat, rmRatio, playTime];
                });

                // Logarithmic Scaling (Log1p) to handle outliers
                const scaledFeatures = rawFeatures.map((row, idx) => {
                    const r = Math.log1p(row[0]);
                    const rm = row[1];
                    const pt = Math.log1p(row[2]);
                    return [r, rm, pt];
                });

                // Then standardize to 0-1 range to align weights
                const numFeatures = scaledFeatures[0].length;
                for (let j = 0; j < numFeatures; j++) {
                    const vals = scaledFeatures.map(row => row[j]);
                    const max = Math.max(...vals);
                    const min = Math.min(...vals);
                    const range = max - min || 1;

                    // If range is tiny, effectively all points are the same
                    if (range < 0.00001) {
                        for (let i = 0; i < groupLevels.length; i++) {
                            scaledFeatures[i][j] = 0.5; // Neutral
                        }
                    } else {
                        for (let i = 0; i < groupLevels.length; i++) {
                            scaledFeatures[i][j] = (scaledFeatures[i][j] - min) / range;
                        }
                    }
                }

                // KMeans on Scaled Features
                const k = Math.min(4, scaledFeatures.length);
                const result = kmeans(scaledFeatures, k, { initialization: 'kmeans++' });

                // Rank clusters based on a composite "Difficulty Index"
                // Cluster 1 (Easiest) -> Cluster 4 (Hardest)
                const clusterIndices = Array.from({ length: k }, (_, i) => i);
                const clusterMeans = clusterIndices.map(cIdx => {
                    const pointsInCluster = scaledFeatures.filter((_, i) => result.clusters[i] === cIdx);
                    if (pointsInCluster.length === 0) return { cIdx, score: 999 };

                    // Calculate mean for each feature in this cluster
                    const means = [0, 0, 0];
                    pointsInCluster.forEach(p => {
                        means[0] += p[0]; // Repeat
                        means[1] += p[1]; // RM Ratio
                        means[2] += p[2]; // Play Time
                    });
                    means[0] /= pointsInCluster.length;
                    means[1] /= pointsInCluster.length;
                    means[2] /= pointsInCluster.length;

                    // Composite Difficulty Score
                    // High score = Harder.
                    // Repeat + PlayTime (Positive Correlation)
                    // RM Ratio (Negative Correlation) -> Use (1 - RM Ratio)
                    const difficultyScore = (means[0] * 0.6) + ((1 - means[1]) * 0.2) + (means[2] * 0.2);
                    return { cIdx, score: difficultyScore };
                });

                // Sort by Difficulty Index (ascending)
                clusterMeans.sort((a, b) => a.score - b.score);

                // Map cluster ID to Rank (1-based string)
                const clusterMapping = new Map<number, string>();
                clusterMeans.forEach((item, index) => {
                    clusterMapping.set(item.cIdx, String(index + 1));
                });

                // Assign cluster to each level in the group
                groupLevels.forEach((d, i) => {
                    const clusterId = result.clusters[i];
                    updates.push({ level: d.level, cluster: clusterMapping.get(clusterId)! });
                });
            });

            // Update State
            let updateCount = 0;
            const newData = [...data];
            const statsMap = new Map<string, { count: number, sumRep: number, sumMoves: number }>();
            ['1', '2', '3', '4'].forEach(c => statsMap.set(c, { count: 0, sumRep: 0, sumMoves: 0 }));

            updates.forEach(u => {
                const idx = newData.findIndex(d => d.level === u.level);
                if (idx !== -1) {
                    newData[idx] = { ...newData[idx], editableCluster: u.cluster };
                    newData[idx].calculatedScore = calculateScore(newData[idx], u.cluster);
                    updateCount++;

                    // Stats
                    const s = statsMap.get(u.cluster)!;
                    s.count++;
                    s.sumRep += newData[idx].avgRepeatRatio;
                    s.sumMoves += newData[idx].avgTotalMoves;
                }
            });

            const statsArr = Array.from(statsMap.entries()).map(([c, val]) => ({
                cluster: c,
                count: val.count,
                avgRep: val.count ? (val.sumRep / val.count).toFixed(2) : '0.00',
                avgMoves: val.count ? (val.sumMoves / val.count).toFixed(2) : '0.00'
            })).sort((a, b) => a.cluster.localeCompare(b.cluster));

            setClusterStatsResult(statsArr);

            setData(newData);
            setClusterResult(`Successfully updated ${updateCount} levels in range ${minLvl}-${maxLvl}.`);

        } catch (e: any) {
            console.error(e);
            alert("Error during clustering: " + e.message);
        } finally {
            setClustering(false);
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

            if (parsed.data.length > 0) {
                setDebugHeaders(Object.keys(parsed.data[0] as object));
            }

            // Normalization Helper
            const normalize = (key: string) => key.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            const headers = parsed.meta.fields || [];
            const headerMap: Record<string, string> = {};

            // map normalized keys to actual headers
            headers.forEach(h => {
                headerMap[normalize(h)] = h;
            });

            const getCol = (row: any, ...candidates: string[]) => {
                const keys = Object.keys(row);
                for (const c of candidates) {
                    const normCandidate = normalize(c);
                    // Match if candidate is exact or a substring of the header
                    const actualKey = keys.find(k => {
                        const normKey = normalize(k);
                        return normKey === normCandidate || normKey.includes(normCandidate) || normCandidate.includes(normKey);
                    });
                    if (actualKey && row[actualKey] !== undefined) return row[actualKey];
                }
                return undefined;
            };

            const parseNum = (val: any) => {
                if (val === undefined || val === null || val === '') return 0;
                if (typeof val === 'number') return val;
                const s = String(val).trim();
                const clean = s.replace(',', '.').replace(/[^\d.-]/g, '');
                const f = parseFloat(clean);
                return isNaN(f) ? 0 : f;
            };


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
            const processedData: LevelData[] = parsed.data.map((row: any, idx: number) => {
                const level = parseInt(String(getCol(row, 'Level', 'level_number') || 0).replace(/[^\d-]/g, '')) || 0;

                const levelScore = parseNum(getCol(row, 'Level Score', 'LevelScore'));
                const monetizationScore = parseNum(getCol(row, 'Monetization Score', 'MonetizationScore'));
                const engagementScore = parseNum(getCol(row, 'Engagement Score', 'EngagementScore'));
                const satisfactionScore = parseNum(getCol(row, 'Satisfaction Score', 'SatisfactionScore'));

                const finalCluster = getCol(row, 'FinalCluster', 'Final Cluster') || '';

                // Clustering fields parsing with robust search
                const avgRepeatRatio = parseNum(getCol(row, 'Repeat Ratio', 'Repeat Rate', 'Repeat'));
                const avgTotalMoves = parseNum(getCol(row, 'Total Moves', 'Move Count', 'TotalMove'));
                const rmFixed = parseNum(getCol(row, 'RM Fixed', 'RM Total', 'Remaining Move'));
                const levelPlayTime = parseNum(getCol(row, 'Level Play Time', 'Play Time', 'PlayTime'));

                // DEBUG: Alert first row values to verify parsing
                // DEBUG: Alert first row values to verify parsing
                if (idx === 0) {
                    // console.log("Debug Parsing First Row:", { level, avgRepeatRatio, avgTotalMoves, rmFixed, levelPlayTime });
                }



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
                    avgRepeatRatio,
                    avgTotalMoves,
                    rmFixed,
                    levelPlayTime,
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
                        <Button variant="ghost" onClick={() => alert("CSV Headers:\n" + debugHeaders.join("\n"))} className="shadow-sm w-full sm:w-auto text-xs">
                            🔍 Debug Headers
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

            {/* Cluster Renewer */}
            {data.length > 0 && (
                <div className="p-4 bg-muted/20 border rounded-xl space-y-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        ✨ Cluster Renewer
                        {clusterResult && <span className="text-muted-foreground font-normal text-xs ml-auto">{clusterResult}</span>}
                    </h3>
                    <div className="flex items-end gap-3 flex-wrap">
                        <div className="space-y-1.5 w-[140px]">
                            <label className="text-xs text-muted-foreground">Min Level</label>
                            <Input
                                type="number"
                                placeholder="Start Level"
                                value={clusterMinLevel}
                                onChange={(e) => setClusterMinLevel(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5 w-[140px]">
                            <label className="text-xs text-muted-foreground">Max Level</label>
                            <Input
                                type="number"
                                placeholder="End Level (Opt)"
                                value={clusterMaxLevel}
                                onChange={(e) => setClusterMaxLevel(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={performClustering}
                            disabled={clustering}
                            variant="secondary"
                            className="w-[120px]"
                        >
                            {clustering ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> ...</> : "Clusterise"}
                        </Button>
                    </div>

                    {clusterStatsResult.length > 0 && (
                        <div className="mt-4 border-t pt-3">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Clustering Impact / Stats:</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {clusterStatsResult.map(s => (
                                    <div key={s.cluster} className="flex flex-col p-2 border rounded bg-background/50 text-xs">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-primary">Cluster {s.cluster}</span>
                                            <span className="font-mono bg-muted px-1 rounded">{s.count}</span>
                                        </div>
                                        <div className="text-muted-foreground flex justify-between">
                                            <span>R:</span> <span>{s.avgRep}</span>
                                        </div>
                                        <div className="text-muted-foreground flex justify-between">
                                            <span>M:</span> <span>{s.avgMoves}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

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
