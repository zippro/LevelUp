"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PlannerColumn, PlannerAction, DateMode } from "@/lib/planner-types";
import { ACTION_COLOR_PALETTE } from "@/lib/planner-types";

export default function PlannerSettingsPage() {
    const router = useRouter();
    const [columns, setColumns] = useState<PlannerColumn[]>([]);
    const [actions, setActions] = useState<PlannerAction[]>([]);
    const [loading, setLoading] = useState(true);

    // New item states
    const [newColName, setNewColName] = useState("");
    const [newActionName, setNewActionName] = useState("");
    const [newActionColor, setNewActionColor] = useState(ACTION_COLOR_PALETTE[0]);
    const [newActionDateMode, setNewActionDateMode] = useState<DateMode>("none");

    // Editing states
    const [editingCol, setEditingCol] = useState<{ id: string; name: string } | null>(null);
    const [editingAction, setEditingAction] = useState<{
        id: string; name: string; color: string; date_mode: DateMode
    } | null>(null);

    // Drag states
    const [dragType, setDragType] = useState<'column' | 'action' | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [colRes, actRes] = await Promise.all([
                fetch('/api/planner/columns'),
                fetch('/api/planner/actions')
            ]);
            const [colData, actData] = await Promise.all([colRes.json(), actRes.json()]);
            setColumns(Array.isArray(colData) ? colData : []);
            setActions(Array.isArray(actData) ? actData : []);
        } catch (e) {
            console.error('Failed to load planner settings:', e);
        } finally {
            setLoading(false);
        }
    };

    // ---- COLUMNS ----
    const addColumn = async () => {
        if (!newColName.trim()) return;
        const order = columns.length;
        const optimistic: PlannerColumn = { id: crypto.randomUUID(), name: newColName.trim(), order };
        setColumns(prev => [...prev, optimistic]);
        setNewColName("");

        const res = await fetch('/api/planner/columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newColName.trim(), order })
        });
        if (!res.ok) fetchData();
        else {
            const real = await res.json();
            setColumns(prev => prev.map(c => c.id === optimistic.id ? real : c));
        }
    };

    const saveEditColumn = async () => {
        if (!editingCol || !editingCol.name.trim()) { setEditingCol(null); return; }
        setColumns(prev => prev.map(c => c.id === editingCol.id ? { ...c, name: editingCol.name.trim() } : c));
        setEditingCol(null);
        await fetch('/api/planner/columns', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingCol.id, name: editingCol.name.trim() })
        });
    };

    const deleteColumn = async (id: string) => {
        if (!confirm('Delete this column? All associated cell data will be removed.')) return;
        setColumns(prev => prev.filter(c => c.id !== id));
        await fetch(`/api/planner/columns?id=${id}`, { method: 'DELETE' });
    };

    const moveColumn = (fromId: string, toIndex: number) => {
        setColumns(prev => {
            const fromIndex = prev.findIndex(c => c.id === fromId);
            if (fromIndex === -1 || fromIndex === toIndex) return prev;
            const newCols = [...prev];
            const [item] = newCols.splice(fromIndex, 1);
            const adjustedIndex = fromIndex < toIndex ? Math.max(0, toIndex - 1) : toIndex;
            newCols.splice(adjustedIndex, 0, item);
            const reorderItems = newCols.map((c, i) => ({ id: c.id, order: i }));
            fetch('/api/planner/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: reorderItems, type: 'column' })
            });
            return newCols;
        });
    };

    // ---- ACTIONS ----
    const addAction = async () => {
        if (!newActionName.trim()) return;
        const order = actions.length;
        const optimistic: PlannerAction = {
            id: crypto.randomUUID(),
            name: newActionName.trim(),
            color: newActionColor,
            date_mode: newActionDateMode,
            order
        };
        setActions(prev => [...prev, optimistic]);
        setNewActionName("");
        setNewActionColor(ACTION_COLOR_PALETTE[0]);
        setNewActionDateMode("none");

        const res = await fetch('/api/planner/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newActionName.trim(),
                color: newActionColor,
                date_mode: newActionDateMode,
                order
            })
        });
        if (!res.ok) fetchData();
        else {
            const real = await res.json();
            setActions(prev => prev.map(a => a.id === optimistic.id ? real : a));
        }
    };

    const saveEditAction = async () => {
        if (!editingAction || !editingAction.name.trim()) { setEditingAction(null); return; }
        setActions(prev => prev.map(a => a.id === editingAction.id ? {
            ...a,
            name: editingAction.name.trim(),
            color: editingAction.color,
            date_mode: editingAction.date_mode
        } : a));
        setEditingAction(null);
        await fetch('/api/planner/actions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editingAction.id,
                name: editingAction.name.trim(),
                color: editingAction.color,
                date_mode: editingAction.date_mode
            })
        });
    };

    const deleteAction = async (id: string) => {
        if (!confirm('Delete this action? Cells using it will have their action cleared.')) return;
        setActions(prev => prev.filter(a => a.id !== id));
        await fetch(`/api/planner/actions?id=${id}`, { method: 'DELETE' });
    };

    const moveAction = (fromId: string, toIndex: number) => {
        setActions(prev => {
            const fromIndex = prev.findIndex(a => a.id === fromId);
            if (fromIndex === -1 || fromIndex === toIndex) return prev;
            const newActions = [...prev];
            const [item] = newActions.splice(fromIndex, 1);
            const adjustedIndex = fromIndex < toIndex ? Math.max(0, toIndex - 1) : toIndex;
            newActions.splice(adjustedIndex, 0, item);
            const reorderItems = newActions.map((a, i) => ({ id: a.id, order: i }));
            fetch('/api/planner/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: reorderItems, type: 'action' })
            });
            return newActions;
        });
    };

    // Drag helpers
    const clearDrag = () => { setDragType(null); setDragId(null); setDropIndex(null); };

    if (loading) return <div className="p-8 animate-pulse text-muted-foreground">Loading planner settings...</div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold">Planner Settings</h1>
            </div>

            {/* =========== COLUMNS =========== */}
            <Card>
                <CardHeader>
                    <CardTitle>Planner Columns</CardTitle>
                    <CardDescription>Define the category columns for the planning table. Drag to reorder.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            placeholder="New column name..."
                            value={newColName}
                            onChange={(e) => setNewColName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
                            className="flex-1"
                        />
                        <Button onClick={addColumn} className="w-full sm:w-auto">
                            <Plus className="mr-2 h-4 w-4" />Add Column
                        </Button>
                    </div>
                    <div className="grid gap-2">
                        {columns.map((col, index) => (
                            <div key={col.id}>
                                {/* Drop zone */}
                                <div
                                    className={cn(
                                        "rounded transition-all duration-200",
                                        dragType === 'column' && dropIndex === index
                                            ? "bg-primary/20 h-8 border-2 border-dashed border-primary my-1"
                                            : dragType === 'column' ? "h-2" : "h-0"
                                    )}
                                    onDragOver={(e) => { e.preventDefault(); if (dragType === 'column') setDropIndex(index); }}
                                    onDragLeave={() => { if (dropIndex === index) setDropIndex(null); }}
                                    onDrop={(e) => { e.preventDefault(); if (dragType === 'column' && dragId) moveColumn(dragId, index); clearDrag(); }}
                                />
                                <div className="flex items-center justify-between rounded border p-3 bg-muted/50">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div
                                            draggable
                                            onDragStart={() => { setDragType('column'); setDragId(col.id); }}
                                            onDragEnd={clearDrag}
                                            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
                                        >
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        {editingCol?.id === col.id ? (
                                            <div className="flex items-center gap-2 flex-1">
                                                <Input
                                                    value={editingCol.name}
                                                    onChange={(e) => setEditingCol({ ...editingCol, name: e.target.value })}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditColumn(); if (e.key === 'Escape') setEditingCol(null); }}
                                                    autoFocus className="h-8"
                                                />
                                                <Button size="icon" variant="ghost" onClick={saveEditColumn} className="h-8 w-8 text-green-600">
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => setEditingCol(null)} className="h-8 w-8">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <span className="font-medium">{col.name}</span>
                                        )}
                                    </div>
                                    {!editingCol && (
                                        <div className="flex items-center">
                                            <Button variant="ghost" size="icon" onClick={() => setEditingCol({ id: col.id, name: col.name })}>
                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => deleteColumn(col.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {/* Final drop zone */}
                        {dragType === 'column' && (
                            <div
                                className={cn(
                                    "rounded transition-all duration-200",
                                    dropIndex === columns.length
                                        ? "bg-primary/20 h-8 border-2 border-dashed border-primary"
                                        : "h-4"
                                )}
                                onDragOver={(e) => { e.preventDefault(); setDropIndex(columns.length); }}
                                onDragLeave={() => { if (dropIndex === columns.length) setDropIndex(null); }}
                                onDrop={(e) => { e.preventDefault(); if (dragId) moveColumn(dragId, columns.length); clearDrag(); }}
                            />
                        )}
                        {columns.length === 0 && <p className="text-sm text-muted-foreground italic">No columns defined. Add one above.</p>}
                    </div>
                </CardContent>
            </Card>

            {/* =========== ACTIONS =========== */}
            <Card>
                <CardHeader>
                    <CardTitle>Planner Actions</CardTitle>
                    <CardDescription>Define the actions that can be assigned to cells (e.g. Done, Planning, Off). Each action has a color and a date mode.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-muted/30">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                placeholder="Action name..."
                                value={newActionName}
                                onChange={(e) => setNewActionName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addAction()}
                                className="flex-1"
                            />
                            <Select value={newActionDateMode} onValueChange={(v) => setNewActionDateMode(v as DateMode)}>
                                <SelectTrigger className="w-full sm:w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Date</SelectItem>
                                    <SelectItem value="optional">Date Optional</SelectItem>
                                    <SelectItem value="required">Date Required</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground mr-1">Color:</span>
                            {ACTION_COLOR_PALETTE.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setNewActionColor(color)}
                                    className={cn(
                                        "w-7 h-7 rounded-full border-2 transition-all hover:scale-110",
                                        newActionColor === color ? "border-foreground scale-110 shadow-md" : "border-transparent"
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                        <Button onClick={addAction} className="w-full sm:w-auto self-start">
                            <Plus className="mr-2 h-4 w-4" />Add Action
                        </Button>
                    </div>

                    <div className="grid gap-2">
                        {actions.map((action, index) => (
                            <div key={action.id}>
                                {/* Drop zone */}
                                <div
                                    className={cn(
                                        "rounded transition-all duration-200",
                                        dragType === 'action' && dropIndex === index
                                            ? "bg-primary/20 h-8 border-2 border-dashed border-primary my-1"
                                            : dragType === 'action' ? "h-2" : "h-0"
                                    )}
                                    onDragOver={(e) => { e.preventDefault(); if (dragType === 'action') setDropIndex(index); }}
                                    onDragLeave={() => { if (dropIndex === index) setDropIndex(null); }}
                                    onDrop={(e) => { e.preventDefault(); if (dragType === 'action' && dragId) moveAction(dragId, index); clearDrag(); }}
                                />
                                <div className="flex items-center justify-between rounded border p-3 bg-muted/50">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div
                                            draggable
                                            onDragStart={() => { setDragType('action'); setDragId(action.id); }}
                                            onDragEnd={clearDrag}
                                            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
                                        >
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="w-5 h-5 rounded-full flex-shrink-0 border" style={{ backgroundColor: action.color }} />
                                        {editingAction?.id === action.id ? (
                                            <div className="flex flex-wrap items-center gap-2 flex-1">
                                                <Input
                                                    value={editingAction.name}
                                                    onChange={(e) => setEditingAction({ ...editingAction, name: e.target.value })}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditAction(); if (e.key === 'Escape') setEditingAction(null); }}
                                                    autoFocus className="h-8 w-32"
                                                />
                                                <Select value={editingAction.date_mode} onValueChange={(v) => setEditingAction({ ...editingAction, date_mode: v as DateMode })}>
                                                    <SelectTrigger className="h-8 w-[130px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">No Date</SelectItem>
                                                        <SelectItem value="optional">Date Optional</SelectItem>
                                                        <SelectItem value="required">Date Required</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <div className="flex gap-1">
                                                    {ACTION_COLOR_PALETTE.map(c => (
                                                        <button
                                                            key={c}
                                                            onClick={() => setEditingAction({ ...editingAction, color: c })}
                                                            className={cn("w-5 h-5 rounded-full border-2 transition-all", editingAction.color === c ? "border-foreground scale-110" : "border-transparent")}
                                                            style={{ backgroundColor: c }}
                                                        />
                                                    ))}
                                                </div>
                                                <Button size="icon" variant="ghost" onClick={saveEditAction} className="h-8 w-8 text-green-600">
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => setEditingAction(null)} className="h-8 w-8">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <span className="font-medium">{action.name}</span>
                                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                                    {action.date_mode === 'none' ? 'No Date' : action.date_mode === 'optional' ? 'Date Optional' : 'Date Required'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {!editingAction && (
                                        <div className="flex items-center">
                                            <Button variant="ghost" size="icon" onClick={() => setEditingAction({
                                                id: action.id, name: action.name, color: action.color, date_mode: action.date_mode
                                            })}>
                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => deleteAction(action.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {/* Final drop zone */}
                        {dragType === 'action' && (
                            <div
                                className={cn(
                                    "rounded transition-all duration-200",
                                    dropIndex === actions.length
                                        ? "bg-primary/20 h-8 border-2 border-dashed border-primary"
                                        : "h-4"
                                )}
                                onDragOver={(e) => { e.preventDefault(); setDropIndex(actions.length); }}
                                onDragLeave={() => { if (dropIndex === actions.length) setDropIndex(null); }}
                                onDrop={(e) => { e.preventDefault(); if (dragId) moveAction(dragId, actions.length); clearDrag(); }}
                            />
                        )}
                        {actions.length === 0 && <p className="text-sm text-muted-foreground italic">No actions defined. Add one above.</p>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
