// This map's Chinese GeoJSON IDs contain six-digit administrative codes.
// Prefecture and province codes end in 00; directly administered counties do not.
export function isMapRegion(place: { id?: unknown; country?: unknown; kind?: unknown }): boolean {
  if (place.country !== 'CHN' || place.kind !== 'city') return true;
  return typeof place.id === 'string' && /^CN-\d{4}00$/.test(place.id);
}
