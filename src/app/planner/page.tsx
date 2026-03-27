"use client";

import { useState, useEffect, useMemo, useCallback, useRef, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import { Loader2, GripVertical, Calendar, X, Eye, EyeOff, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlannerColumn, PlannerAction, PlannerCell, PlannerScheduleEntry, PlannerGameOrder, GameInfo } from "@/lib/planner-types";
import { generateWeekRange, toWeekKey, formatWeekLabel, isCurrentWeek, isPastWeek, formatWeekLabelFull, getWeekStart } from "@/lib/planner-utils";
import { format, addWeeks } from "date-fns";

// Distinct colors for each planning column in the schedule view
const COLUMN_COLORS = [
    '#2563eb', // blue
    '#16a34a', // green
    '#dc2626', // red
    '#9333ea', // purple
    '#ea580c', // orange
    '#0891b2', // cyan
    '#be185d', // pink
    '#854d0e', // brown
    '#4f46e5', // indigo
    '#0d9488', // teal
    '#c026d3', // fuchsia
    '#65a30d', // lime
];

// ========================================
// Action Picker Popover (for adding/editing a single entry)
// ========================================
function ActionPicker({
    actions,
    onSave,
    trigger,
}: {
    actions: PlannerAction[];
    onSave: (actionId: string, date: string | null) => void;
    trigger: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>("");
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const selectedAction = actions.find(a => a.id === selectedActionId);

    const handleSelectAction = (actionId: string) => {
        setSelectedActionId(actionId);
        const action = actions.find(a => a.id === actionId);
        if (!action || action.date_mode === 'none') {
            onSave(actionId, null);
            setSelectedActionId(null);
            setSelectedDate("");
            setOpen(false);
        } else {
            if (!selectedDate) setSelectedDate(todayStr);
        }
    };

    const handleSaveWithDate = () => {
        if (!selectedActionId) return;
        const dateToSave = selectedDate || todayStr;
        onSave(selectedActionId, dateToSave);
        setSelectedActionId(null);
        setSelectedDate("");
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSelectedActionId(null); setSelectedDate(""); } }}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="start">
                <div className="space-y-1">
                    {actions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => handleSelectAction(action.id)}
                            className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                                selectedActionId === action.id ? "ring-2 ring-primary" : "hover:bg-muted/50"
                            )}
                        >
                            <span className="w-3 h-3 rounded-full flex-shrink-0 border" style={{ backgroundColor: action.color }} />
                            {action.name}
                            {selectedActionId === action.id && <span className="ml-auto text-primary text-xs">✓</span>}
                        </button>
                    ))}
                    {selectedAction && selectedAction.date_mode !== 'none' && (
                        <div className="pt-2 mt-2 border-t space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                                Date {selectedAction.date_mode === 'required' ? '(required)' : '(optional)'}
                            </label>
                            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-8 text-xs" />
                            <Button size="sm" className="w-full h-7 text-xs" onClick={handleSaveWithDate}
                                disabled={selectedAction.date_mode === 'required' && !selectedDate}
                            >Save</Button>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ========================================
// Multi-Cell Editor (shows all entries for a game+column slot + add button)
// ========================================
function MultiCellEditor({
    actions,
    entries,
    onAdd,
    onUpdate,
    onDelete,
}: {
    actions: PlannerAction[];
    entries: PlannerCell[];
    onAdd: (actionId: string, date: string | null) => void;
    onUpdate: (cellId: string, actionId: string, date: string | null) => void;
    onDelete: (cellId: string) => void;
}) {
    return (
        <div className="flex flex-col gap-0.5 min-h-[36px] min-w-[80px]">
            {entries.map(entry => {
                const action = actions.find(a => a.id === entry.action_id);
                if (!action) return null;
                return (
                    <ActionPicker
                        key={entry.id}
                        actions={actions}
                        onSave={(actionId, date) => onUpdate(entry.id, actionId, date)}
                        trigger={
                            <div
                                className="group flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-white shadow-sm relative cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                                style={{ backgroundColor: action.color }}
                            >
                                <span className="truncate">{action.name}</span>
                                {entry.date && (
                                    <span className="text-[10px] opacity-80 flex-shrink-0">
                                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] items-center justify-center hidden group-hover:flex shadow"
                                >
                                    ×
                                </button>
                            </div>
                        }
                    />
                );
            })}
            <ActionPicker
                actions={actions}
                onSave={onAdd}
                trigger={
                    <button className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground bg-muted/30 hover:bg-muted/60 transition-colors min-h-[28px]">
                        <Plus className="h-3 w-3" />
                        {entries.length === 0 && <span className="opacity-60">Add</span>}
                    </button>
                }
            />
        </div>
    );
}

// ========================================
// Visibility Filter Popover
// ========================================
function VisibilityFilter({
    label,
    items,
    hiddenIds,
    onToggle,
    onShowAll,
    onHideAll,
}: {
    label: string;
    items: { id: string; name: string }[];
    hiddenIds: Set<string>;
    onToggle: (id: string) => void;
    onShowAll: () => void;
    onHideAll: () => void;
}) {
    const hiddenCount = hiddenIds.size;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    {label}
                    {hiddenCount > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {hiddenCount} hidden
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="start">
                <div className="space-y-1">
                    <div className="flex items-center justify-between px-1 pb-1 border-b mb-1">
                        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                        <div className="flex gap-1">
                            <button onClick={onShowAll} className="text-[10px] text-primary hover:underline">Show All</button>
                            <span className="text-muted-foreground text-[10px]">·</span>
                            <button onClick={onHideAll} className="text-[10px] text-muted-foreground hover:underline">Hide All</button>
                        </div>
                    </div>
                    {items.map(item => {
                        const isHidden = hiddenIds.has(item.id);
                        return (
                            <button
                                key={item.id}
                                onClick={() => onToggle(item.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                                    isHidden ? "text-muted-foreground opacity-60 hover:bg-muted/50" : "hover:bg-muted/50"
                                )}
                            >
                                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                <span className="truncate">{item.name}</span>
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ========================================
// Main Planner Page
// ========================================
export default function PlannerPage() {
    const [activeTab, setActiveTab] = useState<'planning' | 'schedule'>('planning');
    const [loading, setLoading] = useState(true);

    // Data
    const [games, setGames] = useState<GameInfo[]>([]);
    const [columns, setColumns] = useState<PlannerColumn[]>([]);
    const [actions, setActions] = useState<PlannerAction[]>([]);
    const [cells, setCells] = useState<PlannerCell[]>([]);
    const [schedule, setSchedule] = useState<PlannerScheduleEntry[]>([]);
    const [gameOrder, setGameOrder] = useState<PlannerGameOrder[]>([]);

    // Drag state
    const [dragType, setDragType] = useState<'row' | 'column' | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    // Visibility state
    const [hiddenGameIds, setHiddenGameIds] = useState<Set<string>>(new Set());
    const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set());
    // Ref to track if preferences have been loaded (avoid saving on initial load)
    const prefsLoaded = useRef(false);
    const prefsSaveTimer = useRef<NodeJS.Timeout | null>(null);

    // Week range
    const weeks = useMemo(() => generateWeekRange(2, 10), []);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        try {
            const [configRes, colRes, actRes, cellRes, schedRes, prefRes] = await Promise.all([
                fetch('/api/config'),
                fetch('/api/planner/columns'),
                fetch('/api/planner/actions'),
                fetch('/api/planner/cells'),
                fetch('/api/planner/schedule'),
                fetch('/api/planner/preferences'),
            ]);
            const [configData, colData, actData, cellData, schedData] = await Promise.all([
                configRes.json(), colRes.json(), actRes.json(), cellRes.json(), schedRes.json()
            ]);

            const gameList: GameInfo[] = (configData.games || []).map((g: any) => ({ id: g.id, name: g.name }));
            setGames(gameList);
            setColumns(Array.isArray(colData) ? colData : []);
            setActions(Array.isArray(actData) ? actData : []);
            setCells(Array.isArray(cellData) ? cellData : []);
            setSchedule(Array.isArray(schedData) ? schedData : []);

            // Load preferences (hidden states)
            if (prefRes.ok) {
                const prefData = await prefRes.json();
                if (prefData.hidden_game_ids) setHiddenGameIds(new Set(prefData.hidden_game_ids));
                if (prefData.hidden_column_ids) setHiddenColumnIds(new Set(prefData.hidden_column_ids));
            }

            const goRes = await fetch('/api/planner/game-order');
            if (goRes.ok) {
                const goData = await goRes.json();
                setGameOrder(Array.isArray(goData) ? goData : []);
            }
        } catch (e) {
            console.error('Failed to load planner data:', e);
        } finally {
            setLoading(false);
            prefsLoaded.current = true;
        }
    };

    // Sorted games based on persisted order
    const sortedGames = useMemo(() => {
        const orderMap = new Map(gameOrder.map(go => [go.game_id, go.order]));
        return [...games].sort((a, b) => {
            const oa = orderMap.get(a.id) ?? 9999;
            const ob = orderMap.get(b.id) ?? 9999;
            return oa - ob;
        });
    }, [games, gameOrder]);

    // Visible games and columns (filtered by hidden sets)
    const visibleGames = useMemo(() => sortedGames.filter(g => !hiddenGameIds.has(g.id)), [sortedGames, hiddenGameIds]);
    const visibleColumns = useMemo(() => columns.filter(c => !hiddenColumnIds.has(c.id)), [columns, hiddenColumnIds]);

    // Auto-save preferences when hidden state changes (debounced)
    const savePreferences = useCallback((gameIds: Set<string>, colIds: Set<string>) => {
        if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current);
        prefsSaveTimer.current = setTimeout(() => {
            fetch('/api/planner/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hidden_game_ids: Array.from(gameIds),
                    hidden_column_ids: Array.from(colIds),
                })
            });
        }, 500);
    }, []);

    // Visibility toggles (with auto-save)
    const toggleGameVisibility = (id: string) => {
        setHiddenGameIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            if (prefsLoaded.current) savePreferences(next, hiddenColumnIds);
            return next;
        });
    };
    const toggleColumnVisibility = (id: string) => {
        setHiddenColumnIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            if (prefsLoaded.current) savePreferences(hiddenGameIds, next);
            return next;
        });
    };
    const showAllGames = () => {
        const next = new Set<string>();
        setHiddenGameIds(next);
        if (prefsLoaded.current) savePreferences(next, hiddenColumnIds);
    };
    const hideAllGames = () => {
        const next = new Set(games.map(g => g.id));
        setHiddenGameIds(next);
        if (prefsLoaded.current) savePreferences(next, hiddenColumnIds);
    };
    const showAllColumns = () => {
        const next = new Set<string>();
        setHiddenColumnIds(next);
        if (prefsLoaded.current) savePreferences(hiddenGameIds, next);
    };
    const hideAllColumns = () => {
        const next = new Set(columns.map(c => c.id));
        setHiddenColumnIds(next);
        if (prefsLoaded.current) savePreferences(hiddenGameIds, next);
    };

    // Helper: get all cells for a game+column slot
    const getCellsForSlot = useCallback((gameId: string, columnId: string) => {
        return cells.filter(c => c.game_id === gameId && c.column_id === columnId);
    }, [cells]);

    // Add a new cell (multi-task)
    const addCell = async (gameId: string, columnId: string, actionId: string, date: string | null) => {
        const tempId = crypto.randomUUID();
        const newEntry: PlannerCell = { id: tempId, game_id: gameId, column_id: columnId, action_id: actionId, date };
        setCells(prev => [...prev, newEntry]);

        const res = await fetch('/api/planner/cells', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, column_id: columnId, action_id: actionId, date })
        });
        if (res.ok) {
            const saved = await res.json();
            setCells(prev => prev.map(c => c.id === tempId ? { ...c, id: saved.id } : c));
        }
    };

    // Delete a specific cell by ID
    const deleteCell = async (cellId: string) => {
        setCells(prev => prev.filter(c => c.id !== cellId));
        await fetch(`/api/planner/cells?id=${cellId}`, { method: 'DELETE' });
    };

    // Update a cell (change action and/or date)
    const updateCell = async (cellId: string, actionId: string, date: string | null) => {
        setCells(prev => prev.map(c => c.id === cellId ? { ...c, action_id: actionId, date } : c));
        await fetch('/api/planner/cells', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: cellId, action_id: actionId, date })
        });
    };

    // Update a cell's date only (used by schedule DnD)
    const updateCellDate = async (cellId: string, newDate: string) => {
        const cell = cells.find(c => c.id === cellId);
        if (cell) {
            updateCell(cellId, cell.action_id!, newDate);
        }
    };

    // Upsert schedule
    const upsertSchedule = async (gameId: string, weekKey: string, actionId: string | null, date: string | null) => {
        setSchedule(prev => {
            const idx = prev.findIndex(s => s.game_id === gameId && s.week_start === weekKey);
            const entry: PlannerScheduleEntry = {
                id: idx >= 0 ? prev[idx].id : crypto.randomUUID(),
                game_id: gameId,
                week_start: weekKey,
                action_id: actionId,
                date
            };
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = entry;
                return updated;
            }
            return [...prev, entry];
        });

        await fetch('/api/planner/schedule', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, week_start: weekKey, action_id: actionId, date })
        });
    };

    // Row reorder
    const moveGameRow = async (gameId: string, toIndex: number) => {
        const sorted = [...visibleGames];
        const fromIndex = sorted.findIndex(g => g.id === gameId);
        if (fromIndex === -1 || fromIndex === toIndex) return;
        const [item] = sorted.splice(fromIndex, 1);
        const adjustedIndex = fromIndex < toIndex ? Math.max(0, toIndex - 1) : toIndex;
        sorted.splice(adjustedIndex, 0, item);

        // Rebuild full order including hidden games
        const hiddenGames = sortedGames.filter(g => hiddenGameIds.has(g.id));
        const allGames = [...sorted, ...hiddenGames];
        const newOrder = allGames.map((g, i) => ({ game_id: g.id, order: i }));

        setGameOrder(newOrder.map(o => ({
            id: gameOrder.find(go => go.game_id === o.game_id)?.id || crypto.randomUUID(),
            game_id: o.game_id,
            order: o.order
        })));

        await fetch('/api/planner/game-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: newOrder })
        });
    };

    // Column reorder
    const moveColumn = (colId: string, toIndex: number) => {
        setColumns(prev => {
            const fromIndex = prev.findIndex(c => c.id === colId);
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

    const clearDrag = () => { setDragType(null); setDragId(null); setDropIndex(null); };

    if (loading) {
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
                <h1 className="text-2xl font-bold">Planner</h1>
                <p className="text-muted-foreground">Plan and schedule across your games.</p>
            </div>

            {/* Tab Switcher + Filters */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="border-b flex-1">
                    <div className="flex space-x-1">
                        {(['planning', 'schedule'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap hover:bg-muted/50 rounded-t-lg capitalize",
                                    activeTab === tab
                                        ? "border-primary text-primary bg-muted/30"
                                        : "border-transparent text-muted-foreground"
                                )}
                            >
                                {tab === 'planning' ? 'Planning' : 'Schedule'}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Visibility Filters */}
                <div className="flex gap-2 pb-1">
                    <VisibilityFilter
                        label="Games"
                        items={sortedGames}
                        hiddenIds={hiddenGameIds}
                        onToggle={toggleGameVisibility}
                        onShowAll={showAllGames}
                        onHideAll={hideAllGames}
                    />
                    {activeTab === 'planning' && columns.length > 0 && (
                        <VisibilityFilter
                            label="Columns"
                            items={columns}
                            hiddenIds={hiddenColumnIds}
                            onToggle={toggleColumnVisibility}
                            onShowAll={showAllColumns}
                            onHideAll={hideAllColumns}
                        />
                    )}
                </div>
            </div>

            {/* Empty states */}
            {games.length === 0 && (
                <div className="text-center py-16 bg-muted/10 border border-dashed rounded-xl">
                    <p className="text-muted-foreground">No games configured. Add games in <a href="/settings/data-config" className="text-primary underline">Data Configuration</a>.</p>
                </div>
            )}

            {games.length > 0 && actions.length === 0 && (
                <div className="text-center py-8 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-amber-800 text-sm">No planner actions defined yet. <a href="/settings/planner" className="text-primary underline font-medium">Configure actions in Settings</a> to start planning.</p>
                </div>
            )}

            {games.length > 0 && activeTab === 'planning' && columns.length === 0 && (
                <div className="text-center py-8 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-amber-800 text-sm">No planner columns defined. <a href="/settings/planner" className="text-primary underline font-medium">Add columns in Settings</a> to start.</p>
                </div>
            )}

            {/* =============== PLANNING TABLE =============== */}
            {activeTab === 'planning' && visibleGames.length > 0 && visibleColumns.length > 0 && (
                <div className="rounded-lg border shadow-sm bg-card">
                    <div className="overflow-x-auto">
                        <Table className="min-w-full">
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="sticky left-0 z-30 bg-muted/50 w-[180px] min-w-[180px] font-bold text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                        Game
                                    </TableHead>
                                    {visibleColumns.map((col, colIdx) => (
                                        <TableHead
                                            key={col.id}
                                            className={cn(
                                                "font-bold text-foreground text-center min-w-[120px] select-none",
                                                dragType === 'column' && dragId === col.id && "opacity-50",
                                                dragType === 'column' && dropIndex === colIdx && dragId !== col.id && "border-l-2 border-l-primary"
                                            )}
                                            onDragOver={(e) => { e.preventDefault(); if (dragType === 'column') setDropIndex(colIdx); }}
                                            onDragLeave={() => { if (dropIndex === colIdx) setDropIndex(null); }}
                                            onDrop={(e) => { e.preventDefault(); if (dragType === 'column' && dragId) moveColumn(dragId, colIdx); clearDrag(); }}
                                        >
                                            <div
                                                className="flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing"
                                                draggable
                                                onDragStart={(e) => { setDragType('column'); setDragId(col.id); e.dataTransfer.effectAllowed = 'move'; }}
                                                onDragEnd={clearDrag}
                                            >
                                                <GripVertical className="h-3 w-3 text-muted-foreground opacity-40" />
                                                {col.name}
                                            </div>
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleGames.map((game, rowIdx) => (
                                    <TableRow
                                        key={game.id}
                                        className={cn(
                                            "hover:bg-muted/30 transition-colors relative",
                                            dragType === 'row' && dragId === game.id && "opacity-50",
                                            dragType === 'row' && dropIndex === rowIdx && dragId !== game.id && "border-t-2 border-t-primary"
                                        )}
                                        onDragOver={(e) => { e.preventDefault(); if (dragType === 'row') setDropIndex(rowIdx); }}
                                        onDragLeave={() => { if (dropIndex === rowIdx) setDropIndex(null); }}
                                        onDrop={(e) => { e.preventDefault(); if (dragType === 'row' && dragId) moveGameRow(dragId, rowIdx); clearDrag(); }}
                                    >
                                        <TableCell className="sticky left-0 z-10 bg-card shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    draggable
                                                    onDragStart={(e) => { setDragType('row'); setDragId(game.id); e.dataTransfer.effectAllowed = 'move'; }}
                                                    onDragEnd={clearDrag}
                                                    className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded"
                                                >
                                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <span className="font-medium text-sm truncate">{game.name}</span>
                                            </div>
                                        </TableCell>
                                        {visibleColumns.map(col => {
                                            const slotCells = getCellsForSlot(game.id, col.id);
                                            return (
                                                <TableCell key={col.id} className="p-1">
                                                    <MultiCellEditor
                                                        actions={actions}
                                                        entries={slotCells}
                                                        onAdd={(actionId, date) => addCell(game.id, col.id, actionId, date)}
                                                        onUpdate={(cellId, actionId, date) => updateCell(cellId, actionId, date)}
                                                        onDelete={(cellId) => deleteCell(cellId)}
                                                    />
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* =============== SCHEDULE TABLE =============== */}
            {activeTab === 'schedule' && visibleGames.length > 0 && (
                <div className="rounded-lg border shadow-sm bg-card">
                    <div className="overflow-x-auto">
                        <Table className="min-w-full">
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="sticky left-0 z-30 bg-muted/50 w-[180px] min-w-[180px] font-bold text-foreground shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                        Game
                                    </TableHead>
                                    {weeks.map(week => {
                                        const weekKey = toWeekKey(week);
                                        const current = isCurrentWeek(week);
                                        const past = isPastWeek(week);
                                        return (
                                            <TableHead
                                                key={weekKey}
                                                className={cn(
                                                    "text-center min-w-[130px] font-bold whitespace-nowrap",
                                                    current && "bg-primary/10 text-primary",
                                                    past && "text-muted-foreground/60"
                                                )}
                                                title={formatWeekLabelFull(week)}
                                            >
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs">{formatWeekLabel(week)}</span>
                                                    {current && <span className="text-[10px] text-primary font-normal">This Week</span>}
                                                </div>
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleGames.map((game, rowIdx) => (
                                    <TableRow
                                        key={game.id}
                                        className={cn(
                                            "hover:bg-muted/30 transition-colors relative",
                                            dragType === 'row' && dragId === game.id && "opacity-50",
                                            dragType === 'row' && dropIndex === rowIdx && dragId !== game.id && "border-t-2 border-t-primary"
                                        )}
                                        onDragOver={(e) => { e.preventDefault(); if (dragType === 'row') setDropIndex(rowIdx); }}
                                        onDragLeave={() => { if (dropIndex === rowIdx) setDropIndex(null); }}
                                        onDrop={(e) => { e.preventDefault(); if (dragType === 'row' && dragId) moveGameRow(dragId, rowIdx); clearDrag(); }}
                                    >
                                        <TableCell className="sticky left-0 z-10 bg-card shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    draggable
                                                    onDragStart={(e) => { setDragType('row'); setDragId(game.id); e.dataTransfer.effectAllowed = 'move'; }}
                                                    onDragEnd={clearDrag}
                                                    className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded"
                                                >
                                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <span className="font-medium text-sm truncate">{game.name}</span>
                                            </div>
                                        </TableCell>
                                        {weeks.map(week => {
                                            const weekKey = toWeekKey(week);
                                            const nextWeekKey = toWeekKey(addWeeks(week, 1));
                                            const past = isPastWeek(week);

                                            // Derive entries from planning cells: find cells for this game with dates in this week
                                            const weekEntries = cells
                                                .filter(c => {
                                                    if (c.game_id !== game.id || !c.date || !c.action_id) return false;
                                                    return c.date >= weekKey && c.date < nextWeekKey;
                                                })
                                                .map(c => {
                                                    const col = columns.find(col => col.id === c.column_id);
                                                    const colIdx = columns.findIndex(col => col.id === c.column_id);
                                                    const action = actions.find(a => a.id === c.action_id);
                                                    return {
                                                        cellId: c.id,
                                                        columnName: col?.name || '?',
                                                        actionName: action?.name || '',
                                                        actionColor: action?.color || '#6b7280',
                                                        columnColor: COLUMN_COLORS[colIdx % COLUMN_COLORS.length],
                                                        date: c.date,
                                                    };
                                                });

                                            return (
                                                <TableCell
                                                    key={weekKey}
                                                    className={cn("p-1 transition-colors", past && "opacity-60")}
                                                    onDragOver={(e) => { if (e.dataTransfer.types.includes('text/cell-id')) { e.preventDefault(); e.currentTarget.classList.add('bg-primary/10'); } }}
                                                    onDragLeave={(e) => { e.currentTarget.classList.remove('bg-primary/10'); }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        e.currentTarget.classList.remove('bg-primary/10');
                                                        const cellId = e.dataTransfer.getData('text/cell-id');
                                                        if (cellId) {
                                                            // Set date to Monday of this week
                                                            updateCellDate(cellId, weekKey);
                                                        }
                                                    }}
                                                >
                                                    {weekEntries.length > 0 ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            {weekEntries.map((entry, i) => {
                                                                const isDone = entry.actionName.toLowerCase() === 'done';
                                                                return (
                                                                    <div
                                                                        key={entry.cellId}
                                                                        draggable
                                                                        onDragStart={(e) => { e.dataTransfer.setData('text/cell-id', entry.cellId); e.dataTransfer.effectAllowed = 'move'; }}
                                                                        className={cn(
                                                                            "px-2 py-1 rounded-md text-[11px] font-medium text-white shadow-sm flex items-center gap-1.5 cursor-grab active:cursor-grabbing",
                                                                            isDone && "opacity-80"
                                                                        )}
                                                                        style={{ backgroundColor: isDone ? '#22c55e' : entry.columnColor }}
                                                                        title={`${entry.columnName} · ${entry.actionName}${entry.date ? ' · ' + new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}\nDrag to move to another week`}
                                                                    >
                                                                        {isDone ? (
                                                                            <span className="text-[13px] flex-shrink-0">✓</span>
                                                                        ) : (
                                                                            <span
                                                                                className="w-2 h-2 rounded-full flex-shrink-0 border border-white/40"
                                                                                style={{ backgroundColor: entry.actionColor }}
                                                                            />
                                                                        )}
                                                                        <span className={cn("truncate", isDone && "line-through")}>{entry.columnName}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="min-h-[28px]" />
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}
