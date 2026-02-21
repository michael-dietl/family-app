# dietl.mobi Architecture Overview

## 1. Application Structure & Functionality

- **Core Experience:** dietl.mobi is a cross-platform Ionic 8 / Vue 3 application that runs via Capacitor on Android and the web. It combines a photo gallery, wine cellar manager, route tracker, and book helper into a single mobile-first experience.
- **UI Layer:** Every screen is built with Vue 3’s `<script setup>` Composition API and Ionic components such as `IonPage`, `IonHeader`, `IonToolbar`, `IonInput`, `IonSelect`, and modals/action sheets for dialogs. Pages are wrapped in the canonical `<ion-page> → <ion-header> → <ion-content>` structure for consistent native look & feel.
- **Styling & Theme:** Global styles live under `src/global.css` and `src/theme`. The app ships multiple color palettes (default, wine, forest, ocean) selectable through the settings page.
- **Routing & Navigation:** `@ionic/vue-router` in `src/router/index.ts` manages navigation with web-history mode. Dynamic routes (e.g., `/gallery/:id`, `/route/:id`) keep URLs shareable between the web and native shell.
- **Feature Highlights:**
  - **Gallery & Lightbox:** Photo management with exif-driven metadata, filters, manual GPS input, and lightbox-driven slideshows ([GalleryPage](src/pages/GalleryPage.vue), [GalleryDetailPage](src/pages/GalleryDetailPage.vue)).
  - **Route Tracking:** Records GPS routes with waypoint capture, Valhalla validation, and timeline entries ([RoutesPage](src/pages/RoutesPage.vue), [RouteDetailPage](src/pages/RouteDetailPage.vue)).
  - **Wine Inventory:** SQLite-backed wine cellar with rich metadata, photos, and configurable storage notes ([WinePage](src/pages/WinePage.vue)).
  - **Books & Shopping:** PocketBase sync for books and todo/shopping lists with ISBN scanning, categories, and task management.

## 2. Backend Systems & Links

- **PocketBase (https://pocketbase.io/):** Serves as the cloud synchronization backend for books, todo lists, and other user data. The app stores login credentials in the settings, detects the PocketBase token/state, and synchronizes changes via `usePocketbaseSync.ts` to keep local SQLite data mirrored with cloud records.
- **Valhalla (https://valhalla.github.io/):** Validates recorded GPS routes before they appear in the timeline. `useRouteTracking.ts` sends captured tracks to Valhalla’s route-matching API, and the response drives status badges, map overlays, and popup confirmations in `RouteDetailPage`.
- **Local Persistence:** `@capacitor-community/sqlite` backs all primary data (`galleries`, `photos`, `wine`, `routes`) via `src/services/database.ts`. Photo files themselves live under `Directory.Data/galleries/{galleryId}/` and are assigned EXIF metadata extracted with `exifreader` (handled in `usePhoto.ts`). This arrangement makes offline usage first-class while keeping the option to sync with PocketBase.

## 3. Module Breakdown

- **src/pages/** – Feature-aligned screens such as `GalleryPage`, `RoutesPage`, `WinePage`, `SettingsPage`, `BookDetailPage`, etc. Each page imports Ionic layouts, pulls in composables for behavior, and declares per-page CSS in scoped `<style>` blocks.
- **src/composables/** – Encapsulates reusable logic. Key composables include:
  - `useGallery.ts` (gallery CRUD, cover photo selection)
  - `usePhoto.ts` (camera integration, EXIF extraction, filesystem persistence, GPS metadata)
  - `useRouteTracking.ts` (GPS recording, Valhalla validation, modal editors)
  - `usePocketbaseSync.ts` (PocketBase credential handling, sync status, toast notifications)
  - `useLightbox.ts`, `useTimeline.ts`, `useTodoList.ts`, `useWakeLock.ts`, `useWine.ts`, `useShoppingList.ts` (feature-specific helpers)
- **src/services/** – Houses singleton services such as `database.ts` (initialization + CRUD for galleries/photos/wines/routes) and other helpers interacting with Capacitor plugins (Camera, Filesystem, Haptics).
- **src/components/** – Shared UI bits like map popups, modal editors, and the `GalleryMap` component that powers geo-visualizations.
- **src/i18n/** – vue-i18n localization files (`en`, `de`, `fr`, `it`, `bar`). Keys cover settings placeholders, storage modes, toast text, and the auto-generated strings used by the UI.
- **src/utils/** – Utility helpers referenced across the app (helpers for formatting, storage location detection, etc.).
- **src/router/** – Defines navigation guards, dynamic route loading, and default redirects (e.g., `/` → `/gallery`).
- **tests/** – Vitest unit tests and Cypress end-to-end suites ensure critical flows stay stable.
- **scripts/** – Automation helpers for translation extraction (`extract-i18n.js`), sanitization, and generating missing keys.

Each module interacts through the Composition API: pages consume composables, which call services and emit events to Ionic components. Modules are intentionally decoupled so that UI changes or backend switches (e.g., migrating off PocketBase) can be scoped to the relevant composable/service while keeping the presentation layer untouched.