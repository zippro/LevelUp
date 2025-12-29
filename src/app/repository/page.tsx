"use strict";

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, FileText, Trash2, CheckSquare, Square } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Config {
    variables: string[];
    games: { id: string; name: string }[];
}

interface StorageFile {
    name: string;
    id: string;
    updated_at: string;
    created_at: string;
    last_accessed_at: string;
    metadata: {
        eTag: string;
        size: number;
        mimetype: string;
        cacheControl: string;
        lastModified: string;
        contentLength: number;
        httpStatusCode: number;
    };
}

export default function RepositoryPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);

    const [files, setFiles] = useState<StorageFile[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [selectedGameName, setSelectedGameName] = useState<string | null>("all");
    const [selectedVariable, setSelectedVariable] = useState<string | null>("all");
    const [selectedFileType, setSelectedFileType] = useState<string | null>("all");

    // Selection
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        // Fetch Config for Filters
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                setLoadingConfig(false);
            })
            .catch((e) => {
                console.error("Failed to load config:", e);
                setConfig({ variables: [], games: [] });
            })
            .finally(() => {
                setLoadingConfig(false);
            });

        fetchFiles();
    }, []);

    const fetchFiles = async () => {
        setLoadingFiles(true);
        setError(null);
        setSelectedFiles(new Set()); // Clear selection on refresh
        try {
            const { data, error } = await supabase
                .storage
                .from('data-repository')
                .list('', {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'created_at', order: 'desc' },
                });

            if (error) throw error;
            setFiles((data as any) || []);
        } catch (err: any) {
            console.error("Error fetching files:", err);
            setError(err.message || "Failed to load files.");
        } finally {
            setLoadingFiles(false);
        }
    };

    const handleDownload = async (fileName: string) => {
        try {
            const { data, error } = await supabase
                .storage
                .from('data-repository')
                .download(fileName);

            if (error) throw error;

            const url = window.URL.createObjectURL(data);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
            return true;
        } catch (err: any) {
            console.error("Error downloading file:", err);
            setError(`Failed to download ${fileName}`);
            return false;
        }
    };

    const handleBulkDownload = async () => {
        if (selectedFiles.size === 0) return;
        setActionLoading(true);
        setError(null);

        let successCount = 0;
        // Sequential download to avoid browser blocking
        for (const fileName of Array.from(selectedFiles)) {
            await handleDownload(fileName);
            // Small delay
            await new Promise(r => setTimeout(r, 500));
            successCount++;
        }
        setActionLoading(false);
    };

    const handleBulkDelete = async () => {
        const toDelete = Array.from(selectedFiles);
        if (toDelete.length === 0) return;

        if (!confirm(`Are you sure you want to delete ${toDelete.length} files?`)) return;

        setActionLoading(true);
        setError(null);

        try {
            // Use server-side API to bypass RLS
            const response = await fetch('/api/storage/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: toDelete })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete files');
            }

            // Refresh list
            setSelectedFiles(new Set()); // Clear selection
            await fetchFiles();
        } catch (err: any) {
            console.error("Error deleting files:", err);
            setError(err.message || "Failed to delete selected files.");
            setLoadingFiles(false);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteSingle = async (fileName: string) => {
        if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;
        setActionLoading(true);
        try {
            // Use server-side API to bypass RLS
            const response = await fetch('/api/storage/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: [fileName] })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete file');
            }

            await fetchFiles();
        } catch (err: any) {
            console.error("Error deleting file:", err);
            setError(err.message || "Failed to delete file.");
            setLoadingFiles(false);
        } finally {
            setActionLoading(false);
        }
    }


    // Filter Logic
    const filteredFiles = files.filter(file => {
        // Hide system files and placeholders
        if (file.name === ".emptyFolderPlaceholder") return false;
        if (file.name === "system" || file.name.startsWith(".system")) return false;
        if (file.metadata?.size === 0 && !file.name.includes(".")) return false; // Hide 0-byte files without extension

        let matchesGame = true;
        let matchesVariable = true;
        let matchesFileType = true;

        if (selectedGameName && selectedGameName !== "all") {
            matchesGame = file.name.includes(selectedGameName);
        }

        if (selectedVariable && selectedVariable !== "all") {
            matchesVariable = file.name.includes(selectedVariable);
        }

        if (selectedFileType && selectedFileType !== "all") {
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            matchesFileType = ext === selectedFileType;
        }

        return matchesGame && matchesVariable && matchesFileType;
    });

    // Formatting helper
    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const toggleSelection = (fileName: string) => {
        const next = new Set(selectedFiles);
        if (next.has(fileName)) next.delete(fileName);
        else next.add(fileName);
        setSelectedFiles(next);
    };

    const toggleAll = () => {
        if (selectedFiles.size === filteredFiles.length && filteredFiles.length > 0) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(filteredFiles.map(f => f.name)));
        }
    };

    const isAllSelected = filteredFiles.length > 0 && selectedFiles.size === filteredFiles.length;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card>
                <CardHeader>
                    <CardTitle>Data Repository</CardTitle>
                    <CardDescription>Manage and browse pulled data files.</CardDescription>
                </CardHeader>
                <CardContent>

                    {/* Action Bar & Filters */}
                    <div className="flex flex-col gap-4 mb-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Filter by Game</label>
                                <Select value={selectedGameName || "all"} onValueChange={setSelectedGameName}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Games" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Games</SelectItem>
                                        {config?.games.map(g => (
                                            <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Filter by Data Type</label>
                                <Select value={selectedVariable || "all"} onValueChange={setSelectedVariable}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        {config?.variables.map(v => (
                                            <SelectItem key={v} value={v}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">File Format</label>
                                <Select value={selectedFileType || "all"} onValueChange={setSelectedFileType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Formats" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Formats</SelectItem>
                                        <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                                        <SelectItem value="csv">CSV (.csv)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {selectedFiles.size > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                    <span className="text-sm text-muted-foreground hidden sm:inline-block">{selectedFiles.size} selected</span>
                                    <Button size="sm" variant="secondary" onClick={handleBulkDownload} disabled={actionLoading} className="flex-1 sm:flex-none">
                                        <Download className="mr-2 h-4 w-4" /><span className="sm:hidden">{selectedFiles.size} </span>Download
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={actionLoading} className="flex-1 sm:flex-none">
                                        <Trash2 className="mr-2 h-4 w-4" />Delete
                                    </Button>
                                </div>
                            )}

                            <Button variant="outline" onClick={fetchFiles} disabled={loadingFiles || actionLoading} className="w-full sm:w-auto">
                                {loadingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                            </Button>
                        </div>
                    </div>
                    {/* Error */}
                    {error && (
                        <div className="mb-4 p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                            {error}
                        </div>
                    )}

                    {/* Table */}
                    <div className="rounded-md border overflow-x-auto">
                        <Table className="min-w-[600px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40px]">
                                        <Checkbox
                                            checked={isAllSelected}
                                            onChange={toggleAll}
                                        // Handle indeterminate state visually via custom Checkbox later if needed, simple check for now
                                        />
                                    </TableHead>
                                    <TableHead>File Name</TableHead>
                                    <TableHead>Date Created</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingFiles ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredFiles.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            No files found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredFiles.map((file) => (
                                        <TableRow key={file.id}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedFiles.has(file.name)}
                                                    onChange={() => toggleSelection(file.name)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-blue-500" />
                                                    {file.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {file.created_at ? format(new Date(file.created_at), 'MMM dd, yyyy HH:mm') : '-'}
                                            </TableCell>
                                            <TableCell>{formatSize(file.metadata?.size || 0)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="ghost" onClick={() => handleDownload(file.name)}>
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteSingle(file.name)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}
