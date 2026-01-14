"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnConfig, LevelScoreTableSettings, DEFAULT_REPORT_SETTINGS } from "@/lib/report-settings";

// --- Types ---
interface ScoreMultipliers {
    cluster1: MultiplierSet;
    cluster2: MultiplierSet;
    cluster3: MultiplierSet;
    cluster4: MultiplierSet;
    default: MultiplierSet;
}
interface MultiplierSet {
    monetization: number;
    engagement: number;
    satisfaction: number;
}
interface Config {
    games: { id: string; name: string; scoreMultipliers?: ScoreMultipliers }[];
    reportSettings?: {
        levelScoreTable?: LevelScoreTableSettings;
    };
    clusteringSettings?: {
        weights?: Record<string, number>;
        aliases?: Record<string, string>;
    };
}

const DEFAULT_MULTIPLIERS: ScoreMultipliers = {
    cluster1: { monetization: 0.20, engagement: 0.20, satisfaction: 0.60 },
    cluster2: { monetization: 0.25, engagement: 0.25, satisfaction: 0.50 },
    cluster3: { monetization: 0.30, engagement: 0.35, satisfaction: 0.35 },
    cluster4: { monetization: 0.35, engagement: 0.35, satisfaction: 0.30 },
    default: { monetization: 0.30, engagement: 0.30, satisfaction: 0.40 },
};

const DEFAULT_CLUSTERING_WEIGHTS = {
    avgRepeatRatio: 5.0,
    levelPlayTime: 1.0,
    playOnWinRatio: 1.0,
    playOnPerUser: 1.0,
    firstTryWinPercent: 1.0
};

const DEFAULT_COLUMN_ALIASES = {
    avgRepeatRatio: "Repeat Ratio, Repeat, Avg. Repeat Ratio, rep",
    levelPlayTime: "Level Play Time, Play Time, Avg. Level Play Time, Avg Play Time, Duration",
    playOnWinRatio: "PlayOnWinRatio, Play On Win Ratio, PlayOnWin, Play on Win, Win Ratio",
    playOnPerUser: "Playon per User, Play On Per User, PlayOnPerUser",
    firstTryWinPercent: "Avg. FirstTryWinPercent, FirstTryWinPercent, First Try Win, 1st Win %"
};

const METRIC_LABELS: Record<string, string> = {
    avgRepeatRatio: "Avg. Repeat Ratio",
    levelPlayTime: "Level Play Time",
    playOnWinRatio: "Play On Win Ratio",
    playOnPerUser: "Play On Per User",
    firstTryWinPercent: "First Try Win %"
};

const DEFAULT_TABLE_SETTINGS = DEFAULT_REPORT_SETTINGS.levelScoreTable!;

export default function LevelScoreSettingsPage() {
    const router = useRouter();
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Multiplier State
    const [selectedGameId, setSelectedGameId] = useState<string>("");
    const [multipliers, setMultipliers] = useState<ScoreMultipliers>(DEFAULT_MULTIPLIERS);

    // Global Clustering State
    const [clusteringWeights, setClusteringWeights] = useState<Record<string, number>>(DEFAULT_CLUSTERING_WEIGHTS);
    const [columnAliases, setColumnAliases] = useState<Record<string, string>>(DEFAULT_COLUMN_ALIASES);

    // Table Settings State
    const [tableSettings, setTableSettings] = useState<LevelScoreTableSettings>(DEFAULT_TABLE_SETTINGS);

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                if (data.games.length > 0) {
                    const firstGame = data.games[0];
                    setSelectedGameId(firstGame.id);
                    setMultipliers(firstGame.scoreMultipliers || DEFAULT_MULTIPLIERS);
                }
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

                // Load global clustering settings
                if (data.clusteringSettings) {
                    setClusteringWeights({ ...DEFAULT_CLUSTERING_WEIGHTS, ...data.clusteringSettings.weights });
                    setColumnAliases({ ...DEFAULT_COLUMN_ALIASES, ...data.clusteringSettings.aliases });
                }

                setLoading(false);
            })
            .catch((e) => console.error(e));
    }, []);

    // Handle Game Selection Change
    const handleGameChange = (gameId: string) => {
        if (!config) return;
        setSelectedGameId(gameId);
        const game = config.games.find(g => g.id === gameId);
        if (game) {
            setMultipliers(game.scoreMultipliers || DEFAULT_MULTIPLIERS);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);

        // Update selected game's multipliers in the games array
        const updatedGames = config.games.map((g) => {
            if (g.id === selectedGameId) {
                return { ...g, scoreMultipliers: multipliers };
            }
            return g;
        });

        // Update report settings
        const newReportSettings = {
            ...(config.reportSettings || {}),
            levelScoreTable: tableSettings
        };

        const newConfig = {
            ...config,
            games: updatedGames,
            reportSettings: newReportSettings,
            clusteringSettings: {
                weights: clusteringWeights,
                aliases: columnAliases
            }
        };

        try {
            await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newConfig),
            });
            // Update local config state to reflect the save
            setConfig(newConfig);
            alert("Settings saved successfully!");
        } catch (e) {
            console.error(e);
            alert("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    const updateColumn = (key: string, field: keyof ColumnConfig, value: any) => {
        setTableSettings(prev => ({
            ...prev,
            columns: {
                ...prev.columns,
                [key]: {
                    ...prev.columns[key],
                    [field]: value
                }
            }
        }));
    };

    if (loading || !config) return <div className="p-8">Loading settings...</div>;

    const sortedColumnKeys = Object.keys(tableSettings.columns).sort((a, b) => {
        return (tableSettings.columns[a]?.order || 99) - (tableSettings.columns[b]?.order || 99);
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/settings">
                    <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Level Score Configuration</h1>
                    <p className="text-muted-foreground">Manage score multipliers and table column preferences.</p>
                </div>
            </div>

            {/* --- MULTIPLIERS SECTION --- */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Cluster Multipliers</CardTitle>
                            <CardDescription>Configure calculation weights for {config.games.find(g => g.id === selectedGameId)?.name || 'Selected Game'}</CardDescription>
                        </div>
                        <Select value={selectedGameId} onValueChange={handleGameChange}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Select Game" />
                            </SelectTrigger>
                            <SelectContent>
                                {config.games.map(g => (
                                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {Object.keys(DEFAULT_MULTIPLIERS).map((key) => {
                        const k = key as keyof ScoreMultipliers;
                        const current = multipliers[k];
                        return (
                            <div key={key} className="p-4 border rounded-lg bg-muted/20">
                                <h4 className="font-semibold mb-3 capitalize text-sm">{key.replace("cluster", "Cluster ")}</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Monetization</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={current.monetization}
                                            onChange={(e) => setMultipliers(prev => ({
                                                ...prev,
                                                [k]: { ...prev[k], monetization: parseFloat(e.target.value) || 0 }
                                            }))}
                                            className="font-mono h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Engagement</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={current.engagement}
                                            onChange={(e) => setMultipliers(prev => ({
                                                ...prev,
                                                [k]: { ...prev[k], engagement: parseFloat(e.target.value) || 0 }
                                            }))}
                                            className="font-mono h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Satisfaction</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={current.satisfaction}
                                            onChange={(e) => setMultipliers(prev => ({
                                                ...prev,
                                                [k]: { ...prev[k], satisfaction: parseFloat(e.target.value) || 0 }
                                            }))}
                                            className="font-mono h-8"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            {/* --- CLUSTERING CONFIGURATION (GLOBAL) --- */}
            <Card>
                <CardHeader>
                    <CardTitle>Global Clustering Weights & Aliases</CardTitle>
                    <CardDescription>
                        Configure how levels are clustered across ALL games.
                        Define weights (multipliers) for each metric and matching column aliases.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Weights */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold border-b pb-2">Metric Weights (Multipliers)</h3>
                            {Object.entries(clusteringWeights).map(([key, val]) => (
                                <div key={key} className="flex items-center justify-between gap-4">
                                    <label className="text-sm text-muted-foreground min-w-[140px]">{METRIC_LABELS[key] || key}</label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        className="font-mono w-[100px]"
                                        value={val}
                                        onChange={(e) => setClusteringWeights(prev => ({
                                            ...prev,
                                            [key]: parseFloat(e.target.value) || 0
                                        }))}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Aliases */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold border-b pb-2">Column Aliases (Comma Separated)</h3>
                            {Object.entries(columnAliases).map(([key, val]) => (
                                <div key={key} className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">{METRIC_LABELS[key] || key}</label>
                                    <Input
                                        className="font-mono text-xs"
                                        value={val}
                                        onChange={(e) => setColumnAliases(prev => ({
                                            ...prev,
                                            [key]: e.target.value
                                        }))}
                                        placeholder="e.g. Repeat Ratio, rep..."
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* --- TABLE SETTINGS SECTION --- */}
            <Card>
                <CardHeader>
                    <CardTitle>Table Column Settings</CardTitle>
                    <CardDescription>Rename, hide, or reorder table columns.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <div className="grid grid-cols-12 gap-4 p-4 border-b bg-muted/50 font-medium text-sm">
                            <div className="col-span-1 text-center">Hide</div>
                            <div className="col-span-1 text-center">Order</div>
                            <div className="col-span-5">Original Name</div>
                            <div className="col-span-5">Display Name</div>
                        </div>
                        {sortedColumnKeys.map((key) => {
                            const col = tableSettings.columns[key] || { originalName: key, hidden: false, order: 99 };
                            return (
                                <div key={key} className="grid grid-cols-12 gap-4 p-4 border-b last:border-0 items-center hover:bg-muted/10">
                                    <div className="col-span-1 flex justify-center">
                                        <input
                                            type="checkbox"
                                            checked={col.hidden || false}
                                            onChange={(e) => updateColumn(key, 'hidden', e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                    </div>
                                    <div className="col-span-1">
                                        <Input
                                            type="number"
                                            value={col.order || 99}
                                            onChange={(e) => updateColumn(key, 'order', parseInt(e.target.value))}
                                            className="h-8 text-center"
                                        />
                                    </div>
                                    <div className="col-span-5 text-sm font-mono text-muted-foreground flex items-center gap-2">
                                        {key}
                                    </div>
                                    <div className="col-span-5">
                                        <Input
                                            value={col.displayName || ""}
                                            placeholder={col.originalName}
                                            onChange={(e) => updateColumn(key, 'displayName', e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pb-10">
                <Button onClick={handleSave} disabled={saving} size="lg">
                    {saving ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Configuration</>}
                </Button>
            </div>
        </div>
    );
}
