import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { PGlite } from "@electric-sql/pglite";

export const migrations = [
  "0001_initial_schema.sql",
  "0002_vercel_functions.sql",
  "0003_single_site_map.sql",
  "0004_server_table_privileges.sql",
  "0005_private_photo_bucket.sql",
];

export const tables = [
  "spaces", "members", "trips", "shares", "invites", "map_access",
  "map_sessions", "map_access_limits", "site_map",
];

export async function migrate(db, names = migrations) {
  for (const name of names) {
    const sql = await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
    await db.exec(sql);
  }
}

export async function createDatabase(through = migrations.length) {
  const db = new PGlite();
  try {
    // Supabase supplies these roles and storage schema; no hosted service is contacted.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      grant usage on schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false
      );
    `);
    await migrate(db, migrations.slice(0, through));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export function asRole(db, role, sql, parameters = []) {
  if (!["anon", "authenticated", "service_role"].includes(role)) throw new Error("Unknown test role");
  return db.transaction(async (transaction) => {
    await transaction.exec(`set local role ${role}`);
    return transaction.query(sql, parameters);
  });
}

export function blockNetwork(mock) {
  const attempts = [];
  const deny = (name) => (...args) => {
    attempts.push(name);
    throw new Error(`Offline tests forbid network access: ${name} ${String(args[0])}`);
  };
  mock.method(globalThis, "fetch", async (...args) => deny("fetch")(...args));
  for (const [transport, methods] of [
    [http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [tls, ["connect"]],
    [dgram, ["createSocket"]],
  ]) {
    for (const method of methods) mock.method(transport, method, deny(method));
  }
  return attempts;
}
