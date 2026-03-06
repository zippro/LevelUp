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
 * Format a week-start date as a compact human-readable label showing the range.
 * E.g. "Mar 3 – 9" or "Feb 24 – Mar 2"
 */
export function formatWeekLabel(date: Date): string {
    const end = addWeeks(date, 1);
    end.setDate(end.getDate() - 1); // Sunday
    const startMonth = format(date, 'MMM');
    const endMonth = format(end, 'MMM');
    if (startMonth === endMonth) {
        return `${format(date, 'MMM d')} – ${format(end, 'd')}`;
    }
    return `${format(date, 'MMM d')} – ${format(end, 'MMM d')}`;
}

/**
 * Format a week-start date with year for tooltips.
 * E.g. "Mar 2 – 8, 2026"
 */
export function formatWeekLabelFull(date: Date): string {
    const end = addWeeks(date, 1);
    end.setDate(end.getDate() - 1);
    return `${format(date, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
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
