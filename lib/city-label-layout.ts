import type { GeoFeature } from './types';

type Point = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };
type Polygon = { rings: Point[][]; bounds: Box };
export type CityLabel = { id: string; name: string; center: Point; width: number; height: number; leader?: [Point, Point] };
const labelHeight = 20;

function bounds(points: Point[]): Box {
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}
function overlaps(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
function boxAt(p: Point, width: number, height: number): Box {
  return { left: p.x - width / 2, right: p.x + width / 2, top: p.y - height / 2, bottom: p.y + height / 2 };
}
function corners(b: Box): Point[] {
  return [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];
}
function inRing(p: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function inPolygon(p: Point, polygon: Polygon) {
  return inRing(p, polygon.rings[0]) && !polygon.rings.slice(1).some(r => inRing(p, r));
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
function crossesBox(a: Point, b: Point, box: Box) {
  const pts = corners(box);
  const inside = (p: Point) => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
  return inside(a) || inside(b) || pts.some((p, i) => intersects(a, b, p, pts[(i + 1) % 4]));
}
function boundaryTouches(polygon: Polygon, box: Box) {
  return polygon.rings.some(ring => ring.some((p, i) => crossesBox(p, ring[(i + 1) % ring.length], box)));
}
function fits(polygon: Polygon, box: Box) {
  const b = polygon.bounds;
  return box.left > b.left && box.right < b.right && box.top > b.top && box.bottom < b.bottom &&
    corners(box).every(p => inPolygon(p, polygon)) && !boundaryTouches(polygon, box);
}
function touches(polygon: Polygon, box: Box) {
  return overlaps(polygon.bounds, box) && (corners(box).some(p => inPolygon(p, polygon)) || boundaryTouches(polygon, box));
}
function projectFeature(feature: GeoFeature, project: (coordinate: number[]) => Point): Polygon[] {
  const geometry = feature.geometry;
  const coordinates = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return coordinates.map((poly: number[][][]) => {
    const rings = poly.map(ring => ring.map(project));
    return { rings, bounds: bounds(rings[0]) };
  });
}

// Recompute in screen pixels: a name is shown only when its actual text box fits.
export function layoutCityLabels({ features, land, project, measure, size, selectedId, visited }: {
  features: GeoFeature[]; land: GeoFeature[]; project: (coordinate: number[]) => Point;
  measure: (name: string) => number; size: Point; selectedId?: string; visited: Set<string>;
}): CityLabel[] {
  const projected = features.map(feature => ({ feature, polygons: projectFeature(feature, project) }));
  const landPolygons = land.flatMap(f => projectFeature(f, project));
  const occupied: Box[] = [], leaders: [Point, Point][] = [], result: CityLabel[] = [];
  const pending: typeof projected = [];
  const markers = features.filter(f => (visited.has(f.properties.id) || f.properties.id === selectedId) && f.properties.lat != null && f.properties.lng != null).map(f => project([f.properties.lng, f.properties.lat]));
  const controls: Box[] = [
    { left: 0, top: 0, right: 170, bottom: 44 },
    { left: size.x - 120, top: 0, right: size.x, bottom: 44 },
    { left: size.x - 55, top: size.y - 95, right: size.x, bottom: size.y },
    { left: 0, top: size.y - 26, right: size.x, bottom: size.y },
  ];
  const valid = (box: Box) => box.left >= 8 && box.top >= 8 && box.right <= size.x - 8 && box.bottom <= size.y - 8 && !controls.some(b => overlaps(b, box)) &&
    !occupied.some(b => overlaps(b, box)) && !leaders.some(([a, b]) => crossesBox(a, b, box)) && !markers.some(p => overlaps(box, boxAt(p, 18, 18)));
  const priority = (id: string) => id === selectedId ? 2 : visited.has(id) ? 1 : 0;
  projected.sort((a, b) => priority(b.feature.properties.id) - priority(a.feature.properties.id) || String(a.feature.properties.id).localeCompare(String(b.feature.properties.id)));
  const label = (item: typeof projected[number], center: Point, leader?: [Point, Point]) => {
    const name = String(item.feature.properties.name);
    const width = measure(name) + 6, height = labelHeight;
    result.push({ id: item.feature.properties.id, name, center, width, height, leader });
    occupied.push(boxAt(center, width + 6, height + 4));
    if (leader) leaders.push(leader);
  };
  for (const item of projected) {
    const width = measure(String(item.feature.properties.name)) + 6;
    const polygons = [...item.polygons].sort((a, b) => (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top) - (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top));
    let center: Point | undefined;
    for (const polygon of polygons) {
      const b = polygon.bounds;
      if (b.right - b.left < width || b.bottom - b.top < labelHeight) continue;
      const visible = { left: Math.max(b.left + width / 2, 8 + width / 2), right: Math.min(b.right - width / 2, size.x - 8 - width / 2), top: Math.max(b.top + labelHeight / 2, 8 + labelHeight / 2), bottom: Math.min(b.bottom - labelHeight / 2, size.y - 8 - labelHeight / 2) };
      if (visible.left >= visible.right || visible.top >= visible.bottom) continue;
      const middle = { x: (visible.left + visible.right) / 2, y: (visible.top + visible.bottom) / 2 };
      const candidates: Point[] = [];
      for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) candidates.push({ x: visible.left + (visible.right - visible.left) * x / 8, y: visible.top + (visible.bottom - visible.top) * y / 8 });
      candidates.sort((a, c) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(c.x - middle.x, c.y - middle.y));
      const accepts = (p: Point) => valid(boxAt(p, width, labelHeight)) && inPolygon(p, polygon) && fits(polygon, boxAt(p, width, labelHeight));
      center = candidates.find(accepts);
      if (!center) {
        // The old 7x7 grid missed narrow but usable areas of irregular cities.
        const dense: Point[] = [];
        const stepX = Math.max(4, Math.min(10, width / 5));
        const stepY = 6;
        for (let y = visible.top; y <= visible.bottom; y += stepY) for (let x = visible.left; x <= visible.right; x += stepX) dense.push({ x, y });
        dense.sort((a, c) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(c.x - middle.x, c.y - middle.y));
        center = dense.find(accepts);
      }
      if (center) break;
    }
    if (center) label(item, center); else pending.push(item);
  }
  // Small islands/areas can use nearby empty space, with a short leader line.
  // Only attempt this once some normal city names fit, avoiding clutter at province scale.
  if (result.length) for (const item of pending) {
    const polygon = [...item.polygons].sort((a, b) => (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top) - (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top))[0];
    if (!polygon) continue;
    const b = polygon.bounds;
    if (Math.max(b.right - b.left, b.bottom - b.top) < 18) continue;
    const center = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
    let anchor = center;
    if (!inPolygon(anchor, polygon)) {
      const p = item.feature.properties;
      const point = p.lat != null && p.lng != null ? project([p.lng, p.lat]) : center;
      anchor = inPolygon(point, polygon) ? point : polygon.rings[0].reduce((best, q) => Math.hypot(q.x - center.x, q.y - center.y) < Math.hypot(best.x - center.x, best.y - center.y) ? q : best);
    }
    if (anchor.x < 0 || anchor.y < 0 || anchor.x > size.x || anchor.y > size.y) continue;
    const width = measure(String(item.feature.properties.name)) + 6;
    let placed = false;
    for (const radius of [40, 60, 85, 110, 140]) {
      for (const angle of [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI, -3 * Math.PI / 4, 3 * Math.PI / 4]) {
        const position = { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
        const box = boxAt(position, width, labelHeight);
        if (!valid(box) || landPolygons.some(p => touches(p, box)) || projected.some(p => p.polygons.some(poly => touches(poly, box)))) continue;
        const delta = { x: anchor.x - position.x, y: anchor.y - position.y };
        const ratio = Math.min(width / 2 / Math.abs(delta.x || .001), labelHeight / 2 / Math.abs(delta.y || .001));
        const end = { x: position.x + delta.x * ratio, y: position.y + delta.y * ratio };
        if (occupied.some(box => crossesBox(anchor, end, box)) || leaders.some(([a, b]) => intersects(anchor, end, a, b))) continue;
        label(item, position, [anchor, end]); placed = true; break;
      }
      if (placed) break;
    }
  }
  return result;
}
