import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, mock, test } from "node:test";
import sharp from "sharp";
import { blockNetwork } from "./helpers/database.mjs";
import { createAtlasHarness, password, setupKey } from "./helpers/atlas-harness.mjs";

const trip = (changes = {}) => ({
  title: "合成旅行记录", precision: "day", start: "2025-04-12", end: "2025-04-13",
  story: "这是一段只在内存中保存的合成故事。",
  places: [{ id: "synthetic-place", name: "合成地点", kind: "city", country: "CHN", lat: 20, lng: 30 }],
  photos: [], ...changes,
});

async function json(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

function cookie(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "a successful access operation must set a session cookie");
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /; Secure/);
  return value.split(";")[0];
}

describe("offline API with real route, access modules, photo processing and PostgreSQL", { concurrency: false }, () => {
  let atlas;
  let networkAttempts;
  before(async () => {
    networkAttempts = blockNetwork(mock);
    atlas = await createAtlasHarness();
  });
  beforeEach(async () => { await atlas.reset(); });
  afterEach(() => {
    assert.deepEqual(atlas.failures, [], "the REST/storage mock must understand every server request");
    assert.deepEqual(atlas.diagnostics, [], "unexpected errors from real server code must not be hidden");
    assert.deepEqual(networkAttempts, [], "no real network request is allowed");
  });
  after(async () => {
    try { await atlas?.close(); } finally { mock.restoreAll(); }
  });

  async function setup() {
    const response = await atlas.request("space", { method: "POST", data: { setupKey, password, title: "合成旅行地图", names: ["合成甲", "合成乙"] } });
    const session = cookie(response);
    const { id } = await json(response, 201);
    return { id, session };
  }

  async function saveTrip(session, input = trip()) {
    return (await json(await atlas.request("trips", { method: "POST", cookie: session, data: input }), 201)).id;
  }

  test("first setup is guarded and happens once; password login and logout use real hashed sessions", async () => {
    await assert.rejects(atlas.fetch("https://unknown.invalid/rest/v1/spaces"), /rejects unknown origin/);
    const emptyPublic = await json(await atlas.request("public-atlas"));
    assert.equal(emptyPublic.space, null);
    assert.deepEqual(emptyPublic.trips, []);
    assert.equal(emptyPublic.readonly, true);
    assert.equal(emptyPublic.setupAvailable, false);
    assert.equal((await json(await atlas.request("atlas"))).setupAvailable, true);
    await json(await atlas.request("space", { method: "POST", data: { setupKey: "wrong-setup-key", password } }), 403);
    await json(await atlas.request("space", { method: "POST", data: { setupKey, password: "short" } }), 400);
    assert.equal((await atlas.db.query("select * from public.spaces")).rows.length, 0);

    const { id, session } = await setup();
    assert.equal(await atlas.siteMap.siteMapId(), id);
    const storedAccess = (await atlas.db.query("select * from public.map_access")).rows[0];
    assert.notEqual(storedAccess.password_hash, password);
    const rawSession = session.split("=")[1];
    const storedSession = (await atlas.db.query("select * from public.map_sessions")).rows[0];
    assert.notEqual(storedSession.token_hash, rawSession);
    assert.equal(storedSession.token_hash, await atlas.access.digest(rawSession));
    await json(await atlas.request("space", { method: "POST", data: { setupKey, password } }), 409);
    assert.equal((await atlas.db.query("select * from public.spaces")).rows.length, 1);
    await json(await atlas.request("auth/open", { method: "POST", data: { password: "incorrect-but-long-password" } }), 401);
    const login = await atlas.request("auth/open", { method: "POST", data: { password } });
    const loggedIn = cookie(login);
    await json(login);
    assert.notEqual(loggedIn, session);
    const editor = await json(await atlas.request("atlas", { cookie: loggedIn }));
    assert.equal(editor.readonly, false);
    assert.equal(editor.user.userId, `map:${id}`);
    const logout = await atlas.request("auth/logout", { method: "POST", cookie: loggedIn });
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    await json(logout);
    assert.equal((await json(await atlas.request("atlas", { cookie: loggedIn }))).readonly, true);
    assert.equal((await atlas.db.query("select * from public.map_sessions")).rows.length, 1);
  });

  test("anonymous, forged, expired and other-map sessions cannot write; foreign origins are refused", async () => {
    const { id, session } = await setup();
    const tripId = await saveTrip(session);
    const before = (await atlas.db.query("select * from public.trips")).rows;
    for (const [path, method, data] of [
      ["trips", "POST", trip()], [`trips/${tripId}`, "PATCH", trip({ title: "禁止修改" })],
      [`trips/${tripId}`, "DELETE"], ["media", "POST"],
      ["space", "PATCH", { title: "禁止修改", names: ["甲", "乙"] }],
      ["shares", "POST", { scope: "all", audience: "link", days: 1 }],
      ["auth/password", "POST", { password }],
    ]) await json(await atlas.request(path, { method, data }), 401);
    await json(await atlas.request("trips", { method: "POST", cookie: `atlas_session=${"0".repeat(48)}`, data: trip() }), 401);
    await json(await atlas.request("trips", { method: "POST", cookie: session, data: trip(), headers: { Origin: "https://other.invalid" } }), 403);
    assert.deepEqual((await atlas.db.query("select * from public.trips")).rows, before);
    assert.equal((await atlas.db.query("select title from public.spaces where id = $1", [id])).rows[0].title, "合成旅行地图");
    assert.equal((await atlas.db.query("select * from public.shares")).rows.length, 0);
    assert.equal(atlas.uploads.length, 0);

    const otherId = "99999999-9999-4999-8999-999999999999";
    await atlas.db.query("select public.create_travel_space($1, $2, $3, $4, $5, $6, $7)", [otherId, "另一张合成地图", '["丙","丁"]', `map:${otherId}`, "丙 & 丁", "synthetic-salt", "synthetic-hash"]);
    const otherCookie = (await atlas.access.beginSession(new Request("https://atlas.invalid"), `map:${otherId}`)).split(";")[0];
    await json(await atlas.request("trips", { method: "POST", cookie: otherCookie, data: trip() }), 403);
    await atlas.db.query("update public.map_sessions set expires_at = '2000-01-01T00:00:00Z'");
    await json(await atlas.request(`trips/${tripId}`, { method: "DELETE", cookie: session }), 401);
    assert.deepEqual((await atlas.db.query("select * from public.trips")).rows, before);
  });

  test("trip create, update and delete are reflected in saved records on the public homepage", async () => {
    const { session } = await setup();
    const firstInput = trip({ title: "确实保存的新旅行" });
    const first = await saveTrip(session, firstInput);
    const second = await saveTrip(session, trip({ title: "较早的合成旅行", start: "2024-01-01", end: "" }));
    for (const path of ["public-atlas", "atlas"]) {
      const publicAtlas = await json(await atlas.request(path));
      assert.equal(publicAtlas.user, null);
      assert.equal(publicAtlas.readonly, true);
      assert.deepEqual(publicAtlas.trips.map((row) => row.id), [first, second]);
      for (const field of ["title", "precision", "start", "end", "story", "places", "photos"]) assert.deepEqual(publicAtlas.trips[0][field], firstInput[field]);
      assert.equal(publicAtlas.space.title, "合成旅行地图");
    }
    const changed = trip({ title: "保存后的更新标题", story: "更新后保存在数据库中的合成故事" });
    await json(await atlas.request(`trips/${first}`, { method: "PATCH", cookie: session, data: changed }));
    let publicAtlas = await json(await atlas.request("public-atlas"));
    assert.equal(publicAtlas.trips[0].title, changed.title);
    assert.equal(publicAtlas.trips[0].story, changed.story);
    await json(await atlas.request(`trips/${second}`, { method: "DELETE", cookie: session }));
    publicAtlas = await json(await atlas.request("public-atlas"));
    assert.deepEqual(publicAtlas.trips.map((row) => row.id), [first]);
    assert.deepEqual((await atlas.db.query("select id, title, story from public.trips")).rows, [{ id: first, title: changed.title, story: changed.story }]);
    await json(await atlas.request(`trips/${second}`, { method: "DELETE", cookie: session }), 404);
  });

  test("storage receives only EXIF-free output; unlinked photos require editing access and linked photos are public", async () => {
    const { id, session } = await setup();
    const jpeg = await sharp({ create: { width: 12, height: 6, channels: 3, background: "#cc2244" } })
      .withExif({ IFD0: { Artist: "SYNTHETIC_ONLY_CAMERA" } }).jpeg().toBuffer();
    const original = Buffer.concat([jpeg, Buffer.from("SYNTHETIC_ONLY_TRAILING_PAYLOAD")]);
    assert.ok((await sharp(original).metadata()).exif);
    const form = new FormData();
    form.set("file", new File([original], "synthetic-photo.jpg", { type: "image/jpeg" }));
    const { key } = await json(await atlas.request("media", { method: "POST", cookie: session, form }), 201);
    assert.ok(key.startsWith(`${id}/`));
    assert.match(key, /\.jpg$/);
    assert.equal(atlas.uploads.length, 1);
    const saved = atlas.uploads[0];
    assert.equal(saved.key, key);
    assert.equal(saved.contentType, "image/jpeg");
    assert.notDeepEqual(saved.bytes, original);
    assert.equal(saved.bytes.includes(Buffer.from("SYNTHETIC_ONLY_CAMERA")), false);
    assert.equal(saved.bytes.includes(Buffer.from("SYNTHETIC_ONLY_TRAILING_PAYLOAD")), false);
    const metadata = await sharp(saved.bytes).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 12);
    assert.equal(metadata.height, 6);
    assert.equal(metadata.exif, undefined);
    await sharp(saved.bytes).raw().toBuffer();
    await json(await atlas.request(`media/${key}`), 403);
    const preview = await atlas.request(`media/${key}`, { cookie: session });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), saved.bytes);

    const linked = trip({ photos: [{ key }] });
    const tripId = await saveTrip(session, linked);
    assert.deepEqual((await json(await atlas.request("public-atlas"))).trips[0].photos, [{ key }]);
    const publicPhoto = await atlas.request(`media/${key}`);
    assert.equal(publicPhoto.status, 200);
    assert.deepEqual(Buffer.from(await publicPhoto.arrayBuffer()), saved.bytes);
    await json(await atlas.request(`trips/${tripId}`, { method: "PATCH", cookie: session, data: trip() }));
    await json(await atlas.request(`media/${key}`), 403);
    assert.equal((await atlas.request(`media/${key}`, { cookie: session })).status, 200);
    const reads = atlas.calls.filter((call) => call.path.startsWith("/storage/")).length;
    await json(await atlas.request("media/99999999-9999-4999-8999-999999999999/foreign.jpg", { cookie: session }), 403);
    assert.equal(atlas.calls.filter((call) => call.path.startsWith("/storage/")).length, reads);
  });

  test("share scope, revocation and expiry restrict share URLs while the saved homepage and attached photos stay public", async () => {
    const { id, session } = await setup();
    const key = `${id}/synthetic-shared.jpg`;
    const otherKey = `${id}/synthetic-other.jpg`;
    for (const photo of [key, otherKey]) atlas.storage.set(photo, { bytes: Buffer.from("synthetic-storage-object"), contentType: "image/jpeg" });
    const first = await saveTrip(session, trip({ photos: [{ key }] }));
    const second = await saveTrip(session, trip({ title: "另一段已公开旅行", start: "2024-01-01", end: "", photos: [{ key: otherKey }] }));
    const homepage = await json(await atlas.request("public-atlas"));
    const createShare = async () => json(await atlas.request("shares", { method: "POST", cookie: session, data: { scope: [first], audience: "link", days: 1 } }), 201);
    const share = await createShare();
    assert.equal(share.url, `https://atlas.invalid/share/${share.token}`);
    assert.ok(Date.parse(share.expiresAt) > Date.now());
    const storedShare = (await atlas.db.query("select * from public.shares where id = $1", [share.id])).rows[0];
    assert.notEqual(storedShare.token_hash, share.token);
    assert.equal(storedShare.token_hash, await atlas.access.digest(share.token));
    const shared = await json(await atlas.request(`shared/${share.token}`));
    assert.equal(shared.readonly, true);
    assert.deepEqual(shared.trips.map((row) => row.id), [first]);
    assert.equal((await atlas.request(`media/${key}?share=${share.token}`)).status, 200);
    await json(await atlas.request(`media/${otherKey}?share=${share.token}`), 403);
    assert.equal((await atlas.request(`media/${otherKey}`)).status, 200);

    await json(await atlas.request(`shares/${share.id}`, { method: "POST", cookie: session }));
    await json(await atlas.request(`shared/${share.token}`), 410);
    await json(await atlas.request(`media/${key}?share=${share.token}`), 410);
    assert.deepEqual(await json(await atlas.request("public-atlas")), homepage);
    assert.equal((await atlas.request(`media/${key}`)).status, 200);

    const expired = await createShare();
    await atlas.db.query("update public.shares set expires_at = '2000-01-01T00:00:00Z' where id = $1", [expired.id]);
    await json(await atlas.request(`shared/${expired.token}`), 410);
    await json(await atlas.request(`media/${key}?share=${expired.token}`), 410);
    assert.deepEqual(await json(await atlas.request("public-atlas")), homepage);
    assert.deepEqual(homepage.trips.map((row) => row.id), [first, second]);
    assert.equal((await atlas.request(`media/${key}`)).status, 200);
    await json(await atlas.request("shared/invalid-token"), 404);
  });

  test("changing the password revokes old sessions; the real access limiter rejects attempt sixteen", async () => {
    const { session } = await setup();
    const login = await atlas.request("auth/open", { method: "POST", data: { password } });
    const secondSession = cookie(login);
    await json(login);
    const replacement = "replacement-synthetic-edit-password";
    const changed = await atlas.request("auth/password", { method: "POST", cookie: session, data: { password: replacement } });
    const renewed = cookie(changed);
    await json(changed);
    assert.equal((await atlas.db.query("select * from public.map_sessions")).rows.length, 1);
    for (const old of [session, secondSession]) {
      assert.equal((await json(await atlas.request("atlas", { cookie: old }))).readonly, true);
      await json(await atlas.request("trips", { method: "POST", cookie: old, data: trip() }), 401);
    }
    assert.equal((await json(await atlas.request("atlas", { cookie: renewed }))).readonly, false);
    await json(await atlas.request("auth/open", { method: "POST", data: { password } }), 401);
    const reopened = await atlas.request("auth/open", { method: "POST", data: { password: replacement } });
    cookie(reopened);
    await json(reopened);

    const request = new Request("https://atlas.invalid/api/auth/open", { headers: { "x-real-ip": "192.0.2.123" } });
    for (let attempt = 0; attempt < 15; attempt++) await atlas.access.rateLimit(request);
    await assert.rejects(atlas.access.rateLimit(request), (error) => error instanceof atlas.access.AccessError && error.status === 429);
  });
});
