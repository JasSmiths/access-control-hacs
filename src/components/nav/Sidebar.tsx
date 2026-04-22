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
  ChevronDown,
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
];

const settingsNav = {
  href: "/settings",
  label: "Settings",
  Icon: Settings,
  children: [
    { href: "/settings/general", label: "General" },
    { href: "/settings/logging", label: "Logging" },
    { href: "/settings/access-security", label: "Access and Security" },
    { href: "/settings/notifications", label: "Notifications" },
  ],
};

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"));

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

  const settingsActive = pathname.startsWith(settingsNav.href);
  const showSettingsChildren = settingsActive || settingsOpen;

  return (
    <>
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14 border-b bg-[var(--bg-elevated)]">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="Go to dashboard">
          <BrandMark className="h-7 w-7 rounded-md" iconClassName="h-4 w-4" />
          <span className="font-semibold">{APP_SHORT_NAME}</span>
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          className="p-2 rounded-md hover:bg-[var(--bg)]"
          onClick={() => setOpen((value) => !value)}
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
              <button
                type="button"
                onClick={() => setSettingsOpen((value) => !value)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  settingsActive
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--fg)] hover:bg-[var(--bg)]"
                )}
              >
                <settingsNav.Icon size={16} />
                <span className="flex-1 text-left">{settingsNav.label}</span>
                <ChevronDown
                  size={14}
                  className={clsx("transition-transform", showSettingsChildren ? "rotate-180" : "rotate-0")}
                />
              </button>
              {showSettingsChildren ? (
                <div className="ml-6 flex flex-col gap-1">
                  {settingsNav.children.map((child) => {
                    const active = pathname === child.href || pathname.startsWith(child.href + "/");
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className={clsx(
                          "rounded-lg px-3 py-2 text-sm",
                          active
                            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "text-[var(--fg-muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
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
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            className={clsx(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm",
              settingsActive
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--fg)] hover:bg-[var(--bg)]"
            )}
          >
            <settingsNav.Icon size={16} />
            <span className="flex-1 text-left">{settingsNav.label}</span>
            <ChevronDown
              size={14}
              className={clsx("transition-transform", showSettingsChildren ? "rotate-180" : "rotate-0")}
            />
          </button>
          {showSettingsChildren ? (
            <div className="ml-6 flex flex-col gap-1">
              {settingsNav.children.map((child) => {
                const active = pathname === child.href || pathname.startsWith(child.href + "/");
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={clsx(
                      "rounded-lg px-3 py-2 text-sm",
                      active
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "text-[var(--fg-muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]"
                    )}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
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
