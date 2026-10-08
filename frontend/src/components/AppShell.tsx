"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [
  ["Dashboard", "/dashboard"],
  ["Recommended", "/recommended"],
  ["Review", "/review"],
  ["Applications", "/applications"],
] as const;

const secondary = [
  ["Excluded", "/jobs/excluded"],
  ["Diagnostics", "/diagnostics"],
] as const;

export function AppShell({ children, onSignOut }: { children: React.ReactNode; onSignOut: () => void }) {
  const pathname = usePathname();
  const current = (href: string) => pathname === href;
  return (
    <div className="assist-app">
      <nav className="assist-nav" aria-label="Primary">
        <div className="assist-nav-main">
          {primary.map(([label, href]) => (
            <Link key={href} href={href} aria-current={current(href) ? "page" : undefined}>{label}</Link>
          ))}
        </div>
        <div className="assist-nav-side">
          {secondary.map(([label, href]) => (
            <Link key={href} href={href} aria-current={current(href) ? "page" : undefined}>{label}</Link>
          ))}
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>
      {children}
    </div>
  );
}
