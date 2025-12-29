"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Database, Settings, Table, FolderOpen, BarChart3, CalendarCheck, Menu, X, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
    { href: "/", label: "Pull Data", icon: Database },
    { href: "/tables", label: "Tables", icon: Table },
    { href: "/weekly-check", label: "Weekly Check", icon: CalendarCheck },
    { href: "/analyze", label: "Analyze", icon: BarChart3 },
    { href: "/repository", label: "Data Repository", icon: FolderOpen },
    { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Close sidebar on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-100 z-40 flex items-center px-4 gap-3">
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Open menu"
                >
                    <Menu className="h-5 w-5" />
                </button>
                <Link href="/" className="flex items-center gap-2">
                    <img
                        src="/narcade-logo.png"
                        alt="Narcade"
                        className="w-8 h-8 object-contain"
                    />
                    <span className="font-semibold text-gray-900">LevelUp</span>
                </Link>
            </div>

            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-100 flex flex-col z-50 transition-transform duration-300",
                // Mobile: slide in/out
                "md:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Logo */}
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <img
                            src="/narcade-logo.png"
                            alt="Narcade"
                            className="w-10 h-10 object-contain"
                        />
                        <div>
                            <h1 className="font-semibold text-gray-900 text-lg leading-tight">LevelUp</h1>
                            <p className="text-xs text-gray-400">Dashboard</p>
                        </div>
                    </Link>
                    {/* Close button (mobile only) */}
                    <button
                        onClick={() => setIsOpen(false)}
                        className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label="Close menu"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4">
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            const isActive = item.href === "/"
                                ? pathname === "/"
                                : pathname?.startsWith(item.href);
                            const Icon = item.icon;

                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                                            isActive
                                                ? "bg-gray-900 text-white shadow-sm"
                                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        {item.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-50">
                    <Link
                        href="/update-list"
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 mb-2 rounded-lg text-xs font-medium transition-all duration-200",
                            pathname === "/update-list"
                                ? "bg-gray-900 text-white"
                                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        )}
                    >
                        Update List
                    </Link>
                    <div className="px-4 py-3 rounded-xl bg-gray-50 mb-2">
                        <p className="text-xs text-gray-500 truncate">{user?.email || 'User'}</p>
                        <p className="text-xs text-gray-400">Narcade</p>
                    </div>
                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}
