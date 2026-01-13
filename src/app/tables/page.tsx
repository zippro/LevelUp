"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Maximize2, Minimize2, ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from "lucide-react";
import papa from 'papaparse';
import { cn } from "@/lib/utils";
import { generateBolgeselReport, downloadExcel } from "@/lib/reports";
import { TABLE_REPORT_GENERATORS, VARIABLE_TABLE_REPORTS, formatTableValue } from "@/lib/table-reports";
import { ReportSettings, DEFAULT_REPORT_SETTINGS } from "@/lib/report-settings";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

interface Config {
    variables: string[];
    reports?: Record<string, string[]>;
    reportSettings?: ReportSettings;
    games: { id: string; name: string; viewMappings: Record<string, string> }[];
}

interface CachedDataInfo {
    fileName: string;
    createdAt: Date;
    data: string;
}

export default function TablesPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);

    // Selection
    const [selectedVariable, setSelectedVariable] = useState<string | null>(null);
    const [selectedReport, setSelectedReport] = useState<string | null>(null);
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

    // Data
    const [loading, setLoading] = useState(false);
    const [tableData, setTableData] = useState<any[]>([]);
    const [tableHeaders, setTableHeaders] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    // UI State
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Cached data dialog
    const [cachedDataInfo, setCachedDataInfo] = useState<CachedDataInfo | null>(null);
    const [showCacheDialog, setShowCacheDialog] = useState(false);

    // Date range filter (for Level Score AB)
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');



    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                if (data.variables.length > 0) {
                    setSelectedVariable(data.variables[0]);
                }
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));
    }, []);

    // Filter games
    const availableGames = config?.games.filter(
        (g) => selectedVariable && g.viewMappings && g.viewMappings[selectedVariable]
    );

    const getActiveViewId = () => {
        if (!selectedVariable || !selectedGameId || !config) return null;
        const game = config.games.find(g => g.id === selectedGameId);
        return game?.viewMappings?.[selectedVariable] || null;
    };

    // Check for existing cached data in repository
    const checkCachedData = async (): Promise<CachedDataInfo | null> => {
        if (!selectedGameId || !selectedVariable || !config) return null;

        const game = config.games.find(g => g.id === selectedGameId);
        const gameName = game ? game.name : selectedGameId;

        // List files in repository matching game and variable
        const { data: files, error } = await supabase.storage
            .from('data-repository')
            .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        if (error || !files) return null;

        // Find most recent file matching game and variable
        const matchingFile = files.find(f =>
            f.name.includes(gameName) && f.name.includes(selectedVariable)
        );

        if (!matchingFile) return null;

        // Download the file content
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('data-repository')
            .download(matchingFile.name);

        if (downloadError || !fileData) return null;

        const csvText = await fileData.text();

        return {
            fileName: matchingFile.name,
            createdAt: new Date(matchingFile.created_at),
            data: csvText
        };
    };

    // Load cached data into table
    const loadCachedData = (cachedData: CachedDataInfo) => {
        const parsed = papa.parse(cachedData.data, { header: true, skipEmptyLines: true });
        if (parsed.meta.fields) {
            setTableHeaders(parsed.meta.fields);
        }
        setTableData(parsed.data);
        setShowCacheDialog(false);
        setCachedDataInfo(null);
    };

    // Fetch fresh data from Tableau
    const fetchFreshData = async () => {
        setShowCacheDialog(false);
        setCachedDataInfo(null);

        const viewId = getActiveViewId();
        if (!viewId) {
            setError("No View ID found for this selection.");
            return;
        }

        setLoading(true);
        setError(null);
        setTableData([]);
        setTableHeaders([]);
        setSortConfig(null);
        setSearchTerm("");

        try {
            // Build request body with optional date filters for Level Score AB
            const requestBody: any = {
                viewId: viewId,
                tableName: "level_design_data",
            };

            // Add date filters for Level Score AB
            if (selectedVariable === "Level Score AB") {
                if (startDate) requestBody.startDate = startDate;
                if (endDate) requestBody.endDate = endDate;
            }

            const response = await fetch("/api/sync-tableau", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to fetch data");

            // Save to Supabase Storage
            if (selectedGameId && selectedVariable && result.data) {
                const game = config?.games.find(g => g.id === selectedGameId);
                const gameName = game ? game.name : selectedGameId;
                const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
                const fileName = `${gameName} - ${selectedVariable} - ${timestamp}.csv`;

                const { error: uploadError } = await supabase.storage
                    .from('data-repository')
                    .upload(fileName, result.data, {
                        contentType: 'text/csv',
                        upsert: false
                    });

                if (uploadError) {
                    console.error("Failed to auto-save to repository:", uploadError);
                } else {
                    console.log("Auto-saved to repository:", fileName);
                }
            }

            // Parse CSV for Table Display
            const parsed = papa.parse(result.data, { header: true, skipEmptyLines: true });
            if (parsed.meta.fields) {
                setTableHeaders(parsed.meta.fields);
            }
            setTableData(parsed.data);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFetch = async () => {
        const viewId = getActiveViewId();
        if (!viewId) {
            setError("No View ID found for this selection.");
            return;
        }

        setLoading(true);
        setError(null);

        // Check for cached data first
        const cached = await checkCachedData();

        if (cached) {
            setLoading(false);
            setCachedDataInfo(cached);
            setShowCacheDialog(true);
        } else {
            setLoading(false);
            // No cached data, fetch fresh
            await fetchFreshData();
        }
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const processedData = useMemo(() => {
        let data = [...tableData];

        // 1. Search Filter
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            data = data.filter(row =>
                Object.values(row).some(val =>
                    String(val).toLowerCase().includes(lowerSearch)
                )
            );
        }

        // 2. Sorting
        if (sortConfig) {
            data.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                // Try numeric sort
                const aNum = parseFloat(aValue);
                const bNum = parseFloat(bValue);

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                }

                // Fallback to string sort
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return data;
        return data;
    }, [tableData, sortConfig, searchTerm]);

    const displayData = useMemo(() => {
        // Bölgesel Revize uses its own generator
        if (selectedReport === "Bölgesel Revize" && processedData.length > 0) {
            return generateBolgeselReport(processedData);
        }

        // Check for table report generators (3 Day Churn sheets, etc.)
        if (selectedReport && TABLE_REPORT_GENERATORS[selectedReport] && processedData.length > 0) {
            const generator = TABLE_REPORT_GENERATORS[selectedReport];
            const settings = config?.reportSettings || DEFAULT_REPORT_SETTINGS;
            return generator(processedData, settings);
        }

        return processedData;
    }, [selectedReport, processedData, config?.reportSettings]);

    const displayHeaders = useMemo(() => {
        let headers: string[] = [];
        if (displayData.length > 0) {
            headers = Object.keys(displayData[0]);
        } else {
            headers = tableHeaders;
        }
        // Move Level column to first position
        const levelIndex = headers.findIndex(h => h.toLowerCase() === 'level');
        if (levelIndex > 0) {
            const levelHeader = headers.splice(levelIndex, 1)[0];
            headers.unshift(levelHeader);
        }
        return headers;
    }, [displayData, tableHeaders]);



    const handleExport = () => {
        if (displayData.length === 0) return;
        downloadExcel(displayData, `export_${selectedVariable}_${selectedReport || 'raw'}_${new Date().toISOString().split('T')[0]}`);
    };

    if (loadingConfig) return <div className="p-8 animate-pulse text-muted-foreground">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-destructive">Failed to load configuration.</div>;

    return (
        <div className={cn("space-y-6 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500", isFullScreen ? "max-w-[100vw] px-4" : "")}>

            {/* Cached Data Dialog */}
            {showCacheDialog && cachedDataInfo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-2">Existing Data Found</h3>
                        <p className="text-muted-foreground mb-4">
                            Data for this selection was saved on:
                        </p>
                        <div className="bg-muted/50 rounded-lg p-3 mb-4">
                            <p className="font-medium text-sm">{cachedDataInfo.fileName}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {format(cachedDataInfo.createdAt, "MMMM d, yyyy 'at' HH:mm")}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Would you like to use this saved data or fetch new data from Tableau?
                        </p>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => loadCachedData(cachedDataInfo)}
                            >
                                Use Saved Data
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={fetchFreshData}
                            >
                                Fetch New Data
                            </Button>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-muted-foreground"
                            onClick={() => { setShowCacheDialog(false); setCachedDataInfo(null); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Variable Tabs (Top Navigation Style) */}
            {!isFullScreen && (
                <div className="space-y-4">
                    <div className="border-b -mx-4 px-4">
                        <div className="flex space-x-1 overflow-x-auto pb-0 scrollbar-hide">
                            {config.variables.map(v => (
                                <button
                                    key={v}
                                    onClick={() => { setSelectedVariable(v); setSelectedReport(null); setSelectedGameId(null); setTableData([]); }}
                                    className={cn(
                                        "px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap hover:bg-muted/50 rounded-t-lg",
                                        selectedVariable === v
                                            ? "border-primary text-primary bg-muted/30"
                                            : "border-transparent text-muted-foreground"
                                    )}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sub-tabs / Reports */}
                    {selectedVariable && (config.reports?.[selectedVariable] || VARIABLE_TABLE_REPORTS[selectedVariable]) && (
                        <div className="flex items-center gap-2 px-2 flex-wrap">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Reports:</span>
                            <button
                                onClick={() => setSelectedReport(null)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-full transition-all border",
                                    selectedReport === null
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background text-muted-foreground border-muted hover:border-primary/50"
                                )}
                            >
                                Raw Data
                            </button>
                            {/* Config reports (like Bölgesel Revize) */}
                            {config.reports?.[selectedVariable]?.map(report => (
                                <button
                                    key={report}
                                    onClick={() => setSelectedReport(report)}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-full transition-all border",
                                        selectedReport === report
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background text-muted-foreground border-muted hover:border-primary/50"
                                    )}
                                >
                                    {report}
                                </button>
                            ))}
                            {/* Table reports (3 Day Churn sheets) */}
                            {VARIABLE_TABLE_REPORTS[selectedVariable]?.map(report => (
                                <button
                                    key={report}
                                    onClick={() => setSelectedReport(report)}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-full transition-all border",
                                        selectedReport === report
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background text-muted-foreground border-muted hover:border-primary/50"
                                    )}
                                >
                                    {report}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Controls Bar */}
            <div className="flex flex-col gap-4 p-4 bg-muted/40 rounded-xl border shadow-sm">
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 sm:gap-4 w-full">
                    {/* Game Select */}
                    <div className="space-y-1.5 w-full sm:w-[200px]">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Game</label>
                        <Select
                            value={selectedGameId || ""}
                            onValueChange={setSelectedGameId}
                            disabled={!selectedVariable}
                        >
                            <SelectTrigger className="bg-background shadow-sm border-muted-foreground/20">
                                <SelectValue placeholder="Select a Game..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableGames?.map(g => (
                                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                ))}
                                {availableGames?.length === 0 && <SelectItem value="none" disabled>No games available</SelectItem>}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Range (for Level Score AB) */}
                    {selectedVariable === "Level Score AB" && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 w-full sm:w-auto">
                            <div className="space-y-1.5 flex-1 sm:flex-none">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From</label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full sm:w-[140px] bg-background shadow-sm border-muted-foreground/20"
                                />
                            </div>
                            <div className="space-y-1.5 flex-1 sm:flex-none">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">To</label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full sm:w-[140px] bg-background shadow-sm border-muted-foreground/20"
                                />
                            </div>
                            {(startDate || endDate) && (
                                <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); }} className="self-end">
                                    Clear
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Load Button */}
                    <Button onClick={handleFetch} disabled={loading || !selectedGameId} className="shadow-sm w-full sm:w-auto">
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Load
                    </Button>

                    {/* Search */}
                    {tableData.length > 0 && (
                        <div className="space-y-1.5 w-full sm:w-[250px] relative">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search</label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search table..."
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); }}
                                    className="pl-8 bg-background shadow-sm border-muted-foreground/20"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:self-end">
                    {tableData.length > 0 && (
                        <Button variant="outline" size="sm" onClick={handleExport} className="border-muted-foreground/20 shadow-sm">
                            <Download className="mr-2 h-4 w-4" /> Export CSV
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsFullScreen(!isFullScreen)}
                        title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                        className="hover:bg-muted"
                    >
                        {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20 animate-in fade-in slide-in-from-top-2">
                    {error}
                </div>
            )}

            {/* Table Display */}
            {tableData.length > 0 && (
                <div className="space-y-4">
                    <div className={cn("rounded-lg border shadow-sm bg-card overflow-hidden transition-all", isFullScreen ? "max-h-[85vh]" : "max-h-[70vh]")}>
                        <div className="overflow-auto max-h-full">
                            <Table className="relative">
                                <TableHeader className="sticky top-0 z-20 bg-card">
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        {displayHeaders.map((header, colIndex) => (
                                            <TableHead
                                                key={header}
                                                className={cn(
                                                    "whitespace-nowrap font-bold cursor-pointer hover:bg-muted/80 transition-colors select-none text-foreground",
                                                    colIndex === 0 && "sticky left-0 z-30 bg-muted/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                                                )}
                                                onClick={() => handleSort(header)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {header}
                                                    {sortConfig?.key === header ? (
                                                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
                                                    ) : (
                                                        <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                                                    )}
                                                </div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayData.map((row, i) => (
                                        <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                                            {displayHeaders.map((header, colIndex) => (
                                                <TableCell
                                                    key={`${i}-${header}`}
                                                    className={cn(
                                                        "whitespace-nowrap font-medium text-muted-foreground",
                                                        colIndex === 0 && "sticky left-0 z-10 bg-card shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                                                    )}
                                                >
                                                    {formatTableValue(row[header], header)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>


                </div>
            )}

            {tableData.length === 0 && !loading && !error && selectedGameId && (
                <div className="text-center py-20 bg-muted/10 border border-dashed rounded-xl animate-in fade-in zoom-in-95 duration-500">
                    <div className="text-muted-foreground flex flex-col items-center gap-2">
                        <RefreshCw className="h-10 w-10 opacity-20" />
                        <p>Click "Load" to view data.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
