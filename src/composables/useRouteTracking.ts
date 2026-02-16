import { ref, computed } from 'vue';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { db, type Route, type Waypoint } from '@/services/database';
import { PositionSmoother, type LatLonPoint } from '@/services/positionSmoothing';
import { matchPositionsWithValhalla, type ValhallaEndpoint } from '@/services/valhalla';

export interface TrackingState {
  isTracking: boolean;
  isPaused: boolean;
  currentPosition: Position | null;
  distance: number; // meters
  duration: number; // seconds
  waypoints: Waypoint[];
}

type TravelMode = NonNullable<Route['travelMode']>;

interface TrackingProfile {
  waypointDistanceMeters: number;
  waypointIntervalMs: number;
  persistDistanceMeters: number;
  requiredAccuracyMeters?: number;
  minSpeedMs?: number;
  matchDelayMs?: number;
  valhallaGpsAccuracy?: number;
  valhallaSearchRadius?: number;
  valhallaShapeMatch?: string;
  valhallaEndpoint?: ValhallaEndpoint;
}

const TRACKING_PROFILES: Record<TravelMode, TrackingProfile> = {
  pedestrian: {
    waypointDistanceMeters: 3,
    waypointIntervalMs: 1000,
    persistDistanceMeters: 2,
    requiredAccuracyMeters: 10,
    matchDelayMs: 1000,
    valhallaGpsAccuracy: 20,
    valhallaSearchRadius: 50,
    valhallaShapeMatch: 'map_snap',
    valhallaEndpoint: 'trace_attributes'
  },
  bicycle: {
    waypointDistanceMeters: 5,
    waypointIntervalMs: 1500,
    persistDistanceMeters: 3,
    requiredAccuracyMeters: 15,
    matchDelayMs: 1500
  },
  motor_scooter: {
    waypointDistanceMeters: 6,
    waypointIntervalMs: 1300,
    persistDistanceMeters: 5,
    requiredAccuracyMeters: 15,
    matchDelayMs: 1300
  },
  car: {
    waypointDistanceMeters: 12,
    waypointIntervalMs: 2000,
    persistDistanceMeters: 10,
    requiredAccuracyMeters: 20,
    minSpeedMs: 0.5
    ,
    matchDelayMs: 2500
  }
};

const DEFAULT_PROFILE = TRACKING_PROFILES.car;

export const resolveTrackingProfile = (mode: Route['travelMode'] | undefined): TrackingProfile => {
  const chosen: TravelMode = (mode ?? 'car') as TravelMode;
  return TRACKING_PROFILES[chosen] || DEFAULT_PROFILE;
};

export function useRouteTracking() {
    const state = ref<TrackingState>({
      isTracking: false,
      isPaused: false,
      currentPosition: null,
      distance: 0,
      duration: 0,
      waypoints: []
    });
    const matchedPath = ref<LatLonPoint[]>([]);
    const resolveWaypointCoordinates = () => {
      if (matchedPath.value.length > 0) {
        const lastMatched = matchedPath.value[matchedPath.value.length - 1];
        return {
          latitude: lastMatched.latitude,
          longitude: lastMatched.longitude
        };
      }

      if (routePoints.length > 0) {
        const lastPoint = routePoints[routePoints.length - 1];
        return {
          latitude: lastPoint.latitude,
          longitude: lastPoint.longitude
        };
      }

      const currentCoords = state.value.currentPosition?.coords;
      if (currentCoords) {
        return {
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          altitude: currentCoords.altitude ?? undefined,
          accuracy: currentCoords.accuracy ?? undefined
        };
      }

      return null;
    };
  const smoother = new PositionSmoother();
  const routePoints: LatLonPoint[] = [];
  const MAX_ROUTE_POINTS = 1600;
  const MIN_MATCH_POINTS = 6;
  const DEFAULT_MATCH_DELAY_MS = 2500;
  let matchTimeout: number | null = null;
  let matchInFlight = false;

  let watchId: string | null = null;
  let startTime: Date | null = null;
  let lastPosition: Position | null = null;
  let durationInterval: number | null = null;
  let positionWaypointCount = 0;
  let currentRouteId: number | null = null;
  let activeProfile: TrackingProfile = DEFAULT_PROFILE;
  let activeTravelMode: TravelMode = 'car';
  let lastWaypointTimestamp = 0;
  let persistDistanceMeters = DEFAULT_PROFILE.persistDistanceMeters;

  const isTracking = computed(() => state.value.isTracking);
  const isPaused = computed(() => state.value.isPaused);
  const currentPosition = computed(() => state.value.currentPosition);
  const distance = computed(() => state.value.distance);
  const duration = computed(() => state.value.duration);
  const waypoints = computed(() => state.value.waypoints);

  // Calculate distance between two GPS coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const matchRouteWithValhalla = async () => {
    if (matchInFlight || routePoints.length < MIN_MATCH_POINTS) {
      return;
    }
    matchInFlight = true;
    try {
      const routeIdString = currentRouteId?.toString();
      const matched = await matchPositionsWithValhalla(routePoints, {
        gpsAccuracy: activeProfile.valhallaGpsAccuracy,
        searchRadius: activeProfile.valhallaSearchRadius,
        shapeMatch: activeProfile.valhallaShapeMatch,
        endpoint: activeProfile.valhallaEndpoint,
        costing: activeTravelMode,
        id: routeIdString
      });
      if (matched.shape.length >= MIN_MATCH_POINTS) {
        matchedPath.value = matched.shape;
      }
    } finally {
      matchInFlight = false;
    }
  };

  const scheduleValhallaMatch = () => {
    if (matchTimeout) {
      clearTimeout(matchTimeout);
    }
    const delayMs = activeProfile.matchDelayMs ?? DEFAULT_MATCH_DELAY_MS;
    matchTimeout = window.setTimeout(() => {
      matchTimeout = null;
      void matchRouteWithValhalla();
    }, delayMs);
  };

  const flushValhallaMatch = async () => {
    if (matchTimeout) {
      clearTimeout(matchTimeout);
      matchTimeout = null;
    }
    await matchRouteWithValhalla();
  };

  const pushRoutePoint = (point: LatLonPoint) => {
    routePoints.push(point);
    if (routePoints.length > MAX_ROUTE_POINTS) {
      routePoints.shift();
    }
    if (routePoints.length >= MIN_MATCH_POINTS) {
      scheduleValhallaMatch();
    }
  };

  const persistRoutePoints = async () => {
    if (!currentRouteId || routePoints.length === 0) return;

    //await db.deletePositionWaypoints(currentRouteId);

    let lastSavedPoint: LatLonPoint | null = null;
    for (const point of routePoints) {
      if (lastSavedPoint) {
        const distanceSinceLast = calculateDistance(
          lastSavedPoint.latitude,
          lastSavedPoint.longitude,
          point.latitude,
          point.longitude
        );
        if (distanceSinceLast < persistDistanceMeters) {
          continue;
        }
      }

      const timestamp = new Date(point.timestamp ?? Date.now()).toISOString();
      const waypoint: Omit<Waypoint, 'id'> = {
        routeId: currentRouteId,
        type: 'position',
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp,
        updated: timestamp
      };

      await db.createWaypoint(waypoint);
      lastSavedPoint = point;
    }
  };

  const startTracking = async (routeId: number, travelMode: Route['travelMode'] = 'car') => {
    try {
      // Request permissions
      const permission = await Geolocation.requestPermissions();
      if (permission.location !== 'granted') {
        throw new Error('Location permission denied');
      }

      currentRouteId = routeId;
      startTime = new Date();
      state.value.isTracking = true;
      state.value.isPaused = false;
      state.value.distance = 0;
      state.value.duration = 0;
      state.value.waypoints = [];
      lastPosition = null;
      routePoints.length = 0;
      matchedPath.value = [];
      positionWaypointCount = 0;
      if (matchTimeout) {
        clearTimeout(matchTimeout);
        matchTimeout = null;
      }
      matchInFlight = false;
      const chosenMode: TravelMode = (travelMode ?? 'car') as TravelMode;
      activeTravelMode = chosenMode;
      activeProfile = TRACKING_PROFILES[chosenMode] || DEFAULT_PROFILE;
      persistDistanceMeters = activeProfile.persistDistanceMeters;
      lastWaypointTimestamp = 0;

      // Start duration counter
      durationInterval = window.setInterval(() => {
        if (!state.value.isPaused && startTime) {
          state.value.duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
        }
      }, 1000);

      // Start watching position
      watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        },
        async (position, err) => {
          if (err) {
            console.error('Geolocation error:', err);
            return;
          }

          if (!position || state.value.isPaused) return;

          const smoothedPoint = smoother.smooth(position);
          const normalizedPosition: Position = {
            ...position,
            coords: {
              ...position.coords,
              latitude: smoothedPoint.latitude,
              longitude: smoothedPoint.longitude
            }
          };

          state.value.currentPosition = normalizedPosition;

          // Calculate distance if we have a previous position
          if (lastPosition && normalizedPosition.coords) {
            const distanceIncrement = calculateDistance(
              lastPosition.coords.latitude,
              lastPosition.coords.longitude,
              normalizedPosition.coords.latitude,
              normalizedPosition.coords.longitude
            );

            // Only add distance if movement is significant (> 2 meters)
            if (distanceIncrement > 2) {
              state.value.distance += distanceIncrement;

              const waypointDistance = Math.max(1, activeProfile.waypointDistanceMeters);
              const waypointInterval = Math.max(1, activeProfile.waypointIntervalMs);
              const distanceSinceLastWaypoint = state.value.distance - (positionWaypointCount * waypointDistance);
              const now = Date.now();
              const timeSinceLastWaypoint = now - lastWaypointTimestamp;
              if (
                positionWaypointCount === 0 ||
                distanceSinceLastWaypoint >= waypointDistance ||
                timeSinceLastWaypoint >= waypointInterval
              ) {
                lastWaypointTimestamp = now;
                await addPositionWaypoint(position);
              }
            }
          }

          lastPosition = normalizedPosition;
          pushRoutePoint({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp
          });
        }
      );

    } catch (error) {
      console.error('Error starting tracking:', error);
      throw error;
    }
  };

  const pauseTracking = () => {
    state.value.isPaused = true;
  };

  const resumeTracking = () => {
    state.value.isPaused = false;
  };

  const stopTracking = async (): Promise<void> => {
    if (!currentRouteId) return;

    // Stop watching position
    if (watchId) {
      await Geolocation.clearWatch({ id: watchId });
      watchId = null;
    }

    await flushValhallaMatch();

    try {
      await persistRoutePoints();
    } catch (error) {
      console.error('Error persisting full route track:', error);
    }
    routePoints.length = 0;

    // Stop duration counter
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    // Update route with final stats
    await db.updateRoute(currentRouteId, {
      endTime: new Date().toISOString(),
      distance: state.value.distance,
      duration: state.value.duration,
      isRecording: false
    });

    // Reset state
    state.value.isTracking = false;
    state.value.isPaused = false;
    currentRouteId = null;
    startTime = null;
    lastPosition = null;
  };

  const addPositionWaypoint = async (position: Position) => {
    if (!currentRouteId) return;

    const now = new Date().toISOString();
    const waypoint: Omit<Waypoint, 'id'> = {
      routeId: currentRouteId,
      type: 'position',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude || undefined,
      accuracy: position.coords.accuracy,
      timestamp: new Date(position.timestamp).toISOString(),
      updated: now
    };

    const waypointId = await db.createWaypoint(waypoint);
    state.value.waypoints.push({ ...waypoint, id: waypointId });
    positionWaypointCount += 1;
  };

    const addManualWaypoint = async (name: string, description?: string) => {
      if (!currentRouteId) return;

      const coords = resolveWaypointCoordinates();
      if (!coords) {
        console.warn('Unable to resolve manual waypoint location');
        return;
      }

      const now = new Date().toISOString();
      const currentCoords = state.value.currentPosition?.coords;
      const waypoint: Omit<Waypoint, 'id'> = {
        routeId: currentRouteId,
        type: 'manual',
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: currentCoords?.altitude ?? undefined,
        accuracy: currentCoords?.accuracy ?? undefined,
        name,
        description,
        timestamp: now,
        updated: now
      };

      const waypointId = await db.createWaypoint(waypoint);
      state.value.waypoints.push({ ...waypoint, id: waypointId });
    };

    const addPhotoWaypoint = async (photoId: number) => {
      if (!currentRouteId) return;

      const coords = resolveWaypointCoordinates();
      if (!coords) {
        console.warn('Unable to resolve photo waypoint location');
        return;
      }

      const now = new Date().toISOString();
      const currentCoords = state.value.currentPosition?.coords;
      const waypoint: Omit<Waypoint, 'id'> = {
        routeId: currentRouteId,
        type: 'photo',
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: currentCoords?.altitude ?? undefined,
        accuracy: currentCoords?.accuracy ?? undefined,
        photoId,
        timestamp: now,
        updated: now
      };

      const waypointId = await db.createWaypoint(waypoint);
      state.value.waypoints.push({ ...waypoint, id: waypointId });
    };

  const loadWaypoints = async (routeId: number) => {
    state.value.waypoints = await db.getWaypointsByRoute(routeId);
    positionWaypointCount = state.value.waypoints.filter((wp) => wp.type === 'position').length;
  };

  return {
    // State
    isTracking,
    isPaused,
    currentPosition,
    distance,
    duration,
    waypoints,
    matchedPath,
    
    // Methods
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    addManualWaypoint,
    addPhotoWaypoint,
    loadWaypoints
  };
}
