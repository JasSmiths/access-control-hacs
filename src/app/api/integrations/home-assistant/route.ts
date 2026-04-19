import { getSession } from "@/lib/auth";
import { getHomeAssistantHeartbeatStatus } from "@/lib/home-assistant-heartbeat";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  return Response.json(getHomeAssistantHeartbeatStatus());
}
