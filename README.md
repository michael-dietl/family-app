# dietl.mobi

**dietl.mobi** is an Ionic 8 + Vue 3 mobile and web experience for managing photo galleries alongside a wine cellar catalog. It targets Android and browsers via Capacitor, tapping native APIs (Camera, Geolocation, Filesystem, SQLite, Haptics) while keeping the UI in Vue 3 Composition API components.

## Architecture at a Glance

- **Framework**: Ionic 8 with Vue 3 `script setup` + TypeScript, powered by Vite 5.
- **State & Services**: Reactive composables (`useGallery`, `usePhoto`, `useRouteTracking`, `usePocketbaseSync`, etc.) manage business logic instead of Pinia/Vuex.
- **Storage**: `@capacitor-community/sqlite` handles local persistence (galleries, photos, wines, routes). Valhalla and PocketBase integrations live under `src/services/`.
- **Routing**: `@ionic/vue-router` using HTML5 history (`/` → `/gallery`, `/gallery/:id` for details).

## Core Features

- **Gallery Management**: Create galleries, capture or pick photos, view metadata in a lightbox, and display GPS-tagged images on maps.
- **Route Tracking**: Capture GPS tracks, smooth them (`PositionSmoother`), then match/summarize with Valhalla (`matchPositionsWithValhalla`, `traceRouteSummary`) using `trace_attributes` for pedestrians and `trace_route` elsewhere.
- **Wine Cellar**: Add wines with vintages, tasting notes, and manage them alongside photos.
- **PocketBase Sync**: Bi-directional sync for galleries, photos, and books with progress reporting via `syncProgressState` and a background sync helper.

## Localisation & Theming

- Translations live in `src/i18n/{de,en,it,fr,bar}.ts` and register through `src/i18n/index.ts`. A large `auto` dictionary covers reusable strings, plus dedicated sections for UI and settings.
- Themes are orchestrated via `src/services/theme.ts` (`applyTheme`, `availableThemes`, persistence of palette choice).

## Native Integration

- Capacitor plugins enable Camera, Geolocation, Filesystem, SQLite, Haptics, and optional background tasks; Android output is under `android/` and needs `npx cap sync` after plugin changes.
- Photos are stored under `Directory.Data/galleries/{galleryId}/` with Base64 thumbnails and metadata stored in SQLite.

## Developer Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the dev server:
   ```bash
   npm run dev
   ```
3. Production build / sync to Android:
   ```bash
   npm run build
   npx cap sync android
   npx cap run android --target <device>
   ```
4. Tests & lint:
   - Unit: `npm run test:unit`
   - E2E: `npm run test:e2e`
   - Lint: `npm run lint`
5. Utilities in `scripts/` help with i18n extraction/translations.

Please keep this README updated as major features evolve, especially around sync behaviour, Valhalla usage, or Capacitor integrations.