"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { Database, Settings, Table, FolderOpen, BarChart3, CalendarCheck, Menu, X, LogOut, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
    { href: "/tables", label: "Tables", icon: Table },
    { href: "/analyze", label: "Analyze", icon: BarChart3 },
    { href: "/weekly-check", label: "Weekly Check", icon: CalendarCheck },
    { href: "/weekly-reports", label: "Weekly Reports", icon: FolderOpen },
    { href: "/level-score", label: "Level Score", icon: TrendingUp },
    { href: "/repository", label: "Data Repository", icon: FolderOpen },
    { href: "/", label: "Pull Data", icon: Database },
    { href: "/settings", label: "Settings", icon: Settings },
];

// Context for sidebar collapse state
const SidebarContext = createContext<{ isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }>({
    isCollapsed: false,
    setIsCollapsed: () => { },
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Persist collapse state
    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        if (saved === 'true') setIsCollapsed(true);
    }, []);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    }, [isCollapsed]);

    return (
        <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const { isCollapsed, setIsCollapsed } = useSidebar();

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
                "fixed left-0 top-0 h-screen bg-white border-r border-gray-100 flex flex-col z-50 transition-all duration-300",
                // Desktop: collapsed or expanded
                isCollapsed ? "md:w-16" : "md:w-64",
                "w-64",
                // Mobile: slide in/out
                "md:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Logo */}
                <div className="p-4 border-b border-gray-50 flex items-center justify-between">
                    <Link href="/" className={cn("flex items-center gap-3", isCollapsed && "md:justify-center")}>
                        <img
                            src="/narcade-logo.png"
                            alt="Narcade"
                            className="w-10 h-10 object-contain"
                        />
                        {!isCollapsed && (
                            <div className="hidden md:block">
                                <h1 className="font-semibold text-gray-900 text-lg leading-tight">LevelUp</h1>
                                <p className="text-xs text-gray-400">Dashboard</p>
                            </div>
                        )}
                        <div className="md:hidden">
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

                {/* Collapse Toggle (desktop only) */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="hidden md:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center shadow-sm hover:bg-gray-50 transition-colors z-50"
                    aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>

                {/* Navigation */}
                <nav className="flex-1 p-2">
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
                                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                            isCollapsed && "md:justify-center md:px-2",
                                            isActive
                                                ? "bg-gray-900 text-white shadow-sm"
                                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                        )}
                                        title={isCollapsed ? item.label : undefined}
                                    >
                                        <Icon className="h-5 w-5 flex-shrink-0" />
                                        <span className={cn(isCollapsed && "md:hidden")}>{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Footer */}
                <div className="p-2 border-t border-gray-50">
                    <Link
                        href="/update-list"
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs font-medium transition-all duration-200",
                            isCollapsed && "md:justify-center",
                            pathname === "/update-list"
                                ? "bg-gray-900 text-white"
                                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        )}
                        title={isCollapsed ? "Update List" : undefined}
                    >
                        <span className={cn(isCollapsed && "md:hidden")}>Update List</span>
                        {isCollapsed && <span className="hidden md:inline text-xs">📋</span>}
                    </Link>
                    {!isCollapsed && (
                        <div className="px-3 py-2 rounded-xl bg-gray-50 mb-2">
                            <p className="text-xs text-gray-500 truncate">{user?.email || 'User'}</p>
                            <p className="text-xs text-gray-400">Narcade</p>
                        </div>
                    )}
                    <button
                        onClick={signOut}
                        className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200",
                            isCollapsed && "md:justify-center"
                        )}
                        title={isCollapsed ? "Sign Out" : undefined}
                    >
                        <LogOut className="h-4 w-4" />
                        <span className={cn(isCollapsed && "md:hidden")}>Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
