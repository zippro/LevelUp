// =============================================
// Planner Feature — Week & Date Utilities
// =============================================

import { startOfWeek, addWeeks, format, isThisWeek, isBefore, startOfDay } from 'date-fns';

/**
 * Get the Monday-start of the week for a given date.
 */
export function getWeekStart(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 1 });
}

/**
 * Generate an array of week-start dates.
 * @param pastWeeks  number of past weeks to include (default 2)
 * @param futureWeeks number of future weeks to include (default 10)
 */
export function generateWeekRange(pastWeeks = 2, futureWeeks = 10): Date[] {
    const today = new Date();
    const currentWeekStart = getWeekStart(today);
    const weeks: Date[] = [];

    for (let i = -pastWeeks; i <= futureWeeks; i++) {
        weeks.push(addWeeks(currentWeekStart, i));
    }

    return weeks;
}

/**
 * Format a date as a week key for DB storage (ISO date string: YYYY-MM-DD).
 */
export function toWeekKey(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

/**
 * Format a week-start date as a compact human-readable label.
 * E.g. "Mar 2" or "Feb 24"
 */
export function formatWeekLabel(date: Date): string {
    return format(date, 'MMM d');
}

/**
 * Format a week-start date with year for tooltips.
 * E.g. "Mar 2, 2026"
 */
export function formatWeekLabelFull(date: Date): string {
    return format(date, 'MMM d, yyyy');
}

/**
 * Check if a date falls in the current week.
 */
export function isCurrentWeek(date: Date): boolean {
    return isThisWeek(date, { weekStartsOn: 1 });
}

/**
 * Check if a week-start date is in the past (before current week start).
 */
export function isPastWeek(date: Date): boolean {
    const currentWeekStart = getWeekStart(new Date());
    return isBefore(startOfDay(date), startOfDay(currentWeekStart));
}
