"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Database } from "lucide-react";
import { cn } from "@/lib/utils";

import papa from 'papaparse';
import { generateBolgeselReport, downloadCSV } from "@/lib/reports";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

interface Config {
  variables: string[];
  reports?: Record<string, string[]>;
  games: { id: string; name: string; viewMappings: Record<string, string> }[];
}

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

    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch("/api/sync-tableau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewId: viewId,
          tableName: "level_design_data",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch data");
      }

      setData(result.data);

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
          // We don't block the user, just log it. Or maybe show a toast?
        } else {
          console.log("Auto-saved to repository:", fileName);
        }
      }

      return result.data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleReportDownload = async (reportName: string) => {
    let currentData = data;

    // If no data yet, fetch it first
    if (!currentData) {
      currentData = await handleSync();
      if (!currentData) return; // Error happened
    }

    // Parse CSV
    const parsed = papa.parse(currentData, { header: true, skipEmptyLines: true });

    let reportData: any[] = [];
    if (reportName === "Bölgesel Revize") {
      reportData = generateBolgeselReport(parsed.data as any[]);
    }
    // Add other reports here if needed

    if (reportData.length > 0) {
      downloadCSV(reportData, `Report_${reportName}_${selectedGameId}_${new Date().toISOString()}.csv`);
    } else {
      setError("Report generation failed or no valid data found.");
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
            {selectedVariable && config.reports?.[selectedVariable] && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-muted-foreground mr-1">Reports:</span>
                {config.reports[selectedVariable].map(report => (
                  <Button
                    key={report}
                    variant="secondary"
                    // disabled={loading || !selectedGameId} 
                    // Actually allow clicking even if not loaded, logic handles it. But need game selected.
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
          <CardHeader className="flex items-center justify-between flex-row">
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
