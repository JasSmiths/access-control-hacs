import { LiveLogs } from "@/components/logs/LiveLogs";
import { listActiveApiStreams } from "@/lib/api-streams";
import { loadLogsPage } from "@/lib/logs";
import type { LogsPageData } from "@/lib/shared-types";

export const dynamic = "force-dynamic";

export default function LogsPage() {
  const initial: LogsPageData = {
    ...loadLogsPage(1, 10),
    streams: listActiveApiStreams(),
  };
  return <LiveLogs initial={initial} />;
}
