"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
// Cell Editor Component
// ========================================
function CellEditor({
    actions,
    currentActionId,
    currentDate,
    onSave,
}: {
    actions: PlannerAction[];
    currentActionId: string | null;
    currentDate: string | null;
    onSave: (actionId: string | null, date: string | null) => void;
}) {
    const currentAction = actions.find(a => a.id === currentActionId);
    const [open, setOpen] = useState(false);
    const [selectedActionId, setSelectedActionId] = useState<string | null>(currentActionId);
    const [selectedDate, setSelectedDate] = useState<string>(currentDate || "");

    useEffect(() => {
        setSelectedActionId(currentActionId);
        setSelectedDate(currentDate || "");
    }, [currentActionId, currentDate]);

    const selectedAction = actions.find(a => a.id === selectedActionId);

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const handleSelectAction = (actionId: string | null) => {
        setSelectedActionId(actionId);
        const action = actions.find(a => a.id === actionId);
        if (!action || action.date_mode === 'none') {
            // No date needed — save immediately
            onSave(actionId, null);
            setSelectedDate("");
            setOpen(false);
        } else {
            // Has date mode — default to today if not already set
            if (!selectedDate) {
                setSelectedDate(todayStr);
            }
        }
    };

    const handleSaveWithDate = () => {
        const action = actions.find(a => a.id === selectedActionId);
        const dateToSave = selectedDate || todayStr;
        if (action?.date_mode === 'required' && !dateToSave) return;
        onSave(selectedActionId, dateToSave);
        setOpen(false);
    };

    const handleClear = () => {
        onSave(null, null);
        setSelectedActionId(null);
        setSelectedDate("");
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "w-full h-full min-h-[36px] min-w-[80px] px-2 py-1 rounded-md text-xs font-medium transition-all",
                        "hover:ring-2 hover:ring-primary/30 cursor-pointer text-left flex items-center gap-1",
                        currentAction ? "text-white shadow-sm" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    )}
                    style={currentAction ? { backgroundColor: currentAction.color } : undefined}
                >
                    {currentAction ? (
                        <>
                            <span className="truncate">{currentAction.name}</span>
                            {currentDate && (
                                <span className="text-[10px] opacity-80 flex-shrink-0">
                                    {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="opacity-50">—</span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Select Action</p>
                    {actions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => handleSelectAction(action.id)}
                            className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                                selectedActionId === action.id ? "bg-muted" : "hover:bg-muted/50"
                            )}
                        >
                            <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 border" style={{ backgroundColor: action.color }} />
                            <span className="truncate">{action.name}</span>
                            {action.date_mode !== 'none' && (
                                <Calendar className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" />
                            )}
                        </button>
                    ))}

                    {selectedAction && selectedAction.date_mode !== 'none' && (
                        <div className="pt-2 mt-2 border-t space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                                Date {selectedAction.date_mode === 'required' ? '(required)' : '(optional)'}
                            </label>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="h-8 text-xs"
                            />
                            <Button size="sm" className="w-full h-7 text-xs" onClick={handleSaveWithDate}
                                disabled={selectedAction.date_mode === 'required' && !selectedDate}
                            >
                                Save
                            </Button>
                        </div>
                    )}

                    {currentActionId && (
                        <button
                            onClick={handleClear}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors mt-1"
                        >
                            <X className="h-3.5 w-3.5" />
                            Clear
                        </button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
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

    // Helper: get cell data
    const getCell = useCallback((gameId: string, columnId: string) => {
        return cells.find(c => c.game_id === gameId && c.column_id === columnId);
    }, [cells]);

    // Helper: get schedule entry
    const getScheduleEntry = useCallback((gameId: string, weekKey: string) => {
        return schedule.find(s => s.game_id === gameId && s.week_start === weekKey);
    }, [schedule]);

    // Upsert cell — also syncs to the schedule table when a date is present
    const upsertCell = async (gameId: string, columnId: string, actionId: string | null, date: string | null) => {
        // Optimistic update for planning cells
        setCells(prev => {
            const idx = prev.findIndex(c => c.game_id === gameId && c.column_id === columnId);
            const entry: PlannerCell = {
                id: idx >= 0 ? prev[idx].id : crypto.randomUUID(),
                game_id: gameId,
                column_id: columnId,
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

        // Persist cell
        await fetch('/api/planner/cells', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, column_id: columnId, action_id: actionId, date })
        });

        // Sync to schedule: if cell has a date, reflect it in the schedule at the matching week
        if (date && actionId) {
            const cellDate = new Date(date + 'T00:00:00');
            const weekStart = getWeekStart(cellDate);
            const weekKey = toWeekKey(weekStart);

            // Optimistic schedule update
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

            // Persist schedule entry
            await fetch('/api/planner/schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game_id: gameId, week_start: weekKey, action_id: actionId, date })
            });
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
                                            const cell = getCell(game.id, col.id);
                                            return (
                                                <TableCell key={col.id} className="p-1">
                                                    <CellEditor
                                                        actions={actions}
                                                        currentActionId={cell?.action_id || null}
                                                        currentDate={cell?.date || null}
                                                        onSave={(actionId, date) => upsertCell(game.id, col.id, actionId, date)}
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
                                                        columnName: col?.name || '?',
                                                        actionName: action?.name || '',
                                                        actionColor: action?.color || '#6b7280',
                                                        columnColor: COLUMN_COLORS[colIdx % COLUMN_COLORS.length],
                                                        date: c.date,
                                                    };
                                                });

                                            return (
                                                <TableCell key={weekKey} className={cn("p-1", past && "opacity-60")}>
                                                    {weekEntries.length > 0 ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            {weekEntries.map((entry, i) => {
                                                                const isDone = entry.actionName.toLowerCase() === 'done';
                                                                return (
                                                                    <div
                                                                        key={i}
                                                                        className={cn(
                                                                            "px-2 py-1 rounded-md text-[11px] font-medium text-white shadow-sm flex items-center gap-1.5",
                                                                            isDone && "opacity-80"
                                                                        )}
                                                                        style={{ backgroundColor: isDone ? '#22c55e' : entry.columnColor }}
                                                                        title={`${entry.columnName} · ${entry.actionName}${entry.date ? ' · ' + new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`}
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
