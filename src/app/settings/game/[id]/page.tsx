"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

interface Config {
    variables: string[];
    games: {
        id: string;
        name: string;
        viewMappings: Record<string, string>;
        urlMappings?: Record<string, string>;
        scoreMultipliers?: ScoreMultipliers;
        clusteringWeights?: Record<string, number>;
        columnAliases?: Record<string, string>;
    }[];
}

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

const DEFAULT_MULTIPLIERS: ScoreMultipliers = {
    cluster1: { monetization: 0.20, engagement: 0.20, satisfaction: 0.60 },
    cluster2: { monetization: 0.25, engagement: 0.25, satisfaction: 0.50 },
    cluster3: { monetization: 0.30, engagement: 0.35, satisfaction: 0.35 },
    cluster4: { monetization: 0.35, engagement: 0.35, satisfaction: 0.30 },
    default: { monetization: 0.30, engagement: 0.30, satisfaction: 0.40 },
};

const DEFAULT_CLUSTERING_WEIGHTS: Record<string, number> = {
    avgRepeatRatio: 5.0,
    levelPlayTime: 1.0,
    playOnWinRatio: 1.0,
    playOnPerUser: 1.0,
    firstTryWinPercent: 1.0
};

const DEFAULT_COLUMN_ALIASES: Record<string, string> = {
    avgRepeatRatio: "Repeat Ratio, Repeat, Avg. Repeat Ratio, rep",
    levelPlayTime: "Level Play Time, Play Time, Avg. Level Play Time, time",
    playOnWinRatio: "PlayOnWinRatio, Play On Win Ratio, PlayOnWin",
    playOnPerUser: "Playon per User, Play On Per User, PlayOnPerUser",
    firstTryWinPercent: "Avg. FirstTryWinPercent, FirstTryWinPercent, First Try Win"
};

const METRIC_LABELS: Record<string, string> = {
    avgRepeatRatio: "Avg. Repeat Ratio",
    levelPlayTime: "Level Play Time",
    playOnWinRatio: "PlayOnWin Ratio",
    playOnPerUser: "PlayOn per User",
    firstTryWinPercent: "First Try Win %"
};

export default function GameDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const gameId = params.id as string;

    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    // State for URL inputs
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [lookingUp, setLookingUp] = useState<Record<string, boolean>>({});
    const [multipliers, setMultipliers] = useState<ScoreMultipliers>(DEFAULT_MULTIPLIERS);

    // Clustering Config State
    const [clusteringWeights, setClusteringWeights] = useState<Record<string, number>>(DEFAULT_CLUSTERING_WEIGHTS);
    const [columnAliases, setColumnAliases] = useState<Record<string, string>>(DEFAULT_COLUMN_ALIASES);

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                const game = data.games.find((g) => g.id === gameId);
                if (game) {
                    setMappings(game.viewMappings || {});
                    setUrls(game.urlMappings || {});
                    setMultipliers(game.scoreMultipliers || DEFAULT_MULTIPLIERS);
                    setClusteringWeights({ ...DEFAULT_CLUSTERING_WEIGHTS, ...(game.clusteringWeights || {}) });
                    setColumnAliases({ ...DEFAULT_COLUMN_ALIASES, ...(game.columnAliases || {}) });
                } else {
                    // Handle not found?
                }
                setLoading(false);
            })
            .catch((e) => console.error(e));
    }, [gameId]);

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);

        const updatedGames = config.games.map((g) => {
            if (g.id === gameId) {
                return {
                    ...g,
                    viewMappings: mappings,
                    urlMappings: urls,
                    scoreMultipliers: multipliers,
                    clusteringWeights,
                    columnAliases
                };
            }
            return g;
        });

        const newConfig = { ...config, games: updatedGames };

        await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newConfig),
        });

        setSaving(false);
        router.push("/settings");
    };

    const updateMapping = (variable: string, viewId: string) => {
        setMappings((prev) => ({ ...prev, [variable]: viewId }));
    };

    const handleLookup = async (variable: string) => {
        const url = urls[variable];
        if (!url) return;

        setLookingUp(prev => ({ ...prev, [variable]: true }));
        try {
            const res = await fetch('/api/tableau-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            updateMapping(variable, data.id);
            // Optional: clear URL or show success?
            alert(`Found View ID: ${data.id}`);
        } catch (e: any) {
            alert(`Lookup failed: ${e.message}`);
        } finally {
            setLookingUp(prev => ({ ...prev, [variable]: false }));
        }
    };

    if (loading || !config) return <div>Loading...</div>;

    const game = config.games.find((g) => g.id === gameId);
    if (!game) return <div>Game not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/settings">
                    <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{game.name}</h2>
                    <p className="text-muted-foreground">Map Variables to Tableau View IDs for this game.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>View ID Mappings</CardTitle>
                    <CardDescription>
                        Enter the Tableau View ID for each variable. This ID will be used when pulling data.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {config.variables.length === 0 && <p className="text-muted-foreground">No variables defined in Settings.</p>}
                    {config.variables.map(variable => (
                        <div key={variable} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center rounded border p-4">
                            <div className="font-medium text-sm md:text-base">{variable}</div>
                            <div className="md:col-span-2">
                                <Input
                                    value={mappings[variable] || ""}
                                    onChange={(e) => updateMapping(variable, e.target.value)}
                                    placeholder={`View ID for ${variable}`}
                                    className="font-mono text-xs mb-2"
                                />
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Paste Tableau View URL to auto-fill..."
                                        className="text-xs h-8"
                                        value={urls[variable] || ""}
                                        onChange={(e) => setUrls(prev => ({ ...prev, [variable]: e.target.value }))}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleLookup(variable)}
                                        disabled={!urls[variable] || lookingUp[variable]}
                                        className="h-8"
                                    >
                                        {lookingUp[variable] ? "..." : "Get ID"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Clustering Configuration</CardTitle>
                    <CardDescription>
                        Configure weights for the clustering algorithm and map CSV column names (aliases) to metrics.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        {Object.keys(DEFAULT_CLUSTERING_WEIGHTS).map((metricKey) => (
                            <div key={metricKey} className="border p-4 rounded-lg flex flex-col gap-3">
                                <div className="font-semibold text-sm">{METRIC_LABELS[metricKey] || metricKey}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs text-muted-foreground">Weight (Multiplier)</label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={clusteringWeights[metricKey]}
                                            onChange={(e) => setClusteringWeights(prev => ({ ...prev, [metricKey]: parseFloat(e.target.value) || 0 }))}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs text-muted-foreground">Column Aliases (comma separated)</label>
                                        <Input
                                            value={columnAliases[metricKey]}
                                            onChange={(e) => setColumnAliases(prev => ({ ...prev, [metricKey]: e.target.value }))}
                                            placeholder="e.g. Repeat Ratio, rep, repeat_val"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>



            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Configuration</>}
                </Button>
            </div>
        </div >
    );
}
