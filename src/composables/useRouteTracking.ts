import { ref, computed } from 'vue';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { db, type Route, type Waypoint } from '@/services/database';

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

  let watchId: string | null = null;
  let startTime: Date | null = null;
  let lastPosition: Position | null = null;
  let durationInterval: number | null = null;
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

          state.value.currentPosition = position;

          // Calculate distance if we have a previous position
          if (lastPosition && position.coords) {
            const distanceIncrement = calculateDistance(
              lastPosition.coords.latitude,
              lastPosition.coords.longitude,
              position.coords.latitude,
              position.coords.longitude
            );

            // Only add distance if movement is significant (> 2 meters) to filter GPS noise
            if (distanceIncrement > 2) {
              state.value.distance += distanceIncrement;
              
              // Create waypoint every ~20 meters
              if (state.value.distance - (state.value.waypoints.length * 20) >= 20) {
                await addPositionWaypoint(position);
              }
            }
          }

          lastPosition = position;
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
  };

  return {
    // State
    isTracking,
    isPaused,
    currentPosition,
    distance,
    duration,
    waypoints,
    
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
