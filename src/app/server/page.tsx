"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileArchive,
  Upload,
  Download,
  Trash2,
  FolderPlus,
  RefreshCw,
  ChevronRight,
  Home,
  ArrowLeft,
  Pencil,
  Eye,
  X,
  AlertTriangle,
  HardDrive,
  Copy,
  Check,
  Search,
  FileJson,
  FileCog,
  Terminal,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
  name: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modifyTime: number;
  rights: { user: string; group: string; other: string };
  owner: number;
  group: number;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Format unix timestamp
function formatDate(timestamp: number): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Get file icon based on extension
function getFileIcon(name: string, type: string) {
  if (type === "directory") return <Folder className="h-5 w-5 text-blue-400" />;
  if (type === "symlink") return <Link2 className="h-5 w-5 text-purple-400" />;

  const ext = name.split(".").pop()?.toLowerCase() || "";

  const iconMap: Record<string, React.ReactNode> = {
    // Code
    ts: <FileCode className="h-5 w-5 text-blue-500" />,
    tsx: <FileCode className="h-5 w-5 text-blue-500" />,
    js: <FileCode className="h-5 w-5 text-yellow-500" />,
    jsx: <FileCode className="h-5 w-5 text-yellow-500" />,
    py: <FileCode className="h-5 w-5 text-green-500" />,
    rb: <FileCode className="h-5 w-5 text-red-400" />,
    go: <FileCode className="h-5 w-5 text-cyan-500" />,
    rs: <FileCode className="h-5 w-5 text-orange-400" />,
    java: <FileCode className="h-5 w-5 text-red-500" />,
    php: <FileCode className="h-5 w-5 text-indigo-400" />,
    css: <FileCode className="h-5 w-5 text-pink-400" />,
    scss: <FileCode className="h-5 w-5 text-pink-500" />,
    html: <FileCode className="h-5 w-5 text-orange-500" />,
    vue: <FileCode className="h-5 w-5 text-emerald-500" />,
    svelte: <FileCode className="h-5 w-5 text-orange-600" />,
    sh: <Terminal className="h-5 w-5 text-green-400" />,
    bash: <Terminal className="h-5 w-5 text-green-400" />,
    // Data
    json: <FileJson className="h-5 w-5 text-yellow-400" />,
    xml: <FileCode className="h-5 w-5 text-orange-400" />,
    yaml: <FileCog className="h-5 w-5 text-purple-400" />,
    yml: <FileCog className="h-5 w-5 text-purple-400" />,
    toml: <FileCog className="h-5 w-5 text-gray-500" />,
    env: <FileCog className="h-5 w-5 text-green-600" />,
    ini: <FileCog className="h-5 w-5 text-gray-400" />,
    conf: <FileCog className="h-5 w-5 text-gray-400" />,
    cfg: <FileCog className="h-5 w-5 text-gray-400" />,
    // Images
    png: <FileImage className="h-5 w-5 text-emerald-400" />,
    jpg: <FileImage className="h-5 w-5 text-emerald-400" />,
    jpeg: <FileImage className="h-5 w-5 text-emerald-400" />,
    gif: <FileImage className="h-5 w-5 text-emerald-400" />,
    svg: <FileImage className="h-5 w-5 text-orange-400" />,
    webp: <FileImage className="h-5 w-5 text-emerald-400" />,
    ico: <FileImage className="h-5 w-5 text-emerald-400" />,
    // Video
    mp4: <FileVideo className="h-5 w-5 text-red-400" />,
    webm: <FileVideo className="h-5 w-5 text-red-400" />,
    avi: <FileVideo className="h-5 w-5 text-red-400" />,
    mov: <FileVideo className="h-5 w-5 text-red-400" />,
    // Archives
    zip: <FileArchive className="h-5 w-5 text-amber-500" />,
    tar: <FileArchive className="h-5 w-5 text-amber-500" />,
    gz: <FileArchive className="h-5 w-5 text-amber-500" />,
    rar: <FileArchive className="h-5 w-5 text-amber-500" />,
    "7z": <FileArchive className="h-5 w-5 text-amber-500" />,
    // Text
    md: <FileText className="h-5 w-5 text-gray-400" />,
    txt: <FileText className="h-5 w-5 text-gray-400" />,
    log: <FileText className="h-5 w-5 text-gray-400" />,
    csv: <FileText className="h-5 w-5 text-green-400" />,
    sql: <FileCode className="h-5 w-5 text-blue-400" />,
  };

  return iconMap[ext] || <File className="h-5 w-5 text-gray-400" />;
}

// Viewable extensions
const VIEWABLE_EXTENSIONS = new Set([
  "txt", "md", "log", "csv", "json", "xml", "yaml", "yml", "toml",
  "ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php",
  "css", "scss", "html", "vue", "svelte", "sh", "bash",
  "sql", "env", "ini", "conf", "cfg", "gitignore", "dockerignore",
  "dockerfile", "makefile", "readme",
]);

function isViewable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const baseName = name.toLowerCase();
  return VIEWABLE_EXTENSIONS.has(ext) || VIEWABLE_EXTENSIONS.has(baseName);
}

export default function ServerPage() {
  const [currentPath, setCurrentPath] = useState("/");
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Fetch directory listing
  const fetchDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedItems(new Set());

    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", path }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to list directory");
      }

      setItems(data.items);
      setCurrentPath(data.path);
    } catch (err: any) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDirectory("/");
  }, [fetchDirectory]);

  // Navigate to directory
  const navigateTo = (path: string) => {
    setPathHistory((prev) => [...prev, currentPath]);
    setSearchQuery("");
    fetchDirectory(path);
  };

  // Go back
  const goBack = () => {
    if (pathHistory.length > 0) {
      const prev = pathHistory[pathHistory.length - 1];
      setPathHistory((h) => h.slice(0, -1));
      setSearchQuery("");
      fetchDirectory(prev);
    }
  };

  // Navigate to parent
  const goUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const parentPath = "/" + parts.join("/");
    navigateTo(parentPath || "/");
  };

  // Handle item click
  const handleItemClick = (item: FileItem) => {
    if (item.type === "directory") {
      const newPath = currentPath === "/"
        ? `/${item.name}`
        : `${currentPath}/${item.name}`;
      navigateTo(newPath);
    }
  };

  // Handle item double click (open file)
  const handleItemDoubleClick = (item: FileItem) => {
    if (item.type !== "directory" && isViewable(item.name)) {
      viewFile(item);
    }
  };

  // Toggle selection
  const toggleSelect = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Select all
  const selectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((i) => i.name)));
    }
  };

  // Download file
  const downloadFile = async (filePath: string) => {
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download", path: filePath }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Download failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || "file";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // View file
  const viewFile = async (item: FileItem) => {
    const filePath = currentPath === "/"
      ? `/${item.name}`
      : `${currentPath}/${item.name}`;

    setPreviewFileName(item.name);
    setPreviewLoading(true);
    setShowPreview(true);
    setPreviewContent(null);

    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "view", path: filePath }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to view file");
      }

      setPreviewContent(data.content);
    } catch (err: any) {
      setPreviewContent(`Error: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setLoading(true);
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", path: deleteTarget }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    try {
      setLoading(true);
      for (const name of selectedItems) {
        const fullPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", path: fullPath }),
        });
      }
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Rename
  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;

    try {
      const oldPath = renameTarget;
      const parts = oldPath.split("/");
      parts.pop();
      const newPath = [...parts, renameName.trim()].join("/");

      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", path: oldPath, newPath }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowRenameModal(false);
      setRenameTarget(null);
      setRenameName("");
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const folderPath = currentPath === "/"
        ? `/${newFolderName.trim()}`
        : `${currentPath}/${newFolderName.trim()}`;

      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mkdir", path: folderPath }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowNewFolderModal(false);
      setNewFolderName("");
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Upload files
  const handleUpload = async (files: FileList) => {
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(`Uploading ${files.length} file(s)...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})...`);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", currentPath);

        const res = await fetch("/api/server", {
          method: "PUT",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}`);
      }

      setUploadProgress(null);
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleUpload(files);
    }
  };

  // Copy path to clipboard
  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Build breadcrumb
  const pathParts = currentPath.split("/").filter(Boolean);

  // Filter items by search
  const filteredItems = searchQuery
    ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  // Computed counts
  const dirCount = items.filter((i) => i.type === "directory").length;
  const fileCount = items.filter((i) => i.type !== "directory").length;
  const totalSize = items.reduce((acc, i) => acc + (i.type !== "directory" ? i.size : 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <HardDrive className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Server Files</h1>
            <p className="text-xs text-gray-500">
              {dirCount} folders, {fileCount} files ({formatBytes(totalSize)})
            </p>
          </div>
        </div>
      </div>

      {/* Breadcrumb + Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Navigation buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={goBack}
                disabled={pathHistory.length === 0 || loading}
                className="h-8 w-8 p-0"
                title="Go back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateTo("/")}
                disabled={currentPath === "/" || loading}
                className="h-8 w-8 p-0"
                title="Go to root"
              >
                <Home className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchDirectory(currentPath)}
                disabled={loading}
                className="h-8 w-8 p-0"
                title="Refresh"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 flex-1 min-w-0 bg-gray-50 rounded-lg px-3 py-1.5 overflow-x-auto">
              <button
                onClick={() => navigateTo("/")}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors flex-shrink-0"
              >
                /
              </button>
              {pathParts.map((part, idx) => {
                const fullPath = "/" + pathParts.slice(0, idx + 1).join("/");
                const isLast = idx === pathParts.length - 1;
                return (
                  <div key={idx} className="flex items-center gap-1 flex-shrink-0">
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                    <button
                      onClick={() => !isLast && navigateTo(fullPath)}
                      className={cn(
                        "text-sm transition-colors",
                        isLast
                          ? "font-semibold text-gray-900"
                          : "font-medium text-gray-600 hover:text-blue-600"
                      )}
                    >
                      {part}
                    </button>
                  </div>
                );
              })}

              {/* Copy path button */}
              <button
                onClick={() => copyPath(currentPath)}
                className="ml-auto flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
                title="Copy path"
              >
                {copiedPath === currentPath ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                )}
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-shrink-0 w-full sm:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNewFolderModal(true)}
        >
          <FolderPlus className="h-4 w-4 mr-1.5" />
          New Folder
        </Button>

        {selectedItems.size > 0 && (
          <>
            <div className="w-px h-8 bg-gray-200" />
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              onClick={() => {
                setDeleteTarget(null);
                setShowDeleteConfirm(true);
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete ({selectedItems.size})
            </Button>
            {selectedItems.size === 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const name = Array.from(selectedItems)[0];
                  const fullPath = currentPath === "/"
                    ? `/${name}`
                    : `${currentPath}/${name}`;
                  setRenameTarget(fullPath);
                  setRenameName(name);
                  setShowRenameModal(true);
                }}
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Rename
              </Button>
            )}
            {selectedItems.size === 1 && (() => {
              const name = Array.from(selectedItems)[0];
              const item = items.find((i) => i.name === name);
              return item && item.type !== "directory";
            })() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const name = Array.from(selectedItems)[0];
                  const fullPath = currentPath === "/"
                    ? `/${name}`
                    : `${currentPath}/${name}`;
                  downloadFile(fullPath);
                }}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download
              </Button>
            )}
          </>
        )}

        {uploadProgress && (
          <div className="flex items-center gap-2 text-sm text-blue-600 ml-auto">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploadProgress}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* File List */}
      <Card
        className={cn(
          "transition-all duration-200",
          isDragging && "ring-2 ring-blue-500 ring-offset-2 bg-blue-50/50"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/80 backdrop-blur-sm rounded-xl">
            <div className="text-center">
              <Upload className="h-12 w-12 text-blue-500 mx-auto mb-2" />
              <p className="text-lg font-semibold text-blue-700">Drop files here</p>
              <p className="text-sm text-blue-500">Files will be uploaded to {currentPath}</p>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-500">Loading directory...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              {searchQuery ? (
                <>
                  <Search className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-lg font-medium">No matching files</p>
                  <p className="text-sm">Try a different search term</p>
                </>
              ) : (
                <>
                  <Folder className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-lg font-medium">Empty directory</p>
                  <p className="text-sm">Upload files or create a new folder</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/80">
                    <th className="py-2.5 px-4 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                        onChange={selectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                      Size
                    </th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Modified
                    </th>
                    <th className="py-2.5 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Go up row if not at root */}
                  {currentPath !== "/" && !searchQuery && (
                    <tr
                      className="border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer transition-colors"
                      onClick={goUp}
                    >
                      <td className="py-2 px-4"></td>
                      <td className="py-2 px-4" colSpan={3}>
                        <div className="flex items-center gap-3 text-gray-500">
                          <Folder className="h-5 w-5 text-gray-400" />
                          <span className="text-sm font-medium">..</span>
                        </div>
                      </td>
                      <td className="py-2 px-4"></td>
                    </tr>
                  )}

                  {filteredItems.map((item) => {
                    const isSelected = selectedItems.has(item.name);
                    const fullPath = currentPath === "/"
                      ? `/${item.name}`
                      : `${currentPath}/${item.name}`;

                    return (
                      <tr
                        key={item.name}
                        className={cn(
                          "border-b border-gray-50 transition-colors cursor-pointer group",
                          isSelected
                            ? "bg-blue-50/60"
                            : "hover:bg-gray-50/80"
                        )}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                      >
                        <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelect(item.name, e as any);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {getFileIcon(item.name, item.type)}
                            <span className="text-sm font-medium text-gray-800 truncate">
                              {item.name}
                            </span>
                            {item.type === "symlink" && (
                              <span className="text-xs text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded">link</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-4 text-right hidden sm:table-cell">
                          <span className="text-sm text-gray-500">
                            {item.type === "directory" ? "—" : formatBytes(item.size)}
                          </span>
                        </td>
                        <td className="py-2 px-4 hidden md:table-cell">
                          <span className="text-sm text-gray-500">
                            {formatDate(item.modifyTime)}
                          </span>
                        </td>
                        <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.type !== "directory" && isViewable(item.name) && (
                              <button
                                onClick={() => viewFile(item)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {item.type !== "directory" && (
                              <button
                                onClick={() => downloadFile(fullPath)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600 transition-colors"
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setRenameTarget(fullPath);
                                setRenameName(item.name);
                                setShowRenameModal(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-amber-600 transition-colors"
                              title="Rename"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteTarget(fullPath);
                                setShowDeleteConfirm(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============= MODALS ============= */}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-blue-500" />
              New Folder
            </h3>
            <input
              type="text"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
              className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowNewFolderModal(false); setNewFolderName(""); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Pencil className="h-5 w-5 text-amber-500" />
              Rename
            </h3>
            <input
              type="text"
              placeholder="New name..."
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
              className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowRenameModal(false); setRenameTarget(null); setRenameName(""); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRename}
                disabled={!renameName.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Rename
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirm Delete
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {deleteTarget ? (
                <>Are you sure you want to delete <strong className="text-gray-900">{deleteTarget.split("/").pop()}</strong>? This cannot be undone.</>
              ) : (
                <>Are you sure you want to delete <strong className="text-gray-900">{selectedItems.size} selected item(s)</strong>? This cannot be undone.</>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={deleteTarget ? handleDelete : handleDeleteSelected}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900">{previewFileName}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyPath(previewContent || "")}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copy content"
                >
                  {copiedPath === previewContent ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => { setShowPreview(false); setPreviewContent(null); }}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-500">Loading file...</span>
                </div>
              ) : (
                <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap break-all leading-relaxed bg-gray-50 rounded-lg p-4 min-h-[200px]">
                  {previewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
