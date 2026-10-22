import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, Script } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as photoUpload from "../../lib/photo-upload.mjs";
import { asRole, createDatabase, tables } from "./database.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const databaseOrigin = "https://database.invalid";
const websiteOrigin = "https://atlas.invalid";
export const setupKey = "synthetic-only-setup-key";
export const password = "synthetic-only-edit-password";

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsupported mock identifier: ${value}`);
  return `"${value}"`;
}

// This intentionally small PostgREST/storage mock covers only requests used by the
// real server modules. It is not a substitute for testing hosted Supabase services.
export async function createAtlasHarness() {
  const db = await createDatabase();
  const storage = new Map();
  const uploads = [];
  const calls = [];
  const failures = [];
  const diagnostics = [];
  const columns = new Map(tables.map((table) => [table, new Map()]));
  const schema = await db.query("select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'");
  for (const column of schema.rows) columns.get(column.table_name)?.set(column.column_name, column.data_type);

  const rpcArguments = {
    consume_map_access_limit: ["p_id", "p_expires_at"],
    initialize_site_map: ["p_id", "p_title", "p_names", "p_user_id", "p_display_name", "p_salt", "p_password_hash"],
    change_travel_map_password: ["p_space_id", "p_user_id", "p_salt", "p_password_hash"],
  };

  async function databaseRequest(request, url) {
    const path = url.pathname.slice("/rest/v1/".length);
    if (path.startsWith("rpc/")) {
      const name = path.slice(4);
      const arguments_ = rpcArguments[name];
      if (!arguments_ || request.method !== "POST") throw new Error(`Unsupported mock RPC: ${path}`);
      const input = await request.json();
      if (Object.keys(input).length !== arguments_.length || arguments_.some((key) => !(key in input))) {
        throw new Error(`Unexpected mock RPC arguments: ${name}`);
      }
      const values = arguments_.map((key) => key === "p_names" ? JSON.stringify(input[key]) : input[key]);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      const result = await asRole(db, "service_role", `select public.${identifier(name)}(${placeholders}) as result`, values);
      return Response.json(result.rows[0].result);
    }

    const fields = columns.get(path);
    if (!fields) throw new Error(`Unsupported mock table: ${path}`);
    const column = (name) => {
      if (!fields.has(name)) throw new Error(`Unsupported mock column: ${path}.${name}`);
      return identifier(name);
    };
    const values = [];
    const parameter = (value) => { values.push(value); return `$${values.length}`; };
    const conditions = [];
    for (const [key, filter] of url.searchParams) {
      if (["select", "order", "limit"].includes(key)) continue;
      const dot = filter.indexOf(".");
      const operation = { eq: "=", gt: ">", cs: "@>" }[filter.slice(0, dot)];
      if (!operation) throw new Error(`Unsupported mock filter: ${filter}`);
      conditions.push(`${column(key)} ${operation} ${parameter(filter.slice(dot + 1))}`);
    }
    const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
    const table = `public.${identifier(path)}`;
    const encode = (key, value) => fields.get(key) === "jsonb" ? JSON.stringify(value) : value;
    let result;
    if (request.method === "GET") {
      const selection = url.searchParams.get("select") || "*";
      const projection = selection === "*" ? "*" : selection.split(",").map(column).join(", ");
      let suffix = "";
      if (url.searchParams.has("order")) {
        const [name, direction] = url.searchParams.get("order").split(".");
        if (!["asc", "desc"].includes(direction)) throw new Error("Unsupported mock ordering");
        suffix += ` order by ${column(name)} ${direction}`;
      }
      if (url.searchParams.has("limit")) {
        const limit = url.searchParams.get("limit");
        if (!/^\d+$/.test(limit)) throw new Error("Unsupported mock limit");
        suffix += ` limit ${parameter(Number(limit))}`;
      }
      result = await asRole(db, "service_role", `select ${projection} from ${table}${where}${suffix}`, values);
    } else if (request.method === "POST") {
      const input = await request.json();
      const rows = Array.isArray(input) ? input : [input];
      if (conditions.length || rows.length !== 1) throw new Error("Unsupported mock insert");
      const keys = Object.keys(rows[0]);
      const placeholders = keys.map((key) => parameter(encode(key, rows[0][key])));
      result = await asRole(db, "service_role", `insert into ${table} (${keys.map(column).join(", ")}) values (${placeholders.join(", ")}) returning *`, values);
    } else if (request.method === "PATCH") {
      const input = await request.json();
      const assignments = Object.entries(input).map(([key, value]) => `${column(key)} = ${parameter(encode(key, value))}`);
      result = await asRole(db, "service_role", `update ${table} set ${assignments.join(", ")}${where} returning *`, values);
    } else if (request.method === "DELETE") {
      result = await asRole(db, "service_role", `delete from ${table}${where} returning *`, values);
    } else {
      throw new Error(`Unsupported mock method: ${request.method}`);
    }
    return request.headers.get("Prefer")?.includes("return=minimal") ? new Response(null, { status: 204 }) : Response.json(result.rows);
  }

  async function offlineFetch(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== databaseOrigin) throw new Error(`Offline mock rejects unknown origin: ${url.origin}`);
    if (request.headers.get("apikey") !== "offline-test-key") throw new Error("Missing mock service credential");
    calls.push({ method: request.method, path: url.pathname });
    try {
      if (url.pathname.startsWith("/rest/v1/")) return await databaseRequest(request, url);
      const prefix = "/storage/v1/object/travel-photos/";
      if (!url.pathname.startsWith(prefix)) throw new Error(`Unsupported mock endpoint: ${url.pathname}`);
      const key = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
      if (request.method === "POST") {
        if (storage.has(key) && request.headers.get("x-upsert") !== "true") return new Response(null, { status: 409 });
        const photo = { bytes: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type") };
        storage.set(key, photo);
        uploads.push({ key, ...photo });
        return Response.json({ Key: key });
      }
      if (request.method !== "GET") throw new Error(`Unsupported mock storage method: ${request.method}`);
      const photo = storage.get(key);
      return photo ? new Response(photo.bytes, { headers: { "Content-Type": photo.contentType } }) : new Response(null, { status: 404 });
    } catch (error) {
      failures.push(error.message);
      return Response.json({ message: error.message }, { status: 500 });
    }
  }

  const context = createContext({
    Request, Response, Headers, FormData, File, Blob, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Buffer, crypto: webcrypto,
    fetch: offlineFetch,
    process: { env: { SUPABASE_URL: databaseOrigin, SUPABASE_SECRET_KEY: "offline-test-key", ATLAS_SETUP_KEY: setupKey } },
    console: { error: (...args) => diagnostics.push(args.map(String).join(" ")) },
  });
  const filenames = ["lib/supabase-server.ts", "lib/map-access.ts", "lib/site-map.ts", "app/api/[...path]/route.ts"]
    .map((name) => resolve(root, ...name.split("/")));
  const allowed = new Set(filenames);
  const cache = new Map([[resolve(root, "lib", "photo-upload.mjs"), photoUpload]]);
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    if (!allowed.has(filename)) throw new Error(`Offline loader rejects module: ${filename}`);
    const moduleRecord = { exports: {} };
    cache.set(filename, moduleRecord.exports);
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    });
    const require = (specifier) => {
      if (!specifier.startsWith(".")) throw new Error(`Offline loader rejects import: ${specifier}`);
      let target = resolve(dirname(filename), specifier);
      if (!extname(target)) target += ".ts";
      return load(target);
    };
    new Script(`(function(require, module, exports) {\n${outputText}\n})`, { filename })
      .runInContext(context)(require, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }
  const api = load(filenames[3]);
  return {
    db, storage, uploads, calls, failures, diagnostics, fetch: offlineFetch,
    access: load(filenames[1]), siteMap: load(filenames[2]),
    request(path, { method = "GET", cookie, data, form, headers } = {}) {
      const requestHeaders = new Headers(headers);
      if (cookie) requestHeaders.set("Cookie", cookie);
      if (data !== undefined) requestHeaders.set("Content-Type", "application/json");
      const request = new Request(`${websiteOrigin}/api/${path}`, {
        method, headers: requestHeaders, body: form || (data === undefined ? undefined : JSON.stringify(data)),
      });
      return api[method](request);
    },
    async reset() {
      await db.exec(`truncate ${tables.map((table) => `public.${identifier(table)}`).join(", ")} cascade`);
      storage.clear();
      for (const log of [uploads, calls, failures, diagnostics]) log.length = 0;
    },
    close: () => db.close(),
  };
}
