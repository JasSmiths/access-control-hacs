import Link from "next/link";
import { headers } from "next/headers";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { WebhookCard } from "@/components/settings/SettingsPanels";
import { ApiAccessCard } from "@/components/integrations/ApiAccessCard";
import { HomeAssistantStatusCard } from "@/components/integrations/HomeAssistantStatusCard";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;
  const webhookUrl = `${baseUrl}/api/webhooks/gate`;
  const webhookSecret = process.env.WEBHOOK_SECRET ?? "(not configured)";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Connect Crest House Access Control System to external systems and services.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          API and Webhooks
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <WebhookCard webhookUrl={webhookUrl} webhookSecret={webhookSecret} />
          <ApiAccessCard apiBaseUrl={baseUrl} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
          Home Assistant
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Home Assistant integration</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm text-[var(--fg-muted)]">
              <p>
                A dedicated HACS integration is now included in this repository for live on-site state and alert-friendly sensors.
              </p>
              <p>
                In Home Assistant, add this repository to HACS as an <span className="font-medium text-[var(--fg)]">Integration</span>, install <span className="font-medium text-[var(--fg)]">Crest House Access Control</span>, restart Home Assistant, then configure it with the base URL and an API key from this page.
              </p>
              <p>
                The integration now exposes a diagnostic heartbeat in milliseconds so you can verify HA is receiving fresh snapshots. For test connectivity, use the <Link className="text-[var(--accent)] hover:underline" href="/simulate">Simulate</Link> page.
              </p>
            </CardBody>
          </Card>
          <HomeAssistantStatusCard />
        </div>
      </section>
    </div>
  );
}
