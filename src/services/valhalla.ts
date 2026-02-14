import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { LatLonPoint } from '@/services/positionSmoothing';

export interface ValhallaMatchOptions {
  costing?: string;
  id?: string;
  maxPoints?: number;
  gpsAccuracy?: number;
  searchRadius?: number;
  shapeMatch?: string;
}
const FALLBACK_BASE_URL = (import.meta.env.VITE_VALHALLA_BASE_URL || 'http://192.168.1.108:8002').replace(/\/$/, '');
const DEFAULT_MAX_POINTS = 400;
const DEFAULT_GPS_ACCURACY = 20;
const DEFAULT_SEARCH_RADIUS = 25;
const DEFAULT_SHAPE_MATCH = 'walk_or_snap';
const VALHALLA_URL_KEY = 'valhalla_url';
let cachedBaseUrl: string | null | undefined;

const normalizeUrl = (value: string) => value.trim().replace(/\/$/, '');

const loadConfiguredBaseUrl = async () => {
  if (cachedBaseUrl !== undefined) {
    return cachedBaseUrl;
  }

  const stored = await Preferences.get({ key: VALHALLA_URL_KEY });
  if (stored.value) {
    cachedBaseUrl = normalizeUrl(stored.value);
    return cachedBaseUrl;
  }

  cachedBaseUrl = FALLBACK_BASE_URL || null;
  return cachedBaseUrl;
};

export const setValhallaBaseUrl = async (value: string | null) => {
  if (!value) {
    await Preferences.remove({ key: VALHALLA_URL_KEY });
    cachedBaseUrl = FALLBACK_BASE_URL || null;
    return cachedBaseUrl;
  }

  const normalized = normalizeUrl(value);
  await Preferences.set({ key: VALHALLA_URL_KEY, value: normalized });
  cachedBaseUrl = normalized;
  return cachedBaseUrl;
};
type CoordinateOrder = 'latlon' | 'lonlat';

const withinRange = (value: number, minimum: number, maximum: number, padding: number) =>
  value >= minimum - padding && value <= maximum + padding;

const compareShapeError = (shape: number[][], points: LatLonPoint[]): CoordinateOrder => {
  let latLonError = 0;
  let lonLatError = 0;
  if (points.length === 0) return 'lonlat';

  shape.forEach((coord, index) => {
    const ref = points[Math.min(index, points.length - 1)];
    const [first, second] = coord;
    latLonError += Math.abs(first - ref.latitude) + Math.abs(second - ref.longitude);
    lonLatError += Math.abs(second - ref.latitude) + Math.abs(first - ref.longitude);
  });

  return latLonError <= lonLatError ? 'latlon' : 'lonlat';
};

const guessCoordinateOrder = (shape: number[][], reference: LatLonPoint[]): CoordinateOrder => {
  if (shape.length === 0) return 'lonlat';
  const latitudes = reference.map((point) => point.latitude);
  const longitudes = reference.map((point) => point.longitude);
  const latMin = Math.min(...latitudes);
  const latMax = Math.max(...latitudes);
  const lonMin = Math.min(...longitudes);
  const lonMax = Math.max(...longitudes);

  const latPadding = Math.max(0.05, (latMax - latMin) * 0.5);
  const lonPadding = Math.max(0.05, (lonMax - lonMin) * 0.5);

  const firstMean = shape.reduce((sum, coord) => sum + coord[0], 0) / shape.length;
  const secondMean = shape.reduce((sum, coord) => sum + coord[1], 0) / shape.length;

  const firstLooksLikeLat = withinRange(firstMean, latMin, latMax, latPadding);
  const firstLooksLikeLon = withinRange(firstMean, lonMin, lonMax, lonPadding);
  const secondLooksLikeLat = withinRange(secondMean, latMin, latMax, latPadding);
  const secondLooksLikeLon = withinRange(secondMean, lonMin, lonMax, lonPadding);

  if (firstLooksLikeLon && secondLooksLikeLat) return 'lonlat';
  if (firstLooksLikeLat && secondLooksLikeLon) return 'latlon';

  return compareShapeError(shape, reference);
};

const mapShapeEntry = (coord: number[], order: CoordinateOrder): { latitude: number; longitude: number } => {
  const [first, second] = coord;
  return order === 'latlon'
    ? { latitude: first, longitude: second }
    : { latitude: second, longitude: first };
};

const stringifyForLog = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('VALHALLA_LOG_SERIALIZATION_FAILED', error);
    return String(value);
  }
};

const logValhallaResponse = (value: unknown) => {
  console.info('VALHALLA_RESPONSE', stringifyForLog(value));
};

export async function matchPositionsWithValhalla(
  allPoints: LatLonPoint[],
  options: ValhallaMatchOptions = {}
): Promise<LatLonPoint[]> {
  const baseUrl = await loadConfiguredBaseUrl();
  if (!baseUrl || allPoints.length < 3) {
    return allPoints;
  }

  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  const points = allPoints.slice(-maxPoints);
  const payload = {
    costing: options.costing ?? 'auto',
    shape: points.map((point) => ({
      lat: point.latitude,
      lon: point.longitude
    })),
    shape_format: 'json',
    gps_accuracy: options.gpsAccuracy ?? DEFAULT_GPS_ACCURACY,
    search_radius: options.searchRadius ?? DEFAULT_SEARCH_RADIUS,
    shape_match: options.shapeMatch ?? DEFAULT_SHAPE_MATCH,
    id: options.id
  };
  console.info('VALHALLA REQUEST', stringifyForLog(payload));

  try {
    const apiUrl = `${baseUrl}/trace_route`;
    let data: unknown;
    if (Capacitor.getPlatform() !== 'web' && CapacitorHttp) {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: apiUrl,
        headers: { 'Content-Type': 'application/json' },
        data: payload
      });
      logValhallaResponse(response.data);
      if (response.status && response.status >= 400) {
        throw new Error(`Valhalla responded with ${response.status}`);
      }
      data = response.data;
    } else {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const responseBody = await response.text();
      logValhallaResponse(responseBody);
      let parsed: unknown;
      try {
        parsed = JSON.parse(responseBody);
      } catch {
        parsed = responseBody;
      }
      if (!response.ok) {
        throw new Error(`Valhalla responded with ${response.status}`);
      }
      data = parsed;
    }

    const result = data as {
      trip?: {
        legs?: Array<{
          shape?: number[][];
        }>;
      };
    } | null;
    const leg = result?.trip?.legs?.[0];
    if (!leg || !Array.isArray(leg.shape)) {
      return points;
    }

    const validShape = leg.shape.filter((coord: unknown): coord is number[] =>
      Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number'
    );

    if (validShape.length === 0) {
      return points;
    }

    const order = guessCoordinateOrder(validShape, points);
    return validShape.map((coord: number[]) => mapShapeEntry(coord, order));
  } catch (error) {
    console.warn('Valhalla matching failed', error);
    return points;
  }
}
