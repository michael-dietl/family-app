import KalmanFilter from 'kalmanjs';
import savitzkyGolay from 'ml-savitzky-golay';
import type { Position } from '@capacitor/geolocation';

export interface LatLonPoint {
  latitude: number;
  longitude: number;
  timestamp?: number;
}

interface PositionSmootherOptions {
  windowSize?: number;
  polynomial?: number;
  pad?: 'none' | 'pre' | 'post';
  maxHistory?: number;
  kalmanR?: number;
  kalmanQ?: number;
}

const ensureOdd = (value: number): number => (value % 2 === 0 ? value - 1 : value);

export class PositionSmoother {
  private readonly latFilter: KalmanFilter;
  private readonly lonFilter: KalmanFilter;
  private readonly windowSize: number;
  private readonly pad: 'none' | 'pre' | 'post';
  private readonly maxHistory: number;
  private readonly polynomial: number;
  private readonly latHistory: number[] = [];
  private readonly lonHistory: number[] = [];

  constructor(options: PositionSmootherOptions = {}) {
    const windowSize = ensureOdd(options.windowSize ?? 9);
    this.windowSize = Math.max(windowSize, 3);
    this.pad = options.pad ?? 'post';
    this.polynomial = options.polynomial ?? 3;
    this.maxHistory = options.maxHistory ?? this.windowSize * 3;

    const kalmanConfig = {
      R: options.kalmanR ?? 0.01,
      Q: options.kalmanQ ?? 3
    };

    this.latFilter = new KalmanFilter(kalmanConfig);
    this.lonFilter = new KalmanFilter(kalmanConfig);
  }

  public smooth(position: Position): LatLonPoint {
    const { latitude, longitude } = position.coords;

    const filteredLat = this.latFilter.filter(latitude);
    const filteredLon = this.lonFilter.filter(longitude);

    const smoothedLat = this.applySavitzky(this.latHistory, filteredLat);
    const smoothedLon = this.applySavitzky(this.lonHistory, filteredLon);

    return {
      latitude: smoothedLat,
      longitude: smoothedLon,
      timestamp: position.timestamp
    };
  }

  private applySavitzky(history: number[], nextValue: number): number {
    history.push(nextValue);
    if (history.length > this.maxHistory) {
      history.shift();
    }

    if (history.length < this.windowSize) {
      return history[history.length - 1];
    }

    const smoothed = savitzkyGolay(history, 1, {
      windowSize: this.windowSize,
      derivative: 0,
      polynomial: this.polynomial,
      pad: this.pad
    });

    return smoothed[smoothed.length - 1];
  }
}
