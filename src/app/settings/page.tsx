"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
}

export default function SettingsPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);

    // New Item States
    const [newVar, setNewVar] = useState("");
    const [newGame, setNewGame] = useState("");

    const fetchConfig = async () => {
        try {
            const res = await fetch("/api/config");
            if (res.ok) {
                setConfig(await res.json());
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async (newConfig: Config) => {
        setConfig(newConfig); // Optimistic update
        await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newConfig),
        });
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const addVariable = () => {
        if (!newVar || !config) return;
        if (config.variables.includes(newVar)) return;

        const updated = { ...config, variables: [...config.variables, newVar] };
        saveConfig(updated);
        setNewVar("");
    };

    const removeVariable = (v: string) => {
        if (!config) return;
        const updated = { ...config, variables: config.variables.filter((x) => x !== v) };
        saveConfig(updated);
    };

    const addGame = () => {
        if (!newGame || !config) return;
        const id = newGame.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
        const updated = {
            ...config,
            games: [...config.games, { id, name: newGame, viewMappings: {} }],
        };
        saveConfig(updated);
        setNewGame("");
    };

    const removeGame = (id: string) => {
        if (!config) return;
        const updated = { ...config, games: config.games.filter((x) => x.id !== id) };
        saveConfig(updated);
    };


    if (loading || !config) return <div>Loading settings...</div>;

    return (
        <div className="space-y-8">
            {/* Variables Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Pull Variables</CardTitle>
                    <CardDescription>Define the types of data you want to pull (e.g., "Level Score", "Retention").</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="New Variable Name..."
                            value={newVar}
                            onChange={(e) => setNewVar(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addVariable()}
                        />
                        <Button onClick={addVariable}><Plus className="mr-2 h-4 w-4" />Add</Button>
                    </div>
                    <div className="grid gap-2">
                        {config.variables.map((v) => (
                            <div key={v} className="flex items-center justify-between rounded border p-3 bg-muted/50">
                                <span className="font-medium">{v}</span>
                                <Button variant="ghost" size="icon" onClick={() => removeVariable(v)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                        {config.variables.length === 0 && <p className="text-sm text-muted-foreground italic">No variables defined.</p>}
                    </div>
                </CardContent>
            </Card>

            {/* Games Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Games</CardTitle>
                    <CardDescription>Manage games and configure their specific View IDs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="New Game Name..."
                            value={newGame}
                            onChange={(e) => setNewGame(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addGame()}
                        />
                        <Button onClick={addGame}><Plus className="mr-2 h-4 w-4" />Add</Button>
                    </div>
                    <div className="grid gap-2">
                        {config.games.map((game) => (
                            <div key={game.id} className="flex items-center justify-between rounded border p-3 bg-muted/50">
                                <span className="font-medium">{game.name}</span>
                                <div className="flex items-center gap-2">
                                    <Link href={`/settings/game/${game.id}`}>
                                        <Button variant="outline" size="sm">
                                            Configure IDs <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </Link>
                                    <Button variant="ghost" size="icon" onClick={() => removeGame(game.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {config.games.length === 0 && <p className="text-sm text-muted-foreground italic">No games defined.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
