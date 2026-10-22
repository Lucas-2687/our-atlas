import { deleteRows, eq, insertRows, oneRow, restPath, supabaseRest } from "./supabase-server";

export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type MapSession = { user_id: string };
type MapMember = { user_id: string; display_name: string };

export const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, "0")).join("");

export async function digest(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}

export function validPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new AccessError(400, "地图口令需要 12 至 128 个字符");
  }
  return value;
}

export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return Array.from(
    new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}

function cookie(req: Request) {
  return req.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith("atlas_session="))?.slice(14) || "";
}

function cookieHeader(req: Request, value: string, seconds: number) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `atlas_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`;
}

export async function mapUser(req: Request) {
  const raw = cookie(req);
  if (!/^[a-f0-9]{48}$/.test(raw)) return null;
  const session = await oneRow<MapSession>("map_sessions", {
    token_hash: eq("token_hash", await digest(raw)),
    expires_at: `gt.${new Date().toISOString()}`,
  });
  if (!session) return null;
  const member = await oneRow<MapMember>("members", { user_id: eq("user_id", session.user_id) });
  if (!member) return null;
  return { userId: member.user_id, displayName: member.display_name, email: "" };
}

export async function beginSession(req: Request, userId: string) {
  const raw = randomSecret();
  await insertRows("map_sessions", {
    token_hash: await digest(raw),
    user_id: userId,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  return cookieHeader(req, raw, 30 * 86400);
}

export async function endSession(req: Request) {
  const raw = cookie(req);
  if (raw) await deleteRows("map_sessions", { token_hash: eq("token_hash", await digest(raw)) });
  return cookieHeader(req, "", 0);
}

export async function rateLimit(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = req.headers.get("x-real-ip") || forwardedFor || "local";
  const bucket = Math.floor(Date.now() / 900000);
  const key = await digest(`access:${ip}:${bucket}`);
  const attempts = await supabaseRest<number>("rpc/consume_map_access_limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: key, p_expires_at: Date.now() + 1800000 }),
  });
  if (!attempts || attempts > 15) throw new AccessError(429, "尝试次数较多，请 15 分钟后再试");
}

export async function unlock(req: Request, id: string, password: string) {
  await rateLimit(req);
  const row = await oneRow<{ user_id: string; salt: string; password_hash: string }>("map_access", {
    space_id: eq("space_id", id),
  });
  const salt = row?.salt || "missing-map-salt";
  const candidate = await passwordHash(password, salt);
  let different = 0;
  const expected = row?.password_hash || "0".repeat(64);
  for (let i = 0; i < 64; i++) different |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  if (!row || different) throw new AccessError(401, "编辑口令不正确");
  return beginSession(req, row.user_id);
}
