import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getRoster } from "@/lib/adminQueries";
import { normalizeEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  return NextResponse.json(await getRoster(params.id));
});

// Manual add by email — admin roster override, allowed to exceed capacity (§3, §6.4).
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const { email } = await readJson<{ email?: string }>(req);
  if (!email) return jsonError("Enter the participant's email.", 400);
  const user = await queryOne<any>(`SELECT id FROM users WHERE email = $1`, [normalizeEmail(email)]);
  if (!user) return jsonError("No user with that email has signed in yet.", 404);

  const ev = await queryOne<any>(`SELECT entry_type FROM events WHERE id = $1`, [params.id]);
  if (!ev) return jsonError("Event not found.", 404);
  if (ev.entry_type !== "individual") return jsonError("Manual add supports individual events here.", 400);

  const existing = await queryOne(`SELECT 1 FROM registrations WHERE event_id = $1 AND user_id = $2 AND status <> 'withdrawn'`, [params.id, user.id]);
  if (existing) return jsonError("Already registered.", 409);

  await query(`INSERT INTO registrations (event_id, user_id, status) VALUES ($1, $2, 'registered')`, [params.id, user.id]);
  await writeAudit({ actorId: admin.id, action: "registration.manual_add", entityType: "event", entityId: params.id, after: { userId: user.id } });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
});
