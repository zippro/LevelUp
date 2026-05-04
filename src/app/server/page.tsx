"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Database,
  ChevronDown,
  FolderInput,
  FolderSymlink,
  Unlock,
  Globe,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
  name: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modifyTime: number;
  key: string;
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
    json: <FileJson className="h-5 w-5 text-yellow-400" />,
    xml: <FileCode className="h-5 w-5 text-orange-400" />,
    yaml: <FileCog className="h-5 w-5 text-purple-400" />,
    yml: <FileCog className="h-5 w-5 text-purple-400" />,
    toml: <FileCog className="h-5 w-5 text-gray-500" />,
    env: <FileCog className="h-5 w-5 text-green-600" />,
    ini: <FileCog className="h-5 w-5 text-gray-400" />,
    conf: <FileCog className="h-5 w-5 text-gray-400" />,
    cfg: <FileCog className="h-5 w-5 text-gray-400" />,
    png: <FileImage className="h-5 w-5 text-emerald-400" />,
    jpg: <FileImage className="h-5 w-5 text-emerald-400" />,
    jpeg: <FileImage className="h-5 w-5 text-emerald-400" />,
    gif: <FileImage className="h-5 w-5 text-emerald-400" />,
    svg: <FileImage className="h-5 w-5 text-orange-400" />,
    webp: <FileImage className="h-5 w-5 text-emerald-400" />,
    ico: <FileImage className="h-5 w-5 text-emerald-400" />,
    mp4: <FileVideo className="h-5 w-5 text-red-400" />,
    webm: <FileVideo className="h-5 w-5 text-red-400" />,
    avi: <FileVideo className="h-5 w-5 text-red-400" />,
    mov: <FileVideo className="h-5 w-5 text-red-400" />,
    zip: <FileArchive className="h-5 w-5 text-amber-500" />,
    tar: <FileArchive className="h-5 w-5 text-amber-500" />,
    gz: <FileArchive className="h-5 w-5 text-amber-500" />,
    rar: <FileArchive className="h-5 w-5 text-amber-500" />,
    "7z": <FileArchive className="h-5 w-5 text-amber-500" />,
    md: <FileText className="h-5 w-5 text-gray-400" />,
    txt: <FileText className="h-5 w-5 text-gray-400" />,
    log: <FileText className="h-5 w-5 text-gray-400" />,
    csv: <FileText className="h-5 w-5 text-green-400" />,
    sql: <FileCode className="h-5 w-5 text-blue-400" />,
    unity: <FileCode className="h-5 w-5 text-gray-600" />,
    prefab: <FileCode className="h-5 w-5 text-blue-300" />,
    asset: <FileCode className="h-5 w-5 text-purple-300" />,
    bundle: <FileArchive className="h-5 w-5 text-indigo-500" />,
    aab: <FileArchive className="h-5 w-5 text-green-600" />,
    apk: <FileArchive className="h-5 w-5 text-green-600" />,
    ipa: <FileArchive className="h-5 w-5 text-blue-600" />,
  };

  return iconMap[ext] || <File className="h-5 w-5 text-gray-400" />;
}

// Viewable extensions
const VIEWABLE_EXTENSIONS = new Set([
  "txt", "md", "log", "csv", "json", "xml", "yaml", "yml", "toml",
  "ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php",
  "css", "scss", "html", "vue", "svelte", "sh", "bash",
  "sql", "env", "ini", "conf", "cfg",
]);

function isViewable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return VIEWABLE_EXTENSIONS.has(ext);
}

// ─── NarEncryptor (client-side, identical to Decoder page) ───

const VERSION_HEADER = new TextEncoder().encode("NARv1"); // 5 bytes

async function narImportKey(keyStr: string): Promise<CryptoKey> {
  const keyBytes = new TextEncoder().encode(keyStr);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
}

function narHasVersionHeader(data: Uint8Array): boolean {
  if (data.length < VERSION_HEADER.length + 16) return false;
  for (let i = 0; i < VERSION_HEADER.length; i++) {
    if (data[i] !== VERSION_HEADER[i]) return false;
  }
  return true;
}

function narSkipBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return bytes.slice(3);
  }
  if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
    return bytes.slice(2);
  }
  return bytes;
}

/** Decrypt Base64 string → plaintext string (identical to Decoder page's decryptText) */
async function narDecryptText(encryptedText: string, keyStr: string): Promise<string> {
  const key = await narImportKey(keyStr);
  // Base64 decode
  const binary = atob(encryptedText);
  const encryptedBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) encryptedBytes[i] = binary.charCodeAt(i);

  let iv: Uint8Array;
  let cipherData: Uint8Array;

  if (narHasVersionHeader(encryptedBytes)) {
    const headerLen = VERSION_HEADER.length;
    iv = encryptedBytes.slice(headerLen, headerLen + 16);
    cipherData = encryptedBytes.slice(headerLen + 16);
  } else {
    // Legacy: no header, zero IV
    iv = new Uint8Array(16);
    cipherData = encryptedBytes;
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv as unknown as ArrayBuffer },
    key,
    cipherData as unknown as ArrayBuffer
  );
  const decryptedBytes = narSkipBom(new Uint8Array(decrypted));
  return new TextDecoder("utf-8").decode(decryptedBytes);
}

export default function ServerPage() {
  const [currentPath, setCurrentPath] = useState("/");
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Bucket state
  const [currentBucket, setCurrentBucket] = useState<string>("");
  const [availableBuckets, setAvailableBuckets] = useState<string[]>([]);
  const [showBucketDropdown, setShowBucketDropdown] = useState(false);

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

  // Move/Copy state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerMode, setFolderPickerMode] = useState<"move" | "copy">("move");
  const [folderPickerTarget, setFolderPickerTarget] = useState<string | null>(null);
  const [allDirs, setAllDirs] = useState<string[]>([]);
  const [dirsLoading, setDirsLoading] = useState(false);
  const [dirSearchQuery, setDirSearchQuery] = useState("");
  const [selectedDir, setSelectedDir] = useState<string | null>(null);

  // Decode state
  const [decoding, setDecoding] = useState(false);

  // Success toast
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Asset upload prompt state
  const [pendingAssetFiles, setPendingAssetFiles] = useState<File[]>([]);
  const [pendingNonAssetFiles, setPendingNonAssetFiles] = useState<File[]>([]);
  const [showAssetPrompt, setShowAssetPrompt] = useState(false);

  // File visibility (public / private) — default public
  const [fileVisibility, setFileVisibility] = useState<"public" | "private">("public");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Fetch available buckets on mount
  useEffect(() => {
    fetch("/api/server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buckets" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.current) {
          setCurrentBucket(data.current);
          setAvailableBuckets(data.available || [data.current]);
        }
      })
      .catch(console.error);
  }, []);

  // Fetch directory listing
  const fetchDirectory = useCallback(
    async (path: string) => {
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
        if (data.bucket) setCurrentBucket(data.bucket);
      } catch (err: any) {
        setError(err.message);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchDirectory("/");
  }, [fetchDirectory]);

  // Switch bucket
  const switchBucket = (bucket: string) => {
    setShowBucketDropdown(false);
    // We need to update the env on the fly — but since env is server-side,
    // we pass bucket as a param. For now, let's navigate to root.
    // The bucket switching would require server-side support.
    // For simplicity, we store it and the API uses it.
    setCurrentBucket(bucket);
    setPathHistory([]);
    setSearchQuery("");
    // Refetch with the new bucket context
    fetchDirectory("/");
  };

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
      const newPath =
        currentPath === "/"
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
      if (next.has(name)) next.delete(name);
      else next.add(name);
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

  // Save a blob with native Save As dialog, fallback to direct download
  const saveBlob = async (blob: Blob, fileName: string) => {
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }
    // Fallback: direct download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
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
      const fileName = filePath.split("/").pop() || "file";
      await saveBlob(blob, fileName);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // View file
  const viewFile = async (item: FileItem) => {
    const filePath =
      currentPath === "/"
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
      if (!res.ok) throw new Error(data.error || "Failed to view file");
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
      const item = items.find(
        (i) => deleteTarget.endsWith(i.name) || deleteTarget.endsWith(i.name + "/")
      );
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          path: deleteTarget,
          isDirectory: item?.type === "directory",
        }),
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
        const fullPath =
          currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
        const item = items.find((i) => i.name === name);
        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            path: fullPath,
            isDirectory: item?.type === "directory",
          }),
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
      const folderPath =
        currentPath === "/"
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

    // Check if any .asset files are in the batch
    const assetFiles: File[] = [];
    const nonAssetFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      if (files[i].name.endsWith(".asset")) {
        assetFiles.push(files[i]);
      } else {
        nonAssetFiles.push(files[i]);
      }
    }

    if (assetFiles.length > 0) {
      // Store pending files and show prompt
      setPendingAssetFiles(assetFiles);
      setPendingNonAssetFiles(nonAssetFiles);
      setShowAssetPrompt(true);
    } else {
      // No .asset files, upload directly
      await doUpload(files);
    }
  };

  // Actually upload files (called after prompt decision)
  const doUpload = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (!fileArr.length) return;

    setUploading(true);
    setUploadProgress(`Uploading ${fileArr.length} file(s)...`);

    try {
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        setUploadProgress(
          `Uploading ${file.name} (${i + 1}/${fileArr.length})...`
        );

        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", currentPath);
        formData.append("acl", fileVisibility);

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

  // Handle asset prompt: Direct Upload
  const handleAssetDirectUpload = async () => {
    setShowAssetPrompt(false);
    const allFiles = [...pendingNonAssetFiles, ...pendingAssetFiles];
    setPendingAssetFiles([]);
    setPendingNonAssetFiles([]);
    await doUpload(allFiles);
  };

  // Handle asset prompt: Encode & Upload (server-side encryption)
  const handleAssetEncodeUpload = async () => {
    setShowAssetPrompt(false);
    setUploading(true);
    const allFiles = [...pendingNonAssetFiles];

    try {
      for (const assetFile of pendingAssetFiles) {
        setUploadProgress(`Encoding ${assetFile.name}...`);

        // Send the .asset file to server for encryption
        const formData = new FormData();
        formData.append("file", assetFile);
        formData.append("path", currentPath);
        formData.append("acl", fileVisibility);
        formData.append("encodeAsset", "true");

        const res = await fetch("/api/server", {
          method: "PUT",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to encode ${assetFile.name}`);
      }

      // Upload non-asset files normally
      if (allFiles.length > 0) {
        await doUpload(allFiles);
      }

      setSuccessMessage(`${pendingAssetFiles.length} file(s) encoded & uploaded as .txt`);
      setTimeout(() => setSuccessMessage(null), 3000);
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(`Encode failed: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setPendingAssetFiles([]);
      setPendingNonAssetFiles([]);
    }
  };

  // Drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
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
    if (files.length > 0) await handleUpload(files);
  };

  // Copy path
  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Load all directories for folder picker
  const loadDirs = async () => {
    setDirsLoading(true);
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list-dirs" }),
      });
      const data = await res.json();
      if (res.ok && data.dirs) {
        setAllDirs(data.dirs);
      }
    } catch (err: any) {
      console.error("Failed to load dirs", err);
    } finally {
      setDirsLoading(false);
    }
  };

  // Open folder picker for move/copy
  const openFolderPicker = (mode: "move" | "copy", filePath: string) => {
    setFolderPickerMode(mode);
    setFolderPickerTarget(filePath);
    setSelectedDir(null);
    setDirSearchQuery("");
    setShowFolderPicker(true);
    loadDirs();
  };

  // Execute move/copy
  const handleMoveOrCopy = async () => {
    if (!folderPickerTarget || selectedDir === null) return;

    try {
      setLoading(true);
      let destPath = selectedDir;
      if (!destPath.endsWith("/")) destPath += "/";

      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: folderPickerMode,
          path: folderPickerTarget,
          newPath: destPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowFolderPicker(false);
      setFolderPickerTarget(null);
      fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Decode & Download — client-side decryption using same Web Crypto as Decoder page
  const decodeAndDownload = async (filePath: string) => {
    setDecoding(true);
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decode", path: filePath }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Decode failed");
      }

      // Server returns encrypted content + key
      const data = await res.json();
      const { encryptedContent, key: decoderKey, fileName: outputName } = data;

      // Decrypt using the exact same Web Crypto function as the Decoder page
      const decryptedText = await narDecryptText(encryptedContent, decoderKey);

      // Create Blob from string — identical to Decoder page:
      // new Blob([file.resultContent], { type: "text/plain;charset=utf-8" })
      const blob = new Blob([decryptedText], { type: "text/plain;charset=utf-8" });

      await saveBlob(blob, outputName);
    } catch (err: any) {
      setError(`Decode failed: ${err.message}`);
    } finally {
      setDecoding(false);
    }
  };

  // Decode & View — decrypt and show in preview modal (for testing decode format)
  const decodeAndView = async (filePath: string) => {
    const fileName = filePath.split("/").pop() || "file";
    setPreviewFileName(`[Decoded] ${fileName}`);
    setPreviewLoading(true);
    setShowPreview(true);
    setPreviewContent(null);

    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decode", path: filePath }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Decode failed");
      }

      const data = await res.json();
      const { encryptedContent, key: decoderKey } = data;

      // Decrypt using Web Crypto — identical to Decoder page
      const decryptedText = await narDecryptText(encryptedContent, decoderKey);
      setPreviewContent(decryptedText);
    } catch (err: any) {
      setPreviewContent(`Error: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Download all selected files
  const downloadSelected = async () => {
    const fileNames = Array.from(selectedItems).filter((name) => {
      const item = items.find((i) => i.name === name);
      return item && item.type !== "directory";
    });
    for (const name of fileNames) {
      const fullPath =
        currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      await downloadFile(fullPath);
    }
  };

  // Decode & download all selected .txt files
  const decodeSelectedAndDownload = async () => {
    const txtNames = Array.from(selectedItems).filter((name) =>
      name.endsWith(".txt")
    );
    if (txtNames.length === 0) return;
    setDecoding(true);
    try {
      for (const name of txtNames) {
        const fullPath =
          currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
        await decodeAndDownload(fullPath);
      }
    } finally {
      setDecoding(false);
    }
  };

  // Build breadcrumb
  const pathParts = currentPath.split("/").filter(Boolean);

  // Filter items by search
  const filteredItems = searchQuery
    ? items.filter((i) =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  // Computed counts
  const dirCount = items.filter((i) => i.type === "directory").length;
  const fileCount = items.filter((i) => i.type !== "directory").length;
  const totalSize = items.reduce(
    (acc, i) => acc + (i.type !== "directory" ? i.size : 0),
    0
  );

  // Detect if we're in an A or B folder for quick copy
  const lastFolder = pathParts[pathParts.length - 1];
  const isInAFolder = lastFolder === "A";
  const isInBFolder = lastFolder === "B";
  const siblingFolder = isInAFolder ? "B" : isInBFolder ? "A" : null;

  // Get the sibling path (swap A↔B)
  const getSiblingPath = (filePath: string): string | null => {
    // Find /A/ or /B/ in the path and swap
    const parts = filePath.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === "A" || parts[i] === "B") {
        parts[i] = parts[i] === "A" ? "B" : "A";
        return parts.join("/");
      }
    }
    return null;
  };

  // Copy file to sibling A/B folder
  const copyToSibling = async (filePath: string) => {
    const destPath = getSiblingPath(filePath);
    if (!destPath) {
      setError("Cannot determine sibling folder");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy",
          path: filePath,
          newPath: destPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const fileName = filePath.split("/").pop() || "File";
      setSuccessMessage(`"${fileName}" copied to ${siblingFolder}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Copy all selected files to sibling A/B folder
  const copySelectedToSibling = async () => {
    try {
      setLoading(true);
      const count = selectedItems.size;
      for (const name of selectedItems) {
        const fullPath =
          currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
        const destPath = getSiblingPath(fullPath);
        if (!destPath) continue;

        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "copy",
            path: fullPath,
            newPath: destPath,
          }),
        });
      }
      setSelectedItems(new Set());
      setSuccessMessage(`${count} file(s) copied to ${siblingFolder}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Visibility Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Upload as:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setFileVisibility("public")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all",
                  fileVisibility === "public"
                    ? "bg-blue-600 text-white shadow-inner"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                <Globe className="h-4 w-4" />
                Public
              </button>
              <button
                onClick={() => setFileVisibility("private")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all border-l border-gray-200",
                  fileVisibility === "private"
                    ? "bg-amber-600 text-white shadow-inner"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                <Lock className="h-4 w-4" />
                Private
              </button>
            </div>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              fileVisibility === "public"
                ? "bg-blue-100 text-blue-700"
                : "bg-amber-100 text-amber-700"
            )}>
              {fileVisibility === "public" ? "Files will be publicly accessible" : "Files will be private"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <HardDrive className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              DO Spaces — {currentBucket || "..."}
            </h1>
            <p className="text-xs text-gray-500">
              {dirCount} folders, {fileCount} files ({formatBytes(totalSize)})
            </p>
          </div>
        </div>

        {/* Bucket Switcher */}
        {availableBuckets.length > 1 && (
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBucketDropdown(!showBucketDropdown)}
              className="gap-2"
            >
              <Database className="h-4 w-4" />
              {currentBucket}
              <ChevronDown className="h-3 w-3" />
            </Button>
            {showBucketDropdown && (
              <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl border py-1 z-50 min-w-[160px]">
                {availableBuckets.map((bucket) => (
                  <button
                    key={bucket}
                    onClick={() => switchBucket(bucket)}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors",
                      bucket === currentBucket
                        ? "font-semibold text-blue-600 bg-blue-50"
                        : "text-gray-700"
                    )}
                  >
                    {bucket}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
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
                  <div
                    key={idx}
                    className="flex items-center gap-1 flex-shrink-0"
                  >
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
                  const fullPath =
                    currentPath === "/"
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
            {/* Download — single or multi */}
            {(() => {
              const selected = Array.from(selectedItems);
              const hasFiles = selected.some((name) => {
                const item = items.find((i) => i.name === name);
                return item && item.type !== "directory";
              });
              return hasFiles;
            })() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedItems.size === 1) {
                    const name = Array.from(selectedItems)[0];
                    const fullPath =
                      currentPath === "/"
                        ? `/${name}`
                        : `${currentPath}/${name}`;
                    downloadFile(fullPath);
                  } else {
                    downloadSelected();
                  }
                }}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download{selectedItems.size > 1 ? ` (${selectedItems.size})` : ""}
              </Button>
            )}
            {/* Move To / Copy To — single or multi */}
            {(() => {
              const selected = Array.from(selectedItems);
              const hasFiles = selected.some((name) => {
                const item = items.find((i) => i.name === name);
                return item && item.type !== "directory";
              });
              return hasFiles;
            })() && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const name = Array.from(selectedItems)[0];
                    const fullPath =
                      currentPath === "/"
                        ? `/${name}`
                        : `${currentPath}/${name}`;
                    openFolderPicker("move", fullPath);
                  }}
                >
                  <FolderInput className="h-4 w-4 mr-1.5" />
                  Move To
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const name = Array.from(selectedItems)[0];
                    const fullPath =
                      currentPath === "/"
                        ? `/${name}`
                        : `${currentPath}/${name}`;
                    openFolderPicker("copy", fullPath);
                  }}
                >
                  <FolderSymlink className="h-4 w-4 mr-1.5" />
                  Copy To
                </Button>
              </>
            )}
            {/* Decode & Download — single or multi (.txt files) */}
            {(() => {
              const selected = Array.from(selectedItems);
              return selected.some((name) => name.endsWith(".txt"));
            })() && (
              <Button
                variant="outline"
                size="sm"
                disabled={decoding}
                className="text-violet-600 border-violet-200 hover:bg-violet-50 hover:border-violet-300"
                onClick={() => {
                  if (selectedItems.size === 1) {
                    const name = Array.from(selectedItems)[0];
                    const fullPath =
                      currentPath === "/"
                        ? `/${name}`
                        : `${currentPath}/${name}`;
                    decodeAndDownload(fullPath);
                  } else {
                    decodeSelectedAndDownload();
                  }
                }}
              >
                {decoding ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Unlock className="h-4 w-4 mr-1.5" />
                )}
                Decode & Download{selectedItems.size > 1 ? ` (${Array.from(selectedItems).filter(n => n.endsWith(".txt")).length})` : ""}
              </Button>
            )}
          </>
        )}

        {/* Copy to A/B button (visible when in A or B folder with selection) */}
        {siblingFolder && selectedItems.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={copySelectedToSibling}
            disabled={loading}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FolderSymlink className="h-4 w-4 mr-1.5" />
            )}
            Copy to {siblingFolder} ({selectedItems.size})
          </Button>
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
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Success Toast */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-emerald-600 text-white rounded-xl shadow-2xl shadow-emerald-500/30 px-5 py-3.5 flex items-center gap-3 min-w-[280px]">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Copied!</p>
              <p className="text-xs text-emerald-100 mt-0.5">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* File List */}
      <Card
        className={cn(
          "transition-all duration-200 relative",
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
              <p className="text-lg font-semibold text-blue-700">
                Drop files here
              </p>
              <p className="text-sm text-blue-500">
                Files will be uploaded to {currentPath}
              </p>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-500">Loading...</span>
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
                  <p className="text-lg font-medium">Empty</p>
                  <p className="text-sm">
                    Upload files or create a new folder
                  </p>
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
                        checked={
                          selectedItems.size === filteredItems.length &&
                          filteredItems.length > 0
                        }
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
                  {/* Go up row */}
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
                    const fullPath =
                      currentPath === "/"
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
                        <td
                          className="py-2 px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                          </div>
                        </td>
                        <td className="py-2 px-4 text-right hidden sm:table-cell">
                          <span className="text-sm text-gray-500">
                            {item.type === "directory"
                              ? "—"
                              : formatBytes(item.size)}
                          </span>
                        </td>
                        <td className="py-2 px-4 hidden md:table-cell">
                          <span className="text-sm text-gray-500">
                            {formatDate(item.modifyTime)}
                          </span>
                        </td>
                        <td
                          className="py-2 px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.type !== "directory" &&
                              isViewable(item.name) && (
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
                            {item.type !== "directory" && (
                              <>
                                <button
                                  onClick={() => openFolderPicker("move", fullPath)}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
                                  title="Move To"
                                >
                                  <FolderInput className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openFolderPicker("copy", fullPath)}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600 transition-colors"
                                  title="Copy To"
                                >
                                  <FolderSymlink className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {item.type !== "directory" && item.name.endsWith(".txt") && (
                              <>
                                <button
                                  onClick={() => decodeAndDownload(fullPath)}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-violet-600 transition-colors"
                                  title="Decode & Download"
                                >
                                  <Unlock className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => decodeAndView(fullPath)}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-emerald-600 transition-colors"
                                  title="Decode & View"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {item.type !== "directory" && siblingFolder && (
                              <button
                                onClick={() => copyToSibling(fullPath)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-emerald-600 transition-colors"
                                title={`Copy to ${siblingFolder}`}
                              >
                                <span className="text-[10px] font-bold">→{siblingFolder}</span>
                              </button>
                            )}
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
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName("");
                }}
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
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameTarget(null);
                  setRenameName("");
                }}
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
                <>
                  Are you sure you want to delete{" "}
                  <strong className="text-gray-900">
                    {deleteTarget.split("/").pop()}
                  </strong>
                  ? This cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <strong className="text-gray-900">
                    {selectedItems.size} selected item(s)
                  </strong>
                  ? This cannot be undone.
                </>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTarget(null);
                }}
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
                <h3 className="font-semibold text-gray-900">
                  {previewFileName}
                </h3>
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
                  onClick={() => {
                    setShowPreview(false);
                    setPreviewContent(null);
                  }}
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
      {/* Asset Upload Prompt */}
      {showAssetPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Upload className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  .asset File Detected
                </h3>
                <p className="text-xs text-gray-500">
                  {pendingAssetFiles.length} asset file(s): {pendingAssetFiles.map(f => f.name).join(", ")}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-5">
              How would you like to upload the .asset file(s)?
            </p>

            <div className="space-y-3">
              <button
                onClick={handleAssetEncodeUpload}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-violet-200 hover:border-violet-400 hover:bg-violet-50/50 transition-all group text-left"
              >
                <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-200 transition-colors">
                  <Unlock className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Encode & Upload</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Encrypt .asset → .txt using your decoder key, then upload
                  </p>
                </div>
              </button>

              <button
                onClick={handleAssetDirectUpload}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50/50 transition-all group text-left"
              >
                <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                  <Upload className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Direct Upload</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Upload the .asset file as-is without encoding
                  </p>
                </div>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAssetPrompt(false);
                  setPendingAssetFiles([]);
                  setPendingNonAssetFiles([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Picker Modal (Move To / Copy To) */}
      {showFolderPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border w-full max-w-lg mx-4 max-h-[70vh] flex flex-col animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                {folderPickerMode === "move" ? (
                  <FolderInput className="h-5 w-5 text-blue-500" />
                ) : (
                  <FolderSymlink className="h-5 w-5 text-green-500" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {folderPickerMode === "move" ? "Move To" : "Copy To"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {folderPickerTarget?.split("/").pop()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowFolderPicker(false);
                  setFolderPickerTarget(null);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search dirs */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search folders..."
                  value={dirSearchQuery}
                  onChange={(e) => setDirSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Directory list */}
            <div className="flex-1 overflow-auto p-2">
              {dirsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  <span className="ml-2 text-sm text-gray-500">Loading folders...</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {allDirs
                    .filter((d) =>
                      dirSearchQuery
                        ? d.toLowerCase().includes(dirSearchQuery.toLowerCase())
                        : true
                    )
                    .map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setSelectedDir(dir)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors",
                          selectedDir === dir
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <Folder className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        <span className="truncate font-mono text-xs">{dir}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t bg-gray-50/50 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {selectedDir !== null && (
                  <span>Destination: <strong className="text-gray-700">{selectedDir}</strong></span>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowFolderPicker(false);
                    setFolderPickerTarget(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleMoveOrCopy}
                  disabled={selectedDir === null || loading}
                  className={cn(
                    "text-white",
                    folderPickerMode === "move"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-green-600 hover:bg-green-700"
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : folderPickerMode === "move" ? (
                    <FolderInput className="h-4 w-4 mr-1.5" />
                  ) : (
                    <FolderSymlink className="h-4 w-4 mr-1.5" />
                  )}
                  {folderPickerMode === "move" ? "Move Here" : "Copy Here"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
