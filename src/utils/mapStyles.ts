export type MapStyle = 'street' | 'outdoor' | 'dark';

export interface MapStyleConfig {
  value: MapStyle;
  labelKey: string;
  tileUrl: string;
  attribution: string;
  maxZoom?: number;
}

export const DEFAULT_MAP_STYLE: MapStyle = 'street';

export const MAP_STYLE_CONFIGS: MapStyleConfig[] = [
  {
    value: 'street',
    labelKey: 'auto.map_style_street',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  },
  {
    value: 'outdoor',
    labelKey: 'auto.map_style_outdoor',
    tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap contributors',
    maxZoom: 17
  },
  {
    value: 'dark',
    labelKey: 'auto.map_style_dark',
    tileUrl: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png',
    attribution: '© Stamen / OpenStreetMap',
    maxZoom: 19
  }
];
