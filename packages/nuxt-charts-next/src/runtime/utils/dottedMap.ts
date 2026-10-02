import { geoBounds, geoContains, geoPath } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { FeatureCollection } from "geojson";
import type { DottedMapProps, MapDot, MapPin, PrecomputedMap, MapProjectionName } from "../types/maps";
import { createMapProjection, DEFAULT_MAP_REGION, inRegion, mapCountryId, mapFeatures, projectMapPoint, regionGeometry } from "./maps";

export function filterMapCountries(collection: FeatureCollection, countries?: string[]): FeatureCollection {
  if (!countries?.length) return collection;
  const selected = new Set(countries.map(code => code.toUpperCase()));
  return { type: "FeatureCollection", features: collection.features.filter((feature, index) => [mapCountryId(feature, index), feature.properties?.iso_a2, feature.properties?.iso_a3, feature.properties?.name].some(id => selected.has(String(id).toUpperCase()))) };
}

export function generateMapDots(collection: FeatureCollection, projection: GeoProjection, width: number, height: number, options: Pick<DottedMapProps, "mapWidth" | "mapHeight" | "grid" | "region">): MapDot[] {
  if (!projection.invert) throw new Error("DottedMap requires an invertible projection.");
  const spacing = options.mapWidth ? width / Math.max(1, options.mapWidth) : height / Math.max(1, options.mapHeight ?? 60);
  const rowHeight = options.grid === "diagonal" ? spacing * Math.sqrt(3) / 2 : spacing;
  const path = geoPath(projection);
  const countries = collection.features.map((feature, index) => ({ feature, id: mapCountryId(feature, index), bounds: geoBounds(feature) }));
  const dots: MapDot[] = [];
  for (let row = 0, y = rowHeight / 2; y < height; row++, y += rowHeight) {
    const offset = options.grid === "diagonal" && row % 2 ? spacing / 2 : 0;
    for (let x = spacing / 2 + offset; x < width; x += spacing) {
      const coordinates = projection.invert([x, y]);
      if (!coordinates?.every(Number.isFinite) || !inRegion(coordinates, options.region)) continue;
      const projected = projectMapPoint(projection, coordinates, path);
      if (!projected || Math.hypot(projected[0] - x, projected[1] - y) > spacing / 2) continue;
      const country = countries.find(({ bounds: [[west, south], [east, north]], feature }) => coordinates[1] >= south && coordinates[1] <= north && (west <= east ? coordinates[0] >= west && coordinates[0] <= east : coordinates[0] >= west || coordinates[0] <= east) && geoContains(feature, coordinates));
      if (country) dots.push({ x, y, lng: coordinates[0], lat: coordinates[1], countryId: country.id, label: String(country.feature.properties?.name ?? country.id) });
    }
  }
  return dots;
}

/** Precompute a serializable dotted map, using the same grid as DottedMap. */
export function getMap(options: Pick<DottedMapProps, "mapHeight" | "mapWidth" | "countries" | "region" | "grid" | "geoJson" | "mapFeatureKey"> & { height?: number; width?: number; projection?: MapProjectionName; geojsonWorld?: DottedMapProps["geoJson"] } = {}): PrecomputedMap {
  const collection = filterMapCountries(mapFeatures(options.geoJson ?? options.geojsonWorld, options.mapFeatureKey), options.countries);
  if (!collection.features.length) throw new Error("No map features matched. Check your country codes or geometry.");
  const region = options.region ?? (!options.countries?.length && !options.geoJson && !options.geojsonWorld ? DEFAULT_MAP_REGION : undefined);
  const geometry = region ? regionGeometry(region) : collection;
  const preview = createMapProjection(options.projection ?? "mercator", geometry, 1000, 500, { padding: 0 }, region);
  const [[x0, y0], [x1, y1]] = geoPath(preview).bounds(geometry);
  const ratio = (x1 - x0) / (y1 - y0);
  const width = options.width ?? options.mapWidth ?? Math.max(1, Math.round((options.height ?? options.mapHeight ?? 60) * ratio));
  const height = options.height ?? options.mapHeight ?? Math.max(1, Math.round(width / ratio));
  const projection = createMapProjection(options.projection ?? "mercator", geometry, width, height, { padding: 0 }, region);
  const dots = generateMapDots(collection, projection, width, height, { mapWidth: width, mapHeight: height, region, grid: options.grid });
  return { width, height, points: Object.fromEntries(dots.map(dot => [`${dot.x};${dot.y}`, dot])), region, countries: options.countries, grid: options.grid ?? "vertical", projection: options.projection ?? "mercator", scale: projection.scale(), translate: projection.translate() };
}

/** Return the nearest grid position for a pin on a map produced by getMap. */
export function getPin(map: PrecomputedMap, pin: MapPin): MapDot {
  if (map.X_MIN !== undefined && map.Y_MAX !== undefined && map.X_RANGE && map.Y_RANGE) {
    const radians = Math.PI / 180;
    const earthRadius = 6378137;
    const rawX = map.width * (pin.lng * radians * earthRadius - map.X_MIN) / map.X_RANGE;
    const rawY = map.height * (map.Y_MAX - Math.log(Math.tan(Math.PI / 4 + pin.lat * radians / 2)) * earthRadius) / map.Y_RANGE;
    const step = map.ystep ?? (map.grid === "diagonal" ? Math.sqrt(3) / 2 : 1);
    const row = Math.round(rawY / step);
    const offset = map.grid === "diagonal" && row % 2 === 0 ? 0.5 : 0;
    const x = Math.round(rawX - offset) + offset;
    const y = row * step;
    const lng = (x / map.width * map.X_RANGE + map.X_MIN) / earthRadius / radians;
    const lat = (2 * Math.atan(Math.exp((map.Y_MAX - y / map.height * map.Y_RANGE) / earthRadius)) - Math.PI / 2) / radians;
    return { ...pin, x, y, lat, lng };
  }
  const geometry = map.scale !== undefined ? { type: "Sphere" as const } : map.region ? regionGeometry(map.region) : filterMapCountries(mapFeatures(), map.countries);
  const projection = createMapProjection(map.projection ?? "mercator", geometry, map.width, map.height, { padding: 0 }, map.region);
  if (map.scale !== undefined && map.translate) projection.scale(map.scale).translate(map.translate);
  const point = projectMapPoint(projection, [pin.lng, pin.lat]);
  if (!point) throw new Error("Pin coordinates cannot be projected onto this map.");
  const rowHeight = map.grid === "diagonal" ? Math.sqrt(3) / 2 : 1;
  const row = Math.round((point[1] - rowHeight / 2) / rowHeight);
  const offset = map.grid === "diagonal" && row % 2 ? 0.5 : 0;
  const x = Math.round(point[0] - 0.5 - offset) + 0.5 + offset;
  const y = row * rowHeight + rowHeight / 2;
  const coordinates = projection.invert?.([x, y]);
  return { ...pin, x, y, lat: coordinates?.[1] ?? pin.lat, lng: coordinates?.[0] ?? pin.lng };
}
