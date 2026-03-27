"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

const analyzeTabs = [
    { href: "/analyze", label: "Bölgesel Analyze", exact: true },
    { href: "/analyze/ab", label: "A/B Compare" },
];

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="border-b -mx-4 px-4">
                <div className="flex space-x-1 overflow-x-auto pb-0 scrollbar-hide">
                    {analyzeTabs.map(tab => {
                        const isActive = tab.exact
                            ? pathname === tab.href
                            : pathname?.startsWith(tab.href);

                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap hover:bg-muted/50 rounded-t-lg",
                                    isActive
                                        ? "border-primary text-primary bg-muted/30"
                                        : "border-transparent text-muted-foreground"
                                )}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Page Content */}
            {children}
        </div>
    );
}
