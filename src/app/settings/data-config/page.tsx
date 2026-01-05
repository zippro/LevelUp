"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Plus, ArrowRight, Pencil, Check, X, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Config {
    variables: string[];
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
    reports?: Record<string, string[]>;
}

export default function DataConfigPage() {
    const router = useRouter();
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);

    // New Item States
    const [newVar, setNewVar] = useState("");
    const [newGame, setNewGame] = useState("");

    // Editing State
    const [editingVar, setEditingVar] = useState<string | null>(null);
    const [editVarName, setEditVarName] = useState("");

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
        if (!confirm(`Enable removal of '${v}'? This will remove it from all game mappings and reports.`)) return;

        const updated = {
            ...config,
            variables: config.variables.filter((x) => x !== v),
            // Cleanup mappings
            games: config.games.map(g => {
                const newMappings = { ...g.viewMappings };
                delete newMappings[v];
                return { ...g, viewMappings: newMappings };
            }),
            reports: config.reports ? (() => {
                const newReports = { ...config.reports };
                delete newReports[v];
                return newReports;
            })() : undefined
        };
        saveConfig(updated);
    };

    const startEditingVar = (v: string) => {
        setEditingVar(v);
        setEditVarName(v);
    };

    const saveEditedVar = () => {
        if (!config || !editingVar || !editVarName) return;
        if (editVarName === editingVar) {
            setEditingVar(null);
            return;
        }
        if (config.variables.includes(editVarName)) {
            alert("Variable name already exists.");
            return;
        }

        // Rename logic: update variables list, viewMappings, and reports
        const updated = {
            ...config,
            variables: config.variables.map(v => v === editingVar ? editVarName : v),
            games: config.games.map(g => {
                const newMappings = { ...g.viewMappings };
                if (newMappings[editingVar]) {
                    newMappings[editVarName] = newMappings[editingVar];
                    delete newMappings[editingVar];
                }
                return { ...g, viewMappings: newMappings };
            }),
            reports: config.reports ? (() => {
                const newReports = { ...config.reports };
                if (newReports[editingVar]) {
                    newReports[editVarName] = newReports[editingVar];
                    delete newReports[editingVar];
                }
                return newReports;
            })() : undefined
        };

        saveConfig(updated);
        setEditingVar(null);
        setEditVarName("");
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
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold">Data Configuration</h1>
            </div>

            {/* Variables Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Pull Variables</CardTitle>
                    <CardDescription>Define the types of data you want to pull (e.g., "Level Score", "Retention").</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="New Variable Name..."
                            value={newVar}
                            onChange={(e) => setNewVar(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addVariable()}
                            className="flex-1"
                        />
                        <Button onClick={addVariable} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Add</Button>
                    </div>
                    <div className="grid gap-2">
                        {config.variables.map((v) => (
                            <div key={v} className="flex items-center justify-between rounded border p-3 bg-muted/50">
                                {editingVar === v ? (
                                    <div className="flex items-center gap-2 flex-1 mr-2">
                                        <Input
                                            value={editVarName}
                                            onChange={(e) => setEditVarName(e.target.value)}
                                            className="h-8"
                                        />
                                        <Button size="icon" variant="ghost" onClick={saveEditedVar} className="h-8 w-8 text-green-600">
                                            <Check className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => setEditingVar(null)} className="h-8 w-8 text-muted-foreground">
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-medium">{v}</span>
                                        <div className="flex items-center">
                                            <Button variant="ghost" size="icon" onClick={() => startEditingVar(v)}>
                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => removeVariable(v)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </>
                                )}
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
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="New Game Name..."
                            value={newGame}
                            onChange={(e) => setNewGame(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addGame()}
                            className="flex-1"
                        />
                        <Button onClick={addGame} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Add</Button>
                    </div>
                    <div className="grid gap-2">
                        {config.games.map((game) => (
                            <div key={game.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border p-3 bg-muted/50">
                                <span className="font-medium">{game.name}</span>
                                <div className="flex items-center gap-2 self-end sm:self-auto">
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
