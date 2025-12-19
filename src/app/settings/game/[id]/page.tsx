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
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
}

export default function GameDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const gameId = params.id as string;

    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                const game = data.games.find((g) => g.id === gameId);
                if (game) {
                    setMappings(game.viewMappings || {});
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
                return { ...g, viewMappings: mappings };
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
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Configuration</>}
                </Button>
            </div>
        </div>
    );
}
