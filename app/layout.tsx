import type { Metadata, Viewport } from "next";
import "./globals.css";
import { body, display, mono } from "./fonts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppProvider } from "@/components/app-provider";

export const metadata: Metadata = {
  title: "Norwegian Singles Planner",
  description: "Sub-threshold pace ranges from your 5k or 10k PB, a 12-week plan, and one-click sending to COROS or intervals.icu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f3a68" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1216" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AppProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" />
        </AppProvider>
      </body>
    </html>
  );
}
