# Copilot Instructions for dietl.mobi

## Project Overview
**dietl.mobi** ist eine Ionic + Vue 3 + Capacitor Mobile App für **Bildergalerie-Management** (ähnlich Piwigo) und **Weinkeller-Verwaltung**. Die App läuft auf Android und Web mit nativen Capabilities.

## Architecture

### Stack
- **Framework**: Ionic 8 mit Vue 3 Composition API (`<script setup>`)
- **Build Tool**: Vite 5 mit TypeScript
- **Native Bridge**: Capacitor 8 (appId: `io.ionic.starter`)
- **Storage**: SQLite (@capacitor-community/sqlite) - später Migration zu PocketBase geplant
- **Router**: `@ionic/vue-router` (web history mode)
- **Testing**: Vitest (unit), Cypress (e2e)

### Project Structure
- `src/services/` - Core Services (database.ts für SQLite CRUD)
- `src/composables/` - Vue Composables (useGallery, usePhoto für State Management)
- `src/pages/` - Feature Pages (GalleryPage, GalleryDetailPage, MapPage, WinePage)
- `src/views/` - Root Views (HomePage - aktuell nicht genutzt wegen Redirect)
- `src/components/` - Shared Components (leer - bei Bedarf ergänzen)
- `android/` - Native Android Projekt (Capacitor-generated)

### Key Dependencies
- **Capacitor Plugins**: Camera, Geolocation, Filesystem, SQLite, Haptics
- **UI**: Ionicons, Leaflet (Maps)
- **Image Processing**: exifreader (EXIF-Metadaten Extraktion)

## Development Workflows

### Development Server
```bash
npm run dev           # Vite dev server
npm run preview       # Production build preview
```

### Mobile Development
```bash
npx cap sync          # WICHTIG: Nach Plugin-Änderungen! Synct dist/ → android/
npx cap open android  # Android Studio öffnen
npx cap run android   # Build + Run auf Device/Emulator
```

### Testing & Building
```bash
npm run build         # TypeScript check + Vite build → dist/
npm run test:unit     # Vitest tests
npm run test:e2e      # Cypress tests
npm run lint          # ESLint check
```

### Fehleranalyse
```bash
adb logcat
```

## Code Conventions

### Vue Components
- **Immer** Composition API mit `<script setup lang="ts">`
- **Ionic Components** explizit importieren: `import { IonPage, IonHeader, IonToolbar } from '@ionic/vue'`
- **Component Wrapping**: Alle Pages in `<ion-page>` → `<ion-header>` → `<ion-content>` Struktur
- **Path Alias**: `@/` für `src/` (z.B. `import GalleryPage from '@/pages/GalleryPage.vue'`)

### Routing Pattern
- Routes in [src/router/index.ts](src/router/index.ts) mit `createWebHistory`
- Default Redirect: `/` → `/gallery`
- Dynamic Routes: `/gallery/:id` für Detail-Ansichten

### TypeScript Configuration
- Strict mode mit Vue-specific types
- Vite environment types via `vite-env.d.ts`
- Test globals in [vite.config.ts](vite.config.ts)

### Ionic Specifics
- **Dark Mode**: System preference detection (`@ionic/vue/css/palettes/dark.system.css`)
- **Headers**: Collapsible headers mit `collapse="condense"` für large titles
- **Modals**: Für Dialoge (Create Gallery, Photo Details)
- **Action Sheets**: Für Kontextmenüs (Photo Options, Gallery Menu)

## Data Architecture

### SQLite Schema
Definiert in [src/services/database.ts](src/services/database.ts):

**galleries table**:
- `id`, `name`, `description`, `coverPhotoId`, `created`, `updated`

**photos table**:
- Basic: `id`, `galleryId` (FK), `filename`, `filepath`, `thumbnail`, `mimeType`, `filesize`
- Dimensions: `width`, `height`
- EXIF: `dateTaken`, `camera`, `lens`, `focalLength`, `aperture`, `shutterSpeed`, `iso`
- Location: `latitude`, `longitude`
- Timestamp: `created`

### State Management Pattern
- **Composables** statt Pinia/Vuex für reaktiven State
- [src/composables/useGallery.ts](src/composables/useGallery.ts): Gallery CRUD + Liste Management
- [src/composables/usePhoto.ts](src/composables/usePhoto.ts): Camera API, EXIF Extraktion, File Storage

### Database Service
[src/services/database.ts](src/services/database.ts) exportiert `db` Singleton mit:
- `initialize()` - MUSS vor erster Nutzung aufgerufen werden
- Gallery CRUD: `createGallery()`, `getGalleries()`, `getGallery()`, `updateGallery()`, `deleteGallery()`
- Photo CRUD: `createPhoto()`, `getPhotosByGallery()`, `getPhoto()`, `deletePhoto()`, `getPhotoCount()`

## Critical Integration Points

### Capacitor Native Features
Bei nativen Features:
1. Plugin via npm installieren (`@capacitor/plugin-name`)
2. **IMMER `npx cap sync` ausführen** (im Projekt-Root!)
3. Android Permissions in `android/app/src/main/AndroidManifest.xml` prüfen

### File Storage Pattern
- Fotos werden in `Directory.Data/galleries/{galleryId}/` gespeichert
- Base64-Encoding für Filesystem API
- Filepath in DB speichern für spätere Abfrage
- Bei Photo-Delete: Filesystem + DB Cleanup

### EXIF Data Extraction
- `exifreader` Library in [usePhoto.ts](src/composables/usePhoto.ts)
- Extrahiert automatisch bei Photo-Upload: Camera, GPS, Settings
- Fallback bei fehlenden EXIF-Daten (keine Errors)

### Build Output
- Vite buildet nach `dist/` (konfiguriert in [capacitor.config.ts](capacitor.config.ts) als `webDir`)
- Legacy Browser Support via `@vitejs/plugin-legacy`
- Android referenziert via `app/src/main/assets/public/`

## Feature Implementations

### Gallery Feature (Fertig)
- **GalleryPage**: Grid-View aller Gallerien, Create-Dialog, Empty State
- **GalleryDetailPage**: Photo Grid, Slideshow mit Navigation, EXIF-Details Panel, Photo/Gallery Delete
- **Photo Upload**: Camera/Gallery Picker, EXIF Auto-Extract, Filesystem Storage
- **Routing**: `/gallery` (Liste) + `/gallery/:id` (Detail)

### Wine Feature (TODO)
- Geplant: SQLite Schema für Weine (Name, Jahrgang, Lagerort, Notizen)
- Später: Migration zu PocketBase für Cloud-Sync

### Map Feature (TODO)
- Geplant: Leaflet Integration mit Geolocation API
- Foto-Pins auf Karte basierend auf GPS EXIF-Daten

