"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Navigation() {
    const pathname = usePathname();

    return (
        <nav className="flex items-center space-x-4 lg:space-x-6 border-b pb-4 mb-8">
            <Link href="/" passHref>
                <Button
                    variant="ghost"
                    className={cn(
                        "text-base font-medium transition-colors hover:text-primary",
                        pathname === "/" || pathname === "/pull"
                            ? "bg-muted text-foreground hover:bg-muted"
                            : "text-muted-foreground"
                    )}
                >
                    Pull Data
                </Button>
            </Link>
            <Link href="/settings" passHref>
                <Button
                    variant="ghost"
                    className={cn(
                        "text-base font-medium transition-colors hover:text-primary",
                        pathname?.startsWith("/settings")
                            ? "bg-muted text-foreground hover:bg-muted"
                            : "text-muted-foreground"
                    )}
                >
                    Settings
                </Button>
            </Link>
            <Link href="/tables" passHref>
                <Button
                    variant="ghost"
                    className={cn(
                        "text-base font-medium transition-colors hover:text-primary",
                        pathname?.startsWith("/tables")
                            ? "bg-muted text-foreground hover:bg-muted"
                            : "text-muted-foreground"
                    )}
                >
                    Tables
                </Button>
            </Link>
            <Link href="/repository" passHref>
                <Button
                    variant="ghost"
                    className={cn(
                        "text-base font-medium transition-colors hover:text-primary",
                        pathname?.startsWith("/repository")
                            ? "bg-muted text-foreground hover:bg-muted"
                            : "text-muted-foreground"
                    )}
                >
                    Data Repository
                </Button>
            </Link>
        </nav>
    );
}
