import {
  getAdminById,
  getSession,
  hashPassword,
  updateAdminActive,
  updateAdminPassword,
} from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import type { JsonObject } from "@/lib/shared-types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return new Response("Invalid admin user id", { status: 400 });
  }

  const target = getAdminById(userId);
  if (!target) return new Response("Admin user not found", { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { active, password } = (body ?? {}) as {
    active?: unknown;
    password?: unknown;
  };

  let changed = false;

  if (typeof active === "boolean") {
    if (!active && session.userId === userId) {
      return new Response("You cannot deactivate your own account", { status: 400 });
    }
    const result = updateAdminActive(userId, active);
    if (!result.ok) {
      if (result.reason === "last_active_admin") {
        return new Response("Cannot deactivate the last active admin", { status: 400 });
      }
      return new Response("Admin user not found", { status: 404 });
    }
    changed = changed || result.changed;
  }

  if (typeof password === "string") {
    if (password.length < 8) {
      return new Response("Password must be at least 8 characters", { status: 400 });
    }
    const hash = await hashPassword(password);
    updateAdminPassword(userId, hash);
    changed = true;
  }

  if (!changed) return new Response("No changes provided", { status: 400 });

  const details: JsonObject = {
    userId,
    passwordReset: typeof password === "string",
  };
  if (typeof active === "boolean") {
    details.active = active;
  }

  auditLog({
    level: "info",
    category: "auth",
    action: "auth.admin_user_updated",
    message: `Admin user ${target.username} updated by ${session.username}.`,
    request,
    actor: session.username,
    details,
  });

  return Response.json({ ok: true });
}
