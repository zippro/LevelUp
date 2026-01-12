"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Eye, Download, RefreshCw } from "lucide-react";

interface SavedReport {
    id: string;
    game_id: string;
    game_name: string;
    report_date: string;
    created_at: string;
}

interface CombinedReportSection {
    title: string;
    content: string;
    headers: string[];
    summary: string;
}

interface FullReport extends SavedReport {
    report_data: CombinedReportSection[];
}

export default function WeeklyReportsPage() {
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<FullReport | null>(null);
    const [showDialog, setShowDialog] = useState(false);

    const loadReports = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/weekly-reports');
            if (res.ok) {
                const data = await res.json();
                setReports(data);
            }
        } catch (err) {
            console.error('Failed to load reports', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReports();
    }, []);

    const viewReport = async (id: string) => {
        try {
            const res = await fetch(`/api/weekly-reports?id=${id}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedReport(data);
                setShowDialog(true);
            }
        } catch (err) {
            console.error('Failed to load report', err);
        }
    };

    const deleteReport = async (id: string) => {
        if (!confirm('Delete this report?')) return;
        try {
            await fetch(`/api/weekly-reports?id=${id}`, { method: 'DELETE' });
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error('Failed to delete report', err);
        }
    };

    const downloadReport = (report: FullReport) => {
        const dateStr = new Date(report.report_date).toLocaleDateString('en-GB');
        let xlsContent = `Game: ${report.game_name}\nDate: ${dateStr}\n\n`;

        report.report_data.forEach(section => {
            xlsContent += `=== ${section.title} ===\n`;
            xlsContent += section.headers.join('\t') + '\n';
            xlsContent += section.content;
            if (section.summary) {
                xlsContent += section.summary + '\n';
            }
            xlsContent += '\n';
        });

        // Merged table
        xlsContent += `=== MERGED TABLE ===\n`;
        xlsContent += 'Section\tAction\tLevel\tRevision Number\tNew Move\tDescription\n';

        report.report_data.forEach(section => {
            const lines = section.content.split('\n').filter(Boolean);
            let currentAction = '';
            lines.forEach(line => {
                const parts = line.split('\t');
                if (parts[0]) currentAction = parts[0];
                xlsContent += `${section.title}\t${currentAction}\t${parts.slice(1).join('\t')}\n`;
            });
        });

        // Combined moves summary
        const allMoveSummaries: Record<number, number[]> = {};
        report.report_data.forEach(section => {
            if (section.summary) {
                const matches = section.summary.matchAll(/(-?\d+)\s*move:\s*([\d\s]+)/g);
                for (const match of matches) {
                    const mv = parseInt(match[1]);
                    const levels = match[2].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
                    if (!allMoveSummaries[mv]) allMoveSummaries[mv] = [];
                    allMoveSummaries[mv].push(...levels);
                }
            }
        });

        if (Object.keys(allMoveSummaries).length > 0) {
            xlsContent += '\n=== COMBINED MOVES SUMMARY ===\n';
            Object.keys(allMoveSummaries).sort((a, b) => Number(a) - Number(b)).forEach(mvStr => {
                const mv = Number(mvStr);
                const levels = [...new Set(allMoveSummaries[mv])].sort((a, b) => a - b);
                xlsContent += `${mv} move: ${levels.join(' ')}\n`;
            });
        }

        const blob = new Blob([xlsContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Weekly_Report_${report.game_name.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getCombinedMovesSummary = (reportData: CombinedReportSection[]): string => {
        const allMoveSummaries: Record<number, number[]> = {};
        reportData.forEach(section => {
            if (section.summary) {
                const matches = section.summary.matchAll(/(-?\d+)\s*move:\s*([\d\s]+)/g);
                for (const match of matches) {
                    const mv = parseInt(match[1]);
                    const levels = match[2].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
                    if (!allMoveSummaries[mv]) allMoveSummaries[mv] = [];
                    allMoveSummaries[mv].push(...levels);
                }
            }
        });

        if (Object.keys(allMoveSummaries).length === 0) return '';

        let summary = '';
        Object.keys(allMoveSummaries).sort((a, b) => Number(a) - Number(b)).forEach(mvStr => {
            const mv = Number(mvStr);
            const levels = [...new Set(allMoveSummaries[mv])].sort((a, b) => a - b);
            summary += `${mv} move: ${levels.join(' ')}  `;
        });
        return summary.trim();
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold">Weekly Reports</h1>
                    <p className="text-muted-foreground">View and manage saved weekly check reports</p>
                </div>
                <Button variant="outline" onClick={loadReports} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading reports...</div>
            ) : reports.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        No saved reports yet. Go to Weekly Check, combine actions, and save a report.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {reports.map(report => (
                        <Card key={report.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg">{report.game_name}</CardTitle>
                                        <CardDescription>
                                            {new Date(report.report_date).toLocaleDateString('en-GB', {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => viewReport(report.id)}>
                                            <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => deleteReport(report.id)} className="text-destructive hover:text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            )}

            {/* Report Dialog */}
            {showDialog && selectedReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-auto shadow-2xl">
                        <h3 className="text-lg font-semibold mb-2">📋 {selectedReport.game_name}</h3>
                        <p className="text-muted-foreground mb-4 text-sm">
                            {new Date(selectedReport.report_date).toLocaleDateString('en-GB')}
                        </p>

                        <div className="space-y-4">
                            {selectedReport.report_data.map((section, idx) => (
                                <div key={idx} className="border rounded-lg overflow-hidden">
                                    <div className="bg-muted/50 px-4 py-2 font-semibold">
                                        {section.title}
                                    </div>
                                    <div className="p-3 overflow-auto max-h-[200px]">
                                        <table className="w-full text-sm font-mono">
                                            <thead>
                                                <tr className="border-b">
                                                    {section.headers.map((header) => (
                                                        <th key={header} className="text-left py-1 pr-4 font-bold">{header}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {section.content.split('\n').filter(Boolean).map((line, lineIdx) => {
                                                    const parts = line.split('\t');
                                                    return (
                                                        <tr key={lineIdx} className="border-b border-muted-foreground/20">
                                                            {section.headers.map((_, i) => (
                                                                <td key={i} className="py-1 pr-4">{parts[i] || ''}</td>
                                                            ))}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {section.summary && (
                                            <div className="mt-2 text-xs text-muted-foreground">{section.summary}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Combined Moves Summary */}
                        {getCombinedMovesSummary(selectedReport.report_data) && (
                            <div className="mt-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                                <h4 className="font-semibold text-sm mb-2">📊 Combined Moves Summary</h4>
                                <p className="font-mono text-sm">{getCombinedMovesSummary(selectedReport.report_data)}</p>
                            </div>
                        )}

                        <div className="flex gap-3 mt-6">
                            <Button className="flex-1" onClick={() => downloadReport(selectedReport)}>
                                <Download className="h-4 w-4 mr-2" /> Download XLS
                            </Button>
                            <Button variant="outline" onClick={() => setShowDialog(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
