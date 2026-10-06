import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { LearnerProvider } from "@/lib/learner/LearnerContext";
import "@/styles/base.css";
import "@/styles/ui.css";
import "@/styles/shell.css";
import "@/styles/path.css";
import "@/styles/lesson.css";
import "@/styles/pages.css";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Sprout - learn Spanish the fun way",
  description: "A Duolingo-style language learning app: bite-sized lessons, streaks, XP and a learning path.",
};

export const viewport: Viewport = { themeColor: "#58cc02", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <LearnerProvider>
          <ToastProvider>{children}</ToastProvider>
        </LearnerProvider>
      </body>
    </html>
  );
}
