// =============================================
// Planner Feature — Shared TypeScript Types
// =============================================

export type DateMode = 'none' | 'optional' | 'required';

export interface PlannerColumn {
    id: string;
    name: string;
    order: number;
    created_at?: string;
    updated_at?: string;
}

export interface PlannerAction {
    id: string;
    name: string;
    color: string;
    date_mode: DateMode;
    order: number;
    created_at?: string;
    updated_at?: string;
}

export interface PlannerCell {
    id: string;
    game_id: string;
    column_id: string;
    action_id: string | null;
    date: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PlannerScheduleEntry {
    id: string;
    game_id: string;
    week_start: string;
    action_id: string | null;
    date: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PlannerGameOrder {
    id: string;
    game_id: string;
    order: number;
    created_at?: string;
}

export interface GameInfo {
    id: string;
    name: string;
}

// Color palette for action colors
export const ACTION_COLOR_PALETTE = [
    '#22c55e', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#6b7280', // gray
    '#14b8a6', // teal
    '#a855f7', // purple
    '#84cc16', // lime
];
