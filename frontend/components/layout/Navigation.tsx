"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const ITEMS = [
  { href: "/", label: "Learn", icon: "home" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/legendary", label: "Legendary", icon: "star" },
  { href: "/profile", label: "Profile", icon: "user" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

/** Left sidebar on desktop, icon rail on tablet, bottom bar on phones (pure CSS switch). */
export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      <Link href="/" className="brand" aria-label="Sprout home">
        <span className="brand-mark" aria-hidden>
          <Icon name="star" size={22} />
        </span>
        <span className="brand-name">sprout</span>
      </Link>
      <ul className="nav-list">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} className={`nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} size={28} />
                <span className="nav-label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
