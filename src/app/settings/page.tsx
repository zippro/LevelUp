"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Database, Settings, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

export default function SettingsHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your dashboard application configuration from a central hub.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Data Configuration */}
                <Link href="/settings/data-config">
                    <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-blue-500">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5 text-blue-500" />
                                Data Configuration
                            </CardTitle>
                            <CardDescription>
                                Manage Pull Variables and Games. Define what data to fetch and how to map it.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="ghost" className="w-full justify-start pl-0 hover:bg-transparent">
                                Configure Data <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                </Link>

                {/* Weekly Check Settings */}
                <Link href="/settings/weekly-check">
                    <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-green-500">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5 text-green-500" />
                                Weekly Check
                            </CardTitle>
                            <CardDescription>
                                Customize the Weekly Check page. Set minimum user thresholds and default column sorting.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="ghost" className="w-full justify-start pl-0 hover:bg-transparent">
                                Configure Weekly Check <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                </Link>

                {/* Level Score Settings */}
                <Link href="/settings/level-score">
                    <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-purple-500">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-purple-500" />
                                Level Score & Clusters
                            </CardTitle>
                            <CardDescription>
                                Configure score multipliers (clusters) and table column settings.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="ghost" className="w-full justify-start pl-0 hover:bg-transparent">
                                Configure <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                </Link>

                {/* Report Format Settings */}
                <Link href="/settings/reports">
                    <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-orange-500">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-orange-500" />
                                Report Format
                            </CardTitle>
                            <CardDescription>
                                Configure Excel report formatting, sort orders, filters, and header styles.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="ghost" className="w-full justify-start pl-0 hover:bg-transparent">
                                Configure Reports <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
