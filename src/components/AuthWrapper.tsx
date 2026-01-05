"use client";

import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar, SidebarProvider, useSidebar } from "@/components/Sidebar";

function MainContent({ children }: { children: React.ReactNode }) {
    const { isCollapsed } = useSidebar();

    return (
        <main className={`min-h-screen p-4 md:p-8 pt-[72px] md:pt-8 transition-all duration-300 ${isCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
            <div className="w-full mx-auto">
                {children}
            </div>
        </main>
    );
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user && pathname !== "/login") {
            router.push("/login");
        }
    }, [user, loading, pathname, router]);

    // Show loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Login page - no sidebar
    if (pathname === "/login") {
        return <>{children}</>;
    }

    // Protected pages - with sidebar
    if (!user) {
        return null; // Will redirect in useEffect
    }

    return (
        <SidebarProvider>
            <div className="min-h-screen bg-gray-50/50">
                <Sidebar />
                <MainContent>{children}</MainContent>
            </div>
        </SidebarProvider>
    );
}
