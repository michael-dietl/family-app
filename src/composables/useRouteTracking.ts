import { ref, computed } from 'vue';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { db, type Route, type Waypoint } from '@/services/database';
import { PositionSmoother, type LatLonPoint } from '@/services/positionSmoothing';
import { matchPositionsWithValhalla } from '@/services/valhalla';

export interface TrackingState {
  isTracking: boolean;
  isPaused: boolean;
  currentPosition: Position | null;
  distance: number; // meters
  duration: number; // seconds
  waypoints: Waypoint[];
}

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
  const smoother = new PositionSmoother();
  const routePoints: LatLonPoint[] = [];
  const MAX_ROUTE_POINTS = 1600;
  const MIN_MATCH_POINTS = 6;
  const MATCH_DELAY_MS = 2500;
  const MIN_PERSIST_DISTANCE_METERS = 1;
  let matchTimeout: number | null = null;
  let matchInFlight = false;

  let watchId: string | null = null;
  let startTime: Date | null = null;
  let lastPosition: Position | null = null;
  let durationInterval: number | null = null;
  let positionWaypointCount = 0;
  let currentRouteId: number | null = null;

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
      const matched = await matchPositionsWithValhalla(routePoints);
      if (matched.length >= MIN_MATCH_POINTS) {
        matchedPath.value = matched;
      }
    } finally {
      matchInFlight = false;
    }
  };

  const scheduleValhallaMatch = () => {
    if (matchTimeout) {
      clearTimeout(matchTimeout);
    }
    matchTimeout = window.setTimeout(() => {
      matchTimeout = null;
      void matchRouteWithValhalla();
    }, MATCH_DELAY_MS);
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
        if (distanceSinceLast < MIN_PERSIST_DISTANCE_METERS) {
          continue;
        }
      }

      const waypoint: Omit<Waypoint, 'id'> = {
        routeId: currentRouteId,
        type: 'position',
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: new Date(point.timestamp ?? Date.now()).toISOString()
      };

      await db.createWaypoint(waypoint);
      lastSavedPoint = point;
    }
  };

  const startTracking = async (routeId: number) => {
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

              // Create waypoint every ~20 meters
              const distanceSinceLastWaypoint = state.value.distance - (positionWaypointCount * 20);
              if (positionWaypointCount === 0 || distanceSinceLastWaypoint >= 20) {
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

    const waypoint: Omit<Waypoint, 'id'> = {
      routeId: currentRouteId,
      type: 'position',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude || undefined,
      accuracy: position.coords.accuracy,
      timestamp: new Date(position.timestamp).toISOString()
    };

    const waypointId = await db.createWaypoint(waypoint);
    state.value.waypoints.push({ ...waypoint, id: waypointId });
    positionWaypointCount += 1;
  };

  const addManualWaypoint = async (name: string, description?: string) => {
    if (!currentRouteId || !state.value.currentPosition) return;

    const position = state.value.currentPosition;
    const waypoint: Omit<Waypoint, 'id'> = {
      routeId: currentRouteId,
      type: 'manual',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude || undefined,
      accuracy: position.coords.accuracy,
      name,
      description,
      timestamp: new Date().toISOString()
    };

    const waypointId = await db.createWaypoint(waypoint);
    state.value.waypoints.push({ ...waypoint, id: waypointId });
  };

  const addPhotoWaypoint = async (photoId: number, latitude: number, longitude: number) => {
    if (!currentRouteId) return;

    const waypoint: Omit<Waypoint, 'id'> = {
      routeId: currentRouteId,
      type: 'photo',
      latitude,
      longitude,
      photoId,
      timestamp: new Date().toISOString()
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
