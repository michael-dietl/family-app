import type { LatLonPoint } from '@/services/positionSmoothing';

export interface ValhallaMatchOptions {
  costing?: string;
  id?: string;
  maxPoints?: number;
}

//const BASE_URL = (import.meta.env.VITE_VALHALLA_BASE_URL || '').replace(/\/$/, '');
const BASE_URL = ('http://192.168.1.108:8002');
const DEFAULT_MAX_POINTS = 400;

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

export async function matchPositionsWithValhalla(
  allPoints: LatLonPoint[],
  options: ValhallaMatchOptions = {}
): Promise<LatLonPoint[]> {
  if (!BASE_URL || allPoints.length < 3) {
    return allPoints;
  }

  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  const points = allPoints.slice(-maxPoints);
  const payload = {
    costing: options.costing ?? 'auto',
    shape: points.map((point) => [point.longitude, point.latitude]),
    shape_format: 'json',
    id: options.id
  };

  try {
    const response = await fetch(`${BASE_URL}/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Valhalla responded with ${response.status}`);
    }

    const result = await response.json();
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
