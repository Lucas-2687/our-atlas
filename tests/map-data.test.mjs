import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { inspectMapAssets } from "../scripts/check-public.mjs";
import { mapCenter, matchPrefecture } from "../scripts/build-map-data.mjs";

const root = new URL("../", import.meta.url);
const load = (name) => readFile(new URL(name, root));
const json = async (name) => JSON.parse(await load(name));
const manifest = await json("public/data/sources.json");
const catalog = await json("public/data/catalog.json");
const paths = ["public/data/sources.json", ...Object.keys(manifest.files).map((name) => `public/data/${name}`)];

test("distributed maps match pinned, attributed sources with no undeclared old files", async () => {
  assert.deepEqual(await inspectMapAssets(paths, load), []);
  const provinceFiles = (await readdir(new URL("public/data/provinces/", root))).map((name) => `public/data/provinces/${name}`);
  assert.ok(provinceFiles.every((name) => paths.includes(name)));
  assert.equal(manifest.sources.length, 6);
  assert.ok(manifest.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256) && source.attribution && source.licenseUrl));
  assert.ok(!JSON.stringify(manifest.sources).includes("datav.aliyun"));
});

test("release checks reject replaced bytes, missing maps and undeclared additions", async () => {
  const tampered = async (name) => name === "public/data/china.json" ? Buffer.from("{}") : load(name);
  assert.ok((await inspectMapAssets(paths, tampered)).some((issue) => issue.includes("china.json")));
  const missing = async (name) => { if (name === "public/data/world.json") throw new Error("missing"); return load(name); };
  assert.ok((await inspectMapAssets(paths, missing)).length);
  assert.ok((await inspectMapAssets([...paths, "public/data/old-provider.json"], load)).some((issue) => issue.includes("old-provider.json")));
});

test("catalogue retains stable examples, valid parent regions and unique identifiers", () => {
  assert.equal(catalog.countries.length, 239);
  assert.equal(catalog.provinces.length, 34);
  const countries = new Set(catalog.countries.map((place) => place.id));
  const provinces = new Set(catalog.provinces.map((place) => place.id));
  const cities = new Map(catalog.cities.map((place) => [place.id, place]));
  for (const places of Object.values(catalog)) {
    assert.equal(new Set(places.map((place) => place.id)).size, places.length);
    for (const place of places) {
      assert.ok(Number.isFinite(place.lat) && Math.abs(place.lat) <= 90, place.id);
      assert.ok(Number.isFinite(place.lng) && Math.abs(place.lng) <= 180, place.id);
    }
  }
  for (const place of cities.values()) {
    assert.ok(countries.has(place.country), place.id);
    if (place.country === "CHN") assert.ok(provinces.has(place.province), place.id);
  }
  for (const id of ["CN-330100", "CN-532900", "CN-650100", "CN-469005", "CN-659002", "CN-110000-CITY", "INT-JPN-kyoto", "INT-JPN-osaka", "INT-SSD-1159149449"]) assert.ok(cities.has(id), id);
  assert.equal(cities.get("INT-SSD-1159149449").country, "SDS");
});

test("all polygon coordinates are closed, finite GeoJSON and city features refer to their own province", async () => {
  for (const name of Object.keys(manifest.files).filter((name) => name !== "catalog.json")) {
    const data = await json(`public/data/${name}`);
    assert.equal(data.type, "FeatureCollection", name);
    for (const feature of data.features) {
      const { geometry } = feature;
      assert.ok(["Polygon", "MultiPolygon"].includes(geometry.type), feature.properties.id);
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) {
        assert.ok(ring.length >= 4, feature.properties.id);
        assert.deepEqual(ring[0], ring.at(-1));
        for (const point of ring) {
          assert.ok(Number.isFinite(point[0]) && Math.abs(point[0]) <= 180);
          assert.ok(Number.isFinite(point[1]) && Math.abs(point[1]) <= 90);
        }
      }
      if (name.startsWith("provinces/")) {
        assert.equal(feature.properties.kind, "city");
        assert.equal(feature.properties.province, `CN-${name.split("/").at(-1).slice(0, 6)}`);
        assert.ok(catalog.cities.some((city) => city.id === feature.properties.id));
      }
    }
  }
});

test("new settlements have explicit point-only metadata instead of invented boundaries", async () => {
  const marked = catalog.cities.filter((place) => place.markerOnly);
  assert.equal(marked.length, 11);
  assert.deepEqual(marked.map((place) => place.id).sort(), manifest.markerOnly.map((place) => place.id).sort());
  const xinjiang = await json("public/data/provinces/650000.json");
  for (const place of marked) {
    assert.ok(!xinjiang.features.some((feature) => feature.properties.id === place.id));
    assert.ok(manifest.markerOnly.find((record) => record.id === place.id).source.startsWith("https://"));
  }
});

test("province-aware transliteration mapping disambiguates cities and rejects unknown names", () => {
  const targets = [
    { id: "CN-320500", name: "苏州市", province: "CN-320000" },
    { id: "CN-341300", name: "宿州市", province: "CN-340000" },
    { id: "CN-610100", name: "西安市", province: "CN-610000" },
    { id: "CN-610400", name: "咸阳市", province: "CN-610000" },
  ];
  assert.equal(matchPrefecture("Suzhou", "32", targets).id, "CN-320500");
  assert.equal(matchPrefecture("Suzhou", "34", targets).id, "CN-341300");
  assert.equal(matchPrefecture("Xi'an", "61", targets).id, "CN-610100");
  assert.throws(() => matchPrefecture("Unknown", "32", targets), /Unmapped/);
  const center = mapCenter({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]] });
  assert.ok(center.lat >= 0 && center.lat <= 4 && center.lng >= 0 && center.lng <= 4);
  assert.ok(!(center.lat > 1 && center.lat < 3 && center.lng > 1 && center.lng < 3));
});
