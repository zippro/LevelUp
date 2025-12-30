"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Database } from "lucide-react";
import { cn } from "@/lib/utils";

import papa from 'papaparse';
import { generateBolgeselReport, generateLevelScoreReportWorkbook, generateExcelBlobFromWorkbook, generateExcelBlob, downloadExcel } from "@/lib/reports";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

interface Config {
  variables: string[];
  reports?: Record<string, string[]>;
  games: { id: string; name: string; viewMappings: Record<string, string> }[];
  reportSettings?: {
    levelScoreAB?: { minTotalUser?: number };
    bolgeselRevize?: { minTotalUser?: number };
    threeDayChurn?: { minTotalUser?: number };
  };
}

// Map Variables to Available Reports
const VARIABLE_REPORTS: Record<string, string[]> = {
  "Level Revize": ["3 Day Churn Analysis"],
  "Bolgesel Rapor": ["Bölgesel Revize"], // Alias if used
  "Level Score AB": ["Level Score Analysis"]
};

export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Selection State
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // Data State
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Date Range Filter (for Level Score AB)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Cache dialog state
  const [showCacheDialog, setShowCacheDialog] = useState(false);
  const [cachedDataInfo, setCachedDataInfo] = useState<{ fileName: string; createdAt: Date } | null>(null);
  const [platform, setPlatform] = useState<string>("ALL");

  // Fetch Config on Mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data: Config) => {
        setConfig(data);
        if (data.variables.length > 0) {
          setSelectedVariable(data.variables[0]); // Default to first variable
        }
        setLoadingConfig(false);
      })
      .catch((e) => console.error(e));
  }, []);

  // Filter games based on selected variable (only show games that have this variable mapped)
  const availableGames = config?.games.filter(
    (g) => selectedVariable && g.viewMappings && g.viewMappings[selectedVariable]
  );

  const getActiveViewId = () => {
    if (!selectedVariable || !selectedGameId || !config) return null;
    const game = config.games.find(g => g.id === selectedGameId);
    return game?.viewMappings?.[selectedVariable] || null;
  };


  const handleSync = async () => {
    const viewId = getActiveViewId();
    if (!viewId) {
      setError("No View ID found for this selection. Please configure it in Settings.");
      return null;
    }

    // Check for cached data first
    const game = config?.games.find(g => g.id === selectedGameId);
    const gameName = game ? game.name : selectedGameId;

    // Filter Bypass Logic: If any filter is active, force fresh fetch (bypass cache)
    const hasFilters = (startDate && startDate !== '') ||
      (endDate && endDate !== '') ||
      (platform && platform !== 'ALL');

    if (hasFilters) {
      console.log("Filters active, bypassing cache check.");
      return await doSync(true);
    }

    const { data: files } = await supabase.storage
      .from('data-repository')
      .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    const matchingFile = files?.find(f =>
      f.name.includes(gameName || '') && f.name.includes(selectedVariable || '')
    );

    if (matchingFile) {
      setCachedDataInfo({
        fileName: matchingFile.name,
        createdAt: new Date(matchingFile.created_at)
      });
      setShowCacheDialog(true);
      return null;
    } else {
      // No cached data, fetch fresh
      return await doSync(true);
    }
  };

  // Actually perform the sync
  const doSync = async (forceFresh: boolean) => {
    const viewId = getActiveViewId();
    if (!viewId) {
      setError("No View ID found for this selection. Please configure it in Settings.");
      return null;
    }

    setLoading(true);
    setError(null);
    setData(null);
    setShowCacheDialog(false);

    try {
      let csvData: string | null = null;

      if (!forceFresh) {
        // Try to use cached data
        const game = config?.games.find(g => g.id === selectedGameId);
        const gameName = game ? game.name : selectedGameId;

        const { data: files } = await supabase.storage
          .from('data-repository')
          .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

        const matchingFile = files?.find(f =>
          f.name.includes(gameName || '') && f.name.includes(selectedVariable || '')
        );

        if (matchingFile) {
          const { data: fileData } = await supabase.storage
            .from('data-repository')
            .download(matchingFile.name);

          if (fileData) {
            csvData = await fileData.text();
          }
        }
      }

      // If no cached data or force fresh, fetch from Tableau
      if (!csvData) {
        const response = await fetch("/api/sync-tableau", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewId: viewId,
            tableName: `${selectedGameId}-${selectedVariable}`,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            platform: platform === "ALL" ? undefined : platform
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to fetch data");
        }

        csvData = result.data;

        // Save to Supabase Storage
        if (selectedGameId && selectedVariable && csvData) {
          const game = config?.games.find(g => g.id === selectedGameId);
          const gameName = game ? game.name : selectedGameId;
          const timestamp = format(new Date(), "yyyy-MM-dd HH-mm-ss");
          const fileName = `${gameName} - ${selectedVariable} - ${timestamp}.csv`;

          const { error: uploadError } = await supabase.storage
            .from('data-repository')
            .upload(fileName, csvData, {
              contentType: 'text/csv',
              upsert: false
            });

          if (uploadError) {
            console.error("Failed to auto-save to repository:", uploadError);
          } else {
            console.log("Auto-saved to repository:", fileName);
          }
        }
      }

      setData(csvData);
      return csvData;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };



  const handleReportDownload = async (reportName: string) => {
    const game = config?.games.find(g => g.id === selectedGameId);
    let currentData = data;
    setError(null);

    // If date range is set, always fetch fresh data with date filter
    // Otherwise use cached data
    // Always fetch fresh data to ensure new levels/updates are included
    if (!currentData || (startDate || endDate) || true) {
      currentData = await doSync(true);
      if (!currentData) return; // Error happened
    }

    // Parse CSV
    let parsed = papa.parse(currentData, { header: true, skipEmptyLines: true });
    let filteredData = parsed.data as any[];

    // Apply local date filtering if dates are set and data has date column
    if ((startDate || endDate) && parsed.meta.fields) {
      // Exact date column names only (fuzzy 'time' matching was incorrectly matching metric columns like 'Avg. Level Play Time')
      const dateColumns = ['Date', 'Tarih', 'date', 'tarih', 'EventDate', 'Created Date',
        'First Open', 'Time Event', 'first open', 'time event',
        'FirstOpen', 'TimeEvent', 'Event Time', 'Event_Time', 'event_time',
        'Cohort Day', 'cohort day', 'CohortDay'];
      // Only exact match - don't use fuzzy matching as it matches non-date columns
      const dateColumn = parsed.meta.fields.find(f => dateColumns.includes(f));

      // Also check for YEAR/MONTH/DAY pattern in column name
      const datePatternColumn = !dateColumn ? parsed.meta.fields.find(f =>
        /^(year|month|day|date)/i.test(f) ||
        /(year|month|day)$/i.test(f) ||
        /\d{4}/.test(f) // Contains 4 digits (likely a year)
      ) : null;
      const finalDateColumn = dateColumn || datePatternColumn;

      if (finalDateColumn) {
        const startTime = startDate ? new Date(startDate).getTime() : null;
        const endTime = endDate ? new Date(endDate).getTime() : null;

        filteredData = filteredData.filter(row => {
          const dateValue = row[finalDateColumn];
          if (!dateValue) return true;
          const rowTime = new Date(dateValue).getTime();
          if (isNaN(rowTime)) return true;
          if (startTime && rowTime < startTime) return false;
          if (endTime && rowTime > endTime) return false;
          return true;
        });

        console.log(`[Report] Filtered by ${finalDateColumn}: ${(parsed.data as any[]).length} -> ${filteredData.length} rows`);
        // Update parsed data with filtered results
        parsed = { ...parsed, data: filteredData };
      } else {
        // Tableau API should have filtered the data at source
        // Just log a note - don't block the report
        console.log(`[Report] No client-side date filtering (Tableau API should have filtered)`);
      }
    }

    let workbookBlob: Blob | null = null;
    let fileName = "";

    try {
      setLoading(true);
      const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm-ss");
      const rawName = `Report_${reportName}_${game?.name || selectedGameId}_${timestamp}`;
      // Sanitize
      const safeName = rawName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      fileName = `${safeName}.xlsx`;

      // Get minTotalUser from report settings in config
      // Fetch latest config to ensure settings are up to date (e.g. if user just updated settings)
      let reportSettings = config?.reportSettings;
      try {
        const freshConfigRes = await fetch("/api/config");
        if (freshConfigRes.ok) {
          const freshConfig = await freshConfigRes.json();
          if (freshConfig.reportSettings) {
            reportSettings = freshConfig.reportSettings;
          }
        }
      } catch (e) {
        console.error("Failed to fetch fresh config", e);
      }

      let minTotalUser = 0;

      if (reportName === "Bölgesel Revize") {
        minTotalUser = reportSettings?.bolgeselRevize?.minTotalUser || 0;
        // Use ExcelJS with full styling (yellow headers, percentage formatting)
        const { generateBolgeselExcelJSFromRaw } = await import("@/lib/excel-report");
        workbookBlob = await generateBolgeselExcelJSFromRaw(parsed.data as any[], minTotalUser);
      }
      else if (reportName === "Level Score Analysis") {
        minTotalUser = reportSettings?.levelScoreAB?.minTotalUser || 0;
        // Use ExcelJS with full styling (yellow headers, percentage formatting)
        const { generateLevelScoreExcelJSFromRaw } = await import("@/lib/excel-report");
        workbookBlob = await generateLevelScoreExcelJSFromRaw(parsed.data as any[], minTotalUser);
      }
      else if (reportName === "3 Day Churn Analysis") {
        minTotalUser = reportSettings?.threeDayChurn?.minTotalUser || 0;
        // Use ExcelJS with full styling (yellow headers, percentage formatting)
        const { generate3DayChurnExcelJSFromRaw } = await import("@/lib/excel-report");
        workbookBlob = await generate3DayChurnExcelJSFromRaw(parsed.data as any[], minTotalUser);
      }

      if (workbookBlob) {
        // 1. Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('data-repository')
          .upload(fileName, workbookBlob, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: false
          });

        if (uploadError) {
          console.error("Failed to auto-save report to repository:", uploadError);
          setError(`Report generated but failed to save to repository: ${uploadError.message}`);
        } else {
          console.log("Auto-saved report to repository:", fileName);
        }

        // 2. Trigger Download
        // Create URL from Blob and click
        const url = window.URL.createObjectURL(workbookBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        setError("Failed to generate report blob.");
      }

    } catch (e: any) {
      setError("An error occurred during report generation: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([data], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tableau-export-${selectedVariable}-${selectedGameId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loadingConfig) return <div className="p-8">Loading configuration...</div>;
  if (!config) return <div className="p-8">Failed to load configuration.</div>;

  return (
    <div className="space-y-8">
      {/* Cache Dialog */}
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
                onClick={() => doSync(false)}
              >
                Use Saved Data
              </Button>
              <Button
                className="flex-1"
                onClick={() => doSync(true)}
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

      {/* Selection Area */}
      <Card>
        <CardHeader>
          <CardTitle>Pull Data</CardTitle>
          <CardDescription>Select a data variable and a game to download the latest report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* 1. Variable Selection (Chips) */}
          <div className="space-y-3">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              1. Select Data Variable
            </label>
            <div className="flex flex-wrap gap-2">
              {config.variables.map(v => (
                <Button
                  key={v}
                  variant={selectedVariable === v ? "default" : "outline"}
                  onClick={() => { setSelectedVariable(v); setSelectedGameId(null); }}
                  className="h-8"
                >
                  {v}
                </Button>
              ))}
              {config.variables.length === 0 && <span className="text-sm text-muted-foreground">No variables configured. Go to Settings.</span>}
            </div>
          </div>

          {/* 2. Game Selection (Dropdown) */}
          <div className="space-y-3 max-w-xs">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              2. Select Game
            </label>
            <Select
              value={selectedGameId || ""}
              onValueChange={setSelectedGameId}
              disabled={!selectedVariable}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a Game..." />
              </SelectTrigger>
              <SelectContent>
                {availableGames?.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
                {availableGames?.length === 0 && (
                  <SelectItem value="none" disabled>No games have this variable configured</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter (visible for Level Score AB) */}
          {selectedVariable === "Level Score AB" && (
            <div className="space-y-3">
              <label className="text-sm font-medium leading-none">
                3. Select Date Range (Optional)
              </label>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:flex-none">
                  <span className="text-sm text-muted-foreground">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded px-3 py-2 text-sm bg-background w-full sm:w-auto"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:flex-none">
                  <span className="text-sm text-muted-foreground">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded px-3 py-2 text-sm bg-background w-full sm:w-auto"
                  />
                </div>
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="self-end sm:self-center"
                  >
                    Clear Dates
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Platform Filter (visible for Level Revize, Bölgesel, Level Score AB) */}
          {(selectedVariable?.includes("Level Score AB") || selectedVariable?.includes("Bölgesel") || selectedVariable?.includes("Level Revize")) && (
            <div className="space-y-3 max-w-xs">
              <label className="text-sm font-medium leading-none">
                4. Select Platform
              </label>
              <Select
                value={platform}
                onValueChange={setPlatform}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">ALL</SelectItem>
                  <SelectItem value="iOS">iOS</SelectItem>
                  <SelectItem value="Android">Android</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 3. Action */}
          <div className="pt-2 flex flex-wrap gap-4">
            <Button
              onClick={() => handleSync()}
              disabled={loading || !selectedVariable || !selectedGameId}
              size="lg"
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching from Tableau...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" /> Pull Raw Data
                </>
              )}
            </Button>

            {/* Reports */}
            {selectedVariable && (VARIABLE_REPORTS[selectedVariable] || config.reports?.[selectedVariable]) && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-muted-foreground mr-1">Reports:</span>
                {(VARIABLE_REPORTS[selectedVariable] || config.reports?.[selectedVariable] || []).map(report => (
                  <Button
                    key={report}
                    variant="secondary"
                    disabled={loading || !selectedGameId}
                    onClick={() => handleReportDownload(report)}
                    className="h-10"
                  >
                    <Download className="mr-2 h-4 w-4" /> {report}
                  </Button>
                ))}
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Results Area */}
      {(data || error) && (
        <Card className={cn(error ? "border-destructive/50" : "")}>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle>{error ? "Error Occurred" : "Data Ready"}</CardTitle>
              <CardDescription>
                {getActiveViewId() && <span className="font-mono text-xs text-muted-foreground">Source View ID: {getActiveViewId()}</span>}
              </CardDescription>
            </div>
            {data && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {error && (
              <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                {error}
              </div>
            )}
            {data && (
              <div className="rounded-md border bg-muted/50 p-4">
                <pre className="overflow-auto text-xs whitespace-pre-wrap max-h-96">
                  {data.substring(0, 2000) + (data.length > 2000 ? "\n... (truncated for preview)" : "")}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
