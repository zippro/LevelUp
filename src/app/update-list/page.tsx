"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Plus,
    GripVertical,
    Trash2,
    Bug,
    Sparkles,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Pencil,
    Loader2,
    Paperclip,
    Image as ImageIcon,
    Link as LinkIcon,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TodoItem {
    id: string;
    title: string;
    type: 'new' | 'bug';
    done: boolean;
    versionId?: string | null;
    position?: number;
    attachments?: Attachment[];
}

export interface Attachment {
    id: string;
    type: 'image' | 'link';
    url: string;
    name: string;
}

interface VersionBlock {
    id: string;
    title: string;
    todos: TodoItem[];
    done: boolean;
    collapsed: boolean;
    position?: number;
}

// Use randomUUID for temp IDs (optimistic) or real IDs if we want to send them
const generateId = () => crypto.randomUUID();

export default function UpdateListPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [versions, setVersions] = useState<VersionBlock[]>([]);
    const [newVersionTitle, setNewVersionTitle] = useState('');
    const [newTodoInputs, setNewTodoInputs] = useState<Record<string, string>>({});

    // Backlog - standalone todos not assigned to any version
    const [backlog, setBacklog] = useState<TodoItem[]>([]);
    const [backlogInput, setBacklogInput] = useState('');

    // Drag state
    const [dragType, setDragType] = useState<'todo' | 'version' | 'backlog' | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragSourceVersionId, setDragSourceVersionId] = useState<string | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
    const [dropTargetVersionId, setDropTargetVersionId] = useState<string | null>(null);

    // Editing state
    const [editingTodo, setEditingTodo] = useState<{ versionId: string; todoId: string; title: string } | null>(null);
    const [editingVersion, setEditingVersion] = useState<{ id: string; title: string } | null>(null);
    const [editingBacklog, setEditingBacklog] = useState<{ id: string; title: string } | null>(null);
    const [showCompletedVersions, setShowCompletedVersions] = useState(true);

    // Initial Fetch
    useEffect(() => {
        fetchUpdates();
    }, []);

    const fetchUpdates = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(`/api/updates?t=${Date.now()}`, {
                cache: 'no-store',
                headers: {
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });
            const data = await res.json();

            if (data.versions) {
                setVersions(data.versions);
            }
            if (data.backlog) {
                setBacklog(data.backlog);
            }
        } catch (error) {
            console.error("Failed to fetch updates:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- API Helpers ---

    const apiCreateVersion = async (version: VersionBlock) => {
        await fetch('/api/updates/version', {
            method: 'POST',
            body: JSON.stringify({
                title: version.title,
                position: versions.length // Append to end
            })
        });
        // We could replace the temp ID with real ID here if we waited, 
        // but for now we'll just let the next fetch sync it up or assume consistency.
        // Ideally we should update the local state with the real ID from DB.
        fetchUpdates(); // Refresh to get real IDs and ensure consistency
    };

    const apiUpdateVersion = async (id: string, updates: Partial<VersionBlock>) => {
        await fetch('/api/updates/version', {
            method: 'PUT',
            body: JSON.stringify({ id, ...updates })
        });
    };

    const apiDeleteVersion = async (id: string) => {
        await fetch(`/api/updates/version?id=${id}`, { method: 'DELETE' });
    };

    const apiCreateTodo = async (todo: TodoItem, versionId: string | null) => {
        await fetch('/api/updates/todo', {
            method: 'POST',
            body: JSON.stringify({
                title: todo.title,
                type: todo.type,
                versionId: versionId,
                position: 9999 // Append
            })
        });
        fetchUpdates();
    };

    const apiUpdateTodo = async (id: string, updates: Partial<TodoItem>) => {
        await fetch('/api/updates/todo', {
            method: 'PUT',
            body: JSON.stringify({ id, ...updates })
        });
    };

    const apiDeleteTodo = async (id: string) => {
        await fetch(`/api/updates/todo?id=${id}`, { method: 'DELETE' });
    };

    const apiReorder = async (items: { id: string, position: number }[], type: 'version' | 'todo') => {
        await fetch('/api/updates/reorder', {
            method: 'POST',
            body: JSON.stringify({ items, type })
        });
    };

    // --- Actions ---

    // Add new version
    const addVersion = () => {
        if (!newVersionTitle.trim()) return;
        const newVersion: VersionBlock = {
            id: generateId(), // Temp ID
            title: newVersionTitle.trim(),
            todos: [],
            done: false,
            collapsed: false
        };
        // Optimistic
        setVersions(prev => [...prev, newVersion]);
        setNewVersionTitle('');
        // API
        apiCreateVersion(newVersion);
    };

    // Add todo to version
    const addTodo = (versionId: string, type: 'new' | 'bug') => {
        const title = newTodoInputs[versionId]?.trim();
        if (!title) return;

        const newTodo: TodoItem = {
            id: generateId(),
            title,
            type,
            done: false
        };

        // Optimistic
        setVersions(prev => prev.map(v =>
            v.id === versionId
                ? { ...v, todos: [...v.todos, newTodo] }
                : v
        ));
        setNewTodoInputs(prev => ({ ...prev, [versionId]: '' }));
        // API
        apiCreateTodo(newTodo, versionId);
    };

    // Toggle todo done
    const toggleTodoDone = (versionId: string, todoId: string) => {
        // Get current state synchronously first
        const version = versions.find(v => v.id === versionId);
        const todo = version?.todos.find(t => t.id === todoId);
        if (!todo) return;

        const newDone = !todo.done;

        // Optimistic update
        setVersions(prev => prev.map(v => {
            if (v.id !== versionId) return v;
            return {
                ...v,
                todos: v.todos.map(t => t.id === todoId ? { ...t, done: newDone } : t)
            };
        }));

        // API call with correct value
        apiUpdateTodo(todoId, { done: newDone });
    };

    // Toggle version done
    const toggleVersionDone = (versionId: string) => {
        // Get current state synchronously first
        const version = versions.find(v => v.id === versionId);
        if (!version) return;

        const newDone = !version.done;

        // Optimistic update
        setVersions(prev => prev.map(v => v.id === versionId ? { ...v, done: newDone } : v));

        // API call with correct value
        apiUpdateVersion(versionId, { done: newDone });
    };

    // Delete todo
    const deleteTodo = (versionId: string, todoId: string) => {
        setVersions(prev => prev.map(v =>
            v.id === versionId
                ? { ...v, todos: v.todos.filter(t => t.id !== todoId) }
                : v
        ));
        apiDeleteTodo(todoId);
    };

    // Save todo edit
    const saveTodoEdit = () => {
        if (!editingTodo) return;
        const { versionId, todoId, title } = editingTodo;
        if (!title.trim()) {
            setEditingTodo(null);
            return;
        }
        setVersions(prev => prev.map(v =>
            v.id === versionId
                ? { ...v, todos: v.todos.map(t => t.id === todoId ? { ...t, title: title.trim() } : t) }
                : v
        ));
        setEditingTodo(null);
        apiUpdateTodo(todoId, { title: title.trim() });
    };

    // Save version edit
    const saveVersionEdit = () => {
        if (!editingVersion) return;
        const { id, title } = editingVersion;
        if (!title.trim()) {
            setEditingVersion(null);
            return;
        }
        setVersions(prev => prev.map(v =>
            v.id === id ? { ...v, title: title.trim() } : v
        ));
        setEditingVersion(null);
        apiUpdateVersion(id, { title: title.trim() });
    };

    // Backlog functions
    const addBacklogItem = (type: 'new' | 'bug') => {
        if (!backlogInput.trim()) return;
        const item: TodoItem = {
            id: generateId(),
            title: backlogInput.trim(),
            type,
            done: false
        };
        setBacklog(prev => [...prev, item]);
        setBacklogInput('');
        apiCreateTodo(item, null);
    };

    const toggleBacklogDone = (todoId: string) => {
        // Get current state synchronously first
        const item = backlog.find(t => t.id === todoId);
        if (!item) return;

        const newDone = !item.done;

        // Optimistic update
        setBacklog(prev => prev.map(t => t.id === todoId ? { ...t, done: newDone } : t));

        // API call with correct value
        apiUpdateTodo(todoId, { done: newDone });
    };

    const deleteBacklogItem = (todoId: string) => {
        setBacklog(prev => prev.filter(t => t.id !== todoId));
        apiDeleteTodo(todoId);
    };

    // Save backlog edit
    const saveBacklogEdit = () => {
        if (!editingBacklog) return;
        const { id, title } = editingBacklog;
        if (!title.trim()) {
            setEditingBacklog(null);
            return;
        }
        setBacklog(prev => prev.map(t =>
            t.id === id ? { ...t, title: title.trim() } : t
        ));
        setEditingBacklog(null);
        apiUpdateTodo(id, { title: title.trim() });
    };

    // Move backlog item by drag
    const moveBacklogItem = (todoId: string, toIndex: number) => {
        setBacklog(prev => {
            const fromIndex = prev.findIndex(t => t.id === todoId);
            if (fromIndex === -1 || fromIndex === toIndex) return prev;
            const newBacklog = [...prev];
            const [item] = newBacklog.splice(fromIndex, 1);
            newBacklog.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, item);

            // API reorder
            const itemsToReorder = newBacklog.map((t, i) => ({ id: t.id, position: i }));
            apiReorder(itemsToReorder, 'todo');

            return newBacklog;
        });
    };

    // Move backlog item to a version
    const moveBacklogToVersion = (todoId: string, versionId: string) => {
        const item = backlog.find(t => t.id === todoId);
        if (!item) return;

        // Optimistic
        setBacklog(prev => prev.filter(t => t.id !== todoId));
        setVersions(prev => prev.map(v =>
            v.id === versionId ? { ...v, todos: [...v.todos, item] } : v
        ));

        // API
        // We need to fetch the version to know where to put it or just put it at end.
        // Putting it at end is safest for now.
        const targetVersion = versions.find(v => v.id === versionId);
        const newPos = targetVersion ? targetVersion.todos.length : 0;

        apiUpdateTodo(todoId, { versionId, position: newPos });
    };

    // Move version todo item to backlog
    const moveVersionTodoToBacklog = (todoId: string, sourceVersionId: string) => {
        // Find the item first from current state
        const sourceVersion = versions.find(v => v.id === sourceVersionId);
        const item = sourceVersion?.todos.find(t => t.id === todoId);
        if (!item) return;

        // Optimistic
        setVersions(prev => prev.map(v =>
            v.id === sourceVersionId
                ? { ...v, todos: v.todos.filter(t => t.id !== todoId) }
                : v
        ));

        // Add to backlog
        setBacklog(prev => {
            const newBacklog = [...prev, item];
            // API Call inside callback to get new length
            const newPos = newBacklog.length - 1;
            apiUpdateTodo(todoId, { versionId: null, position: newPos });
            return newBacklog;
        });
    };

    // Delete version
    const deleteVersion = (versionId: string) => {
        if (!confirm('Delete this version and all its todos?')) return;
        setVersions(prev => prev.filter(v => v.id !== versionId));
        apiDeleteVersion(versionId);
    };

    // Toggle version collapse
    const toggleCollapse = (versionId: string) => {
        let newCollapsed = false;
        setVersions(prev => prev.map(v => {
            if (v.id === versionId) {
                newCollapsed = !v.collapsed;
                return { ...v, collapsed: newCollapsed };
            }
            return v;
        }));
        apiUpdateVersion(versionId, { collapsed: newCollapsed });
    };

    // Move todo to new position
    const moveTodo = (fromVersionId: string, todoId: string, toVersionId: string, toIndex: number) => {
        setVersions(prev => {
            const newVersions = prev.map(v => ({ ...v, todos: [...v.todos] }));

            const fromVersion = newVersions.find(v => v.id === fromVersionId);
            const toVersion = newVersions.find(v => v.id === toVersionId);

            if (!fromVersion || !toVersion) return prev;

            const todoIndex = fromVersion.todos.findIndex(t => t.id === todoId);
            if (todoIndex === -1) return prev;

            const [todo] = fromVersion.todos.splice(todoIndex, 1);

            // Adjust target index if moving within same version and from lower to higher index
            let adjustedIndex = toIndex;
            if (fromVersionId === toVersionId && todoIndex < toIndex) {
                adjustedIndex = Math.max(0, toIndex - 1);
            }

            toVersion.todos.splice(adjustedIndex, 0, todo);

            // API Logic
            // If moved to different version or same version reorder
            if (fromVersionId !== toVersionId) {
                // Moved to new version
                // We also need to reorder the target version's todos
                const reorderItems = toVersion.todos.map((t, i) => ({ id: t.id, position: i }));
                apiReorder(reorderItems, 'todo');
                // And update the moved item's version
                apiUpdateTodo(todoId, { versionId: toVersionId });
            } else {
                // Same version reorder
                const reorderItems = toVersion.todos.map((t, i) => ({ id: t.id, position: i }));
                apiReorder(reorderItems, 'todo');
            }

            return newVersions;
        });
    };

    // Move version to new position
    const moveVersion = (versionId: string, toIndex: number) => {
        setVersions(prev => {
            const fromIndex = prev.findIndex(v => v.id === versionId);
            if (fromIndex === -1 || fromIndex === toIndex) return prev;

            const newVersions = [...prev];
            const [version] = newVersions.splice(fromIndex, 1);

            // Adjust index if moving from lower to higher
            let adjustedIndex = toIndex;
            if (fromIndex < toIndex) {
                adjustedIndex = Math.max(0, toIndex - 1);
            }

            newVersions.splice(adjustedIndex, 0, version);

            // API sync order
            const reorderItems = newVersions.map((v, i) => ({ id: v.id, position: i }));
            apiReorder(reorderItems, 'version');

            return newVersions;
        });
    };

    // Clear drag state
    const clearDragState = () => {
        setDragType(null);
        setDragId(null);
        setDragSourceVersionId(null);
        setDropTargetIndex(null);
        setDropTargetVersionId(null);
    };

    // --- Attachments ---

    const addAttachment = async (todoId: string, attachment: Attachment, versionId: string | null) => {
        // Find todo to get current attachments
        let currentAttachments: Attachment[] = [];

        if (versionId) {
            const v = versions.find(v => v.id === versionId);
            const t = v?.todos.find(t => t.id === todoId);
            if (t) currentAttachments = t.attachments || [];
        } else {
            const t = backlog.find(t => t.id === todoId);
            if (t) currentAttachments = t.attachments || [];
        }

        const newAttachments = [...currentAttachments, attachment];

        // Optimistic Update
        if (versionId) {
            setVersions(prev => prev.map(v =>
                v.id === versionId
                    ? { ...v, todos: v.todos.map(t => t.id === todoId ? { ...t, attachments: newAttachments } : t) }
                    : v
            ));
        } else {
            setBacklog(prev => prev.map(t => t.id === todoId ? { ...t, attachments: newAttachments } : t));
        }

        // API Update
        await apiUpdateTodo(todoId, { attachments: newAttachments });
    };

    const deleteAttachment = async (todoId: string, attachmentId: string, versionId: string | null) => {
        // Find todo
        let currentAttachments: Attachment[] = [];
        if (versionId) {
            const v = versions.find(v => v.id === versionId);
            const t = v?.todos.find(t => t.id === todoId);
            if (t) currentAttachments = t.attachments || [];
        } else {
            const t = backlog.find(t => t.id === todoId);
            if (t) currentAttachments = t.attachments || [];
        }

        const newAttachments = currentAttachments.filter(a => a.id !== attachmentId);

        // Optimistic Update
        if (versionId) {
            setVersions(prev => prev.map(v =>
                v.id === versionId
                    ? { ...v, todos: v.todos.map(t => t.id === todoId ? { ...t, attachments: newAttachments } : t) }
                    : v
            ));
        } else {
            setBacklog(prev => prev.map(t => t.id === todoId ? { ...t, attachments: newAttachments } : t));
        }

        // API Update
        await apiUpdateTodo(todoId, { attachments: newAttachments });
    };

    const handleImageUpload = async (file: File, todoId: string, versionId: string | null) => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${todoId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('attachments')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);

            const attachment: Attachment = {
                id: generateId(),
                type: 'image',
                url: data.publicUrl,
                name: file.name
            };

            await addAttachment(todoId, attachment, versionId);
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Failed to upload image');
        }
    };


    // Separate active and done versions
    const activeVersions = versions.filter(v => !v.done);
    const doneVersions = versions.filter(v => v.done); // Not used currently

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">Update List <span className="text-xs font-normal text-muted-foreground ml-2">v1.2</span></h1>
                <p className="text-muted-foreground">Track version updates and feature todo lists</p>
            </div>

            {/* Add New Version */}
            <div className="flex gap-2">
                <Input
                    placeholder="New version number (e.g. v1.2.0)"
                    value={newVersionTitle}
                    onChange={(e) => setNewVersionTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addVersion()}
                    className="max-w-xs"
                />
                <Button onClick={addVersion} disabled={!newVersionTitle.trim()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Version
                </Button>
            </div>

            {/* Two Column Layout - stacks on mobile */}
            <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Left Column - Versions */}
                <div className="flex-1 w-full space-y-2">
                    {activeVersions.map((version, versionIndex) => (
                        <div key={version.id}>
                            {/* Drop zone before version */}
                            <div
                                className={cn(
                                    "h-3 rounded transition-all",
                                    dragType === 'version' && dropTargetIndex === versionIndex && dropTargetVersionId === null
                                        ? "bg-primary/40 h-6 border-2 border-dashed border-primary"
                                        : dragType === 'version' ? "bg-muted/30" : ""
                                )}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (dragType === 'version') {
                                        setDropTargetIndex(versionIndex);
                                        setDropTargetVersionId(null);
                                    }
                                }}
                                onDragLeave={() => {
                                    if (dropTargetIndex === versionIndex && dropTargetVersionId === null) {
                                        setDropTargetIndex(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragType === 'version' && dragId) {
                                        moveVersion(dragId, versionIndex);
                                    }
                                    clearDragState();
                                }}
                            />

                            <Card
                                draggable
                                onDragStart={(e) => {
                                    setDragType('version');
                                    setDragId(version.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    // Allow dropping backlog items or reordering versions
                                    if (dragType === 'version' && dragId !== version.id) {
                                        setDropTargetIndex(versionIndex + 1);
                                        setDropTargetVersionId(null);
                                    } else if (dragType === 'backlog') {
                                        setDropTargetVersionId(version.id);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (dragType === 'version' && dragId && dragId !== version.id) {
                                        moveVersion(dragId, versionIndex + 1);
                                    } else if (dragType === 'backlog' && dragId) {
                                        // Move backlog item to this version
                                        moveBacklogToVersion(dragId, version.id);
                                    }
                                    clearDragState();
                                }}
                                onDragLeave={(e) => {
                                    e.stopPropagation();
                                    if (dropTargetVersionId === version.id) {
                                        setDropTargetVersionId(null);
                                    }
                                }}
                                onDragEnd={clearDragState}
                                className={cn(
                                    "transition-all",
                                    dragType === 'version' && dragId === version.id && "opacity-50 scale-[0.98]",
                                    dragType === 'backlog' && dropTargetVersionId === version.id && "ring-2 ring-primary"
                                )}
                            >
                                <CardHeader className="py-3">
                                    <div className="flex items-center gap-3">
                                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                                        <Checkbox
                                            checked={version.done}
                                            onChange={() => toggleVersionDone(version.id)}
                                        />

                                        {/* Version title - editable or static */}
                                        {editingVersion?.id === version.id ? (
                                            <Input
                                                value={editingVersion.title}
                                                onChange={(e) => setEditingVersion({ ...editingVersion, title: e.target.value })}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveVersionEdit();
                                                    if (e.key === 'Escape') setEditingVersion(null);
                                                }}
                                                onBlur={saveVersionEdit}
                                                autoFocus
                                                className="flex-1 h-8 text-lg font-semibold"
                                            />
                                        ) : (
                                            <CardTitle className="flex-1 text-lg break-words whitespace-pre-wrap">{version.title}</CardTitle>
                                        )}

                                        {/* Edit button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingVersion({ id: version.id, title: version.title })}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleCollapse(version.id)}
                                        >
                                            {version.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => deleteVersion(version.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardHeader>

                                {!version.collapsed && (
                                    <CardContent className="pt-0 space-y-2">
                                        {/* Add Todo */}
                                        <div className="flex gap-2 mb-3">
                                            <Input
                                                placeholder="New todo item..."
                                                value={newTodoInputs[version.id] || ''}
                                                onChange={(e) => setNewTodoInputs(prev => ({ ...prev, [version.id]: e.target.value }))}
                                                onKeyDown={(e) => e.key === 'Enter' && addTodo(version.id, 'new')}
                                                className="flex-1"
                                            />
                                            <Button size="sm" variant="outline" onClick={() => addTodo(version.id, 'new')}>
                                                <Sparkles className="h-4 w-4 mr-1" />
                                                New
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => addTodo(version.id, 'bug')}>
                                                <Bug className="h-4 w-4 mr-1" />
                                                Bug
                                            </Button>
                                        </div>

                                        {/* Todo List */}
                                        <div className="space-y-0">
                                            {version.todos.map((todo, todoIndex) => (
                                                <div key={todo.id}>
                                                    {/* Drop zone before todo */}
                                                    <div
                                                        className={cn(
                                                            "h-1 -my-0.5 mx-2 rounded transition-all",
                                                            dragType === 'todo' && dropTargetIndex === todoIndex && dropTargetVersionId === version.id
                                                                ? "bg-primary/50 h-2"
                                                                : ""
                                                        )}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (dragType === 'todo') {
                                                                setDropTargetIndex(todoIndex);
                                                                setDropTargetVersionId(version.id);
                                                            }
                                                        }}
                                                        onDragLeave={(e) => {
                                                            e.stopPropagation();
                                                            if (dropTargetIndex === todoIndex && dropTargetVersionId === version.id) {
                                                                setDropTargetIndex(null);
                                                                setDropTargetVersionId(null);
                                                            }
                                                        }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (dragType === 'todo' && dragId && dragSourceVersionId) {
                                                                moveTodo(dragSourceVersionId, dragId, version.id, todoIndex);
                                                            }
                                                            clearDragState();
                                                        }}
                                                    />

                                                    <div
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.stopPropagation();
                                                            setDragType('todo');
                                                            setDragId(todo.id);
                                                            setDragSourceVersionId(version.id);
                                                            e.dataTransfer.effectAllowed = 'move';
                                                            e.dataTransfer.setData('text/plain', todo.id);
                                                        }}
                                                        onDragEnd={clearDragState}
                                                        className={cn(
                                                            "flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group",
                                                            todo.done && "opacity-60",
                                                            dragType === 'todo' && dragId === todo.id && "opacity-30 scale-[0.98]"
                                                        )}
                                                    >
                                                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                                                        <Checkbox
                                                            checked={todo.done}
                                                            onChange={() => toggleTodoDone(version.id, todo.id)}
                                                        />
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                                                            todo.type === 'new' ? "bg-emerald-500/20 text-emerald-600" : "bg-red-500/20 text-red-600"
                                                        )}>
                                                            {todo.type === 'new' ? <Sparkles className="h-3 w-3" /> : <Bug className="h-3 w-3" />}
                                                            {todo.type}
                                                        </span>

                                                        {/* Todo title - editable or static */}
                                                        <div className="flex-1 min-w-0">
                                                            {editingTodo?.todoId === todo.id && editingTodo?.versionId === version.id ? (
                                                                <Input
                                                                    value={editingTodo.title}
                                                                    onChange={(e) => setEditingTodo({ ...editingTodo, title: e.target.value })}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') saveTodoEdit();
                                                                        if (e.key === 'Escape') setEditingTodo(null);
                                                                    }}
                                                                    onBlur={saveTodoEdit}
                                                                    autoFocus
                                                                    className="h-7 text-sm"
                                                                />
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    <span className={cn("break-words whitespace-pre-wrap", todo.done && "line-through text-muted-foreground")}>
                                                                        {todo.title}
                                                                    </span>

                                                                    {/* Attachments List */}
                                                                    {todo.attachments && todo.attachments.length > 0 && (
                                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                                            {todo.attachments.map(att => (
                                                                                <div key={att.id} className="group/att flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                                                                                    {att.type === 'image' ? <ImageIcon className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
                                                                                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="hover:underline max-w-[100px] truncate">
                                                                                        {att.name}
                                                                                    </a>
                                                                                    <button
                                                                                        onClick={() => deleteAttachment(todo.id, att.id, version.id)}
                                                                                        className="opacity-0 group-hover/att:opacity-100 p-0.5 hover:text-destructive"
                                                                                    >
                                                                                        <X className="h-2.5 w-2.5" />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setEditingTodo({ versionId: version.id, todoId: todo.id, title: todo.title })}
                                                                className="h-6 w-6 p-0"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                            </Button>

                                                            <div className="relative">
                                                                <input
                                                                    type="file"
                                                                    className="absolute inset-0 opacity-0 cursor-pointer w-6 h-6"
                                                                    onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) handleImageUpload(file, todo.id, version.id);
                                                                    }}
                                                                    accept="image/*"
                                                                />
                                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                                    <ImageIcon className="h-3 w-3" />
                                                                </Button>
                                                            </div>

                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => deleteTodo(version.id, todo.id)}
                                                                className="text-destructive hover:text-destructive h-6 w-6 p-0"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Drop zone at end of todo list */}
                                            <div
                                                className={cn(
                                                    "h-8 mx-2 rounded border-2 border-dashed transition-all flex items-center justify-center",
                                                    dragType === 'todo' && dropTargetIndex === version.todos.length && dropTargetVersionId === version.id
                                                        ? "border-primary bg-primary/10"
                                                        : "border-transparent",
                                                    dragType === 'todo' ? "border-muted-foreground/30" : ""
                                                )}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (dragType === 'todo') {
                                                        setDropTargetIndex(version.todos.length);
                                                        setDropTargetVersionId(version.id);
                                                    }
                                                }}
                                                onDragLeave={(e) => {
                                                    e.stopPropagation();
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (dragType === 'todo' && dragId && dragSourceVersionId) {
                                                        moveTodo(dragSourceVersionId, dragId, version.id, version.todos.length);
                                                    }
                                                    clearDragState();
                                                }}
                                            >
                                                {dragType === 'todo' && (
                                                    <span className="text-xs text-muted-foreground">Drop here</span>
                                                )}
                                            </div>

                                            {version.todos.length === 0 && !dragType && (
                                                <div className="text-sm text-muted-foreground text-center py-4">
                                                    No todos yet. Add one above.
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        </div>
                    ))}

                    {/* Final drop zone for versions */}
                    {activeVersions.length > 0 && (
                        <div
                            className={cn(
                                "h-2 rounded transition-all",
                                dragType === 'version' && dropTargetIndex === activeVersions.length && dropTargetVersionId === null
                                    ? "bg-primary/30 h-4"
                                    : ""
                            )}
                            onDragOver={(e) => {
                                e.preventDefault();
                                if (dragType === 'version') {
                                    setDropTargetIndex(activeVersions.length);
                                    setDropTargetVersionId(null);
                                }
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragType === 'version' && dragId) {
                                    moveVersion(dragId, activeVersions.length);
                                }
                                clearDragState();
                            }}
                        />
                    )}
                </div>

                {/* Right Column - Backlog at top, Done at bottom */}
                <div className="w-full md:w-80 flex-shrink-0 space-y-4">
                    {/* Backlog Section */}
                    <Card
                        onDragOver={(e) => {
                            if (dragType === 'todo') {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragType === 'todo' && dragId && dragSourceVersionId) {
                                moveVersionTodoToBacklog(dragId, dragSourceVersionId);
                            }
                            clearDragState();
                        }}
                        className={cn(
                            "transition-all",
                            dragType === 'todo' && "ring-2 ring-amber-500"
                        )}
                    >
                        <CardHeader className="py-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <GripVertical className="h-5 w-5 text-muted-foreground" />
                                Backlog
                                <span className="text-sm font-normal text-muted-foreground">({backlog.length})</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {/* Add to backlog */}
                            <div className="flex gap-1">
                                <Input
                                    placeholder="Add to backlog..."
                                    value={backlogInput}
                                    onChange={(e) => setBacklogInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addBacklogItem('new')}
                                    className="flex-1 h-8 text-sm"
                                />
                                <Button size="sm" variant="outline" onClick={() => addBacklogItem('new')} className="h-8 px-2">
                                    <Sparkles className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => addBacklogItem('bug')} className="h-8 px-2">
                                    <Bug className="h-3 w-3" />
                                </Button>
                            </div>

                            {/* Backlog items */}
                            <div className="space-y-1 max-h-[40vh] overflow-auto">
                                {backlog.map((item, index) => (
                                    <div key={item.id}>
                                        {/* Drop zone */}
                                        <div
                                            className={cn(
                                                "h-1 rounded transition-all",
                                                dragType === 'backlog' && dropTargetIndex === index
                                                    ? "bg-primary/50 h-2"
                                                    : ""
                                            )}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (dragType === 'backlog') {
                                                    setDropTargetIndex(index);
                                                }
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                if (dragType === 'backlog' && dragId) {
                                                    moveBacklogItem(dragId, index);
                                                }
                                                clearDragState();
                                            }}
                                        />
                                        <div
                                            draggable
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                setDragType('backlog');
                                                setDragId(item.id);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={clearDragState}
                                            className={cn(
                                                "flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group text-sm",
                                                item.done && "opacity-60",
                                                dragType === 'backlog' && dragId === item.id && "opacity-30 scale-[0.98]"
                                            )}
                                        >
                                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" />
                                            <Checkbox
                                                checked={item.done}
                                                onChange={() => toggleBacklogDone(item.id)}
                                            />

                                            <div className="flex-1 min-w-0">
                                                {editingBacklog?.id === item.id ? (
                                                    <Input
                                                        value={editingBacklog.title}
                                                        onChange={(e) => setEditingBacklog({ ...editingBacklog, title: e.target.value })}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveBacklogEdit();
                                                            if (e.key === 'Escape') setEditingBacklog(null);
                                                        }}
                                                        onBlur={saveBacklogEdit}
                                                        autoFocus
                                                        className="h-6 text-sm px-1"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <span className={cn("break-words whitespace-pre-wrap", item.done && "line-through text-muted-foreground")}>
                                                            {item.title}
                                                        </span>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className={cn(
                                                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium leading-none",
                                                                item.type === 'new' ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                                                            )}>
                                                                {item.type === 'new' ? <Sparkles className="h-2.5 w-2.5" /> : <Bug className="h-2.5 w-2.5" />}
                                                                {item.type}
                                                            </span>
                                                            {/* Attachments Indicator */}
                                                            {item.attachments && item.attachments.length > 0 && (
                                                                <div className="flex items-center gap-0.5 text-muted-foreground text-[10px]">
                                                                    <Paperclip className="h-2.5 w-2.5" />
                                                                    {item.attachments.length}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Backlog Attachments List */}
                                                        {item.attachments && item.attachments.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {item.attachments.map(att => (
                                                                    <div key={att.id} className="group/att flex items-center gap-1 bg-muted/50 px-1 py-0.5 rounded text-[9px] text-muted-foreground hover:bg-muted transition-colors">
                                                                        {att.type === 'image' ? <ImageIcon className="h-2.5 w-2.5" /> : <LinkIcon className="h-2.5 w-2.5" />}
                                                                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="hover:underline max-w-[80px] truncate">
                                                                            {att.name}
                                                                        </a>
                                                                        <button
                                                                            onClick={() => deleteAttachment(item.id, att.id, null)}
                                                                            className="opacity-0 group-hover/att:opacity-100 p-0.5 hover:text-destructive"
                                                                        >
                                                                            <X className="h-2 w-2" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setEditingBacklog({ id: item.id, title: item.title })}
                                                    className="h-6 w-6 p-0"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </Button>

                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        className="absolute inset-0 opacity-0 cursor-pointer w-6 h-6"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleImageUpload(file, item.id, null);
                                                        }}
                                                        accept="image/*"
                                                    />
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                        <ImageIcon className="h-3 w-3" />
                                                    </Button>
                                                </div>

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => deleteBacklogItem(item.id)}
                                                    className="text-destructive hover:text-destructive h-6 w-6 p-0"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {backlog.length === 0 && (
                                    <div className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
                                        Backlog is empty
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Done Versions Section */}
                    {doneVersions.length > 0 && (
                        <div className="pt-2 border-t mt-4">
                            <Button
                                variant="ghost"
                                className="w-full flex items-center justify-between p-2 h-auto text-muted-foreground hover:text-foreground group"
                                onClick={() => setShowCompletedVersions(!showCompletedVersions)}
                            >
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="font-semibold text-sm">Completed Versions</span>
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{doneVersions.length}</span>
                                </div>
                                {showCompletedVersions ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
                            </Button>

                            {showCompletedVersions && (
                                <div className="space-y-2 mt-2 opacity-75 animate-in slide-in-from-top-2 fade-in duration-200">
                                    {doneVersions.map(version => (
                                        <Card key={version.id} className="bg-muted/30 border-dashed">
                                            <CardHeader className="py-2 px-3 flex flex-row items-center gap-3 space-y-0">
                                                <Checkbox
                                                    checked={version.done}
                                                    onChange={() => toggleVersionDone(version.id)}
                                                    className="data-[state=checked]:bg-muted-foreground data-[state=checked]:border-muted-foreground"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <CardTitle className="text-sm line-through text-muted-foreground break-words whitespace-pre-wrap">{version.title}</CardTitle>
                                                </div>
                                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                                    {version.todos.length} items
                                                </div>
                                            </CardHeader>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
