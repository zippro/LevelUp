"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, GripVertical, Save, RefreshCw, AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import papa from 'papaparse';

// Define default columns for fallback
const DEFAULT_COLUMNS = [
    "New Move",
    "Level",
    "Revision Number",
    "Level Score",
    "Total Move",
    "Average remaining move",
    "In app value",
    "TotalUser",
    "3 Days Churn",
    "Avg. FirstTryWinPercent",
    "Avg. Repeat Ratio",
    "Level Play Time",
    "Playon per User",
    "RM Total",
    "Avg. Total Moves",
    "New Cluster",
    "Score",
    "Min. Time Event"
];

interface WeeklyCheckConfig {
    minTotalUser: number;
    minTotalUserLast30: number;
    minLevel: number;
    minDaysSinceEvent: number;
    finalCluster?: string;
    columnOrder: string[];
    columnRenames?: Record<string, string>;
    hiddenColumns?: string[];
    // Successful tab defaults
    successMinTotalUser?: number;
    successMinLevel?: number;
    successMinDaysSinceEvent?: number;
    successFinalCluster?: string;
}

interface AppConfig {
    weeklyCheck?: WeeklyCheckConfig;
    // ... other config parts
}

export default function WeeklyCheckSettingsPage() {
    const router = useRouter();
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Unsuccessful Tab Form State
    const [minTotalUser, setMinTotalUser] = useState<number>(50);
    const [minTotalUserLast30, setMinTotalUserLast30] = useState<number>(50);
    const [minLevel, setMinLevel] = useState<number>(0);
    const [minDaysSinceEvent, setMinDaysSinceEvent] = useState<number>(0);
    const [finalCluster, setFinalCluster] = useState<string>('1,2,3,4');
    // Successful Tab Form State
    const [successMinTotalUser, setSuccessMinTotalUser] = useState<number>(50);
    const [successMinLevel, setSuccessMinLevel] = useState<number>(0);
    const [successMinDaysSinceEvent, setSuccessMinDaysSinceEvent] = useState<number>(0);
    const [successFinalCluster, setSuccessFinalCluster] = useState<string>('1,2,3,4');
    // Column config
    const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
    const [columnRenames, setColumnRenames] = useState<Record<string, string>>({});
    const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
    const [editingColumn, setEditingColumn] = useState<string | null>(null);
    const [actualHeaders, setActualHeaders] = useState<string[]>([]);
    const [loadingHeaders, setLoadingHeaders] = useState(false);

    // Drag State
    const [draggedItem, setDraggedItem] = useState<string | null>(null);

    const fetchConfig = async () => {
        try {
            const res = await fetch("/api/config");
            if (res.ok) {
                const data = await res.json();
                setConfig(data);

                // Initialize form state from config
                if (data.weeklyCheck) {
                    if (data.weeklyCheck.minTotalUser !== undefined) {
                        setMinTotalUser(data.weeklyCheck.minTotalUser);
                    }
                    if (data.weeklyCheck.minTotalUserLast30 !== undefined) {
                        setMinTotalUserLast30(data.weeklyCheck.minTotalUserLast30);
                    }
                    if (data.weeklyCheck.minLevel !== undefined) {
                        setMinLevel(data.weeklyCheck.minLevel);
                    }
                    if (data.weeklyCheck.minDaysSinceEvent !== undefined) {
                        setMinDaysSinceEvent(data.weeklyCheck.minDaysSinceEvent);
                    }
                    if (data.weeklyCheck.columnOrder && Array.isArray(data.weeklyCheck.columnOrder)) {
                        const savedOrder = data.weeklyCheck.columnOrder;
                        // Add any new default columns that aren't in the saved order
                        const missingDefaults = DEFAULT_COLUMNS.filter(col => !savedOrder.includes(col));
                        setColumns(Array.from(new Set([...savedOrder, ...missingDefaults])));
                    } else {
                        setColumns(DEFAULT_COLUMNS);
                    }
                    if (data.weeklyCheck.columnRenames) {
                        setColumnRenames(data.weeklyCheck.columnRenames);
                    }
                    if (data.weeklyCheck.hiddenColumns) {
                        setHiddenColumns(data.weeklyCheck.hiddenColumns);
                    }
                    // Successful tab defaults
                    if (data.weeklyCheck.successMinTotalUser !== undefined) {
                        setSuccessMinTotalUser(data.weeklyCheck.successMinTotalUser);
                    }
                    if (data.weeklyCheck.successMinLevel !== undefined) {
                        setSuccessMinLevel(data.weeklyCheck.successMinLevel);
                    }
                    if (data.weeklyCheck.successMinDaysSinceEvent !== undefined) {
                        setSuccessMinDaysSinceEvent(data.weeklyCheck.successMinDaysSinceEvent);
                    }
                    if (data.weeklyCheck.successFinalCluster !== undefined) {
                        setSuccessFinalCluster(data.weeklyCheck.successFinalCluster);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        if (!config) return;
        setSaving(true);

        const updatedConfig = {
            ...config,
            weeklyCheck: {
                minTotalUser,
                minTotalUserLast30,
                minLevel,
                minDaysSinceEvent,
                finalCluster,
                columnOrder: columns,
                columnRenames,
                hiddenColumns,
                successMinTotalUser,
                successMinLevel,
                successMinDaysSinceEvent,
                successFinalCluster
            }
        };

        try {
            await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedConfig),
            });
            setConfig(updatedConfig);
            alert("Settings saved successfully!");
        } catch (error) {
            console.error("Failed to save settings", error);
            alert("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        fetchConfig();
        fetchActualHeaders();
    }, []);

    // Fetch actual headers from most recent Level Revize CSV
    const fetchActualHeaders = async () => {
        setLoadingHeaders(true);
        try {
            const { data: files } = await supabase.storage
                .from('data-repository')
                .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

            const levelRevizeFile = files?.find(f => f.name.includes('Level Revize'));
            if (levelRevizeFile) {
                const { data: fileData } = await supabase.storage
                    .from('data-repository')
                    .download(levelRevizeFile.name);

                if (fileData) {
                    const csvText = await fileData.text();
                    const parsed = papa.parse(csvText, { header: true, preview: 1 });
                    const rawHeaders = parsed.meta.fields || [];
                    // Add virtual columns that are added dynamically in UI
                    if (!rawHeaders.includes('New Cluster')) rawHeaders.push('New Cluster');
                    if (!rawHeaders.includes('Score')) rawHeaders.push('Score');
                    setActualHeaders(rawHeaders);
                }
            }
        } catch (error) {
            console.error('Failed to fetch actual headers:', error);
        } finally {
            setLoadingHeaders(false);
        }
    };

    // Sync columns with actual headers - keeps default columns like "Min. Time Event"
    const syncWithActualHeaders = () => {
        if (actualHeaders.length === 0) return;

        // Start with any saved order that matches actual headers
        const matchingColumns = columns.filter(col => actualHeaders.includes(col));
        // Add any actual headers not in the current list
        const newHeaders = actualHeaders.filter(h => !matchingColumns.includes(h));
        // Also add any DEFAULT_COLUMNS that aren't in actual headers (like "Min. Time Event")
        const preservedDefaults = DEFAULT_COLUMNS.filter(d =>
            !matchingColumns.includes(d) && !newHeaders.includes(d)
        );
        setColumns(Array.from(new Set([...matchingColumns, ...newHeaders, ...preservedDefaults])));
    };

    const resetToDefaults = () => {
        if (confirm("Reset to default columns?")) {
            setColumns(DEFAULT_COLUMNS);
            setHiddenColumns([]);
        }
    };

    // Toggle column visibility
    const toggleColumnVisibility = (e: React.MouseEvent, col: string) => {
        e.stopPropagation(); // Prevent drag start when clicking button
        setHiddenColumns(prev =>
            prev.includes(col)
                ? prev.filter(c => c !== col)
                : [...prev, col]
        );
    };

    // Drag and Drop Logic
    const handleDragStart = (e: React.DragEvent, item: string) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (!draggedItem) return;

        const draggedIdx = columns.indexOf(draggedItem);
        if (draggedIdx === index) return;

        const newColumns = [...columns];
        newColumns.splice(draggedIdx, 1);
        newColumns.splice(index, 0, draggedItem);
        setColumns(newColumns);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    if (loading) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="space-y-8 max-w-4xl">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Weekly Check Settings</h1>
                    <p className="text-muted-foreground">Configure the Weekly Check dashboard view.</p>
                </div>
                <div className="ml-auto">
                    <Button onClick={saveSettings} disabled={saving} className="gap-2">
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>
            </div>

            <div className="grid gap-6">
                {/* Minimum User Threshold */}
                <Card>
                    <CardHeader>
                        <CardTitle>Data Filtering</CardTitle>
                        <CardDescription>
                            Set the minimum number of users required for a row to be displayed.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Minimum Total Users (General)</label>
                            <Input
                                type="number"
                                value={minTotalUser}
                                onChange={(e) => setMinTotalUser(Number(e.target.value))}
                                className="w-full"
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                Rows with 'TotalUser' less than this value will be hidden from the analysis tables.
                            </p>
                        </div>
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Minimum Total Users (Last 30 Levels)</label>
                            <Input
                                type="number"
                                value={minTotalUserLast30}
                                onChange={(e) => setMinTotalUserLast30(Number(e.target.value))}
                                className="w-full"
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                Specific threshold for the "Last 30 Levels" section.
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
                                Exclude levels from the last N days (based on Min. Time Event date). Only affects Level Score and Churn tables.
                            </p>
                        </div>
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Final Cluster (Unsuccessful)</label>
                            <div className="flex gap-1">
                                {['1', '2', '3', '4'].map(c => {
                                    const selected = finalCluster.split(',').includes(c);
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                                const current = finalCluster ? finalCluster.split(',') : [];
                                                const updated = selected ? current.filter(x => x !== c) : [...current, c];
                                                setFinalCluster(updated.join(','));
                                            }}
                                            className={cn(
                                                "w-10 h-10 rounded-md text-sm font-medium transition-colors",
                                                selected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                        >
                                            {c}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Successful Tab Defaults */}
                <Card>
                    <CardHeader>
                        <CardTitle>Successful Tab Defaults</CardTitle>
                        <CardDescription>
                            Default filter values for the Successful tab (can be changed per session).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Min Users (Successful)</label>
                            <Input
                                type="number"
                                value={successMinTotalUser}
                                onChange={(e) => setSuccessMinTotalUser(Number(e.target.value))}
                                className="w-full"
                            />
                        </div>
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Min Level (Successful)</label>
                            <Input
                                type="number"
                                value={successMinLevel}
                                onChange={(e) => setSuccessMinLevel(Number(e.target.value))}
                                className="w-full"
                                min={0}
                            />
                        </div>
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Min Days Old (Successful)</label>
                            <Input
                                type="number"
                                value={successMinDaysSinceEvent}
                                onChange={(e) => setSuccessMinDaysSinceEvent(Number(e.target.value))}
                                className="w-full"
                                min={0}
                            />
                        </div>
                        <div className="max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Final Cluster (Successful)</label>
                            <div className="flex gap-1">
                                {['1', '2', '3', '4'].map(c => {
                                    const selected = successFinalCluster.split(',').includes(c);
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                                const current = successFinalCluster ? successFinalCluster.split(',') : [];
                                                const updated = selected ? current.filter(x => x !== c) : [...current, c];
                                                setSuccessFinalCluster(updated.join(','));
                                            }}
                                            className={cn(
                                                "w-10 h-10 rounded-md text-sm font-medium transition-colors",
                                                selected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                        >
                                            {c}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Column Ordering */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Column Display & Order</CardTitle>
                                <CardDescription>
                                    Drag to reorder. Click text to rename. Click eye to toggle visibility.
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                {actualHeaders.length > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={syncWithActualHeaders}
                                        className="gap-1"
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                        Sync with Data
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={resetToDefaults}>
                                    Reset Defaults
                                </Button>
                            </div>
                        </div>
                        {actualHeaders.length > 0 && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground flex items-center gap-2">
                                <AlertCircle className="h-3 w-3" />
                                <span>Found {actualHeaders.length} columns from latest data. Click "Sync with Data" to update column names.</span>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg bg-card">
                            {columns.map((col, index) => {
                                const isHidden = hiddenColumns.includes(col);
                                return (
                                    <div
                                        key={col}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, col)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDragEnd={handleDragEnd}
                                        className={cn(
                                            "flex items-center gap-3 p-3 border-b last:border-0 bg-card hover:bg-muted/50 transition-colors",
                                            draggedItem === col && "opacity-50",
                                            isHidden && "opacity-60 bg-muted/20"
                                        )}
                                    >
                                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />

                                        <div className="flex-1 flex items-center gap-2">
                                            <span className={cn("text-xs text-muted-foreground", isHidden && "line-through")}>{col}</span>
                                            <span className="text-muted-foreground">→</span>
                                            {editingColumn === col ? (
                                                <Input
                                                    defaultValue={columnRenames[col] || col}
                                                    className="h-7 w-48"
                                                    autoFocus
                                                    onBlur={(e) => {
                                                        const val = e.target.value.trim();
                                                        if (val && val !== col) {
                                                            setColumnRenames(prev => ({ ...prev, [col]: val }));
                                                        } else {
                                                            // Remove rename if same as original
                                                            const { [col]: _, ...rest } = columnRenames;
                                                            setColumnRenames(rest);
                                                        }
                                                        setEditingColumn(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            (e.target as HTMLInputElement).blur();
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <span
                                                    className={cn(
                                                        "font-medium cursor-pointer hover:text-primary",
                                                        isHidden && "text-muted-foreground line-through"
                                                    )}
                                                    onClick={() => setEditingColumn(col)}
                                                    title="Click to rename"
                                                >
                                                    {columnRenames[col] || col}
                                                </span>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "h-8 w-8 p-0",
                                                isHidden ? "text-muted-foreground" : "text-foreground"
                                            )}
                                            onClick={(e) => toggleColumnVisibility(e, col)}
                                            title={isHidden ? "Show column" : "Hide column"}
                                        >
                                            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 flex gap-2">
                            <Input
                                placeholder="Add new column name..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        if (val && !columns.includes(val)) {
                                            setColumns([...columns, val]);
                                            (e.target as HTMLInputElement).value = '';
                                        }
                                    }
                                }}
                            />
                            <p className="text-xs text-muted-foreground self-center">Press Enter to add</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
