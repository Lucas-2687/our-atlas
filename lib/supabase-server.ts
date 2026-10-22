const STORAGE_BUCKET = "travel-photos";

export class SupabaseConfigError extends Error {
  constructor() {
    super("请先在部署设置中填写 Supabase 服务地址和服务密钥");
  }
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SupabaseConfigError();
  return { url, key };
}

function headers(extra?: HeadersInit) {
  const { key } = config();
  const result = new Headers(extra);
  result.set("apikey", key);
  if (key.startsWith("sb_secret_")) result.delete("Authorization");
  else result.set("Authorization", `Bearer ${key}`);
  return result;
}

export async function supabaseRest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("Supabase Data API request failed", response.status, text);
    throw new Error("数据库暂时无法完成这项操作");
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function storageRequest(
  key: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url } = config();
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${encodedKey}`, {
    ...init,
    headers: headers(init.headers),
    cache: "no-store",
  });
}

export function eq(field: string, value: string | number | boolean) {
  return `eq.${value}`;
}

export function restPath(table: string, filters: Record<string, string>) {
  const query = new URLSearchParams({ select: "*", ...filters });
  return `${table}?${query.toString()}`;
}

export async function selectRows<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, string>,
): Promise<T[]> {
  return supabaseRest<T[]>(restPath(table, filters));
}

export async function insertRows<T = Record<string, unknown>>(
  table: string,
  rows: unknown | unknown[],
): Promise<T[]> {
  return supabaseRest<T[]>(table, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
}

export async function updateRows(
  table: string,
  filters: Record<string, string>,
  values: unknown,
): Promise<void> {
  const query = new URLSearchParams(filters);
  await supabaseRest(`${table}?${query.toString()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
}

export async function deleteRows(
  table: string,
  filters: Record<string, string>,
): Promise<void> {
  const query = new URLSearchParams(filters);
  await supabaseRest(`${table}?${query.toString()}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export async function oneRow<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, string>,
): Promise<T | null> {
  const rows = await selectRows<T>(table, { ...filters, limit: "1" });
  return rows[0] ?? null;
}
