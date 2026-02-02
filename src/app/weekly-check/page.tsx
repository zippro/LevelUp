"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, ChevronDown, ChevronUp, Download, Ban, Search, Save } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import papa from 'papaparse';
import { cn } from "@/lib/utils";
import { generateLevelScoreTopUnsuccessful, generateLevelScoreTopSuccessful, generate3DayChurnTopUnsuccessful, generate3DayChurnTopSuccessful, formatTableValue } from "@/lib/table-reports";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

interface SavedScore {
    level: number;
    score: number;
    cluster: string | null;
}

const HEADER_DEFINITIONS = [
    { name: "Total Move", aliases: ["total move", "totalmove", "total moves", "move count", "avg. total moves", "avg total moves"] },
    { name: "Average remaining move", aliases: ["average remaining move", "avg remaining move", "avg. remaining move", "remaining moves", "avg remaining moves", "remaining move", "rem", "rm", "avg. rm", "avg rm", "moves left", "rm total"] },
    { name: "In app value", aliases: ["in app value", "inappvalue", "in-app value", "in app values", "inapp value", "inapp_value"] },
    { name: "Level Score", aliases: ["level score", "levelscore", "level_score"] },
    { name: "3 Days Churn", aliases: ["3 days churn", "3 day churn", "3daychurn", "3_days_churn"] },
    { name: "Min. Time Event", aliases: ["min. time event", "min time event", "min event time", "mineventtime", "min_time_event", "minimum time event"] }
];

const normalizeHeader = (h: string) => h.toLowerCase().trim();

const DEFAULT_MULTIPLIERS: any = {
    cluster1: { monetization: 0.20, engagement: 0.20, satisfaction: 0.60 },
    cluster2: { monetization: 0.25, engagement: 0.25, satisfaction: 0.50 },
    cluster3: { monetization: 0.30, engagement: 0.35, satisfaction: 0.35 },
    cluster4: { monetization: 0.35, engagement: 0.35, satisfaction: 0.30 },
    default: { monetization: 0.30, engagement: 0.30, satisfaction: 0.40 },
};

const parseNum = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    // Handle "1,05" vs "1.05"
    const cleaned = String(val).replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
};

const getCol = (row: any, ...names: string[]) => {
    const keys = Object.keys(row);
    for (const name of names) {
        const normalizedCandidate = normalizeHeader(name);
        const actualKey = keys.find(k => {
            const normKey = normalizeHeader(k);
            return normKey === normalizedCandidate || normKey.includes(normalizedCandidate) || normalizedCandidate.includes(normKey);
        });
        if (actualKey && row[actualKey] !== undefined) return row[actualKey];
    }
    return '';
};

function processHeaders(allHeaders: string[]): string[] {
    let headers = [...allHeaders];
    const hasLevelScore = headers.some(h => normalizeHeader(h).includes('level score'));
    if (hasLevelScore) {
        headers = headers.filter(h => {
            const normalized = normalizeHeader(h);
            return normalized !== 'level score along' && normalized !== 'level score-' && normalized !== 'level score 29072024';
        });
    }
    const presentPriorityHeaders: string[] = [];
    HEADER_DEFINITIONS.forEach(def => {
        const match = headers.find(h => {
            const normalized = normalizeHeader(h);
            return def.aliases.some(alias => normalized === alias || normalized.includes(alias));
        });
        if (match) presentPriorityHeaders.push(match);
    });
    const otherHeaders = headers.filter(h => !presentPriorityHeaders.includes(h));
    return [...presentPriorityHeaders, ...otherHeaders];
}

function sortHeaders(headers: string[], order: string[]): string[] {
    if (!order || order.length === 0) return headers;
    const orderMap = new Map(order.map((h, i) => [normalizeHeader(h), i]));
    const getOrderIndex = (header: string) => {
        const normalizedH = normalizeHeader(header);
        if (orderMap.has(normalizedH)) return orderMap.get(normalizedH)!;
        const noSpaceH = normalizedH.replace(/\s+/g, '');
        for (const [orderKey, idx] of orderMap.entries()) {
            if (orderKey.replace(/\s+/g, '') === noSpaceH) return idx;
        }
        const matchedConfigHeader = order.find(configH => {
            const def = HEADER_DEFINITIONS.find(d => normalizeHeader(d.name) === normalizeHeader(configH));
            if (def) return def.aliases.some(alias => normalizedH === alias || normalizedH.includes(alias));
            return false;
        });
        if (matchedConfigHeader) return orderMap.get(normalizeHeader(matchedConfigHeader));
        return -1;
    };
    const headersWithIndex = headers.map(h => ({ h, idx: getOrderIndex(h) }));
    const ordered = headersWithIndex.filter(x => x.idx !== -1 && x.idx !== undefined).sort((a, b) => a.idx! - b.idx!).map(x => x.h);
    const remaining = headersWithIndex.filter(x => x.idx === -1 || x.idx === undefined).map(x => x.h);
    return [...ordered, ...remaining];
}

function getDisplayName(header: string, renames?: Record<string, string>): string {
    if (!renames) return header;
    if (renames[header]) return renames[header];
    const normalizedH = normalizeHeader(header);
    for (const [key, value] of Object.entries(renames)) {
        if (normalizeHeader(key) === normalizedH) return value;
    }
    const noSpaceH = normalizedH.replace(/\s+/g, '');
    for (const [key, value] of Object.entries(renames)) {
        if (normalizeHeader(key).replace(/\s+/g, '') === noSpaceH) return value;
    }
    return header;
}

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string>; scoreMultipliers?: any }[];
    weeklyCheck?: {
        minTotalUser?: number;
        minTotalUserLast30?: number;
        minLevel?: number;
        minDaysSinceEvent?: number;
        columnOrder?: string[];
        columnRenames?: Record<string, string>;
        hiddenColumns?: string[];
        // Successful tab filters
        successMinTotalUser?: number;
        successMinLevel?: number;
        successMinDaysSinceEvent?: number;
        successFinalCluster?: string;
    };
}

interface TableSection {
    id: string;
    title: string;
    data: any[];
    headers: string[];
    expanded: boolean;
}

interface CombinedReportSection {
    title: string;
    content: string;
    headers: string[];
    summary: string;
    details?: any[];
}

export default function WeeklyCheckPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("unsuccessful");

    // Unsuccessful Tab Filters
    const [minTotalUser, setMinUsers] = useState<number>(50);
    const [minLevel, setMinLevel] = useState<number>(0);
    const [minDaysSinceEvent, setMinDaysSinceEvent] = useState<number>(0);
    const [finalClusters, setFinalClusters] = useState<string[]>(['1', '2', '3', '4', 'None']);

    // Successful Tab Filters
    const [successMinTotalUser, setSuccessMinUsers] = useState<number>(50);
    const [successMinLevel, setSuccessMinLevel] = useState<number>(0);
    const [successMinDaysSinceEvent, setSuccessMinDaysSinceEvent] = useState<number>(0);
    const [successFinalClusters, setSuccessFinalClusters] = useState<string[]>(['1', '2', '3', '4', 'None']);

    // Last 30 Filter
    const [minTotalUserLast30, setMinUsersLast30] = useState<number>(50);

    // Raw Data
    const [rawData, setRawData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);

    // Sections per tab
    const [unsuccessfulSections, setUnsuccessfulSections] = useState<TableSection[]>([
        { id: 'levelScoreUnsuccess', title: 'Level Score Top Unsuccessful', data: [], headers: [], expanded: true },
        { id: 'churnUnsuccess', title: '3 Day Churn Top Unsuccessful', data: [], headers: [], expanded: true },
    ]);
    const [successfulSections, setSuccessfulSections] = useState<TableSection[]>([
        { id: 'levelScoreSuccess', title: 'Level Score Top Successful', data: [], headers: [], expanded: true },
        { id: 'churnSuccess', title: '3 Day Churn Top Successful', data: [], headers: [], expanded: true },
    ]);
    const [last30Section, setLast30Section] = useState<TableSection>(
        { id: 'last30', title: 'Last 30 Levels', data: [], headers: [], expanded: true }
    );

    // Actions state: key = "sectionId-level", value = array of actions for multiple actions per level
    interface LevelAction {
        type: 'M' | 'R' | 'BR' | 'TR' | 'S' | 'SS' | '';
        moveValue?: number;
        description?: string;
    }
    const [actions, setActions] = useState<Record<string, LevelAction[]>>({});
    const [showCacheDialog, setShowCacheDialog] = useState(false);
    const [cachedDataInfo, setCachedDataInfo] = useState<{ fileName: string; createdAt: Date } | null>(null);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [exportData, setExportData] = useState<string>('');
    const [exportHeaders, setExportHeaders] = useState<string[]>([]);
    const [savedScores, setSavedScores] = useState<Record<number, { cluster: string | null, score: number | null }>>({}); // Combined state
    const [exportSummary, setExportSummary] = useState<string>('');
    const [pendingClusterChanges, setPendingClusterChanges] = useState<Record<number, boolean>>({});

    const [exportDetails, setExportDetails] = useState<any[]>([]);

    // Combined Report State
    const [combinedReport, setCombinedReport] = useState<CombinedReportSection[]>([]);
    const [showWeeklyReportDialog, setShowWeeklyReportDialog] = useState(false);

    // ... (lines 165-398 unchanged)

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                if (data.weeklyCheck) {
                    // Unsuccessful defaults
                    setMinUsers(data.weeklyCheck.minTotalUser ?? 50);
                    setMinLevel(data.weeklyCheck.minLevel ?? 0);
                    setMinDaysSinceEvent(data.weeklyCheck.minDaysSinceEvent ?? 0);
                    setMinUsersLast30(data.weeklyCheck.minTotalUserLast30 ?? 50);
                    // Successful defaults
                    setSuccessMinUsers(data.weeklyCheck.successMinTotalUser ?? data.weeklyCheck.minTotalUser ?? 50);
                    setSuccessMinLevel(data.weeklyCheck.successMinLevel ?? data.weeklyCheck.minLevel ?? 0);
                    setSuccessMinDaysSinceEvent(data.weeklyCheck.successMinDaysSinceEvent ?? data.weeklyCheck.minDaysSinceEvent ?? 0);
                    // successFinalCluster is omitted - use default ['1','2','3','4']
                }
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));
    }, []);

    // Helper functions for filtering
    const parseDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;
        const str = dateStr.trim();
        const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) {
            const [, day, month, year] = slashMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (dashMatch) {
            const [, year, month, day] = dashMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        return null;
    };

    const daysSinceDate = (date: Date): number => {
        const now = new Date();
        return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    };

    // Filter function generator
    const createFilter = (minUsers: number, minLvl: number, minDays: number, clusters: string[]) => {
        return (row: any, levelCol: string, dateCol: string) => {
            const levelVal = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            if (levelVal < minLvl) return false;

            const totalUserVal = row['TotalUser'] || row['Total User'] || row['TotalUsers'] || row['total_user'];
            if (!totalUserVal) return false;
            const num = parseInt(String(totalUserVal).replace(/[.,]/g, ''), 10);
            if (isNaN(num) || num < minUsers) return false;

            if (minDays > 0 && dateCol) {
                const dateStr = row[dateCol];
                if (dateStr) {
                    const eventDate = parseDate(String(dateStr));
                    if (eventDate && daysSinceDate(eventDate) < minDays) return false;
                }
            }

            // Multi-select New Cluster filter (uses effective cluster - saved or final)
            // Only filter if the row actually has a cluster value
            if (clusters.length > 0 && clusters.length < 5) {
                const clusterVal = String(row['Clu'] || '').trim();
                // Check if 'None' is selected and cluster value is empty
                if (!clusterVal) {
                    if (!clusters.includes('None')) return false;
                } else {
                    if (!clusters.includes(clusterVal)) return false;
                }
            }
            return true;
        };
    };

    // Process data for Unsuccessful tab
    useEffect(() => {
        if (!rawData.length || !headers.length) return;
        const sampleRow = rawData[0] || {};
        const levelCol = Object.keys(sampleRow).find(k => {
            const n = normalizeHeader(k);
            return n === 'level' || n === 'level number' || n === 'level_number';
        }) || 'Level';
        const dateCol = Object.keys(sampleRow).find(k => {
            const n = normalizeHeader(k);
            return n.includes('min') && n.includes('time') && n.includes('event');
        }) || '';

        const filter = createFilter(minTotalUser, minLevel, minDaysSinceEvent, finalClusters);
        const filtered = rawData.filter(row => filter(row, levelCol, dateCol));

        const levelScoreData = generateLevelScoreTopUnsuccessful(filtered);
        const churnData = generate3DayChurnTopUnsuccessful(filtered);

        setUnsuccessfulSections(prev => [
            { ...prev[0], data: levelScoreData.slice(0, 50), headers },
            { ...prev[1], data: churnData.slice(0, 50), headers },
        ]);
    }, [rawData, headers, minTotalUser, minLevel, minDaysSinceEvent, finalClusters]);

    // Process data for Successful tab
    useEffect(() => {
        if (!rawData.length || !headers.length) return;
        const sampleRow = rawData[0] || {};
        const levelCol = Object.keys(sampleRow).find(k => {
            const n = normalizeHeader(k);
            return n === 'level' || n === 'level number' || n === 'level_number';
        }) || 'Level';
        const dateCol = Object.keys(sampleRow).find(k => {
            const n = normalizeHeader(k);
            return n.includes('min') && n.includes('time') && n.includes('event');
        }) || '';

        const filter = createFilter(successMinTotalUser, successMinLevel, successMinDaysSinceEvent, successFinalClusters);
        const filtered = rawData.filter(row => filter(row, levelCol, dateCol));

        const levelScoreData = generateLevelScoreTopSuccessful(filtered);
        const churnData = generate3DayChurnTopSuccessful(filtered);

        setSuccessfulSections(prev => [
            { ...prev[0], data: levelScoreData.slice(0, 50), headers },
            { ...prev[1], data: churnData.slice(0, 50), headers },
        ]);
    }, [rawData, headers, successMinTotalUser, successMinLevel, successMinDaysSinceEvent, successFinalClusters]);

    // Process data for Last 30 tab
    useEffect(() => {
        if (!rawData.length || !headers.length) return;
        const sampleRow = rawData[0] || {};
        const levelCol = Object.keys(sampleRow).find(k => {
            const n = normalizeHeader(k);
            return n === 'level' || n === 'level number' || n === 'level_number';
        }) || 'Level';

        const candidates = rawData.filter(row => {
            const totalUserVal = row['TotalUser'] || row['Total User'] || row['TotalUsers'] || row['total_user'];
            if (!totalUserVal) return false;
            const num = parseInt(String(totalUserVal).replace(/[.,]/g, ''), 10);
            return !isNaN(num) && num >= minTotalUserLast30;
        });

        const sortedByLevel = [...candidates].sort((a, b) => {
            const levelA = parseInt(String(a[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            const levelB = parseInt(String(b[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            return levelB - levelA;
        });

        setLast30Section(prev => ({ ...prev, data: sortedByLevel.slice(0, 30), headers }));
    }, [rawData, headers, minTotalUserLast30]);

    const availableGames = config?.games.filter(g => g.viewMappings && g.viewMappings["Level Revize"]);

    const handleLoad = async () => {
        if (!selectedGameId || !config) return;
        const game = config.games.find(g => g.id === selectedGameId);
        const viewId = game?.viewMappings?.["Level Revize"];
        if (!viewId) { setError("No Level Revize view found for this game."); return; }

        const gameName = game ? game.name : selectedGameId;
        const { data: files } = await supabase.storage.from('data-repository').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
        const matchingFile = files?.find(f => f.name.includes(gameName) && f.name.includes("Level Revize"));

        if (matchingFile) {
            setCachedDataInfo({ fileName: matchingFile.name, createdAt: new Date(matchingFile.created_at) });
            setShowCacheDialog(true);
        } else {
            await loadData(true);
        }
    };

    const loadData = async (forceFresh: boolean) => {
        if (!selectedGameId || !config) return;
        const game = config.games.find(g => g.id === selectedGameId);
        const viewId = game?.viewMappings?.["Level Revize"];
        if (!viewId) { setError("No Level Revize view found for this game."); return; }

        setLoading(true);
        setError(null);
        setShowCacheDialog(false);

        try {
            // Fetch saved level scores (clusters)
            const savedRes = await fetch(`/api/level-scores?gameId=${selectedGameId}&t=${Date.now()}`);
            if (savedRes.ok) {
                const savedData = await savedRes.json();
                const savedMap: Record<number, { cluster: string | null, score: number | null }> = {};
                if (Array.isArray(savedData)) {
                    savedData.forEach((s: any) => {
                        savedMap[s.level] = { cluster: s.cluster || null, score: s.score !== undefined ? s.score : null };
                    });
                }
                setSavedScores(savedMap);
            }
        } catch (e) {
            console.error("Failed to load saved scores", e);
        }

        try {

            const gameName = game ? game.name : selectedGameId;
            let csvData: string | null = null;

            if (!forceFresh) {
                const { data: files } = await supabase.storage.from('data-repository').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
                const matchingFile = files?.find(f => f.name.includes(gameName) && f.name.includes("Level Revize"));
                if (matchingFile) {
                    const { data: fileData } = await supabase.storage.from('data-repository').download(matchingFile.name);
                    if (fileData) csvData = await fileData.text();
                }
            }

            if (!csvData) {
                const response = await fetch("/api/sync-tableau", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ viewId, tableName: "level_design_data" }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Failed to fetch data");
                csvData = result.data;

                if (csvData) {
                    const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
                    const fileName = `${gameName} - Level Revize - ${timestamp}.csv`;
                    await supabase.storage.from('data-repository').upload(fileName, csvData, { contentType: 'text/csv', upsert: false });
                }
            }

            if (!csvData) throw new Error("No data available to parse");

            const parsed = papa.parse(csvData, { header: true, skipEmptyLines: true });
            let rawRows = parsed.data as any[];

            // Fetch Saved Scores
            try {
                // Add timestamp to prevent caching
                const savedRes = await fetch(`/api/level-scores?gameId=${selectedGameId}&t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
                });
                if (savedRes.ok) {
                    const savedData: SavedScore[] = await savedRes.json();
                    const savedMap = new Map(savedData.map(s => [s.level, s]));

                    // Inject Saved Scores into Raw Data
                    rawRows = rawRows.map(row => {
                        // Find Level Column
                        const levelCol = Object.keys(row).find(k => {
                            const n = normalizeHeader(k);
                            return n === 'level' || n === 'level number' || n === 'level_number';
                        }) || 'Level';

                        const levelVal = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
                        const saved = savedMap.get(levelVal);

                        // Find Final Cluster Column
                        const clusterCol = Object.keys(row).find(k => {
                            const n = normalizeHeader(k);
                            return n.includes('final') && n.includes('cluster');
                        });
                        const finalClusterVal = clusterCol ? row[clusterCol] : '';

                        // Determine Effective Cluster
                        const effectiveCluster = saved?.cluster || finalClusterVal;

                        return {
                            ...row,
                            'Clu': effectiveCluster,
                            'Score': saved?.score !== undefined ? saved.score : '',
                            '__FinalCluster': finalClusterVal // Internal field for comparison
                        };
                    });
                }
            } catch (err) {
                console.error("Failed to load saved scores", err);
            }

            setRawData(rawRows);

            let processedHeaders = processHeaders(parsed.meta.fields || []);
            // Add new headers
            if (!processedHeaders.includes('Clu')) processedHeaders.push('Clu');
            if (!processedHeaders.includes('Score')) processedHeaders.push('Score');

            if (config?.weeklyCheck?.columnOrder?.length) {
                processedHeaders = sortHeaders(processedHeaders, config.weeklyCheck.columnOrder);
            }
            if (config?.weeklyCheck?.hiddenColumns?.length) {
                const hiddenSet = new Set(config.weeklyCheck.hiddenColumns);
                processedHeaders = processedHeaders.filter(h => !hiddenSet.has(h));
            }
            setHeaders(processedHeaders);

            // Auto-sync all level data to database for Discord bot
            const gameId = selectedGameId;
            if (gameId && rawRows.length > 0) {
                const parseDecimal = (val: any) => {
                    if (val === null || val === undefined || val === '' || val === '-') return null;
                    const num = parseFloat(String(val).replace(/[%,]/g, ''));
                    return isNaN(num) ? null : num;
                };

                // Debug: Log column names from first row
                if (rawRows.length > 0) {
                    console.log('[Auto-Sync] CSV columns:', Object.keys(rawRows[0]));
                }

                const levels = rawRows.map((row: any) => {
                    const levelCol = Object.keys(row).find(k => {
                        const n = normalizeHeader(k);
                        return n === 'level' || n === 'level number' || n === 'levelnumber';
                    }) || 'Level';
                    const level = parseInt(String(row[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
                    if (level <= 0) return null;

                    const cluster = row['Clu'] || getCol(row, 'Final Cluster', 'FinalCluster', 'Clu', 'cluster') || null;
                    const score = row['Score'] !== undefined && row['Score'] !== '' ? parseFloat(row['Score']) : null;

                    // USE EXACT SAME LOOKUPS AS MAGNIFIER (lines 1452-1458)
                    const churnVal = row['3 Days Churn'] || row['3 Day Churn'] || row['3DaysChurn'] || null;
                    const replayVal = getCol(row, 'Avg. Repeat Ratio (birleşik)', 'Avg. Repeat Rate', 'Repeat', 'Repeat Rate', 'rep', 'birleşik', 'birlesik');
                    const playonVal = row['Playon per User'] || row['Playon Per User'] || row['PlayonPerUser'] || null;
                    const movesVal = row['Avg. Total Moves'] || row['Total Move'] || row['TotalMove'] || null;
                    const timeVal = row['Avg. Level Play'] || row['Avg. Level Play Time'] || row['Level Play Time'] || row['LevelPlayTime'] || null;
                    const winVal = row['Avg. FirstTryWin'] || row['Avg. FirstTryWinPercent'] || row['Avg First Try Win'] || row['First Try Win'] || null;
                    const remVal = getCol(row, 'RM Total', 'Avg. RM Fixed', 'Average remaining move', 'avg remaining move', 'remaining moves', 'Rem', 'RM', 'Avg. RM', 'Avg RM', 'Moves Left', 'remaining');

                    // Debug: Log first row values
                    if (level === rawRows[0]?.[levelCol]) {
                        console.log('[Auto-Sync] Sample row values:', { churnVal, replayVal, playonVal, movesVal, timeVal, winVal, remVal });
                    }

                    let churn_rate = parseDecimal(churnVal);
                    if (churn_rate !== null && churn_rate > 1) churn_rate = churn_rate / 100;

                    let win_rate_1st = parseDecimal(winVal);
                    if (win_rate_1st !== null && win_rate_1st > 1) win_rate_1st = win_rate_1st / 100;

                    return {
                        level,
                        cluster,
                        score,
                        churn_rate,
                        replay_rate: parseDecimal(replayVal),
                        play_on_rate: parseDecimal(playonVal),
                        avg_moves: parseDecimal(movesVal),
                        avg_time: parseDecimal(timeVal),
                        win_rate_1st,
                        avg_remaining_moves: parseDecimal(remVal),
                    };
                }).filter(Boolean);

                // Sync in background (don't wait)
                if (levels.length > 0) {
                    const batchSize = 500;
                    for (let i = 0; i < levels.length; i += batchSize) {
                        const batch = levels.slice(i, i + batchSize);
                        fetch("/api/level-scores", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ gameId, levels: batch }),
                        }).catch(err => console.error('[Auto-Sync] Error:', err));
                    }
                    console.log(`[Auto-Sync] Synced ${levels.length} levels for Discord bot`);
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleActionTypeChange = (sectionId: string, level: number, type: 'M' | 'R' | 'BR' | 'TR' | 'S' | 'SS' | '', actionIndex: number = 0) => {
        const key = `${sectionId}-${level}`;
        setActions(prev => {
            const existing = prev[key] || [{ type: '' }];
            const updated = [...existing];
            if (type === '') {
                // Clear this action
                updated[actionIndex] = { type: '' };
            } else {
                updated[actionIndex] = { ...updated[actionIndex], type, moveValue: undefined, description: undefined };
            }
            return { ...prev, [key]: updated };
        });
    };

    const handleActionMoveChange = (sectionId: string, level: number, moveValue: number, actionIndex: number = 0) => {
        const key = `${sectionId}-${level}`;
        setActions(prev => {
            const existing = prev[key] || [{ type: '' }];
            const updated = [...existing];
            updated[actionIndex] = { ...updated[actionIndex], moveValue };
            return { ...prev, [key]: updated };
        });
    };

    const handleActionDescriptionChange = (sectionId: string, level: number, description: string, actionIndex: number = 0) => {
        const key = `${sectionId}-${level}`;
        setActions(prev => {
            const existing = prev[key] || [{ type: '' }];
            const updated = [...existing];
            updated[actionIndex] = { ...updated[actionIndex], description };
            return { ...prev, [key]: updated };
        });
    };

    const addAction = (sectionId: string, level: number) => {
        const key = `${sectionId}-${level}`;
        setActions(prev => {
            const existing = prev[key] || [{ type: '' }];
            return { ...prev, [key]: [...existing, { type: '' }] };
        });
    };

    const exportActions = (section: TableSection, isSuccessfulTab: boolean = false) => {
        if (isSuccessfulTab) {
            const grouped: Record<string, { level: number; description: string }[]> = {
                'Select': [],
                'Super Select': []
            };

            section.data.forEach(row => {
                const level = row['Level'];
                if (level === undefined) return;
                const key = `${section.id}-${level}`;
                const levelActions = actions[key] || [];

                levelActions.forEach(action => {
                    if (!action?.type) return;
                    if (action.type === 'S') {
                        grouped['Select'].push({ level, description: action.description || '-' });
                    } else if (action.type === 'SS') {
                        grouped['Super Select'].push({ level, description: action.description || '-' });
                    }
                });
            });

            // Build table string for successful tab
            let output = '';
            for (const [actionName, items] of Object.entries(grouped)) {
                if (items.length === 0) continue;
                items.forEach((item, idx) => {
                    output += `${idx === 0 ? actionName : ''}\t${item.level}\t${item.description}\n`;
                });
            }

            if (!output.trim()) { alert('No actions entered.'); return; }
            setExportData(output);
            setExportHeaders(['Action', 'Level', 'Description']);
            setShowExportDialog(true);
            return;
        }

        const grouped: Record<string, { level: number; revisionNumber: number; newMove: string; description: string; totalMove: number }[]> = {
            'Revise': [],
            'Big Revise': [],
            'Time Revise': [],
            'Move Change': []
        };

        section.data.forEach(row => {
            const level = row['Level'];
            if (level === undefined) return;
            const key = `${section.id}-${level}`;
            const levelActions = actions[key] || [];

            const currentRevision = parseInt(row['RevisionNumber'] || row['Revision Number'] || '0') || 0;
            const totalMove = Math.round(parseFloat(row['Total Move'] || row['Avg. Total Moves'] || row['TotalMove'] || '0') || 0);

            levelActions.forEach(action => {
                if (!action?.type) return;
                if (action.type === 'R') {
                    grouped['Revise'].push({ level, revisionNumber: currentRevision + 1, newMove: '-', description: action.description || '-', totalMove });
                } else if (action.type === 'BR') {
                    grouped['Big Revise'].push({ level, revisionNumber: currentRevision + 1, newMove: '-', description: action.description || '-', totalMove });
                } else if (action.type === 'TR') {
                    grouped['Time Revise'].push({ level, revisionNumber: currentRevision + 1, newMove: '-', description: action.description || '-', totalMove });
                } else if (action.type === 'M') {
                    const mv = action.moveValue || 0;
                    grouped['Move Change'].push({ level, revisionNumber: currentRevision + 1, newMove: String(totalMove + mv), description: '-', totalMove });
                }
            });
        });

        // Build table string
        let output = '';
        for (const [actionName, items] of Object.entries(grouped)) {
            if (items.length === 0) continue;
            items.forEach((item, idx) => {
                output += `${idx === 0 ? actionName : ''}\t${item.level}\t${item.revisionNumber}\t${item.newMove}\t${item.description}\n`;
            });
        }

        if (!output.trim()) {
            alert('No actions entered.');
            return;
        }

        // Generate Move Summary
        const moveGroups: Record<number, number[]> = {};
        grouped['Move Change'].forEach(item => {
            const mv = parseInt(item.newMove) - item.totalMove; // Calculate move change from NewMove - TotalMove. 
            // Wait, previous logic was: newMove = String(totalMove + mv). So mv = newMove - totalMove.
            // Actually, in the loop above: `const mv = action.moveValue || 0;`
            // We can just re-access the action logical, or parse it?
            // Let's just use the values from the grouped array? 
            // The grouped array has `newMove`. `totalMove`.

            // Better: Iterate the actions again or capture it during the loop.
            // Let's just capture it during the loop for cleanliness.
            // Actually, let's keep it simple and iterate the grouped array IF we have the info needed.
            // grouped['Move Change'] item has: { level, revisionNumber, newMove, description, totalMove }
            // newMove is string. totalMove is number.
            // diff = parseInt(newMove) - totalMove.
        });

        // Let's redo the grouping properly in one pass or just reuse the actions check.
        const moveSummaryGroups: Record<number, number[]> = {};

        section.data.forEach(row => {
            const level = row['Level'];
            if (level === undefined) return;
            const key = `${section.id}-${level}`;
            const levelActions = actions[key] || [];
            levelActions.forEach(action => {
                if (action?.type === 'M' && action.moveValue !== undefined) {
                    const mv = action.moveValue;
                    if (!moveSummaryGroups[mv]) moveSummaryGroups[mv] = [];
                    moveSummaryGroups[mv].push(level);
                }
            });
        });

        let summaryStr = '';
        if (Object.keys(moveSummaryGroups).length > 0) {
            summaryStr = '\nMoves Summary:\n';
            // Sort by move value? User example: -1, 1, 3.
            Object.keys(moveSummaryGroups).sort((a, b) => Number(a) - Number(b)).forEach(mvStr => {
                const mv = Number(mvStr);
                const levels = moveSummaryGroups[mv];
                // Sort levels from small to big
                levels.sort((a, b) => Number(a) - Number(b));
                summaryStr += `${mv} move ${levels.join(' ')}\n`;
            });
        }

        // Build Level Details Table for all actioned levels
        const actionedLevels: { level: number; actionType: string; row: Record<string, any> }[] = [];
        section.data.forEach(row => {
            const level = row['Level'];
            if (level === undefined) return;
            const key = `${section.id}-${level}`;
            const levelActions = actions[key] || [];
            levelActions.forEach(action => {
                if (action?.type && action.type !== 'M') {
                    const actionLabel = action.type === 'R' ? 'R' : action.type === 'BR' ? 'BR' : action.type === 'TR' ? 'TR' : action.type;
                    actionedLevels.push({ level, actionType: actionLabel, row });
                }
            });
        });

        // Sort by level ascending and build table
        actionedLevels.sort((a, b) => a.level - b.level);

        const detailsArray: any[] = [];
        if (actionedLevels.length > 0) {
            summaryStr += '\n\nRevise Levels Details:\n';
            summaryStr += 'Level\tAction\t3 Day Churn\tRepeat\tPlayon per User\tTotal Moves\tLevel Play Time\tAvg First Try Win\tRemaining Move\n';
            actionedLevels.forEach(item => {
                const r = item.row;
                const churn3d = r['3 Days Churn'] || r['3 Day Churn'] || r['3DaysChurn'] || '-';
                const repeat = getCol(r, 'Avg. Repeat Ratio (birleşik)', 'Avg. Repeat Rate', 'Repeat', 'Repeat Rate', 'rep', 'birleşik', 'birlesik');
                const playon = r['Playon per User'] || r['Playon Per User'] || r['PlayonPerUser'] || '-';
                const totalMoves = r['Avg. Total Moves'] || r['Total Move'] || r['TotalMove'] || '-';
                const playTime = r['Avg. Level Play'] || r['Avg. Level Play Time'] || r['Level Play Time'] || r['LevelPlayTime'] || '-';
                const firstTryWin = r['Avg. FirstTryWin'] || r['Avg. FirstTryWinPercent'] || r['Avg First Try Win'] || r['First Try Win'] || '-';
                const remaining = getCol(r, 'RM Total', 'Avg. RM Fixed', 'Average remaining move', 'avg remaining move', 'remaining moves', 'Rem', 'RM', 'Avg. RM', 'Avg RM', 'Moves Left', 'remaining');

                const formatVal = (v: any) => {
                    if (v === '-' || v === undefined || v === null) return '-';
                    const num = parseFloat(v);
                    if (isNaN(num)) return String(v);
                    return num.toFixed(2);
                };

                const formatPercent = (v: any) => {
                    if (v === '-' || v === undefined || v === null) return '-';
                    const num = parseFloat(v);
                    if (isNaN(num)) return String(v);
                    return (num * 100).toFixed(2) + '%';
                };

                const formattedRow = {
                    level: item.level,
                    action: item.actionType,
                    churn3d: formatPercent(churn3d),
                    repeat: formatVal(repeat),
                    playon: formatVal(playon),
                    totalMoves: formatVal(totalMoves),
                    playTime: formatVal(playTime),
                    firstTryWin: formatPercent(firstTryWin),
                    remaining: formatVal(remaining)
                };
                detailsArray.push(formattedRow);

                summaryStr += `${formattedRow.level}\t${formattedRow.action}\t${formattedRow.churn3d}\t${formattedRow.repeat}\t${formattedRow.playon}\t${formattedRow.totalMoves}\t${formattedRow.playTime}\t${formattedRow.firstTryWin}\t${formattedRow.remaining}\n`;
            });
        }

        if (!output.trim()) {
            alert('No actions entered.');
            return;
        }

        setExportData(output);
        setExportSummary(summaryStr); // Set summary
        setExportDetails(detailsArray); // Set details for visual table
        setExportHeaders(['Action', 'Level', 'Revision Number', 'New Move', 'Description']);
        setShowExportDialog(true);
    };

    const copyExportData = () => {
        // Add headers to clipboard data
        const withHeaders = `${exportHeaders.join('\t')}\n${exportData}\n${exportSummary}`;
        navigator.clipboard.writeText(withHeaders);
        alert('Copied to clipboard!');
        setShowExportDialog(false);
    };

    const downloadAsXLS = () => {
        // Create XLS content with headers
        const headers = exportHeaders.join('\t') + '\n';
        const xlsContent = headers + exportData + '\n' + exportSummary;

        // Create a Blob with XLS mimetype
        const blob = new Blob([xlsContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Weekly_Check_Actions.xls';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Combine Actions - adds current section to weekly report
    const combineActions = (section: TableSection, isSuccessfulTab: boolean = false) => {
        let content = '';
        let headers: string[] = [];
        let summary = '';
        let actionedLevels: { level: number; actionType: string; row: Record<string, any> }[] = [];

        if (isSuccessfulTab) {
            const grouped: Record<string, { level: number; description: string }[]> = {
                'Select': [],
                'Super Select': []
            };

            section.data.forEach(row => {
                const level = row['Level'];
                if (level === undefined) return;
                const key = `${section.id}-${level}`;
                const levelActions = actions[key] || [];

                levelActions.forEach(action => {
                    if (!action?.type) return;
                    if (action.type === 'S') {
                        grouped['Select'].push({ level, description: action.description || '-' });
                    } else if (action.type === 'SS') {
                        grouped['Super Select'].push({ level, description: action.description || '-' });
                    }
                });
            });

            headers = ['Action', 'Level', 'Description'];
            for (const [actionName, items] of Object.entries(grouped)) {
                if (items.length === 0) continue;
                items.forEach((item, idx) => {
                    content += `${idx === 0 ? actionName : ''}\t${item.level}\t${item.description}\n`;
                });
            }
        }
        else {
            const grouped: Record<string, { level: number; revisionNumber: number; newMove: string; description: string; totalMove: number }[]> = {
                'Revise': [],
                'Big Revise': [],
                'Time Revise': [],
                'Move Change': []
            };

            section.data.forEach(row => {
                const level = row['Level'];
                if (level === undefined) return;
                const key = `${section.id}-${level}`;
                const levelActions = actions[key] || [];

                const currentRevision = parseInt(row['RevisionNumber'] || row['Revision Number'] || '0') || 0;
                const totalMove = Math.round(parseFloat(row['Total Move'] || row['Avg. Total Moves'] || row['TotalMove'] || '0') || 0);

                levelActions.forEach(action => {
                    if (!action?.type) return;
                    if (action.type === 'R') {
                        grouped['Revise'].push({ level, revisionNumber: currentRevision + 1, newMove: '-', description: action.description || '-', totalMove });
                    } else if (action.type === 'BR') {
                        grouped['Big Revise'].push({ level, revisionNumber: currentRevision + 1, newMove: '-', description: action.description || '-', totalMove });
                    } else if (action.type === 'TR') {
                        grouped['Time Revise'].push({ level, revisionNumber: currentRevision + 1, newMove: '-', description: action.description || '-', totalMove });
                    } else if (action.type === 'M') {
                        const mv = action.moveValue || 0;
                        grouped['Move Change'].push({ level, revisionNumber: currentRevision + 1, newMove: String(totalMove + mv), description: '-', totalMove });
                    }
                });
            });

            headers = ['Action', 'Level', 'Revision Number', 'New Move', 'Description'];
            for (const [actionName, items] of Object.entries(grouped)) {
                if (items.length === 0) continue;
                items.forEach((item, idx) => {
                    content += `${idx === 0 ? actionName : ''}\t${item.level}\t${item.revisionNumber}\t${item.newMove}\t${item.description}\n`;
                });
            }

            // Move Summary
            const moveSummaryGroups: Record<number, number[]> = {};
            section.data.forEach(row => {
                const level = row['Level'];
                if (level === undefined) return;
                const key = `${section.id}-${level}`;
                const levelActions = actions[key] || [];
                levelActions.forEach(action => {
                    if (action?.type === 'M' && action.moveValue !== undefined) {
                        const mv = action.moveValue;
                        if (!moveSummaryGroups[mv]) moveSummaryGroups[mv] = [];
                        moveSummaryGroups[mv].push(level);
                    }
                });
            });

            if (Object.keys(moveSummaryGroups).length > 0) {
                summary = 'Moves Summary: ';
                Object.keys(moveSummaryGroups).sort((a, b) => Number(a) - Number(b)).forEach(mvStr => {
                    const mv = Number(mvStr);
                    const levels = moveSummaryGroups[mv].sort((a, b) => a - b);
                    summary += `${mv} move: ${levels.join(' ')}  `;
                });
            }

            // Build Level Details Table for all actioned levels
            actionedLevels.push(...section.data.map(row => {
                const level = row['Level'];
                if (level === undefined) return null;
                const key = `${section.id}-${level}`;
                const levelActions = actions[key] || [];
                let actionType = '';
                levelActions.forEach(action => {
                    if (action?.type && action.type !== 'M') {
                        actionType = action.type === 'R' ? 'R' : action.type === 'BR' ? 'BR' : action.type === 'TR' ? 'TR' : action.type;
                    }
                });
                if (!actionType) return null;
                return { level, actionType, row };
            }).filter((x): x is { level: number; actionType: string; row: Record<string, any> } => x !== null));

            // Sort by level ascending
            actionedLevels.sort((a, b) => a.level - b.level);

            if (actionedLevels.length > 0) {
                summary += '\n\nRevise Levels Details:\nLevel\tAction\t3 Day Churn\tRepeat\tPlayon per User\tTotal Moves\tLevel Play Time\tAvg First Try Win\tRemaining Move\n';
                actionedLevels.forEach(item => {
                    const r = item.row;
                    const churn3d = r['3 Days Churn'] || r['3 Day Churn'] || r['3DaysChurn'] || '-';
                    const repeat = getCol(r, 'Avg. Repeat Ratio (birleşik)', 'Avg. Repeat Rate', 'Repeat', 'Repeat Rate', 'rep', 'birleşik', 'birlesik');
                    const playon = r['Playon per User'] || r['Playon Per User'] || r['PlayonPerUser'] || '-';
                    const totalMoves = r['Avg. Total Moves'] || r['Total Move'] || r['TotalMove'] || '-';
                    const playTime = r['Avg. Level Play'] || r['Avg. Level Play Time'] || r['Level Play Time'] || r['LevelPlayTime'] || '-';
                    const firstTryWin = r['Avg. FirstTryWin'] || r['Avg. FirstTryWinPercent'] || r['Avg First Try Win'] || r['First Try Win'] || '-';
                    const remaining = getCol(r, 'RM Total', 'Avg. RM Fixed', 'Average remaining move', 'avg remaining move', 'remaining moves', 'Rem', 'RM', 'Avg. RM', 'Avg RM', 'Moves Left', 'remaining');

                    const formatVal = (v: any) => {
                        if (v === '-' || v === undefined || v === null) return '-';
                        const num = parseFloat(v);
                        if (isNaN(num)) return String(v);
                        return num.toFixed(2);
                    };

                    const formatPercent = (v: any) => {
                        if (v === '-' || v === undefined || v === null) return '-';
                        const num = parseFloat(v);
                        if (isNaN(num)) return String(v);
                        return (num * 100).toFixed(2) + '%';
                    };

                    summary += `${item.level}\t${item.actionType}\t${formatPercent(churn3d)}\t${formatVal(repeat)}\t${formatVal(playon)}\t${formatVal(totalMoves)}\t${formatVal(playTime)}\t${formatPercent(firstTryWin)}\t${formatVal(remaining)}\n`;
                });
            }


        }

        if (!content.trim()) {
            alert('No actions to combine in this section.');
            return;
        }

        // Add to combined report (replace if same section title exists)
        setCombinedReport(prev => {
            const filtered = prev.filter(s => s.title !== section.title);
            return [...filtered, {
                title: section.title, content, headers, summary, details: actionedLevels.length > 0 ? actionedLevels.map(item => {
                    const r = item.row;
                    const churn3d = r['3 Days Churn'] || r['3 Day Churn'] || r['3DaysChurn'] || '-';
                    const repeat = getCol(r, 'Avg. Repeat Ratio (birleşik)', 'Avg. Repeat Rate', 'Repeat', 'Repeat Rate', 'rep', 'birleşik', 'birlesik');
                    const playon = r['Playon per User'] || r['Playon Per User'] || r['PlayonPerUser'] || '-';
                    const totalMoves = r['Avg. Total Moves'] || r['Total Move'] || r['TotalMove'] || '-';
                    const playTime = r['Avg. Level Play'] || r['Avg. Level Play Time'] || r['Level Play Time'] || r['LevelPlayTime'] || '-';
                    const firstTryWin = r['Avg. FirstTryWin'] || r['Avg. FirstTryWinPercent'] || r['Avg First Try Win'] || r['First Try Win'] || '-';
                    const remaining = getCol(r, 'RM Total', 'Avg. RM Fixed', 'Average remaining move', 'avg remaining move', 'remaining moves', 'Rem', 'RM', 'Avg. RM', 'Avg RM', 'Moves Left', 'remaining');

                    const formatVal = (v: any) => {
                        if (v === '-' || v === undefined || v === null) return '-';
                        const num = parseFloat(v);
                        if (isNaN(num)) return String(v);
                        return num.toFixed(2);
                    };

                    const formatPercent = (v: any) => {
                        if (v === '-' || v === undefined || v === null) return '-';
                        const num = parseFloat(v);
                        if (isNaN(num)) return String(v);
                        return (num * 100).toFixed(2) + '%';
                    };

                    return {
                        level: item.level,
                        action: item.actionType,
                        churn3d: formatPercent(churn3d),
                        repeat: formatVal(repeat),
                        playon: formatVal(playon),
                        totalMoves: formatVal(totalMoves),
                        playTime: formatVal(playTime),
                        firstTryWin: formatPercent(firstTryWin),
                        remaining: formatVal(remaining)
                    };
                }) : []
            }];
        });

        alert(`Added "${section.title}" to Weekly Report! (${combinedReport.length + 1} sections total)`);
    };

    // Download Weekly Report as XLS
    const downloadWeeklyReport = () => {
        if (combinedReport.length === 0) {
            alert('No sections combined yet. Click "Combine Actions" on each section first.');
            return;
        }

        const gameName = config?.games.find(g => g.id === selectedGameId)?.name || 'Unknown Game';
        const dateStr = new Date().toLocaleDateString('en-GB');

        let xlsContent = `Game: ${gameName}\nDate: ${dateStr}\n\n`;

        // Individual sections
        combinedReport.forEach(section => {
            xlsContent += `=== ${section.title} ===\n`;
            xlsContent += section.headers.join('\t') + '\n';
            xlsContent += section.content;
            if (section.summary) {
                xlsContent += section.summary + '\n';
            }
            if (section.details && section.details.length > 0) {
                xlsContent += '\nLevel Details Table:\n';
                xlsContent += 'Level\tAction\t3 Day Churn\tRepeat\tPlayon per User\tTotal Moves\tLevel Play Time\tAvg First Try Win\tRemaining Move\n';
                section.details.forEach(row => {
                    xlsContent += `${row.level}\t${row.action}\t${row.churn3d}\t${row.repeat}\t${row.playon}\t${row.totalMoves}\t${row.playTime}\t${row.firstTryWin}\t${row.remaining}\n`;
                });
            }
            xlsContent += '\n';
        });

        // Create merged table (all actions combined)
        xlsContent += `=== MERGED TABLE ===\n`;
        xlsContent += 'Section\tAction\tLevel\tRevision Number\tNew Move\tDescription\n';

        combinedReport.forEach(section => {
            const lines = section.content.split('\n').filter(Boolean);
            let currentAction = '';
            lines.forEach(line => {
                const parts = line.split('\t');
                if (parts[0]) currentAction = parts[0];
                // Add section name as first column
                xlsContent += `${section.title}\t${currentAction}\t${parts.slice(1).join('\t')}\n`;
            });
        });

        // Combined moves summary
        const allMoveSummaries: Record<number, number[]> = {};
        combinedReport.forEach(section => {
            if (section.summary) {
                // Parse "Moves Summary: -1 move: 100 101  1 move: 200 201"
                const matches = section.summary.matchAll(/(-?\d+)\s*move:\s*([\d\s]+)/g);
                for (const match of matches) {
                    const mv = parseInt(match[1]);
                    const levels = match[2].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
                    if (!allMoveSummaries[mv]) allMoveSummaries[mv] = [];
                    allMoveSummaries[mv].push(...levels);
                }
            }
        });

        if (Object.keys(allMoveSummaries).length > 0) {
            xlsContent += '\n=== COMBINED MOVES SUMMARY ===\n';
            Object.keys(allMoveSummaries).sort((a, b) => Number(a) - Number(b)).forEach(mvStr => {
                const mv = Number(mvStr);
                const levels = [...new Set(allMoveSummaries[mv])].sort((a, b) => a - b);
                xlsContent += `${mv} move: ${levels.join(' ')}\n`;
            });
        }

        const blob = new Blob([xlsContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Weekly_Report_${gameName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setShowWeeklyReportDialog(false);
    };

    // Helper to get combined moves summary for display
    const getCombinedMovesSummary = (): string => {
        const allMoveSummaries: Record<number, number[]> = {};
        combinedReport.forEach(section => {
            if (section.summary) {
                const matches = section.summary.matchAll(/(-?\d+)\s*move:\s*([\d\s]+)/g);
                for (const match of matches) {
                    const mv = parseInt(match[1]);
                    const levels = match[2].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
                    if (!allMoveSummaries[mv]) allMoveSummaries[mv] = [];
                    allMoveSummaries[mv].push(...levels);
                }
            }
        });

        if (Object.keys(allMoveSummaries).length === 0) return '';

        let summary = '';
        Object.keys(allMoveSummaries).sort((a, b) => Number(a) - Number(b)).forEach(mvStr => {
            const mv = Number(mvStr);
            const levels = [...new Set(allMoveSummaries[mv])].sort((a, b) => a - b);
            summary += `${mv} move: ${levels.join(' ')}  `;
        });
        return summary.trim();
    };

    // Save Weekly Report to database
    const [savingReport, setSavingReport] = useState(false);
    const saveWeeklyReport = async () => {
        if (combinedReport.length === 0 || !selectedGameId || !config) return;

        setSavingReport(true);
        const gameName = config.games.find(g => g.id === selectedGameId)?.name || 'Unknown Game';

        try {
            const res = await fetch('/api/weekly-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: selectedGameId,
                    gameName,
                    reportData: combinedReport
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save');
            }

            alert('Report saved successfully! View it in Weekly Reports.');
        } catch (err: any) {
            alert('Failed to save report: ' + err.message);
        } finally {
            setSavingReport(false);
        }
    };

    const toggleSection = (sectionId: string, tabType: 'unsuccessful' | 'successful' | 'last30') => {
        if (tabType === 'unsuccessful') {
            setUnsuccessfulSections(prev => prev.map(s => s.id === sectionId ? { ...s, expanded: !s.expanded } : s));
        } else if (tabType === 'successful') {
            setSuccessfulSections(prev => prev.map(s => s.id === sectionId ? { ...s, expanded: !s.expanded } : s));
        } else {
            setLast30Section(prev => ({ ...prev, expanded: !prev.expanded }));
        }
    };

    const getMultipliers = (cluster: string) => {
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

    const updateCluster = (level: number, cluster: string) => {
        // Find row to get component scores
        const row = rawData.find(r => {
            const levelCol = Object.keys(r).find(k => {
                const n = normalizeHeader(k);
                return n === 'level' || n === 'level number' || n === 'level_number';
            }) || 'Level';
            return parseInt(String(r[levelCol] || 0).replace(/[^\d-]/g, '')) === level;
        });

        let newScore = null;
        if (row) {
            const monetizationScore = parseNum(getCol(row, 'Monetization Score', 'Monetization_Score', 'Monetization'));
            const engagementScore = parseNum(getCol(row, 'Engagement Score', 'Engagement_Score', 'Engagement'));
            const satisfactionScore = parseNum(getCol(row, 'Satisfaction Score', 'Satisfaction_Score', 'Satisfaction'));

            const mult = getMultipliers(cluster);
            newScore = (monetizationScore * mult.monetization) +
                (engagementScore * mult.engagement) +
                (satisfactionScore * mult.satisfaction);
        }

        // Optimistic update
        setSavedScores(prev => ({
            ...prev,
            [level]: { cluster, score: newScore }
        }));

        // Update rawData to trigger re-sort in effects
        setRawData(prev => prev.map(r => {
            const levelCol = Object.keys(r).find(k => {
                const n = normalizeHeader(k);
                return n === 'level' || n === 'level number' || n === 'level_number';
            }) || 'Level';
            const rowLevel = parseInt(String(r[levelCol] || 0).replace(/[^\d-]/g, '')) || 0;
            if (rowLevel === level) {
                // Also update matching Level Score field so re-sort logic picks it up
                const levelScoreCol = Object.keys(r).find(k => normalizeHeader(k).includes('level score')) || 'Level Score';
                return { ...r, 'Clu': cluster, 'Score': newScore, [levelScoreCol]: newScore };
            }
            return r;
        }));

        // Mark as pending
        setPendingClusterChanges(prev => ({ ...prev, [level]: true }));
    };

    const saveClusterChange = async (level: number) => {
        const saved = savedScores[level];
        if (!saved) return;

        try {
            setLoading(true);
            const res = await fetch("/api/level-scores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    gameId: selectedGameId || config?.games[0]?.id,
                    levels: [{ level, cluster: saved.cluster, score: saved.score }]
                }),
            });
            if (res.ok) {
                setPendingClusterChanges(prev => {
                    const next = { ...prev };
                    delete next[level];
                    return next;
                });
            } else {
                alert("Failed to save cluster");
            }
        } catch (e) {
            console.error("Failed to save cluster", e);
            alert("Failed to save cluster");
        } finally {
            setLoading(false);
        }
    };

    const saveAllPendingClusters = async () => {
        const levelsToSave = Object.keys(pendingClusterChanges).map(Number);
        if (levelsToSave.length === 0) return;

        const payload = levelsToSave.map(level => {
            const saved = savedScores[level];
            if (!saved) return null;
            return { level, cluster: saved.cluster, score: saved.score };
        }).filter(Boolean);

        if (payload.length === 0) return;

        try {
            setLoading(true);
            const res = await fetch("/api/level-scores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    gameId: selectedGameId || config?.games[0]?.id,
                    levels: payload
                }),
            });

            if (res.ok) {
                setPendingClusterChanges({});
            } else {
                alert("Failed to save changes");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to save changes");
        } finally {
            setLoading(false);
        }
    };

    const renderSection = (section: TableSection, tabType: 'unsuccessful' | 'successful' | 'last30') => (
        <div key={section.id} className="rounded-xl border shadow-sm bg-card overflow-hidden">
            <button
                onClick={() => toggleSection(section.id, tabType)}
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
                                    <TableHead className="whitespace-nowrap font-bold text-foreground bg-muted" style={{ position: 'sticky', left: 0, zIndex: 30 }}>Action</TableHead>
                                    {section.headers.slice(0, 50).map((header) => (
                                        <TableHead key={header} className="whitespace-nowrap font-bold text-foreground bg-muted">
                                            {getDisplayName(header, config?.weeklyCheck?.columnRenames)}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {section.data.map((row, i) => {
                                    const level = row['Level'];
                                    const key = `${section.id}-${level}`;
                                    const levelActions = actions[key] || [{ type: '' }];
                                    return (
                                        <TableRow key={i} className="hover:bg-muted/30">
                                            <TableCell className="whitespace-nowrap sticky left-0 bg-card z-10 p-2">
                                                <div className="flex flex-row items-start gap-1">
                                                    <div className="mt-1 flex-shrink-0">
                                                        {row['Level'] && (() => {
                                                            const getNeighboringLevels = (currentLevel: number, allData: any[]) => {
                                                                const sorted = [...allData]
                                                                    .filter(x => x && x['Level'] !== undefined)
                                                                    .sort((a, b) => Number(a['Level']) - Number(b['Level']));
                                                                const currentIndex = sorted.findIndex(r => Number(r['Level']) === currentLevel);
                                                                if (currentIndex === -1) return { prev: [], current: null, next: [] };

                                                                const prev = sorted.slice(Math.max(0, currentIndex - 5), currentIndex);
                                                                const current = sorted[currentIndex];
                                                                const next = sorted.slice(currentIndex + 1, currentIndex + 6);
                                                                return { prev, current, next };
                                                            };

                                                            const { prev, current, next } = getNeighboringLevels(Number(row['Level']), rawData);

                                                            const combinedData = [
                                                                ...prev,
                                                                ...(current ? [{ ...current, isCurrent: true }] : []),
                                                                ...next
                                                            ];

                                                            const renderMiniTable = (data: any[]) => {
                                                                if (data.length === 0) return null;
                                                                return (
                                                                    <div className="mb-2">
                                                                        <div className="border rounded-md overflow-hidden">
                                                                            <table className="w-full text-[10px]">
                                                                                <thead className="bg-muted">
                                                                                    <tr>
                                                                                        <th className="p-1 font-medium text-left">Lvl</th>
                                                                                        <th className="p-1 font-medium text-right">Churn</th>
                                                                                        <th className="p-1 font-medium text-right text-red-600">Rep</th>
                                                                                        <th className="p-1 font-medium text-right">Playon</th>
                                                                                        <th className="p-1 font-medium text-right">Moves</th>
                                                                                        <th className="p-1 font-medium text-right">Time</th>
                                                                                        <th className="p-1 font-medium text-right">1stWin</th>
                                                                                        <th className="p-1 font-medium text-right">Rem</th>
                                                                                        <th className="p-1 font-medium text-right text-blue-600">Clu</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {data.map((r, ri) => {
                                                                                        const isCurrent = r.isCurrent;
                                                                                        const churn3d = r['3 Days Churn'] || r['3 Day Churn'] || r['3DaysChurn'] || '-';
                                                                                        const repeat = getCol(r, 'Avg. Repeat Ratio (birleşik)', 'Avg. Repeat Rate', 'Repeat', 'Repeat Rate', 'rep', 'birleşik', 'birlesik');
                                                                                        const playon = r['Playon per User'] || r['Playon Per User'] || r['PlayonPerUser'] || '-';
                                                                                        const totalMoves = r['Avg. Total Moves'] || r['Total Move'] || r['TotalMove'] || '-';
                                                                                        const playTime = r['Avg. Level Play'] || r['Avg. Level Play Time'] || r['Level Play Time'] || r['LevelPlayTime'] || '-';
                                                                                        const firstTryWin = r['Avg. FirstTryWin'] || r['Avg. FirstTryWinPercent'] || r['Avg First Try Win'] || r['First Try Win'] || '-';
                                                                                        const remaining = getCol(r, 'RM Total', 'Avg. RM Fixed', 'Average remaining move', 'avg remaining move', 'remaining moves', 'Rem', 'RM', 'Avg. RM', 'Avg RM', 'Moves Left', 'remaining');

                                                                                        const formatVal = (v: any) => {
                                                                                            if (v === '-' || v === undefined) return '-';
                                                                                            const num = parseFloat(v);
                                                                                            if (isNaN(num)) return String(v).substring(0, 4);
                                                                                            return num.toFixed(2);
                                                                                        };

                                                                                        const formatPercent = (v: any) => {
                                                                                            if (v === '-' || v === undefined) return '-';
                                                                                            const num = parseFloat(v);
                                                                                            if (isNaN(num)) return String(v).substring(0, 4);
                                                                                            return (num * 100).toFixed(2) + '%';
                                                                                        };

                                                                                        return (
                                                                                            <tr key={ri} className={cn(
                                                                                                "border-t hover:bg-muted/50 transition-colors",
                                                                                                isCurrent && "bg-muted font-bold border-primary/20"
                                                                                            )}>
                                                                                                <td className="p-1 font-medium">{r['Level']}</td>
                                                                                                <td className="p-1 text-right">{formatPercent(churn3d)}</td>
                                                                                                <td className="p-1 text-right text-red-600">{formatVal(repeat)}</td>
                                                                                                <td className="p-1 text-right">{formatVal(playon)}</td>
                                                                                                <td className="p-1 text-right">{formatVal(totalMoves)}</td>
                                                                                                <td className="p-1 text-right">{formatVal(playTime)}</td>
                                                                                                <td className="p-1 text-right">{formatPercent(firstTryWin)}</td>
                                                                                                <td className="p-1 text-right">{formatVal(remaining)}</td>
                                                                                                <td className="p-1 text-right font-medium text-blue-600">{savedScores[parseInt(r['Level'])]?.cluster || '-'}</td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            };

                                                            return (
                                                                <div className="flex items-center gap-2 min-w-[70px]">
                                                                    <Popover>
                                                                        <PopoverTrigger asChild>
                                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted bg-muted/50 rounded-full border border-border/50">
                                                                                <Search className="h-4 w-4 text-primary" />
                                                                            </Button>
                                                                        </PopoverTrigger>
                                                                        <PopoverContent className="w-[500px] p-4" align="start" side="bottom">
                                                                            <h4 className="font-semibold text-sm mb-2">Level Context: {row['Level']}</h4>
                                                                            {renderMiniTable(combinedData)}
                                                                        </PopoverContent>
                                                                    </Popover>
                                                                    {pendingClusterChanges[Number(row['Level'])] && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-8 w-8 p-0 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded-full border border-green-200"
                                                                            onClick={() => saveClusterChange(Number(row['Level']))}
                                                                            title="Save Cluster Change"
                                                                        >
                                                                            <Save className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>



                                                    <div className="flex flex-col gap-1">
                                                        {levelActions.map((action, actionIndex) => (
                                                            <div key={actionIndex} className="flex gap-1 items-center">
                                                                <Select
                                                                    value={action.type || '_clear'}
                                                                    onValueChange={(val) => handleActionTypeChange(section.id, level, val === '_clear' ? '' : val as any, actionIndex)}
                                                                >
                                                                    <SelectTrigger className="w-16 h-8">
                                                                        <SelectValue placeholder="-" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="_clear">-</SelectItem>
                                                                        {tabType === 'successful' ? (
                                                                            <>
                                                                                <SelectItem value="S">S</SelectItem>
                                                                                <SelectItem value="SS">SS</SelectItem>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <SelectItem value="M">M</SelectItem>
                                                                                <SelectItem value="R">R</SelectItem>
                                                                                <SelectItem value="BR">BR</SelectItem>
                                                                                <SelectItem value="TR">TR</SelectItem>
                                                                            </>
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                                {action.type === 'M' && (
                                                                    <Select
                                                                        value={action.moveValue !== undefined ? String(action.moveValue) : ''}
                                                                        onValueChange={(val) => handleActionMoveChange(section.id, level, parseInt(val), actionIndex)}
                                                                    >
                                                                        <SelectTrigger className="w-14 h-8">
                                                                            <SelectValue placeholder="0" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="-3">-3</SelectItem>
                                                                            <SelectItem value="-2">-2</SelectItem>
                                                                            <SelectItem value="-1">-1</SelectItem>
                                                                            <SelectItem value="1">+1</SelectItem>
                                                                            <SelectItem value="2">+2</SelectItem>
                                                                            <SelectItem value="3">+3</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                                {(action.type === 'R' || action.type === 'BR' || action.type === 'TR' || action.type === 'S' || action.type === 'SS') && (
                                                                    <Input
                                                                        type="text"
                                                                        className="w-28 h-8 text-xs"
                                                                        value={action.description || ''}
                                                                        onChange={(e) => handleActionDescriptionChange(section.id, level, e.target.value, actionIndex)}
                                                                        placeholder="Desc..."
                                                                    />
                                                                )}
                                                                {actionIndex === levelActions.length - 1 && action.type && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0"
                                                                        onClick={() => addAction(section.id, level)}
                                                                        title="Add another action"
                                                                    >
                                                                        +
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {section.headers.slice(0, 50).map((header) => {
                                                if (header === 'Clu' || header === 'Cluster') {
                                                    return (
                                                        <TableCell key={`${i}-${header}`} className="whitespace-nowrap bg-card z-10 w-min px-1">
                                                            <Select
                                                                value={savedScores[Number(row['Level'])]?.cluster || '-'}
                                                                onValueChange={(v) => updateCluster(Number(row['Level']), v)}
                                                            >
                                                                <SelectTrigger className="h-8 w-[60px] border-none shadow-none text-xs font-bold text-blue-600">
                                                                    <SelectValue placeholder="-" />
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

                                                if (header === 'Score' || header === 'Level Score') {
                                                    const currentLevel = Number(row['Level']);
                                                    const overhead = savedScores[currentLevel];
                                                    const displayScore = (overhead && overhead.score !== null)
                                                        ? overhead.score
                                                        : row[header];

                                                    return (
                                                        <TableCell
                                                            key={`${i}-${header}`}
                                                            className="whitespace-nowrap font-medium text-muted-foreground"
                                                        >
                                                            {formatTableValue(displayScore, header)}
                                                        </TableCell>
                                                    );
                                                }

                                                const isClu = header === 'Clu';
                                                const isBold = isClu && row['Clu'] !== row['__FinalCluster'];

                                                return (
                                                    <TableCell
                                                        key={`${i}-${header}`}
                                                        className={cn(
                                                            "whitespace-nowrap font-medium text-muted-foreground",
                                                            isBold && "font-bold text-foreground border-2 border-primary/20 bg-primary/5"
                                                        )}
                                                    >
                                                        {formatTableValue(row[header], header)}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="p-3 border-t bg-muted/20 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => combineActions(section, tabType === 'successful')} className="gap-2">
                            + Combine
                        </Button>
                        {Object.keys(pendingClusterChanges).length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={saveAllPendingClusters}
                                className="gap-2 border-2 border-primary font-bold animate-pulse hover:bg-primary/10"
                            >
                                <Save className="h-4 w-4" />
                                Save {Object.keys(pendingClusterChanges).length} Clusters
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => exportActions(section, tabType === 'successful')} className="gap-2">
                            <Download className="h-4 w-4" /> Export Actions
                        </Button>
                    </div>
                </div>
            )
            }

            {
                section.expanded && section.data.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                        No data loaded. Select a game and click "Load Data".
                    </div>
                )
            }
        </div >
    );

    if (loadingConfig) return <div className="p-8 animate-pulse text-muted-foreground">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-destructive">Failed to load configuration.</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Cache Dialog */}
            {showCacheDialog && cachedDataInfo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-2">Existing Data Found</h3>
                        <p className="text-muted-foreground mb-4">Data for this selection was saved on:</p>
                        <div className="bg-muted/50 rounded-lg p-3 mb-4">
                            <p className="font-medium text-sm">{cachedDataInfo.fileName}</p>
                            <p className="text-xs text-muted-foreground mt-1">{format(cachedDataInfo.createdAt, "MMMM d, yyyy 'at' HH:mm")}</p>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => loadData(false)}>Use Saved Data</Button>
                            <Button className="flex-1" onClick={() => loadData(true)}>Fetch New Data</Button>
                        </div>
                        <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground" onClick={() => { setShowCacheDialog(false); setCachedDataInfo(null); }}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Export Actions Dialog */}
            {showExportDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card rounded-xl shadow-2xl border p-6 max-w-2xl w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-2">Export Actions</h3>
                        <p className="text-muted-foreground mb-4 text-sm">Copy this table data to paste into your spreadsheet:</p>
                        <div className="bg-muted rounded-lg p-3 mb-4 overflow-auto max-h-[300px]">
                            <table className="w-full text-sm font-mono">
                                <thead>
                                    <tr className="border-b">
                                        {exportHeaders.map((header) => (
                                            <th key={header} className="text-left py-1 pr-4 font-bold">{header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {exportData.split('\n').filter(Boolean).map((line, idx) => {
                                        const parts = line.split('\t');
                                        return (
                                            <tr key={idx} className="border-b border-muted-foreground/20">
                                                {exportHeaders.map((_, i) => (
                                                    <td key={i} className="py-1 pr-4">{parts[i] || ''}</td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {/* Summary / Revise Levels Details */}
                        {(exportSummary.includes("Moves Summary") || exportDetails.length > 0) && (
                            <div className="bg-muted/50 rounded-lg p-3 mb-4 space-y-4">
                                {/* Moves Summary Text */}
                                {exportSummary.includes("Moves Summary") && (
                                    <div className="text-sm font-mono whitespace-pre-wrap">
                                        {exportSummary.split("Revise Levels Details")[0].split("Moves Summary:")[1]?.trim() ? (
                                            <>
                                                <div className="font-semibold mb-1">Moves Summary:</div>
                                                {exportSummary.split("Revise Levels Details")[0].split("Moves Summary:")[1]}
                                            </>
                                        ) : null}
                                    </div>
                                )}

                                {/* Visual Table for Revise Levels Details */}
                                {exportDetails.length > 0 && (
                                    <div>
                                        <div className="font-semibold text-sm mb-2">Revise Levels Details:</div>
                                        <div className="border rounded-md bg-background overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted hover:bg-muted">
                                                        <TableHead className="h-8 py-1">Level</TableHead>
                                                        <TableHead className="h-8 py-1">Action</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">3d Churn</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">Repeat</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">Playon</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">Moves</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">Time</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">1stWin</TableHead>
                                                        <TableHead className="h-8 py-1 text-right">Rem</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {exportDetails.map((row, i) => (
                                                        <TableRow key={i} className="hover:bg-muted/50">
                                                            <TableCell className="py-1 font-medium">{row.level}</TableCell>
                                                            <TableCell className="py-1">{row.action}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.churn3d}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.repeat}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.playon}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.totalMoves}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.playTime}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.firstTryWin}</TableCell>
                                                            <TableCell className="py-1 text-right">{row.remaining}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <Button className="flex-1" onClick={copyExportData}>Copy to Clipboard</Button>
                            <Button variant="secondary" className="flex-1" onClick={downloadAsXLS}>Download XLS</Button>
                            <Button variant="outline" onClick={() => setShowExportDialog(false)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Weekly Report Dialog */}
            {showWeeklyReportDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-auto shadow-2xl">
                        <h3 className="text-lg font-semibold mb-2">📋 Weekly Report</h3>
                        <p className="text-muted-foreground mb-4 text-sm">
                            {config?.games.find(g => g.id === selectedGameId)?.name || 'Unknown Game'} - {new Date().toLocaleDateString('en-GB')}
                        </p>

                        {combinedReport.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">
                                No sections combined yet. Click "+ Combine" on each section first.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {combinedReport.map((section, idx) => (
                                    <div key={idx} className="border rounded-lg overflow-hidden">
                                        <div className="bg-muted/50 px-4 py-2 font-semibold flex justify-between items-center">
                                            <span>{section.title}</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCombinedReport(prev => prev.filter((_, i) => i !== idx))}
                                                className="h-6 px-2 text-destructive hover:text-destructive"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                        <div className="overflow-auto max-h-[400px]">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted/50 sticky top-0">
                                                    <tr>
                                                        {section.headers.map((h, i) => <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {section.content.split('\n').filter(Boolean).map((line, lineIdx) => {
                                                        const parts = line.split('\t');
                                                        return (
                                                            <tr key={lineIdx} className="border-b border-muted-foreground/20">
                                                                {section.headers.map((_, i) => (
                                                                    <td key={i} className="py-1 pr-4">{parts[i] || ''}</td>
                                                                ))}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {
                                            section.details && section.details.length > 0 && (
                                                <div className="mt-4 px-1">
                                                    <h4 className="font-semibold text-xs mb-2">Revise Levels Details:</h4>
                                                    <div className="border rounded-md overflow-hidden">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow className="bg-muted hover:bg-muted">
                                                                    <TableHead className="h-7 py-1 text-xs">Level</TableHead>
                                                                    <TableHead className="h-7 py-1 text-xs">Action</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">3d Churn</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">Repeat</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">Playon</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">Moves</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">Time</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">1stWin</TableHead>
                                                                    <TableHead className="h-7 py-1 text-right text-xs">Rem</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {section.details.map((row, i) => (
                                                                    <TableRow key={i} className="hover:bg-muted/50 border-b border-muted/20">
                                                                        <TableCell className="py-1 font-medium text-xs">{row.level}</TableCell>
                                                                        <TableCell className="py-1 text-xs">{row.action}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.churn3d}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.repeat}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.playon}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.totalMoves}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.playTime}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.firstTryWin}</TableCell>
                                                                        <TableCell className="py-1 text-right text-xs">{row.remaining}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>
                                            )
                                        }
                                        {
                                            section.summary && (
                                                <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                                    {section.summary.split("Revise Levels Details:")[0].trim()}
                                                </div>
                                            )
                                        }
                                    </div >

                                ))
                                }
                            </div >
                        )
                        }

                        {/* Combined Moves Summary */}
                        {
                            getCombinedMovesSummary() && (
                                <div className="mt-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                                    <h4 className="font-semibold text-sm mb-2">📊 Combined Moves Summary</h4>
                                    <p className="font-mono text-sm">{getCombinedMovesSummary()}</p>
                                </div>
                            )
                        }

                        <div className="flex gap-3 mt-6">
                            <Button variant="secondary" onClick={saveWeeklyReport} disabled={combinedReport.length === 0 || savingReport}>
                                {savingReport ? 'Saving...' : '💾 Save Report'}
                            </Button>
                            <Button className="flex-1" onClick={downloadWeeklyReport} disabled={combinedReport.length === 0}>
                                Download Merged XLS
                            </Button>
                            <Button variant="outline" onClick={() => setCombinedReport([])}>
                                Clear All
                            </Button>
                            <Button variant="outline" onClick={() => setShowWeeklyReportDialog(false)}>
                                Close
                            </Button>
                        </div>
                    </div >
                </div >
            )
            }

            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">Weekly Check</h1>
                        <p className="text-muted-foreground">Review key metrics from Level Revize data</p>
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
                            {availableGames?.map(g => (<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>))}
                            {availableGames?.length === 0 && <SelectItem value="none" disabled>No games available</SelectItem>}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={handleLoad} disabled={loading || !selectedGameId} className="shadow-sm w-full sm:w-auto">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Load Data
                </Button>
                {combinedReport.length > 0 && (
                    <Button variant="secondary" onClick={() => setShowWeeklyReportDialog(true)} className="shadow-sm w-full sm:w-auto gap-2">
                        📋 Weekly Report ({combinedReport.length})
                    </Button>
                )}
            </div>

            {
                error && (
                    <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">{error}</div>
                )
            }

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="unsuccessful">Unsuccessful</TabsTrigger>
                    <TabsTrigger value="successful">Successful</TabsTrigger>
                    <TabsTrigger value="last30">Last 30 Levels</TabsTrigger>
                </TabsList>

                {/* Unsuccessful Tab */}
                <TabsContent value="unsuccessful" className="space-y-4 mt-4">
                    <div className="flex flex-wrap gap-4 items-end p-3 bg-muted/30 rounded-lg border">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Level</label>
                            <Input type="number" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} className="w-20 h-8 bg-background" min={0} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Users</label>
                            <Input type="number" value={minTotalUser} onChange={(e) => setMinUsers(Number(e.target.value))} className="w-24 h-8 bg-background" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Days Old</label>
                            <Input type="number" value={minDaysSinceEvent} onChange={(e) => setMinDaysSinceEvent(Number(e.target.value))} className="w-20 h-8 bg-background" min={0} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Clu</label>
                            <div className="flex gap-1">
                                {['1', '2', '3', '4', 'None'].map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => {
                                            setFinalClusters(prev =>
                                                prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                                            );
                                        }}
                                        className={cn(
                                            "w-8 h-8 rounded-md text-sm font-medium transition-colors flex items-center justify-center",
                                            finalClusters.includes(c)
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                                        )}
                                        title={c === 'None' ? 'No cluster' : `Cluster ${c}`}
                                    >
                                        {c === 'None' ? <Ban className="h-4 w-4" /> : c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {unsuccessfulSections.map(s => renderSection(s, 'unsuccessful'))}
                </TabsContent>

                {/* Successful Tab */}
                <TabsContent value="successful" className="space-y-4 mt-4">
                    <div className="flex flex-wrap gap-4 items-end p-3 bg-muted/30 rounded-lg border">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Level</label>
                            <Input type="number" value={successMinLevel} onChange={(e) => setSuccessMinLevel(Number(e.target.value))} className="w-20 h-8 bg-background" min={0} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Users</label>
                            <Input type="number" value={successMinTotalUser} onChange={(e) => setSuccessMinUsers(Number(e.target.value))} className="w-24 h-8 bg-background" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Min Days Old</label>
                            <Input type="number" value={successMinDaysSinceEvent} onChange={(e) => setSuccessMinDaysSinceEvent(Number(e.target.value))} className="w-20 h-8 bg-background" min={0} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Clu</label>
                            <div className="flex gap-1">
                                {['1', '2', '3', '4', 'None'].map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => {
                                            setSuccessFinalClusters(prev =>
                                                prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                                            );
                                        }}
                                        className={cn(
                                            "w-8 h-8 rounded-md text-sm font-medium transition-colors flex items-center justify-center",
                                            successFinalClusters.includes(c)
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                                        )}
                                        title={c === 'None' ? 'No cluster' : `Cluster ${c}`}
                                    >
                                        {c === 'None' ? <Ban className="h-4 w-4" /> : c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {successfulSections.map(s => renderSection(s, 'successful'))}
                </TabsContent>

                {/* Last 30 Levels Tab */}
                <TabsContent value="last30" className="space-y-4 mt-4">
                    {renderSection(last30Section, 'last30')}
                </TabsContent>
            </Tabs>
        </div >
    );
}
