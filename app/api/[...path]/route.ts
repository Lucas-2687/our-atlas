import { AccessError, beginSession, digest, endSession, mapUser, passwordHash, randomSecret, rateLimit, unlock, validPassword } from "../../../lib/map-access";
import { deleteRows, eq, insertRows, oneRow, selectRows, storageRequest, supabaseRest, SupabaseConfigError, updateRows } from "../../../lib/supabase-server";
import { siteMapId, validSetupKey } from "../../../lib/site-map";
import { PhotoUploadError, preparePhotoUpload } from "../../../lib/photo-upload.mjs";
import type { Photo, Place, Trip } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const now = () => new Date().toISOString();
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, "0")).join("");

function str(value: unknown, max: number, optional = false) {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim())) {
    throw new ApiError(400, "请检查填写的内容");
  }
  return value.trim();
}

async function body(req: Request) {
  const text = await req.text();
  if (text.length > 100000) throw new ApiError(413, "记录内容太长，请缩短后保存");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "提交内容无法读取");
  }
}

function jsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function identity(req: Request) {
  const user = await mapUser(req);
  if (!user) throw new ApiError(401, "请在编辑页面验证口令后再操作");
  return user;
}

async function membership(req: Request) {
  const user = await identity(req);
  const member = await oneRow<any>("members", { user_id: eq("user_id", user.userId) });
  if (!member || member.space_id !== await siteMapId()) throw new ApiError(403, "没有这张地图的编辑权限");
  return { user, member };
}

function rowTrip(row: any): Trip {
  return {
    id: row.id,
    title: row.title,
    precision: row.precision,
    start: row.start,
    end: row.end,
    story: row.story,
    places: jsonColumn<Place[]>(row.places, []),
    photos: jsonColumn<Photo[]>(row.photos, []),
    createdAt: row.created_at,
  };
}

async function spaceAtlas(spaceId: string, includeMembers = false) {
  const space = await oneRow<any>("spaces", { id: eq("id", spaceId) });
  if (!space) throw new ApiError(404, "地图不存在");
  const [tripRows, members] = await Promise.all([
    selectRows<any>("trips", { space_id: eq("space_id", spaceId) }),
    includeMembers ? selectRows<any>("members", { space_id: eq("space_id", spaceId), order: "slot.asc" }) : Promise.resolve([]),
  ]);
  const trips = tripRows.map(rowTrip).sort((a, b) => {
    const aDate = a.start || a.createdAt;
    const bDate = b.start || b.createdAt;
    return bDate.localeCompare(aDate);
  });
  return {
    space: { id: space.id, title: space.title, names: jsonColumn<string[]>(space.names, []) },
    trips,
    members: members.map((member) => ({ displayName: member.display_name, slot: member.slot })),
  };
}

function validateDate(value: string, precision: string) {
  if (!value) return;
  if (precision === "unknown") throw new ApiError(400, "日期不确定时请留空");
  const valid = precision === "year"
    ? /^\d{4}$/
    : precision === "month"
      ? /^\d{4}-(0[1-9]|1[0-2])$/
      : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!valid.test(value) || +value.slice(0, 4) < 1900 || +value.slice(0, 4) > 2100) {
    throw new ApiError(400, "请填写有效的旅行日期");
  }
  if (precision === "day" && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "这一天不存在，请检查日期");
  }
}

function validateTrip(input: any, spaceId: string) {
  const precision = input.precision;
  if (!["day", "month", "year", "unknown"].includes(precision)) throw new ApiError(400, "请选择日期精度");
  const start = str(input.start ?? "", 10, true);
  const end = str(input.end ?? "", 10, true);
  validateDate(start, precision);
  validateDate(end, precision);
  if (end && !start) throw new ApiError(400, "请先填写开始日期");
  if (start && end && end < start) throw new ApiError(400, "结束日期不能早于开始日期");
  if (!Array.isArray(input.places) || input.places.length < 1 || input.places.length > 60) {
    throw new ApiError(400, "请添加至少一个去过的地方，最多 60 个");
  }
  const places: Place[] = input.places.map((place: any) => {
    const country = str(place.country, 3);
    if (!/^[A-Z]{3}$/.test(country) || !["country", "province", "city"].includes(place.kind)) {
      throw new ApiError(400, "地点信息不完整");
    }
    const lat = place.lat ?? null;
    const lng = place.lng ?? null;
    if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) ||
      (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180)) || (lat === null) !== (lng === null)) {
      throw new ApiError(400, "地点坐标无效");
    }
    return {
      id: str(place.id, 180),
      name: str(place.name, 100),
      kind: place.kind,
      country,
      ...(place.province ? { province: str(place.province, 30) } : {}),
      lat,
      lng,
    };
  });
  if (new Set(places.map((place) => place.id)).size !== places.length) throw new ApiError(400, "同一个地点不用重复添加");
  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length > 12) throw new ApiError(400, "每次旅行最多添加 12 张照片");
  const safePhotos = photos.map((photo: any) => {
    const key = str(photo.key, 160);
    if (!key.startsWith(`${spaceId}/`) || !/^[-\w/]+\.(jpg|png|webp)$/.test(key)) {
      throw new ApiError(400, "照片不属于你们的地图");
    }
    return { key };
  });
  return {
    title: str(input.title || `${places[0].name}的共同旅行`, 120),
    precision,
    start,
    end,
    story: str(input.story ?? "", 10000, true),
    places,
    photos: safePhotos,
  };
}

async function resolveShare(raw: string, req: Request) {
  if (!/^[a-f0-9]{48}$/.test(raw)) throw new ApiError(404, "分享链接不存在");
  const share = await oneRow<any>("shares", { token_hash: eq("token_hash", await digest(raw)) });
  if (!share || share.revoked || (share.expires_at && share.expires_at <= now())) {
    throw new ApiError(410, "分享链接已失效，请让分享者生成新链接");
  }
  if (share.audience === "invited") {
    const user = await mapUser(req);
    if (!user) throw new ApiError(401, "这个分享仅限地图成员，请先打开你们的地图");
    const emails = jsonColumn<string[]>(share.emails, []);
    const member = await oneRow<any>("members", { user_id: eq("user_id", user.userId) });
    if (!emails.includes(user.email.toLowerCase()) && member?.space_id !== share.space_id) {
      throw new ApiError(403, "当前账号不在这次分享的邀请名单中");
    }
  }
  const atlas = await spaceAtlas(share.space_id);
  const scope = jsonColumn<string[] | "all">(share.scope, "all");
  const selected = scope === "all" ? atlas.trips : atlas.trips.filter((trip) => scope.includes(trip.id));
  return { share, atlas: { user: null, readonly: true, space: atlas.space, trips: selected } };
}

async function handle(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean).slice(1);
    const method = req.method;
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin) throw new ApiError(403, "请从当前网站提交操作");
    }

    if (path[0] === "auth" && path[1] === "open" && method === "POST") {
      const input = await body(req);
      const id = await siteMapId();
      if (!id) throw new ApiError(409, "请先初始化网站地图");
      const password = validPassword(input.password);
      const session = await unlock(req, id, password);
      const response = json({ ok: true });
      response.headers.set("Set-Cookie", session);
      return response;
    }

    if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
      const response = json({ ok: true });
      response.headers.set("Set-Cookie", await endSession(req));
      return response;
    }

    if (path[0] === "auth" && path[1] === "password" && method === "POST") {
      const { user, member } = await membership(req);
      const input = await body(req);
      const password = validPassword(input.password);
      await rateLimit(req);
      const salt = randomSecret();
      const value = await passwordHash(password, salt);
      await supabaseRest("rpc/change_travel_map_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_space_id: member.space_id, p_user_id: user.userId, p_salt: salt, p_password_hash: value }),
      });
      const response = json({ ok: true });
      response.headers.set("Set-Cookie", await beginSession(req, user.userId));
      return response;
    }

    if (["atlas", "public-atlas"].includes(path[0]) && method === "GET") {
      const id = await siteMapId();
      const publicView = path[0] === "public-atlas";
      if (!id) return json({ user: null, readonly: true, space: null, trips: [], setupAvailable: !publicView && (process.env.ATLAS_SETUP_KEY?.length || 0) >= 12 });
      const atlas = await spaceAtlas(id);
      const user = publicView ? null : await mapUser(req);
      const member = user ? await oneRow<any>("members", { user_id: eq("user_id", user.userId) }) : null;
      const editor = member?.space_id === id;
      return json({ user: editor ? user : null, readonly: !editor, space: atlas.space, trips: atlas.trips, accessConfigured: true });
    }

    if (path[0] === "space" && method === "POST") {
      await rateLimit(req);
      const input = await body(req);
      if (await siteMapId()) throw new ApiError(409, "网站地图已经建立，请输入编辑口令");
      if (!await validSetupKey(input.setupKey)) throw new ApiError(403, "初始化密钥不正确，请检查部署设置");
      const password = validPassword(input.password);
      const names = [str(input.names?.[0] || "我", 24), str(input.names?.[1] || "你", 24)];
      const title = str(input.title || "我们的同行地图", 80);
      const id = crypto.randomUUID();
      const userId = `map:${id}`;
      const salt = randomSecret();
      const value = await passwordHash(password, salt);
      await supabaseRest("rpc/initialize_site_map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_id: id, p_title: title, p_names: names, p_user_id: userId, p_display_name: names.join(" & "), p_salt: salt, p_password_hash: value }),
      });
      const response = json({ ok: true, id }, 201);
      response.headers.set("Set-Cookie", await beginSession(req, userId));
      return response;
    }

    if (path[0] === "space" && method === "PATCH") {
      const { member } = await membership(req);
      const input = await body(req);
      const names = [str(input.names?.[0], 24), str(input.names?.[1], 24)];
      const title = str(input.title, 80);
      await updateRows("spaces", { id: eq("id", member.space_id) }, { title, names });
      return json({ ok: true });
    }

    if (path[0] === "trips") {
      const { member } = await membership(req);
      const id = path[1];
      if (method === "POST" && !id) {
        const trip = validateTrip(await body(req), member.space_id);
        const tripId = crypto.randomUUID();
        await insertRows("trips", {
          id: tripId,
          space_id: member.space_id,
          title: trip.title,
          precision: trip.precision,
          start: trip.start,
          end: trip.end,
          story: trip.story,
          places: trip.places,
          photos: trip.photos,
          created_at: now(),
        });
        return json({ id: tripId }, 201);
      }
      if (id && (method === "PATCH" || method === "DELETE")) {
        const owned = await oneRow("trips", { id: eq("id", id), space_id: eq("space_id", member.space_id) });
        if (!owned) throw new ApiError(404, "旅行记录不存在");
        if (method === "DELETE") {
          await deleteRows("trips", { id: eq("id", id), space_id: eq("space_id", member.space_id) });
          return json({ ok: true });
        }
        const trip = validateTrip(await body(req), member.space_id);
        await updateRows("trips", { id: eq("id", id), space_id: eq("space_id", member.space_id) }, {
          title: trip.title,
          precision: trip.precision,
          start: trip.start,
          end: trip.end,
          story: trip.story,
          places: trip.places,
          photos: trip.photos,
        });
        return json({ ok: true });
      }
    }

    if (path[0] === "media" && method === "POST") {
      const { member } = await membership(req);
      const photo = await preparePhotoUpload(req);
      const key = `${member.space_id}/${crypto.randomUUID()}.${photo.extension}`;
      const uploaded = await storageRequest(key, {
        method: "POST",
        headers: { "Content-Type": photo.contentType, "x-upsert": "false" },
        body: new Blob([photo.bytes], { type: photo.contentType }),
      });
      if (!uploaded.ok) {
        const detail = await uploaded.text();
        console.error("Supabase Storage upload failed", uploaded.status, detail);
        throw new ApiError(503, "照片暂时没能保存，请稍后重试");
      }
      return json({ key }, 201);
    }

    if (path[0] === "media" && method === "GET") {
      const key = path.slice(1).join("/");
      if (!/^[-\w/]+\.(jpg|png|webp)$/.test(key)) throw new ApiError(404, "照片不存在");
      let permitted = false;
      const raw = url.searchParams.get("share");
      if (raw) {
        const { atlas } = await resolveShare(raw, req);
        permitted = atlas.trips.some((trip: any) => trip.photos.some((photo: any) => photo.key === key));
      } else {
        const id = await siteMapId();
        if (id && key.startsWith(`${id}/`)) {
          const attached = await oneRow("trips", { space_id: eq("space_id", id), photos: `cs.${JSON.stringify([{ key }])}`, select: "id" });
          permitted = !!attached;
          if (!permitted) {
            const user = await mapUser(req);
            const member = user ? await oneRow<any>("members", { user_id: eq("user_id", user.userId) }) : null;
            permitted = member?.space_id === id;
          }
        }
      }
      if (!permitted) throw new ApiError(403, "无法查看这张照片");
      const photo = await storageRequest(key);
      if (!photo.ok) {
        if (photo.status !== 404) console.error("Supabase Storage download failed", photo.status, await photo.text());
        throw new ApiError(photo.status === 404 ? 404 : 503, photo.status === 404 ? "照片不存在" : "照片暂时无法读取");
      }
      return new Response(photo.body, {
        headers: {
          "Content-Type": photo.headers.get("Content-Type") || "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (path[0] === "shares") {
      const { member } = await membership(req);
      if (method === "GET") {
        const shares = await selectRows<any>("shares", {
          space_id: eq("space_id", member.space_id),
          select: "id,scope,audience,expires_at,revoked,created_at",
          order: "created_at.desc",
        });
        return json(shares.map((share) => ({
          id: share.id,
          scope: share.scope,
          audience: share.audience,
          expiresAt: share.expires_at,
          revoked: share.revoked,
          createdAt: share.created_at,
        })));
      }
      if (method === "POST" && path[1]) {
        await updateRows("shares", { id: eq("id", path[1]), space_id: eq("space_id", member.space_id) }, { revoked: true });
        return json({ ok: true });
      }
      if (method === "POST") {
        const input = await body(req);
        const atlas = await spaceAtlas(member.space_id);
        let scope: string[] | "all" = input.scope;
        if (scope !== "all") {
          if (!Array.isArray(scope) || !scope.length || scope.length > 100 || scope.some((tripId: string) => !atlas.trips.some((trip) => trip.id === tripId))) {
            throw new ApiError(400, "请选要分享的旅行");
          }
          scope = [...new Set(scope)];
        }
        const days = Number(input.days);
        if (![0, 1, 7, 30].includes(days)) throw new ApiError(400, "请选择有效期");
        const audience = input.audience;
        if (!["link", "invited"].includes(audience)) throw new ApiError(400, "请选择访问方式");
        const emails: string[] = Array.isArray(input.emails)
          ? Array.from(new Set<string>((input.emails as unknown[]).map((email) => str(email, 160).toLowerCase())))
          : [];
        if (emails.length > 20 || emails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) throw new ApiError(400, "请检查分享设置");
        const raw = token();
        const id = crypto.randomUUID();
        const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
        await insertRows("shares", {
          id,
          token_hash: await digest(raw),
          space_id: member.space_id,
          scope,
          audience,
          emails,
          expires_at: expiresAt,
          revoked: false,
          created_at: now(),
        });
        return json({ id, token: raw, url: `${url.origin}/share/${raw}`, expiresAt }, 201);
      }
    }

    if (path[0] === "shared" && method === "GET") {
      const { atlas } = await resolveShare(path[1] || "", req);
      return json(atlas);
    }

    if (path[0] === "invite" && method === "POST") throw new ApiError(410, "请使用编辑地址和口令与伴侣共同记录");
    if (path[0] === "join" && method === "POST") throw new ApiError(410, "旧邀请已停用，请向伴侣索取编辑口令");
    throw new ApiError(404, "没有找到这个操作");
  } catch (error) {
    if (error instanceof ApiError || error instanceof AccessError || error instanceof PhotoUploadError) return json({ error: error.message }, error.status);
    if (error instanceof SupabaseConfigError) return json({ error: error.message }, 503);
    console.error("Atlas API error", error);
    return json({ error: "暂时没能完成操作，请稍后再试" }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
