import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LevelUp Dashboard",
  description: "Analytics and Level Design Insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-background p-8">
          <div className="mx-auto max-w-5xl">
            <header className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight mb-2">LevelUp Dashboard</h1>
              <p className="text-muted-foreground mb-6">
                Analytics and Level Design Insights
              </p>
              <Navigation />
            </header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
