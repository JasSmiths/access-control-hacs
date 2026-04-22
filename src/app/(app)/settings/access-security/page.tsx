import { redirect } from "next/navigation";
import {
  AdminUsersCard,
  ChangePasswordCard,
} from "@/components/settings/SettingsPanels";
import { getSession, listAdminUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsAccessSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const adminUsers = listAdminUsers().map((row) => ({
    id: row.id,
    username: row.username,
    active: !!row.active,
    last_login_at: row.last_login_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings: Access and Security</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Manage administrator accounts and password controls.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Password
        </h2>
        <ChangePasswordCard />
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Admin Users
        </h2>
        <AdminUsersCard currentUserId={session.userId} initialUsers={adminUsers} />
      </section>
    </div>
  );
}
