import { redirect } from "next/navigation";
import { SiteSettingsCard } from "@/components/settings/SettingsPanels";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsGeneralPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const settings = getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings: General</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Core site profile details used across the app.
        </p>
      </div>
      <SiteSettingsCard initial={settings} />
    </div>
  );
}
