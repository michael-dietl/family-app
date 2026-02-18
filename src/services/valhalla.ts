import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { LatLonPoint } from '@/services/positionSmoothing';

export type ValhallaEndpoint = 'trace_route' | 'trace_attributes';

export interface ValhallaMatchOptions {
  costing?: string;
  id?: string;
  endpoint?: ValhallaEndpoint;
  maxPoints?: number;
  gpsAccuracy?: number;
  searchRadius?: number;
  shapeMatch?: string;
}
export type TraceRouteSummaryOptions = Pick<ValhallaMatchOptions, 'costing' | 'id' | 'gpsAccuracy' | 'searchRadius' | 'shapeMatch'>;
export interface ValhallaTraceSummary {
  has_time_restrictions?: boolean;
  has_toll?: boolean;
  has_highway?: boolean;
  has_ferry?: boolean;
  min_lat?: number;
  min_lon?: number;
  max_lat?: number;
  max_lon?: number;
  time?: number;
  length?: number;
  [key: string]: unknown;
}
export interface ValhallaMatchResult {
  shape: LatLonPoint[];
  matchedPoints: LatLonPoint[];
}
interface ValhallaErrorEntry {
  code?: string | number;
  message?: string;
}
const FALLBACK_BASE_URL = (import.meta.env.VITE_VALHALLA_BASE_URL || 'http://192.168.1.108:8002').replace(/\/$/, '');
const DEFAULT_MAX_POINTS = 400;
const DEFAULT_GPS_ACCURACY = 20;
const DEFAULT_SEARCH_RADIUS = 25;
const DEFAULT_SHAPE_MATCH = 'walk_or_snap';
const DEFAULT_ENDPOINT: ValhallaEndpoint = 'trace_attributes';
const ENCODED_POLYLINE_THRESHOLD = 150;
const MIN_SHAPE_POINTS = 4;
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

const performValhallaRequest = async (baseUrl: string, endpoint: ValhallaEndpoint, payload: unknown) => {
  console.info('VALHALLA REQUEST', stringifyForLog(payload));
  const apiUrl = `${baseUrl}/${endpoint}`;
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

  const responseError = formatValhallaErrors(data);
  if (responseError) {
    throw new Error(responseError);
  }

  return data;
};


const pointsAreEqual = (a: LatLonPoint, b: LatLonPoint, tolerance = 1e-7) =>
  Math.abs(a.latitude - b.latitude) <= tolerance && Math.abs(a.longitude - b.longitude) <= tolerance;

const deduplicateSequentialPoints = (points: LatLonPoint[]) => {
  if (points.length === 0) return points;
  const cleaned: LatLonPoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (!pointsAreEqual(points[i], cleaned[cleaned.length - 1])) {
      cleaned.push(points[i]);
    }
  }
  return cleaned;
};

const boundingBoxArea = (points: LatLonPoint[]) => {
  if (points.length === 0) return 0;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const latMin = Math.min(...latitudes);
  const latMax = Math.max(...latitudes);
  const lonMin = Math.min(...longitudes);
  const lonMax = Math.max(...longitudes);
  return (latMax - latMin) * (lonMax - lonMin);
};
const formatValhallaErrors = (payload: any): string | null => {
  if (!payload) return null;
  if (typeof payload.error === 'string' && payload.error.length > 0) return payload.error;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((entry: ValhallaErrorEntry | any) => (entry?.message ? `${entry.code ?? ''}: ${entry.message}` : JSON.stringify(entry)))
      .join(', ');
  }
  if (payload.status && (payload.status.status !== undefined || payload.status.code !== undefined)) {
    const code = payload.status.status ?? payload.status.code;
    if (code !== 0 && code !== 200) {
      return `status ${code}` + (payload.status.message ? `: ${payload.status.message}` : '');
    }
  }
  return null;
};

const decodePolyline = (encoded: string): LatLonPoint[] => {
  const points: LatLonPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const length = encoded.length;

  while (index < length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < length);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < length);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
};

const encodeDeltaValue = (delta: number) => {
  let value = delta < 0 ? ~(delta << 1) : delta << 1;
  let encoded = '';
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);
  return encoded;
};

const encodePolyline = (points: LatLonPoint[]): string => {
  let lastLat = 0;
  let lastLon = 0;
  let result = '';

  points.forEach(({ latitude, longitude }) => {
    const lat = Math.round(latitude * 1e5);
    const lon = Math.round(longitude * 1e5);
    result += encodeDeltaValue(lat - lastLat);
    result += encodeDeltaValue(lon - lastLon);
    lastLat = lat;
    lastLon = lon;
  });

  return result;
};

const isValidLatLng = (point: LatLonPoint): boolean =>
  Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;

const normalizeDecodedShape = (points: LatLonPoint[]): LatLonPoint[] => {
  if (points.length === 0 || points.every(isValidLatLng)) {
    return points;
  }

  const divisors = [10, 100];
  for (const divisor of divisors) {
    const scaled = points.map((point) => ({
      latitude: point.latitude / divisor,
      longitude: point.longitude / divisor
    }));
    if (scaled.every(isValidLatLng)) {
      console.info('VALHALLA_SHAPE_RESCALED', { divisor, count: scaled.length });
      return scaled;
    }
  }

  console.warn('VALHALLA_SHAPE_OUT_OF_RANGE',
    points
      .slice(0, 3)
      .map((point) => `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`)
      .join(' | ')
  );
  return points;
};

const extractMatchedPoints = (value: unknown): LatLonPoint[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const entries: Array<{lat: number; lon: number}> = [];
  const source = value as any;
  const pushIfPresent = (candidate: unknown) => {
    if (!candidate || !Array.isArray(candidate)) return;
    candidate.forEach((item) => {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as any).lat === 'number' &&
        typeof (item as any).lon === 'number'
      ) {
        entries.push({ lat: (item as any).lat, lon: (item as any).lon });
      }
    });
  };

  pushIfPresent(source.matched_points);
  pushIfPresent(source.trip?.matched_points);
  if (Array.isArray(source.trip?.legs)) {
    source.trip.legs.forEach((leg: any) => {
      pushIfPresent(leg.matched_points);
    });
  }

  return entries.map((point) => ({ latitude: point.lat, longitude: point.lon }));
};

export async function matchPositionsWithValhalla(
  allPoints: LatLonPoint[],
  options: ValhallaMatchOptions = {}
): Promise<ValhallaMatchResult> {
  const baseUrl = await loadConfiguredBaseUrl();
  if (!baseUrl || allPoints.length < 3) {
    return { shape: allPoints, matchedPoints: [] };
  }

  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  const slicedPoints = allPoints.slice(-maxPoints);
  const points = deduplicateSequentialPoints(slicedPoints);
  if (points.length < 3) {
    return { shape: points, matchedPoints: [] };
  }

  const useEncodedShape = points.length > ENCODED_POLYLINE_THRESHOLD;
  const shapePayload = useEncodedShape
    ? { encoded_polyline: encodePolyline(points) }
    : {
        shape: points.map((point) => ({
          lat: point.latitude,
          lon: point.longitude
        }))
      };

  const targetEndpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const limitOptions = {
    gps_accuracy: options.gpsAccuracy ?? DEFAULT_GPS_ACCURACY,
    search_radius: options.searchRadius ?? DEFAULT_SEARCH_RADIUS
  };
  const basePayload = {
    costing: options.costing ?? 'auto',
    ...shapePayload,
    shape_match: options.shapeMatch ?? DEFAULT_SHAPE_MATCH,
    id: options.id
  };
  const payload =
    targetEndpoint === 'trace_attributes'
      ? {
          ...basePayload,
          trace_options: limitOptions
        }
      : {
          ...basePayload,
          ...limitOptions
        };
  try {
    const data = await performValhallaRequest(baseUrl, targetEndpoint, payload);
    const result = data as {
      trip?: {
        legs?: Array<{
          shape?: number[][] | string;
          matched_points?: Array<{ lat: number; lon: number }>;
        }>;
      };
      matched_points?: Array<{ lat: number; lon: number }>;
      error?: string;
      errors?: Array<{ code?: string | number; message?: string }>;
      status?: { status?: number; code?: number; message?: string };
    } | null;
    const leg = result?.trip?.legs?.[0];
    const globalShape = (result as any)?.shape;
    const shapeValue = leg?.shape ?? globalShape;
    const matchedPoints = extractMatchedPoints(result ?? data);

    let decodedShape: LatLonPoint[] = [];
    if (typeof shapeValue === 'string' && shapeValue.length > 0) {
      decodedShape = decodePolyline(shapeValue);
    } else if (Array.isArray(shapeValue)) {
      const validShape = shapeValue.filter((coord: unknown): coord is number[] =>
        Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number'
      );
      if (validShape.length > 0) {
        const order = guessCoordinateOrder(validShape, points);
        decodedShape = validShape.map((coord: number[]) => mapShapeEntry(coord, order));
      }
    }

    decodedShape = normalizeDecodedShape(decodedShape);
    const dedupedMatchedPoints = deduplicateSequentialPoints(matchedPoints);
    const routeArea = boundingBoxArea(points);
    const shapeArea = boundingBoxArea(decodedShape);
    const shapeTooSmall =
      routeArea > 0 ? shapeArea / routeArea < 0.5 : decodedShape.length < dedupedMatchedPoints.length;

    if ((decodedShape.length < MIN_SHAPE_POINTS || shapeTooSmall) && dedupedMatchedPoints.length >= MIN_SHAPE_POINTS) {
      decodedShape = dedupedMatchedPoints;
    }

    console.info('VALHALLA_DECODED_SHAPE', stringifyForLog(decodedShape));

    if (decodedShape.length === 0 && dedupedMatchedPoints.length >= MIN_SHAPE_POINTS) {
      return {
        shape: dedupedMatchedPoints,
        matchedPoints: dedupedMatchedPoints
      };
    }

    if (decodedShape.length === 0) {
      return {
        shape: points,
        matchedPoints
      };
    }

    return {
      shape: decodedShape,
      matchedPoints
    };
  } catch (error) {
    console.warn('Valhalla matching failed', error);
    return {
      shape: points,
      matchedPoints: []
    };
  }
}

export async function traceRouteSummary(
  shapePoints: LatLonPoint[],
  options: TraceRouteSummaryOptions = {}
): Promise<ValhallaTraceSummary | null> {
  const baseUrl = await loadConfiguredBaseUrl();
  if (!baseUrl) return null;

  const cleanedPoints = deduplicateSequentialPoints(shapePoints);
  if (cleanedPoints.length < MIN_SHAPE_POINTS) {
    return null;
  }

  const payload = {
    costing: options.costing ?? 'auto',
    shape: cleanedPoints.map((point) => [point.latitude, point.longitude]),
    shape_match: options.shapeMatch ?? DEFAULT_SHAPE_MATCH,
    id: options.id,
    trace_options: {
      gps_accuracy: options.gpsAccuracy ?? DEFAULT_GPS_ACCURACY,
      search_radius: options.searchRadius ?? DEFAULT_SEARCH_RADIUS
    }
  };

  const data = await performValhallaRequest(baseUrl, 'trace_route', payload);
  const result = data as {
    trip?: {
      summary?: ValhallaTraceSummary;
      legs?: Array<{ summary?: ValhallaTraceSummary }>;
    };
  } | null;
  return result?.trip?.summary ?? result?.trip?.legs?.[0]?.summary ?? null;
}
