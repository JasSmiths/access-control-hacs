import { redirect } from "next/navigation";
import { AppRiseCard } from "@/components/settings/SettingsPanels";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const settings = getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings: Notifications</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Configure alert channels and event-level notification preferences.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          AppRise
        </h2>
        <div className="max-w-4xl">
          <AppRiseCard initial={settings} />
        </div>
      </section>
    </div>
  );
}
