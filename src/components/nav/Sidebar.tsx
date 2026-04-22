"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Car,
  Activity,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Flag,
  Zap,
  Plug,
  ScrollText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { clsx } from "@/components/ui/clsx";
import { ThemeToggle } from "./ThemeToggle";
import { APP_SHORT_NAME } from "@/lib/brand";
import { BrandMark } from "@/components/brand/BrandMark";

const nav = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/vehicles", label: "Vehicles", Icon: Car },
  { href: "/events", label: "Events", Icon: Activity },
  { href: "/review", label: "Review", Icon: Flag },
  { href: "/reports", label: "Reports", Icon: FileText },
  { href: "/simulate", label: "Simulate", Icon: Zap },
  { href: "/integrations", label: "Integrations", Icon: Plug },
  { href: "/logs", label: "Logs", Icon: ScrollText },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14 border-b bg-[var(--bg-elevated)]">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="Go to dashboard">
          <BrandMark className="h-7 w-7 rounded-md" iconClassName="h-4 w-4" />
          <span className="font-semibold">{APP_SHORT_NAME}</span>
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          className="p-2 rounded-md hover:bg-[var(--bg)]"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {open ? (
        <div className="md:hidden fixed inset-0 top-14 z-40 bg-[var(--bg-elevated)]">
          <div className="h-full overflow-y-auto">
            <nav className="p-3 flex flex-col gap-1">
              {nav.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                      active
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "text-[var(--fg)] hover:bg-[var(--bg)]"
                    )}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-4 mt-auto space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-[var(--fg-muted)]">Theme</span>
                <ThemeToggle />
              </div>
              <div className="rounded-lg border bg-[var(--bg)] p-3 text-sm flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-[var(--fg-muted)]">Signed in as</div>
                  <div className="truncate font-medium">{username}</div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="p-2 rounded-md hover:bg-[var(--bg-elevated)]"
                  aria-label="Log out"
                  title="Log out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <aside
        className={clsx(
          "hidden md:block md:w-64 md:shrink-0 md:border-r md:h-dvh md:sticky md:top-0 bg-[var(--bg-elevated)]"
        )}
      >
        <Link
          href="/dashboard"
          className="hidden md:flex items-center gap-2 px-5 h-14 border-b"
          aria-label="Go to dashboard"
        >
          <BrandMark className="h-7 w-7 rounded-md" iconClassName="h-4 w-4" />
          <span className="font-semibold">{APP_SHORT_NAME}</span>
        </Link>
        <nav className="p-3 flex flex-col gap-1">
          {nav.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  active
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--fg)] hover:bg-[var(--bg)]"
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4 mt-auto md:absolute md:bottom-0 md:left-0 md:right-0 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-[var(--fg-muted)]">Theme</span>
            <ThemeToggle />
          </div>
          <div className="rounded-lg border bg-[var(--bg)] p-3 text-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-[var(--fg-muted)]">Signed in as</div>
              <div className="truncate font-medium">{username}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-md hover:bg-[var(--bg-elevated)]"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
