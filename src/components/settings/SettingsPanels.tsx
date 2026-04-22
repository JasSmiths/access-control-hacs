"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import { Copy, Bell, BellOff } from "lucide-react";
import type { SettingsRow } from "@/lib/settings-shared";

type AdminUserItem = {
  id: number;
  username: string;
  active: boolean;
  last_login_at: string | null;
};

// ─── Change Password ────────────────────────────────────────────────────────

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    if (res.ok) {
      setState("ok");
      setCurrent("");
      setNext("");
    } else {
      setState("err");
      setError((await res.text()) || "Failed");
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </Field>
          {error ? (
            <div className="text-sm text-[var(--danger)]">{error}</div>
          ) : null}
          {state === "ok" ? (
            <div className="text-sm text-[var(--success)]">Password updated.</div>
          ) : null}
          <Button type="submit" disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Update password"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function AdminUsersCard({
  currentUserId,
  initialUsers,
}: {
  currentUserId: number;
  initialUsers: AdminUserItem[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetById, setResetById] = useState<Record<number, string>>({});

  async function refreshUsers() {
    const res = await fetch("/api/admin-users");
    if (!res.ok) return;
    const json = (await res.json()) as { users: AdminUserItem[] };
    setUsers(json.users);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      setState("ok");
      setUsername("");
      setPassword("");
      await refreshUsers();
      return;
    }
    setState("err");
    setError((await res.text()) || "Failed to create admin user");
  }

  async function setActive(userId: number, active: boolean) {
    setBusyId(userId);
    setError(null);
    const res = await fetch(`/api/admin-users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.text()) || "Failed to update admin user");
      return;
    }
    await refreshUsers();
  }

  async function resetPassword(userId: number) {
    const next = (resetById[userId] ?? "").trim();
    if (next.length < 8) {
      setError("Reset password must be at least 8 characters.");
      return;
    }
    setBusyId(userId);
    setError(null);
    const res = await fetch(`/api/admin-users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: next }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.text()) || "Password reset failed");
      return;
    }
    setResetById((current) => ({ ...current, [userId]: "" }));
    setState("ok");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin users</CardTitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="rounded-lg border bg-[var(--bg)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">
            Add administrator
          </p>
          <form
            onSubmit={createUser}
            className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end"
          >
            <Field label="Username">
              <Input
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={state === "saving"}>
              {state === "saving" ? "Creating…" : "Add admin user"}
            </Button>
          </form>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="hidden xl:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] bg-[var(--bg)] px-4 py-2 text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">
            <div>User</div>
            <div>Password reset</div>
            <div>Actions</div>
          </div>
          <div className="divide-y">
            {users.map((user) => (
              <div
                key={user.id}
                className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-end"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">{user.username}</p>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    {user.active ? "Active" : "Inactive"} • Last login:{" "}
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                    {user.id === currentUserId ? " • You" : ""}
                  </p>
                </div>
                <Field label="Reset password">
                  <Input
                    type="password"
                    minLength={8}
                    value={resetById[user.id] ?? ""}
                    onChange={(e) =>
                      setResetById((current) => ({
                        ...current,
                        [user.id]: e.target.value,
                      }))
                    }
                    placeholder="At least 8 characters"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={user.active ? "secondary" : "primary"}
                    disabled={busyId === user.id || user.id === currentUserId}
                    onClick={() => setActive(user.id, !user.active)}
                  >
                    {user.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => resetPassword(user.id)}
                  >
                    Reset password
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error ? <div className="text-sm text-[var(--danger)]">{error}</div> : null}
        {state === "ok" ? <div className="text-sm text-[var(--success)]">Saved.</div> : null}
      </CardBody>
    </Card>
  );
}

// ─── Webhook ────────────────────────────────────────────────────────────────

export function WebhookCard({
  webhookUrl,
  webhookSecret,
}: {
  webhookUrl: string;
  webhookSecret: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Webhook endpoint</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <Field label="URL">
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => copy("url", webhookUrl)}
            >
              <Copy size={14} /> {copied === "url" ? "Copied" : "Copy"}
            </Button>
          </div>
        </Field>
        <Field
          label="Secret (X-Webhook-Secret header)"
          hint="Set this in your UniFi Protect Alarm Manager webhook config."
        >
          <div className="flex gap-2">
            <Input readOnly value={webhookSecret} type="text" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => copy("secret", webhookSecret)}
            >
              <Copy size={14} /> {copied === "secret" ? "Copied" : "Copy"}
            </Button>
          </div>
        </Field>
        <div className="text-xs text-[var(--fg-muted)]">
          Expected JSON body:{" "}
          <code className="px-1 py-0.5 rounded bg-[var(--bg)]">
            {"{ plate, event, timestamp, source? }"}
          </code>
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Site Settings ──────────────────────────────────────────────────────────

export function SiteSettingsCard({ initial }: { initial: SettingsRow }) {
  const [address, setAddress] = useState(initial.site_address ?? "");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_address: address || null }),
    });
    if (res.ok) {
      setState("ok");
    } else {
      setState("err");
      setError((await res.text()) || "Failed");
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Site information</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Physical address"
            hint="Included in generated reports as the site location."
          >
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 42 Acacia Avenue, Springfield"
            />
          </Field>
          {error ? (
            <div className="text-sm text-[var(--danger)]">{error}</div>
          ) : null}
          {state === "ok" ? (
            <div className="text-sm text-[var(--success)]">Saved.</div>
          ) : null}
          <Button type="submit" disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function LoggingSettingsCard({ initial }: { initial: SettingsRow }) {
  const [logLevel, setLogLevel] = useState<SettingsRow["log_level"]>(initial.log_level ?? "debug");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log_level: logLevel }),
    });
    if (res.ok) {
      setState("ok");
    } else {
      setState("err");
      setError((await res.text()) || "Failed");
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Logging</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Log level"
            hint="Errors: store only error logs. Debug: store all logs."
          >
            <Select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value as SettingsRow["log_level"])}
            >
              <option value="errors">Errors</option>
              <option value="debug">Debug</option>
            </Select>
          </Field>
          {error ? (
            <div className="text-sm text-[var(--danger)]">{error}</div>
          ) : null}
          {state === "ok" ? (
            <div className="text-sm text-[var(--success)]">Saved.</div>
          ) : null}
          <Button type="submit" disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─── AppRise Notifications ──────────────────────────────────────────────────

type NotifKey = "notif_arrived" | "notif_exited" | "notif_unauthorized" | "notif_flagged";

const NOTIF_OPTIONS: { key: NotifKey; label: string; description: string }[] = [
  {
    key: "notif_arrived",
    label: "Vehicle Arrived",
    description: "Notify when a tracked vehicle enters (Family, Friends, Visitors, Contractors).",
  },
  {
    key: "notif_exited",
    label: "Vehicle Exited",
    description: "Notify when a tracked vehicle exits (Family, Friends, Visitors, Contractors).",
  },
  {
    key: "notif_unauthorized",
    label: "Access Rule Breach",
    description: "Notify when an entry occurs outside allowed hours or days.",
  },
  {
    key: "notif_flagged",
    label: "Flagged Session Events",
    description: "Notify on anomalies like double-enters or exits without entry.",
  },
];

export function AppRiseCard({ initial }: { initial: SettingsRow }) {
  const [url, setUrl] = useState(initial.apprise_url ?? "");
  const [toggles, setToggles] = useState<Record<NotifKey, boolean>>({
    notif_arrived: !!initial.notif_arrived,
    notif_exited: !!initial.notif_exited,
    notif_unauthorized: !!initial.notif_unauthorized,
    notif_flagged: !!initial.notif_flagged,
  });
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err" | "testing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apprise_url: url || null, ...toggles }),
    });
    if (res.ok) {
      setState("ok");
    } else {
      setState("err");
      setError((await res.text()) || "Failed");
    }
  }

  async function testNotification() {
    if (!url) return;
    setState("testing");
    setError(null);
    try {
      const res = await fetch("/api/settings/test-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        setState("ok");
      } else {
        const msg = await res.text();
        setState("err");
        setError(msg || "Notification failed");
      }
    } catch {
      setState("err");
      setError("Request to server failed.");
    }
  }

  function toggle(key: NotifKey) {
    setToggles((t) => ({ ...t, [key]: !t[key] }));
    setState("idle");
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>AppRise notifications</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-5">
          <Field
            label="AppRise endpoint or URL scheme"
            hint="Apprise schemes (pushover://USER/TOKEN, tgram://BOT/CHAT) or an http(s):// REST endpoint."
          >
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setState("idle"); }}
                placeholder="pushover://USER_KEY/TOKEN  or  http://apprise:8000/notify/"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!url || state === "testing"}
                onClick={testNotification}
              >
                Test
              </Button>
            </div>
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--fg)]">Event toggles</p>
            {NOTIF_OPTIONS.map(({ key, label, description }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between gap-4 px-3 py-3 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition-colors text-left"
              >
                <div>
                  <div className="text-sm font-medium text-[var(--fg)]">{label}</div>
                  <div className="text-xs text-[var(--fg-muted)]">{description}</div>
                </div>
                <div
                  className={`shrink-0 rounded-full p-1 transition-colors ${
                    toggles[key]
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "text-[var(--fg-muted)]"
                  }`}
                >
                  {toggles[key] ? <Bell size={16} /> : <BellOff size={16} />}
                </div>
              </button>
            ))}
          </div>

          {error ? (
            <div className="text-sm text-[var(--danger)]">{error}</div>
          ) : null}
          {state === "ok" ? (
            <div className="text-sm text-[var(--success)]">Saved.</div>
          ) : null}

          <Button type="submit" disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save notification settings"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
