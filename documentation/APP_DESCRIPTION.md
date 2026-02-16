# dietl.mobi

**dietl.mobi** is an Ionic 8 + Vue 3 mobile/web application that combines gallery management and wine cellar tracking. The app targets Android and the browser via Capacitor, exposing native features such as camera access, geolocation, and SQLite storage.

## Architecture

- **Framework**: Ionic 8 + Vue 3 with the `<script setup>` composition API and TypeScript.
- **Build Tooling**: Vite 5 powers dev server, unit (`vitest`) and e2e (`cypress`) tests, and production builds.
- **Capacitor Bridge**: Capacitor 8 exposes plugins for Camera, Filesystem, Geolocation, SQLite, Haptics, and more.
- **Routing**: `@ionic/vue-router` with web history mode, defaulting `/` → `/gallery` and `/gallery/:id` for detail views.
- **State Management**: Lightweight composables (no Pinia/Vuex) encapsulate domain logic like `useGallery`, `usePhoto`, `usePocketbaseSync`, `useRouteTracking`, etc.
- **Storage**: SQLite via `@capacitor-community/sqlite` encapsulated in `src/services/database.ts`; entities include galleries, photos, wines, and routes.

## Core Features

- **Galleries**: Create galleries, attach many photos, view metadata on tiles, and open a lightbox with OrientationSync.
- **Photos**: Capture via camera or pick from disk, extract EXIF (via `exifreader`), store base64 thumbnails, and persist filepaths in SQLite.
- **Route Tracking**: Record GPS tracks, smooth with `PositionSmoother`, match against Valhalla (`matchPositionsWithValhalla`) and summarize routes (`traceRouteSummary`). Pedestrian mode uses `trace_attributes` while other profiles use `trace_route`.
- **Wine Management**: Track bottles, vintages, tasting notes, and optional PocketBase sync for remote storage.
- **Sync**: PocketBase sync composable (`usePocketbaseSync`) handles galleries/photos/books uploads/downloads, emits progress, and now runs via a background sync helper so the UI can listen to `syncProgressState` without blocking.

## Data Flow

- SQLite stores primary records (galleries, photos, routes, tastes).
- PocketBase sync uploads local records with `foreignID` bridging and downloads remote updates, reusing helper utilities for file upload (`uploadPhotoPicture`, `uploadCoverForBook`).
- Valhalla requests (match, trace summary) go through `src/services/valhalla.ts`, which centralizes HTTP handling, error normalization, polyline decoding, and caching of the base URL from Preferences.

## i18n & Theming

- Translations live under `src/i18n/{de,en,it,fr,bar}.ts` and are registered via `src/i18n/index.ts`. The app leans on a large `auto` dictionary for reused strings plus scoped sections (app, settings, buttons).
- Themes are managed through `src/services/theme.ts` with `applyTheme`, `availableThemes`, and persistence of the user’s palette choice.

## Native Integrations

- Capacitor plugins enable camera uploads, geolocation for routes, haptic feedback, and optional background sync. Android builds live under `android/` and rely on `npx cap sync` after plugin changes.
- Image data is stored in `Directory.Data/galleries/{id}/` with Base64 conversions handled in `usePhoto.ts` when saving.

## Developer Workflow

1. `npm install` + `npx cap sync` after plugin changes.
2. Run `npm run dev` for Vite or `npm run build` before `npx cap copy`/`run`.
3. Tests: `npm run test:unit` (Vitest) and `npm run test:e2e` (Cypress).
4. Linting: `npm run lint`.
5. Sync & docs helpers exist under `scripts/` for i18n extraction and translation assistance.

Keep this file accurate as you add features, especially when the navigation stack, syncing behavior, or Valhalla integration evolves.