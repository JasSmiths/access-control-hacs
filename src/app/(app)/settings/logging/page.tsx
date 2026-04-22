import { redirect } from "next/navigation";
import { LoggingSettingsCard } from "@/components/settings/SettingsPanels";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsLoggingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const settings = getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings: Logging</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Configure how much detail the system stores in logs.
        </p>
      </div>
      <LoggingSettingsCard initial={settings} />
    </div>
  );
}
