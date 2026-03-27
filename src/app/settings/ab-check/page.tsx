"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface ABCheckConfig {
    minTotalUser: number;
    minLevel: number;
    minDaysSinceEvent: number;
    hideRevision9xx: boolean;
}

interface AppConfig {
    abCheck?: ABCheckConfig;
    [key: string]: any;
}

export default function ABCheckSettingsPage() {
    const router = useRouter();
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [minTotalUser, setMinTotalUser] = useState(50);
    const [minLevel, setMinLevel] = useState(0);
    const [minDaysSinceEvent, setMinDaysSinceEvent] = useState(0);
    const [hideRevision9xx, setHideRevision9xx] = useState(false);

    useEffect(() => {
        fetch("/api/config")
            .then(res => res.json())
            .then((data: AppConfig) => {
                setConfig(data);
                if (data.abCheck) {
                    if (data.abCheck.minTotalUser !== undefined) setMinTotalUser(data.abCheck.minTotalUser);
                    if (data.abCheck.minLevel !== undefined) setMinLevel(data.abCheck.minLevel);
                    if (data.abCheck.minDaysSinceEvent !== undefined) setMinDaysSinceEvent(data.abCheck.minDaysSinceEvent);
                    if (data.abCheck.hideRevision9xx !== undefined) setHideRevision9xx(data.abCheck.hideRevision9xx);
                }
                setLoading(false);
            })
            .catch(e => { console.error(e); setLoading(false); });
    }, []);

    const saveSettings = async () => {
        if (!config) return;
        setSaving(true);

        const updatedConfig = {
            ...config,
            abCheck: {
                minTotalUser,
                minLevel,
                minDaysSinceEvent,
                hideRevision9xx,
            }
        };

        try {
            await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedConfig),
            });
            setConfig(updatedConfig);
            alert("AB Check settings saved!");
        } catch (error) {
            console.error("Failed to save", error);
            alert("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="space-y-8 max-w-4xl">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">AB Check Settings</h1>
                    <p className="text-muted-foreground">Configure default filters for the AB Check page.</p>
                </div>
                <div className="ml-auto">
                    <Button onClick={saveSettings} disabled={saving} className="gap-2">
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Data Filtering Defaults</CardTitle>
                        <CardDescription>
                            Set default filter values for the AB Check page. These can still be changed per session.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Minimum Total Users</label>
                            <Input
                                type="number"
                                value={minTotalUser}
                                onChange={(e) => setMinTotalUser(Number(e.target.value))}
                                className="w-full"
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                Levels where both A and B groups have fewer users than this will be hidden.
                            </p>
                        </div>

                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Minimum Level Number</label>
                            <Input
                                type="number"
                                value={minLevel}
                                onChange={(e) => setMinLevel(Number(e.target.value))}
                                className="w-full"
                                min={0}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                Only show levels greater than or equal to this number.
                            </p>
                        </div>

                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Minimum Days Since Event</label>
                            <Input
                                type="number"
                                value={minDaysSinceEvent}
                                onChange={(e) => setMinDaysSinceEvent(Number(e.target.value))}
                                className="w-full"
                                min={0}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                Exclude levels from the last N days (based on Min. Time Event date).
                            </p>
                        </div>

                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Revision 9xx Filter</label>
                            <div className="flex gap-2">
                                <Button
                                    variant={hideRevision9xx ? "destructive" : "outline"}
                                    onClick={() => setHideRevision9xx(!hideRevision9xx)}
                                >
                                    {hideRevision9xx ? "Hidden by Default" : "Shown by Default"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Whether to hide levels with 3-digit revision numbers starting with 9 (900-999) by default.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
