"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, FileText, Trash2 } from "lucide-react";
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
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null); // We filter by Name actually, but ID is useful if mapping needed
    const [selectedGameName, setSelectedGameName] = useState<string | null>("all");
    const [selectedVariable, setSelectedVariable] = useState<string | null>("all");

    useEffect(() => {
        // Fetch Config for Filters
        fetch("/api/config")
            .then((res) => res.json())
            .then((data: Config) => {
                setConfig(data);
                setLoadingConfig(false);
            })
            .catch((e) => console.error(e));

        fetchFiles();
    }, []);

    const fetchFiles = async () => {
        setLoadingFiles(true);
        setError(null);
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
        } catch (err: any) {
            console.error("Error downloading file:", err);
            setError("Failed to download file.");
        }
    };

    // Filter Logic
    const filteredFiles = files.filter(file => {
        if (file.name === ".emptyFolderPlaceholder") return false;

        let matchesGame = true;
        let matchesVariable = true;

        // Parse Name: "GameName - Variable - Timestamp.csv"
        // This is a rough parse, relying on the naming convention.
        // If names are complex (contain hyphens), this might be fragile.
        // Assuming: "Game Name - Variable Type - Date Time.csv"

        // Let's rely on simple string inclusion for custom names or partial filtering
        if (selectedGameName && selectedGameName !== "all") {
            matchesGame = file.name.includes(selectedGameName);
        }

        if (selectedVariable && selectedVariable !== "all") {
            matchesVariable = file.name.includes(selectedVariable);
        }

        return matchesGame && matchesVariable;
    });

    // Formatting helper
    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loadingConfig) return <div className="p-8">Loading configuration...</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card>
                <CardHeader>
                    <CardTitle>Data Repository</CardTitle>
                    <CardDescription>Manage and browse pulled data files.</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex flex-wrap gap-4 mb-6">
                        <div className="w-full sm:w-[200px] space-y-2">
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
                        <div className="w-full sm:w-[200px] space-y-2">
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

                        <div className="flex items-end ml-auto">
                            <Button variant="outline" onClick={fetchFiles} disabled={loadingFiles}>
                                {loadingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh List"}
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
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>File Name</TableHead>
                                    <TableHead>Date Created</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingFiles ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredFiles.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            No files found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredFiles.map((file) => (
                                        <TableRow key={file.id}>
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
