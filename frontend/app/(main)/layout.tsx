import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function MainLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
