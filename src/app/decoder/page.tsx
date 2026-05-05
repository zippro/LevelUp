"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Upload, Download, Lock, Unlock, FileText, File, Trash2, ArrowRightLeft, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── NarEncryptor (client-side, matches C# NarEncryptor exactly) ───

const VERSION_HEADER = new TextEncoder().encode("NARv1"); // 5 bytes

async function importKey(keyStr: string): Promise<CryptoKey> {
    const keyBytes = new TextEncoder().encode(keyStr);
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        result.set(a, offset);
        offset += a.length;
    }
    return result;
}

function hasVersionHeader(data: Uint8Array): boolean {
    if (data.length < VERSION_HEADER.length + 16) return false;
    for (let i = 0; i < VERSION_HEADER.length; i++) {
        if (data[i] !== VERSION_HEADER[i]) return false;
    }
    return true;
}

function skipBom(bytes: Uint8Array): Uint8Array {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return bytes.slice(3);
    }
    if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
        return bytes.slice(2);
    }
    return bytes;
}

/** Encrypt plaintext string → Base64 string (matching NarEncryptor.EncryptInternal) */
async function encryptText(plainText: string, keyStr: string): Promise<string> {
    const key = await importKey(keyStr);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const plainBytes = new TextEncoder().encode(plainText);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, plainBytes);
    const result = concatBytes(VERSION_HEADER, iv, new Uint8Array(encrypted));
    // Base64 encode
    let binary = "";
    const bytes = new Uint8Array(result);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/** Decrypt Base64 string → plaintext string (matching NarEncryptor.DecryptInternal) */
async function decryptText(encryptedText: string, keyStr: string): Promise<string> {
    const key = await importKey(keyStr);
    // Base64 decode
    const binary = atob(encryptedText);
    const encryptedBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) encryptedBytes[i] = binary.charCodeAt(i);

    let iv: Uint8Array;
    let cipherData: Uint8Array;

    if (hasVersionHeader(encryptedBytes)) {
        const headerLen = VERSION_HEADER.length;
        iv = encryptedBytes.slice(headerLen, headerLen + 16);
        cipherData = encryptedBytes.slice(headerLen + 16);
    } else {
        // Legacy: no header, zero IV
        iv = new Uint8Array(16);
        cipherData = encryptedBytes;
    }

    const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv as unknown as ArrayBuffer }, key, cipherData as unknown as ArrayBuffer);
    const decryptedBytes = skipBom(new Uint8Array(decrypted));
    return new TextDecoder("utf-8").decode(decryptedBytes);
}

// ─── JSON → Unity YAML Converter ───

function jsonToUnityYaml(jsonText: string): string {
    let data: any;
    try { data = JSON.parse(jsonText); } catch { return jsonText; /* not JSON, return as-is */ }

    const levelNum = data["<LevelNumber>k__BackingField"] ?? 0;
    const lines: string[] = [
        "%YAML 1.1",
        "%TAG !u! tag:unity3d.com,2011:",
        "--- !u!114 &11400000",
        "MonoBehaviour:",
        "  m_ObjectHideFlags: 0",
        "  m_CorrespondingSourceObject: {fileID: 0}",
        "  m_PrefabInstance: {fileID: 0}",
        "  m_PrefabAsset: {fileID: 0}",
        "  m_GameObject: {fileID: 0}",
        "  m_Enabled: 1",
        "  m_EditorHideFlags: 0",
        "  m_Script: {fileID: 11500000, guid: 4b890cbc5da84282a96f1be7de522b73, type: 3}",
        `  m_Name: Level_${levelNum}`,
        "  m_EditorClassIdentifier: ",
    ];

    for (const [key, value] of Object.entries(data)) {
        writeYamlField(lines, key, value, 2);
    }
    return lines.join("\n") + "\n";
}

function writeYamlField(lines: string[], key: string, value: any, indent: number): void {
    const pad = " ".repeat(indent);
    if (value === null || value === undefined) { lines.push(`${pad}${key}: `); return; }
    if (typeof value === "number" || typeof value === "boolean") { lines.push(`${pad}${key}: ${value}`); return; }
    if (typeof value === "string") { lines.push(`${pad}${key}: ${yamlQuote(value)}`); return; }
    if (Array.isArray(value)) {
        if (value.length === 0) { lines.push(`${pad}${key}: []`); return; }
        if (key === "colorIDs" && value.every((v: any) => typeof v === "number")) {
            const hex = value.map((n: number) => {
                const b = new ArrayBuffer(4); new DataView(b).setInt32(0, n, true);
                return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("");
            }).join("");
            lines.push(`${pad}${key}: ${hex}`);
            return;
        }
        lines.push(`${pad}${key}:`);
        for (const item of value) { writeYamlArrayItem(lines, item, indent); }
        return;
    }
    if (typeof value === "object") {
        lines.push(`${pad}${key}:`);
        for (const [k, v] of Object.entries(value)) { writeYamlField(lines, k, v, indent + 2); }
        return;
    }
    lines.push(`${pad}${key}: ${value}`);
}

function writeYamlArrayItem(lines: string[], item: any, parentIndent: number): void {
    const pad = " ".repeat(parentIndent);
    if (item === null || item === undefined) { lines.push(`${pad}- `); return; }
    if (typeof item !== "object" || Array.isArray(item)) {
        lines.push(`${pad}- ${typeof item === "string" ? yamlQuote(item) : item}`);
        return;
    }
    const entries = Object.entries(item);
    if (entries.length === 0) { lines.push(`${pad}- {}`); return; }
    const [fk, fv] = entries[0];
    if (fv !== null && typeof fv === "object" && !Array.isArray(fv)) {
        lines.push(`${pad}- ${fk}:`);
        for (const [k, v] of Object.entries(fv as object)) { writeYamlField(lines, k, v, parentIndent + 4); }
    } else if (Array.isArray(fv) && fv.length === 0) {
        lines.push(`${pad}- ${fk}: []`);
    } else if (Array.isArray(fv)) {
        lines.push(`${pad}- ${fk}:`);
        for (const sub of fv) { writeYamlArrayItem(lines, sub, parentIndent + 2); }
    } else {
        lines.push(`${pad}- ${fk}: ${typeof fv === "string" ? yamlQuote(fv) : fv}`);
    }
    for (let i = 1; i < entries.length; i++) {
        writeYamlField(lines, entries[i][0], entries[i][1], parentIndent + 2);
    }
}

function yamlQuote(s: string): string {
    if (s.includes("{") || s.includes("}") || s.includes('"') || s.includes(":") || s.includes("#") || s.includes("'") || s.includes("[") || s.includes("]") || s.includes(",")) {
        return `'${s.replace(/'/g, "''")}'`;
    }
    return s;
}

// ─── File processing helpers ───

interface ProcessedFile {
    originalName: string;
    originalSize: number;
    resultName: string;
    resultContent: string;
    operation: "encode" | "decode";
    status: "success" | "error";
    error?: string;
}

function getOutputName(fileName: string, operation: "encode" | "decode"): string {
    if (operation === "decode") {
        // 18.txt → Level_18.asset
        const baseName = fileName.replace(/\.txt$/i, "");
        // Try to extract level number
        const num = baseName.match(/\d+/)?.[0];
        return num ? `Level_${num}.asset` : `${baseName}.asset`;
    } else {
        // Level_18.asset → 18.txt
        const baseName = fileName.replace(/\.asset$/i, "");
        const num = baseName.match(/\d+/)?.[0];
        return num ? `${num}.txt` : `${baseName}.txt`;
    }
}

function detectOperation(fileName: string): "encode" | "decode" {
    if (fileName.endsWith(".txt")) return "decode";
    if (fileName.endsWith(".asset")) return "encode";
    // Default: try decode
    return "decode";
}

// ─── Page ───

export default function DecoderPage() {
    const [key, setKey] = useState("");

    useEffect(() => {
        const saved = localStorage.getItem("nar-decoder-key");
        if (saved) setKey(saved);
    }, []);
    const [showKey, setShowKey] = useState(false);
    const [files, setFiles] = useState<ProcessedFile[]>([]);
    const [processing, setProcessing] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const saveKey = (k: string) => {
        setKey(k);
        if (typeof window !== "undefined") {
            localStorage.setItem("nar-decoder-key", k);
        }
    };

    const processFiles = useCallback(async (fileList: FileList) => {
        if (key.length !== 32) {
            alert("Key must be exactly 32 characters.");
            return;
        }

        setProcessing(true);
        const results: ProcessedFile[] = [];

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const operation = detectOperation(file.name);
            const content = await file.text();

            try {
                let result: string;
                if (operation === "decode") {
                    // .txt file → decrypt and convert to Unity YAML
                    const decrypted = await decryptText(content.trim(), key);
                    result = jsonToUnityYaml(decrypted);
                } else {
                    // .asset file → encrypt to Base64
                    result = await encryptText(content, key);
                }

                results.push({
                    originalName: file.name,
                    originalSize: file.size,
                    resultName: getOutputName(file.name, operation),
                    resultContent: result,
                    operation,
                    status: "success",
                });
            } catch (err: any) {
                results.push({
                    originalName: file.name,
                    originalSize: file.size,
                    resultName: getOutputName(file.name, operation),
                    resultContent: "",
                    operation,
                    status: "error",
                    error: err.message || "Unknown error",
                });
            }
        }

        setFiles(prev => [...prev, ...results]);
        setProcessing(false);
    }, [key]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    }, [processFiles]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
            e.target.value = "";
        }
    }, [processFiles]);

    const downloadFile = (file: ProcessedFile) => {
        const blob = new Blob([file.resultContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.resultName;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadAll = () => {
        const successFiles = files.filter(f => f.status === "success");
        successFiles.forEach(f => downloadFile(f));
    };

    const clearFiles = () => setFiles([]);

    const successCount = files.filter(f => f.status === "success").length;
    const errorCount = files.filter(f => f.status === "error").length;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <ArrowRightLeft className="h-7 w-7 text-violet-600" />
                        Decoder
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Encrypt <span className="text-blue-600 font-medium">.asset</span> → <span className="text-amber-600 font-medium">.txt</span> or
                        Decrypt <span className="text-amber-600 font-medium">.txt</span> → <span className="text-blue-600 font-medium">.asset</span>
                    </p>
                </div>
            </div>

            {/* Key Input */}
            <div className="rounded-xl border shadow-sm bg-card p-5">
                <div className="flex items-center gap-3 mb-3">
                    <Lock className="h-4 w-4 text-violet-600" />
                    <h3 className="font-semibold text-sm">Encryption Key</h3>
                    <span className={cn(
                        "text-[10px] font-mono px-2 py-0.5 rounded-full",
                        key.length === 32 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                        {key.length}/32
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={showKey ? "text" : "password"}
                            value={key}
                            onChange={(e) => saveKey(e.target.value)}
                            placeholder="Enter 32-character encryption key..."
                            className="font-mono text-sm pr-10"
                            maxLength={32}
                        />
                        <button
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                    Key is stored locally in your browser. AES-256-CBC • NARv1 format • Client-side only.
                </p>
            </div>

            {/* Upload Area */}
            <div
                className={cn(
                    "rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer",
                    dragOver ? "border-violet-500 bg-violet-50/50 scale-[1.01]" : "border-muted hover:border-violet-300 hover:bg-muted/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.asset"
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <Upload className={cn("h-10 w-10 mx-auto mb-3 transition-colors", dragOver ? "text-violet-600" : "text-muted-foreground/40")} />
                <p className="font-medium text-sm">
                    {processing ? "Processing..." : "Drop files here or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-amber-600 font-medium">.txt</span> files will be <Unlock className="h-3 w-3 inline" /> decrypted •
                    <span className="text-blue-600 font-medium ml-1">.asset</span> files will be <Lock className="h-3 w-3 inline" /> encrypted
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                    Supports multiple files at once
                </p>
            </div>

            {/* Results */}
            {files.length > 0 && (
                <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
                    <div className="px-5 py-3 bg-muted/30 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-sm">Results</h3>
                            {successCount > 0 && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                    {successCount} success
                                </span>
                            )}
                            {errorCount > 0 && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                    {errorCount} failed
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {successCount > 1 && (
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={downloadAll}>
                                    <Download className="h-3 w-3" /> Download All
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={clearFiles}>
                                <Trash2 className="h-3 w-3" /> Clear
                            </Button>
                        </div>
                    </div>

                    <div className="divide-y max-h-[500px] overflow-auto">
                        {files.map((file, idx) => (
                            <div key={idx} className={cn(
                                "px-5 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors",
                                file.status === "error" && "bg-red-50/30"
                            )}>
                                {/* Icon */}
                                <div className={cn(
                                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                                    file.status === "success"
                                        ? file.operation === "decode" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                        : "bg-red-100 text-red-700"
                                )}>
                                    {file.status === "success"
                                        ? file.operation === "decode" ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />
                                        : <AlertCircle className="h-4 w-4" />
                                    }
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-muted-foreground">{file.originalName}</span>
                                        <span className="text-muted-foreground/40">→</span>
                                        <span className="text-sm font-semibold truncate">{file.resultName}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={cn(
                                            "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                            file.operation === "decode" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                        )}>
                                            {file.operation === "decode" ? "DECRYPTED" : "ENCRYPTED"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {(file.originalSize / 1024).toFixed(1)} KB → {(new Blob([file.resultContent]).size / 1024).toFixed(1)} KB
                                        </span>
                                        {file.status === "error" && (
                                            <span className="text-[10px] text-red-600">{file.error}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                {file.status === "success" && (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs gap-1"
                                            onClick={() => {
                                                navigator.clipboard.writeText(file.resultContent);
                                            }}
                                        >
                                            Copy
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="h-7 text-xs gap-1"
                                            onClick={() => downloadFile(file)}
                                        >
                                            <Download className="h-3 w-3" /> Download
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Preview */}
            {files.length > 0 && files.some(f => f.status === "success") && (
                <div className="rounded-xl border shadow-sm bg-card overflow-hidden">
                    <div className="px-5 py-3 bg-muted/30 border-b">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Preview
                        </h3>
                    </div>
                    <div className="p-4">
                        {files.filter(f => f.status === "success").map((file, idx) => (
                            <details key={idx} className="mb-3 last:mb-0" open={idx === files.filter(f => f.status === "success").length - 1}>
                                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                                    {file.resultName}
                                    <span className={cn(
                                        "ml-2 text-[10px] px-1.5 py-0.5 rounded",
                                        file.operation === "decode" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                    )}>
                                        {file.operation === "decode" ? "Decrypted" : "Encrypted"}
                                    </span>
                                </summary>
                                <pre className="mt-2 p-3 rounded-lg bg-muted/30 border text-xs font-mono overflow-auto max-h-[400px] whitespace-pre-wrap break-all">
                                    {file.resultContent.slice(0, 5000)}
                                    {file.resultContent.length > 5000 && "\n\n... (truncated)"}
                                </pre>
                            </details>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
