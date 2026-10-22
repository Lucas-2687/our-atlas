import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { asRole, blockNetwork, createDatabase, migrate, migrations, tables } from "./helpers/database.mjs";

let networkAttempts;
before(() => { networkAttempts = blockNetwork(mock); });
after(() => {
  mock.restoreAll();
  assert.deepEqual(networkAttempts, []);
});

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const mapArguments = (id) => [id, "合成地图", JSON.stringify(["合成甲", "合成乙"]), `map:${id}`, "合成甲 & 合成乙", "synthetic-salt", "synthetic-hash"];
const initializeSql = "select public.initialize_site_map($1, $2, $3, $4, $5, $6, $7)";

async function database(t, through) {
  const db = await createDatabase(through);
  t.after(() => db.close());
  return db;
}

async function seedMap(db, id = firstId) {
  await db.query("select public.create_travel_space($1, $2, $3, $4, $5, $6, $7)", mapArguments(id));
}

async function snapshot(db, names) {
  const entries = [];
  for (const name of names) entries.push([name, (await db.query(`select * from public.${name} order by 1`)).rows]);
  return Object.fromEntries(entries);
}

async function seedStorage(db, isPublic) {
  await db.exec(`
    alter table storage.buckets add column file_size_limit bigint;
    alter table storage.buckets add column allowed_mime_types text[];
    create table storage.objects (
      id text primary key, bucket_id text references storage.buckets(id),
      name text not null, body bytea not null, metadata jsonb not null
    );
  `);
  await db.query("insert into storage.buckets values ('travel-photos', 'retained-bucket-name', $1, 123456, array['image/jpeg'])", [isPublic]);
  await db.exec(`
    insert into storage.objects values (
      'synthetic-photo', 'travel-photos', '${firstId}/retained.jpg',
      decode('000102feff', 'hex'), '{"synthetic":true}'
    );
  `);
}

async function storageSnapshot(db) {
  return {
    buckets: (await db.query("select * from storage.buckets order by id")).rows,
    objects: (await db.query("select id, bucket_id, name, encode(body, 'hex') as bytes, metadata from storage.objects order by id")).rows,
  };
}

test("fresh install executes all five real migrations and creates the private schema and RPCs", async (t) => {
  const files = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual(files, migrations);
  const db = await database(t);
  const schema = await db.query("select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename");
  assert.deepEqual(schema.rows.map((row) => row.tablename), [...tables].sort());
  assert.ok(schema.rows.every((row) => row.rowsecurity));
  const functions = await db.query(`
    select p.proname, p.prosecdef, p.proconfig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    order by p.proname
  `);
  assert.deepEqual(functions.rows.map((row) => row.proname), [
    "change_travel_map_password", "consume_map_access_limit", "create_travel_space", "initialize_site_map",
  ]);
  for (const row of functions.rows) {
    assert.equal(row.prosecdef, true);
    assert.deepEqual(row.proconfig, ["search_path=public"]);
  }
  assert.deepEqual((await db.query("select * from storage.buckets")).rows, [{ id: "travel-photos", name: "travel-photos", public: false }]);
  assert.equal((await db.query("select * from public.site_map")).rows.length, 0);
});

test("service initialization succeeds once, rolls back duplicates, and real RPCs retain their boundaries", async (t) => {
  const db = await database(t);
  await asRole(db, "service_role", initializeSql, mapArguments(firstId));
  const initialized = await snapshot(db, tables);
  assert.equal(initialized.spaces.length, 1);
  assert.equal(initialized.members[0].space_id, firstId);
  assert.equal(initialized.map_access[0].password_hash, "synthetic-hash");
  assert.deepEqual(initialized.site_map, [{ id: 1, space_id: firstId }]);
  await assert.rejects(asRole(db, "service_role", initializeSql, mapArguments(secondId)), /already exists/i);
  assert.deepEqual(await snapshot(db, tables), initialized);

  const expiration = Date.now() + 60_000;
  await db.query("insert into public.map_access_limits values ('expired', 9, 0)");
  for (const count of [1, 2]) {
    const result = await asRole(db, "service_role", "select public.consume_map_access_limit($1, $2) as attempts", ["synthetic-rate-key", expiration]);
    assert.equal(result.rows[0].attempts, count);
  }
  assert.equal((await db.query("select * from public.map_access_limits where id = 'expired'")).rows.length, 0);
  await db.query("insert into public.map_sessions values ('owner-session', $1, now() + interval '1 day'), ('unrelated-session', 'unrelated-user', now() + interval '1 day')", [`map:${firstId}`]);
  await asRole(db, "service_role", "select public.change_travel_map_password($1, $2, $3, $4)", [firstId, `map:${firstId}`, "new-synthetic-salt", "new-synthetic-hash"]);
  assert.deepEqual((await db.query("select token_hash from public.map_sessions")).rows, [{ token_hash: "unrelated-session" }]);
  assert.equal((await db.query("select password_hash from public.map_access")).rows[0].password_hash, "new-synthetic-hash");
});

test("upgrading a single existing map preserves records, credentials, private bucket settings and photo bytes", async (t) => {
  const db = await database(t, 2);
  await seedMap(db);
  const photos = JSON.stringify([{ key: `${firstId}/retained.jpg` }]);
  await db.query('insert into public.trips (space_id, title, precision, story, places, photos) values ($1, $2, $3, $4, $5, $6)', [firstId, "合成旧旅行", "unknown", "保留这段合成故事", JSON.stringify([{ id: "synthetic-place" }]), photos]);
  await db.query("insert into public.shares (token_hash, space_id, scope, audience) values ('synthetic-old-share', $1, '\"all\"', 'link')", [firstId]);
  await db.query("insert into public.map_sessions values ('synthetic-old-session', $1, now() + interval '1 day')", [`map:${firstId}`]);
  await seedStorage(db, false);
  const records = await snapshot(db, tables.filter((name) => name !== "site_map"));
  const stored = await storageSnapshot(db);
  await migrate(db, migrations.slice(2));
  await migrate(db, [migrations[2], migrations[4]]);
  assert.deepEqual(await snapshot(db, Object.keys(records)), records);
  assert.deepEqual((await db.query("select * from public.site_map")).rows, [{ id: 1, space_id: firstId }]);
  assert.deepEqual(await storageSnapshot(db), stored);
});

test("an ambiguous existing installation is never silently bound or initialized over", async (t) => {
  const db = await database(t, 2);
  await seedMap(db, firstId);
  await seedMap(db, secondId);
  const records = await snapshot(db, ["spaces", "members", "map_access"]);
  await migrate(db, migrations.slice(2));
  assert.deepEqual((await db.query("select * from public.site_map")).rows, []);
  await assert.rejects(asRole(db, "service_role", initializeSql, mapArguments("33333333-3333-4333-8333-333333333333")), /already exists/i);
  await db.query("insert into public.site_map values (1, $1)", [secondId]);
  await migrate(db, [migrations[2]]);
  assert.deepEqual((await db.query("select * from public.site_map")).rows, [{ id: 1, space_id: secondId }]);
  assert.deepEqual(await snapshot(db, Object.keys(records)), records);
});

test("a pre-existing public photo bucket stops migration without changing its access or photos", async (t) => {
  const db = await database(t, 4);
  await seedStorage(db, true);
  const beforeMigration = await storageSnapshot(db);
  await assert.rejects(migrate(db, [migrations[4]]), /travel-photos is public/i);
  assert.deepEqual(await storageSnapshot(db), beforeMigration);
});

test("anonymous and authenticated SQL roles cannot read, write or execute server RPCs", async (t) => {
  const db = await database(t);
  const grants = await db.query(`
    select role_name, tablename, permission,
      has_table_privilege(role_name, format('public.%I', tablename), permission) as allowed
    from pg_tables
    cross join unnest(array['anon', 'authenticated', 'service_role']) as role_name
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as permission
    where schemaname = 'public'
  `);
  assert.equal(grants.rows.length, tables.length * 3 * 4);
  for (const row of grants.rows) assert.equal(row.allowed, row.role_name === "service_role", `${row.role_name} ${row.permission} ${row.tablename}`);
  const functions = await db.query(`
    select p.proname, role_name, has_function_privilege(role_name, p.oid, 'EXECUTE') as allowed
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join unnest(array['anon', 'authenticated', 'service_role']) as role_name
    where n.nspname = 'public'
  `);
  assert.equal(functions.rows.length, 4 * 3);
  for (const row of functions.rows) assert.equal(row.allowed, row.role_name === "service_role", `${row.role_name} ${row.proname}`);
  for (const role of ["anon", "authenticated"]) {
    for (const [sql, parameters] of [
      ["select * from public.map_access", []],
      ["insert into public.spaces (title, names) values ('forbidden', '[]')", []],
      [initializeSql, mapArguments(firstId)],
      ["select public.consume_map_access_limit('forbidden', 1)", []],
    ]) await assert.rejects(asRole(db, role, sql, parameters), (error) => error.code === "42501");
  }
  await asRole(db, "service_role", initializeSql, mapArguments(firstId));
  assert.equal((await asRole(db, "service_role", "select * from public.spaces")).rows.length, 1);
});
