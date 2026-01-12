// Report Settings Types and Default Values

export interface SheetSortConfig {
    sortColumn: string;
    sortOrder: 'asc' | 'desc';
    filterColumn?: string;
    filterThreshold?: number;
    filterOperator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
}

export interface ReportTypeSettings {
    headerColor: string; // Hex color without # like 'FFFF00'
    minTotalUser?: number; // Minimum TotalUser filter (exclude rows below this)
    sheets: Record<string, SheetSortConfig>;
}

export interface ColumnConfig {
    originalName: string;
    displayName?: string;
    hidden?: boolean;
    order?: number;
}

export interface LevelScoreTableSettings {
    defaultSortColumn: string;
    defaultSortOrder: 'asc' | 'desc';
    columns: Record<string, ColumnConfig>;
}

export interface ReportSettings {
    levelScoreAB: ReportTypeSettings;
    bolgeselRevize: ReportTypeSettings;
    threeDayChurn: ReportTypeSettings;
    levelScoreTable?: LevelScoreTableSettings;
}

// Default report settings with sensible values
export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
    levelScoreAB: {
        headerColor: 'FFFF00', // Yellow
        minTotalUser: 100, // Default minimum TotalUser filter
        sheets: {
            rawData: { sortColumn: 'Level', sortOrder: 'asc' },
            levelScoreAB: { sortColumn: 'Level', sortOrder: 'asc' },
            levelScore: {
                sortColumn: 'LevelScore Diff',
                sortOrder: 'desc',
                filterColumn: 'LevelScore Diff',
                filterThreshold: 2,
                filterOperator: 'gt'
            },
            instantChurn: {
                sortColumn: 'Instant Churn Diff',
                sortOrder: 'desc',
                filterColumn: 'Instant Churn Diff',
                filterThreshold: 0.01,
                filterOperator: 'gt'
            },
            threeDayChurn: {
                sortColumn: '3 Days Churn Diff',
                sortOrder: 'desc',
                filterColumn: '3 Days Churn Diff',
                filterThreshold: 0.01,
                filterOperator: 'gt'
            },
            time: { sortColumn: 'Time Diff', sortOrder: 'desc' },
            levelScoreB: { sortColumn: 'Level', sortOrder: 'asc' },
            topSuccessful: { sortColumn: 'Level Score', sortOrder: 'desc' },
            bottomUnsuccess: { sortColumn: 'Level Score', sortOrder: 'asc' },
        }
    },
    bolgeselRevize: {
        headerColor: 'FFFF00', // Yellow
        sheets: {
            rawData: { sortColumn: 'Level', sortOrder: 'asc' },
            bolgeselRapor: { sortColumn: 'Range Start', sortOrder: 'asc' },
        }
    },
    threeDayChurn: {
        headerColor: 'FFFF00', // Yellow
        sheets: {
            rawData: { sortColumn: 'Level', sortOrder: 'asc' },
            levelScoreUnsuccess: { sortColumn: 'Level Score', sortOrder: 'asc' },
            levelScoreSuccess: { sortColumn: 'Level Score', sortOrder: 'desc' },
            churnUnsuccess: { sortColumn: '3 Days Churn', sortOrder: 'asc' },
        }
    },
    levelScoreTable: {
        defaultSortColumn: 'Level',
        defaultSortOrder: 'asc',
        columns: {
            'Level': { originalName: 'Level', hidden: false, order: 1 },
            'Level Score': { originalName: 'Level Score', hidden: false, order: 2 },
            'Engagement Score': { originalName: 'Engagement Score', hidden: false, order: 3 },
            'Monetization Score': { originalName: 'Monetization Score', hidden: false, order: 4 },
            'Satisfaction Score': { originalName: 'Satisfaction Score', hidden: false, order: 5 },
            'FinalCluster': { originalName: 'FinalCluster', hidden: false, order: 6 },
            'Calculated Score': { originalName: 'Calculated Score', hidden: false, order: 7 },
            'Editable Cluster': { originalName: 'Editable Cluster', hidden: false, order: 8 },
        }
    }
};

// Helper to get report settings with defaults
export function getReportSettings(config: any): ReportSettings {
    if (!config?.reportSettings) {
        return DEFAULT_REPORT_SETTINGS;
    }

    // Merge with defaults to ensure all fields are present
    return {
        levelScoreAB: {
            ...DEFAULT_REPORT_SETTINGS.levelScoreAB,
            ...config.reportSettings.levelScoreAB,
            sheets: {
                ...DEFAULT_REPORT_SETTINGS.levelScoreAB.sheets,
                ...config.reportSettings.levelScoreAB?.sheets
            }
        },
        bolgeselRevize: {
            ...DEFAULT_REPORT_SETTINGS.bolgeselRevize,
            ...config.reportSettings.bolgeselRevize,
            sheets: {
                ...DEFAULT_REPORT_SETTINGS.bolgeselRevize.sheets,
                ...config.reportSettings.bolgeselRevize?.sheets
            }
        },
        threeDayChurn: {
            ...DEFAULT_REPORT_SETTINGS.threeDayChurn,
            ...config.reportSettings.threeDayChurn,
            sheets: {
                ...DEFAULT_REPORT_SETTINGS.threeDayChurn.sheets,
                ...config.reportSettings.threeDayChurn?.sheets
            }
        },
        levelScoreTable: {
            ...DEFAULT_REPORT_SETTINGS.levelScoreTable!,
            ...config.reportSettings.levelScoreTable,
            columns: {
                ...DEFAULT_REPORT_SETTINGS.levelScoreTable!.columns,
                ...config.reportSettings.levelScoreTable?.columns
            }
        }
    };
}
