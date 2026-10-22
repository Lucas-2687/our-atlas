import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import shapefile from "shapefile";
import { pinyin } from "pinyin-pro";
import polylabel from "polylabel";
import clipping from "polygon-clipping";
import { municipalities, prefectureAliases, provinceEnglish, provinceNames, settlementMarkers } from "./map-place-aliases.mjs";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round = (value) => typeof value === "number" ? Math.round(value * 10000) / 10000 : value.map(round);
const collection = (features) => ({ type: "FeatureCollection", features });
const latin = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const polygons = (geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

export function mapCenter(geometry) {
  const area = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + x * next[1] - next[0] * y;
  }, 0));
  const largest = [...polygons(geometry)].sort((a, b) => area(b[0]) - area(a[0]))[0];
  const [lng, lat] = polylabel(largest, 0.001);
  return { lng: round(lng), lat: round(lat) };
}

export function matchPrefecture(name, prefix, targets) {
  const alias = prefectureAliases[name];
  if (alias) {
    if (!alias.startsWith(prefix)) throw new Error(`Alias province mismatch: ${name}`);
    return targets.find((place) => place.id === `CN-${alias}`);
  }
  const stem = latin(name.split(/\s+/)[0]);
  const candidates = targets.filter((place) => place.province === `CN-${prefix}0000`).map((place) => {
    const text = latin(pinyin(place.name.replace(/(?:地区|市|县|盟)$/u, ""), { toneType: "none" }));
    return { place, score: text === stem ? 2 : text.startsWith(stem) ? 1 : 0 };
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);
  if (candidates.length && (!candidates[1] || candidates[0].score > candidates[1].score)) return candidates[0].place;
  throw new Error(`Unmapped or ambiguous prefecture: ${prefix} ${name}`);
}

async function sourceBytes(source, directory) {
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error(`Missing source checksum: ${source.id}`);
  const path = join(directory, source.file);
  let bytes;
  try { bytes = await readFile(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!bytes) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Map source ${source.id}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (hash(bytes) !== source.sha256) throw new Error(`Source checksum mismatch: ${source.id}`);
  await writeFile(path, bytes);
  return bytes;
}

export async function buildMapData() {
  const sources = JSON.parse(await readFile(new URL("./map-sources.json", import.meta.url), "utf8"));
  const cache = resolve(process.env.ATLAS_MAP_CACHE || ".cache/maps");
  const output = resolve(process.env.ATLAS_MAP_OUTPUT || "public/data");
  await mkdir(cache, { recursive: true });
  const inputs = Object.fromEntries(await Promise.all(sources.map(async (source) => [source.id, await sourceBytes(source, cache)])));
  const rawWorld = JSON.parse(inputs.world), rawCities = JSON.parse(inputs.cities);
  const rawProvinces = JSON.parse(inputs.provinces), codes = JSON.parse(inputs.codes);
  const archive = unzipSync(inputs.prefectures);
  const rawPrefectures = await shapefile.read(archive["CHN_ADM2.shp"], archive["CHN_ADM2.dbf"], { encoding: "utf-8" });
  const provinces = rawProvinces.features.map((feature) => {
    const prefix = provinceEnglish[feature.properties.shapeName];
    if (!prefix) throw new Error(`Unknown province: ${feature.properties.shapeName}`);
    const geometry = { ...feature.geometry, coordinates: round(feature.geometry.coordinates) };
    return { type: "Feature", properties: { id: `CN-${prefix}0000`, name: provinceNames[prefix], country: "CHN", kind: "province", adcode: Number(`${prefix}0000`), ...mapCenter(geometry) }, geometry };
  }).sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  if (provinces.length !== 34) throw new Error("Expected all 34 province-level regions");
  const targets = [];
  for (const province of provinces) {
    const prefix = String(province.properties.adcode).slice(0, 2);
    if (municipalities.has(prefix)) {
      targets.push({ ...province.properties, id: `${province.properties.id}-CITY`, kind: "city", province: province.properties.id });
    } else if (prefix !== "71") {
      const administrative = codes.find((item) => item.code === prefix);
      if (!administrative) throw new Error(`Missing administrative codes for ${prefix}`);
      for (const city of administrative.children) {
        const units = city.name.includes("直辖县级") ? city.children : [city];
        for (const unit of units) targets.push({ id: `CN-${unit.code.padEnd(6, "0")}`, name: unit.name, kind: "city", country: "CHN", province: province.properties.id });
      }
    }
  }
  const geometryById = new Map();
  const addGeometry = (id, geometry) => {
    const previous = geometryById.get(id);
    geometryById.set(id, previous ? { type: "MultiPolygon", coordinates: clipping.union(polygons(previous), polygons(geometry)) } : geometry);
  };
  const mappingErrors = [];
  for (const feature of rawPrefectures.features) {
    const prefix = String(Number(feature.properties.pcode.slice(2, 5))).padStart(2, "0");
    if (municipalities.has(prefix) || prefix === "71") continue;
    let target;
    try { target = matchPrefecture(feature.properties.name, prefix, targets); }
    catch (error) { mappingErrors.push(error.message); continue; }
    if (!target) { mappingErrors.push(`Missing alias target: ${feature.properties.name}`); continue; }
    addGeometry(target.id, { ...feature.geometry, coordinates: round(feature.geometry.coordinates) });
  }
  if (mappingErrors.length) throw new Error(mappingErrors.join("\n"));
  const county = JSON.parse(inputs.counties).features.find((feature) => feature.properties.shapeName === "Wenchangxian");
  if (!county) throw new Error("Missing independently licensed Wenchang boundary");
  addGeometry("CN-469005", { ...county.geometry, coordinates: round(county.geometry.coordinates) });
  const markerOnly = [];
  for (const target of targets) {
    if (target.id.endsWith("-CITY")) continue;
    const geometry = geometryById.get(target.id);
    if (geometry) Object.assign(target, mapCenter(geometry));
    else {
      const marker = settlementMarkers[target.id.slice(3)];
      if (!marker) throw new Error(`No licensed geometry or explicit settlement marker for ${target.id} ${target.name}`);
      Object.assign(target, { lat: marker.lat, lng: marker.lng, markerOnly: true });
      markerOnly.push({ id: target.id, name: target.name, source: marker.source });
    }
  }
  const countries = rawWorld.features.filter((feature) => !["TWN", "HKG", "MAC"].includes(feature.properties.ADM0_A3)).map((feature) => {
    const p = feature.properties;
    return { type: "Feature", properties: { id: p.ADM0_A3, name: p.NAME_ZH || p.NAME, english: p.NAME, continent: p.CONTINENT, lat: p.LABEL_Y, lng: p.LABEL_X, rank: p.LABELRANK }, geometry: { ...feature.geometry, coordinates: round(feature.geometry.coordinates) } };
  });
  const china = countries.find((country) => country.properties.id === "CHN");
  china.properties.name = "中国";
  china.geometry = { type: "MultiPolygon", coordinates: provinces.flatMap((province) => polygons(province.geometry)) };
  const catalog = { countries: countries.map((feature) => ({ ...feature.properties, kind: "country", country: feature.properties.id })), provinces: provinces.map((feature) => feature.properties), cities: targets };
  for (const feature of rawCities.features) {
    const p = feature.properties, originalCountry = p.ADM0_A3 || p.adm0_a3;
    const country = originalCountry === "SSD" ? "SDS" : originalCountry;
    if (country === "TWN") {
      if (!String(p.NAME_ZH).endsWith("区")) catalog.cities.push({ id: `CN-71-${p.NE_ID}`, name: p.NAME_ZH || p.NAME, kind: "city", country: "CHN", province: "CN-710000", lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] });
      continue;
    }
    if (["CHN", "HKG", "MAC"].includes(country) || !catalog.countries.some((item) => item.id === country)) continue;
    const english = p.NAMEASCII || p.nameascii || p.NAME || p.name;
    const id = country === "JPN" && ["Kyoto", "Osaka"].includes(english) ? `INT-JPN-${english.toLowerCase()}` : `INT-${originalCountry}-${p.NE_ID || p.ne_id}`;
    catalog.cities.push({ id, name: p.NAME_ZH || p.name_zh || p.NAME || p.name, english, kind: "city", country, lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] });
  }
  for (const place of [{ id: "INT-JPN-kyoto", name: "京都", lat: 35.0116, lng: 135.7681 }, { id: "INT-JPN-osaka", name: "大阪", lat: 34.6937, lng: 135.5023 }]) {
    if (!catalog.cities.some((city) => city.id === place.id)) catalog.cities.push({ ...place, kind: "city", country: "JPN" });
  }
  const files = new Map([["china.json", collection(provinces)], ["world.json", collection(countries)], ["catalog.json", catalog]]);
  for (const province of provinces) {
    const prefix = String(province.properties.adcode).slice(0, 2);
    if (municipalities.has(prefix)) continue;
    files.set(`provinces/${province.properties.adcode}.json`, collection(targets.filter((place) => place.province === province.properties.id && geometryById.has(place.id)).map((place) => ({ type: "Feature", properties: place, geometry: geometryById.get(place.id) }))));
  }
  for (const items of [catalog.countries, catalog.provinces, catalog.cities]) {
    if (new Set(items.map((place) => place.id)).size !== items.length) throw new Error("Duplicate catalog identifiers");
    for (const place of items) if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) throw new Error(`Invalid map center: ${place.id}`);
  }
  const checksums = {};
  await mkdir(join(output, "provinces"), { recursive: true });
  for (const [name, value] of files) {
    const bytes = JSON.stringify(value) + "\n";
    checksums[name] = hash(bytes);
    await writeFile(join(output, name), bytes);
  }
  for (const name of await readdir(join(output, "provinces"))) {
    if (name.endsWith(".json") && !files.has(`provinces/${name}`)) await rm(join(output, "provinces", name));
  }
  const manifest = { version: 1, changes: "Converted GeoJSON/SHP, rounded coordinates, mapped administrative names/codes, merged former Laiwu into Jinan; Wenchang supplemented from PDDL county data. Settlement-only records do not fabricate boundaries.", sources, markerOnly, files: checksums };
  await writeFile(join(output, "sources.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { countries: catalog.countries.length, provinces: catalog.provinces.length, cities: catalog.cities.length, markerOnly };
}
