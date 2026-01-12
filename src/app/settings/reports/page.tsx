"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Save, RotateCcw } from "lucide-react";
import { DEFAULT_REPORT_SETTINGS, type ReportSettings, type SheetSortConfig, type LevelScoreTableSettings, type ColumnConfig, type ReportTypeSettings } from "@/lib/report-settings";

const REPORT_TYPES = [
    { id: 'levelScoreAB', name: 'Level Score AB' },
    { id: 'bolgeselRevize', name: 'Bölgesel Revize' },
    { id: 'threeDayChurn', name: '3 Day Churn Analysis' },
];

const SHEET_NAMES: Record<string, Record<string, string>> = {
    levelScoreAB: {
        rawData: 'RAW DATA',
        levelScoreAB: 'Level Score AB',
        levelScore: 'Level Score',
        instantChurn: 'Instant Churn',
        threeDayChurn: '3 Day',
        time: 'Time',
        levelScoreB: 'Level Score B',
        topSuccessful: 'B Level Score Top Successful',
        bottomUnsuccess: 'B Churn Bottom Unsuccessful',
    },
    bolgeselRevize: {
        rawData: 'RAW DATA',
        bolgeselRapor: 'Bölgesel Rapor',
    },
    threeDayChurn: {
        rawData: 'RAW DATA',
        levelScoreUnsuccess: 'Level Score Top Unsuccessful',
        levelScoreSuccess: 'Level Score Top Successful',
        churnUnsuccess: '3 Day Churn Top Unsuccessful',
    },
};

const SORT_COLUMNS: Record<string, string[]> = {
    levelScoreAB: ['Level', 'LevelScore Diff', 'Instant Churn Diff', '3 Days Churn Diff', 'Time Diff', 'Level Score'],
    bolgeselRevize: ['Level', 'Range Start', 'Range End', 'Total Users'],
    threeDayChurn: ['Level', 'Level Score', '3 Days Churn', 'Instant Churn'],
};

export default function ReportSettingsPage() {
    const [settings, setSettings] = useState<ReportSettings>(DEFAULT_REPORT_SETTINGS);
    const [selectedReport, setSelectedReport] = useState('levelScoreAB');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch("/api/config");
            if (res.ok) {
                const config = await res.json();
                if (config.reportSettings) {
                    // Merge with defaults
                    setSettings({
                        ...DEFAULT_REPORT_SETTINGS,
                        ...config.reportSettings,
                    });
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        setMessage(null);
        try {
            // First get current config
            const res = await fetch("/api/config");
            const currentConfig = res.ok ? await res.json() : {};

            // Update with new report settings
            const updatedConfig = {
                ...currentConfig,
                reportSettings: settings
            };

            await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedConfig),
            });
            setMessage("Settings saved successfully!");
        } catch (e) {
            console.error(e);
            setMessage("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const resetToDefaults = () => {
        if (confirm("Reset all report settings to defaults?")) {
            setSettings(DEFAULT_REPORT_SETTINGS);
        }
    };

    const updateSheetConfig = (reportType: string, sheetKey: string, field: keyof SheetSortConfig, value: any) => {
        setSettings(prev => {
            const currentTypeSettings = prev[reportType as keyof ReportSettings] as ReportTypeSettings;
            return {
                ...prev,
                [reportType]: {
                    ...currentTypeSettings,
                    sheets: {
                        ...currentTypeSettings.sheets,
                        [sheetKey]: {
                            ...currentTypeSettings.sheets[sheetKey],
                            [field]: value
                        }
                    }
                }
            };
        });
    };

    const updateHeaderColor = (reportType: string, color: string) => {
        // Remove # if present
        const cleanColor = color.replace('#', '').toUpperCase();
        setSettings(prev => ({
            ...prev,
            [reportType]: {
                ...prev[reportType as keyof ReportSettings],
                headerColor: cleanColor
            }
        }));
    };

    if (loading) return <div>Loading settings...</div>;

    const currentReportSettings = settings[selectedReport as keyof ReportSettings] as ReportTypeSettings;
    const sheets = SHEET_NAMES[selectedReport] || {};
    const sortColumns = SORT_COLUMNS[selectedReport] || ['Level'];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Report Format Settings</CardTitle>
                    <CardDescription>Configure sorting, filtering, and styling for Excel reports</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Report Type Selector */}
                    <div className="flex items-center gap-4">
                        <span className="w-32">Report Type:</span>
                        <Select value={selectedReport} onValueChange={setSelectedReport}>
                            <SelectTrigger className="w-64">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {REPORT_TYPES.map(rt => (
                                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Header Style */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-medium">Header Style</h2>
                            <p className="text-sm text-muted-foreground">Customize header appearance for this report.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Color:</span>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="color"
                                    className="w-12 h-8 p-1 cursor-pointer"
                                    value={`#${currentReportSettings.headerColor || '000000'}`}
                                    onChange={(e) => updateHeaderColor(selectedReport, e.target.value)}
                                />
                                <Input
                                    type="text"
                                    className="w-24 h-8 font-mono text-xs uppercase"
                                    value={currentReportSettings.headerColor || '000000'}
                                    onChange={(e) => updateHeaderColor(selectedReport, e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Min Total User Filter */}
                    <div className="flex items-center gap-4">
                        <span className="w-32">Min Total Users:</span>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min="0"
                                value={currentReportSettings.minTotalUser || 0}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    setSettings(prev => ({
                                        ...prev,
                                        [selectedReport]: {
                                            ...prev[selectedReport as keyof ReportSettings],
                                            minTotalUser: value
                                        }
                                    }));
                                }}
                                className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">
                                Exclude rows with TotalUser below this
                            </span>
                        </div>
                    </div>

                    {/* Sheets Configuration */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-lg border-b pb-2">Sheet Settings</h3>
                        {Object.entries(sheets).map(([sheetKey, sheetName]) => {
                            const sheetConfig = currentReportSettings.sheets[sheetKey] || { sortColumn: 'Level', sortOrder: 'asc' };
                            return (
                                <div key={sheetKey} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                                    <h4 className="font-medium">{sheetName}</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {/* Sort Column */}
                                        <div className="space-y-1">
                                            <span className="text-xs">Sort Column</span>
                                            <Select
                                                value={sheetConfig.sortColumn}
                                                onValueChange={(v) => updateSheetConfig(selectedReport, sheetKey, 'sortColumn', v)}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sortColumns.map(col => (
                                                        <SelectItem key={col} value={col}>{col}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Sort Order */}
                                        <div className="space-y-1">
                                            <span className="text-xs">Sort Order</span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full h-9"
                                                onClick={() => updateSheetConfig(
                                                    selectedReport,
                                                    sheetKey,
                                                    'sortOrder',
                                                    sheetConfig.sortOrder === 'asc' ? 'desc' : 'asc'
                                                )}
                                            >
                                                {sheetConfig.sortOrder === 'asc' ? (
                                                    <><ArrowUp className="h-4 w-4 mr-1" /> Ascending</>
                                                ) : (
                                                    <><ArrowDown className="h-4 w-4 mr-1" /> Descending</>
                                                )}
                                            </Button>
                                        </div>

                                        {/* Filter Threshold (if applicable) */}
                                        {sheetConfig.filterThreshold !== undefined && (
                                            <>
                                                <div className="space-y-1">
                                                    <span className="text-xs">Filter Column</span>
                                                    <Select
                                                        value={sheetConfig.filterColumn || sheetConfig.sortColumn}
                                                        onValueChange={(v) => updateSheetConfig(selectedReport, sheetKey, 'filterColumn', v)}
                                                    >
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {sortColumns.map(col => (
                                                                <SelectItem key={col} value={col}>{col}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-xs">Threshold (&gt;)</span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={sheetConfig.filterThreshold}
                                                        onChange={(e) => updateSheetConfig(
                                                            selectedReport,
                                                            sheetKey,
                                                            'filterThreshold',
                                                            parseFloat(e.target.value)
                                                        )}
                                                        className="h-9"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-4 pt-4 border-t">
                        <Button onClick={saveSettings} disabled={saving}>
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Saving...' : 'Save Settings'}
                        </Button>
                        <Button variant="outline" onClick={resetToDefaults}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reset to Defaults
                        </Button>
                        {message && (
                            <span className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                                {message}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
