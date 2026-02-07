<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons>
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>{{ $t('auto.timeline_title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-searchbar
        v-model="searchQuery"
        :debounce="200"
        :placeholder="$t('auto.suchen')"
        class="timeline-search"
        show-clear-button="focus"
      />
      <div class="timeline-filter-row">
        <ion-segment v-model="activeFilter" class="timeline-filter">
          <!-- Status Badges -->
          <div class="status-badges">
            <ion-chip @click="toggleFilterGallery" outline="true">
              <ion-label>{{ $t('timeline_gallery') }}</ion-label>
            </ion-chip>
            
            <ion-chip  @click="toggleFilterRoutes" outline="true">
               <ion-label>{{ $t('timeline_routes') }}</ion-label>
            </ion-chip>
            
            <ion-chip @click="toggleFilterEvents" outline="true">
              <ion-label>{{ $t('timeline_events') }}</ion-label>
            </ion-chip>
          </div>
        </ion-segment>
      </div>
      <ion-segment v-model="activeTab" class="timeline-tabs">
        <ion-segment-button value="timeline">Timeline</ion-segment-button>
        <ion-segment-button value="events">Events</ion-segment-button>
      </ion-segment>
      <div v-if="isBusy">
        <div class="timeline-loading">
          <ion-spinner />
        </div>
      </div>
      <div v-else>
        <div v-if="activeTab === 'timeline'">
          <section class="timeline-section">
            <div v-if="timelineBars.length > 0" class="timeline-axis">
              <div class="axis-line" />
              <div
                v-for="bar in timelineBars"
                :key="bar.key"
                class="timeline-bar gallery-bar"
                :style="{ left: bar.left, width: bar.width, backgroundColor: bar.color || '#3880ff', top: '-18px' }"
                @click="openGallery(bar.id)">
                <ion-icon :icon="imagesOutline" size="small" />
                <span class="gallery-label">{{ bar.name }}</span>
              </div>
              <div v-for="event in filteredEvents" :key="event.id" class="timeline-event-bar" :style="eventBarStyle(event)">
                <ion-icon :icon="calendarNumber" size="small" />
                <span class="event-label">{{ event.title }}</span>
              </div>
              <div class="timeline-labels">
                <span>{{ formatDate(axisStart) }}</span>
                <span>{{ formatDate(axisEnd) }}</span>
              </div>
            </div>
            <div v-else class="timeline-empty">
              <p>
                <span v-if="searchQuery">{{ $t('auto.timeline_no_gallery_matches') }}</span>
                <span v-else>{{ $t('auto.timeline_gallery_hint') }}</span>
              </p>
            </div>
            <!-- Manuelles Event-Formular -->
            <section class="manual-event-form">
              <ion-card>
                <ion-card-header>
                  <ion-card-title>{{ $t('auto.timeline_create_event') }}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                  <ion-input
                    v-model="manualTitle"
                    placeholder="$t('auto.timeline_manual_events')"
                    @keyup.enter="handleSaveManualEvent"
                  />
                  <ion-textarea
                    v-model="manualDescription"
                    placeholder="$t('auto.timeline_attach_photos')"
                    :rows="2"
                    auto-grow
                  />
                  <div class="manual-actions">
                    <ion-datetime
                      v-model="manualStart"
                      presentation="date"
                      display-format="DD.MM.YYYY"
                      placeholder="$t('auto.timeline_start_date')"
                    />
                    <ion-datetime
                      v-model="manualEnd"
                      presentation="date"
                      display-format="DD.MM.YYYY"
                      placeholder="$t('auto.timeline_end_date')"
                    />
                    <ion-button fill="clear" @click="handlePickPhotos">
                      <ion-icon :icon="imagesOutline" />
                      {{ $t('auto.timeline_attach_photos') }}
                    </ion-button>
                    <ion-button fill="solid" color="primary" @click="handleSaveManualEvent" :disabled="isSubmitting">
                      {{ $t('auto.timeline_create_event') }}
                    </ion-button>
                  </div>
                  <div v-if="pendingPhotos.length > 0" class="pending-photos">
                    <div v-for="(photo, idx) in pendingPhotos" :key="idx" class="pending-thumb">
                      <img :src="getPendingPhotoSrc(photo)" />
                      <ion-button fill="clear" color="danger" @click="removePendingPhoto(idx)">×</ion-button>
                    </div>
                  </div>
                </ion-card-content>
              </ion-card>
            </section>
          </section>
        </div>
        <div v-else>
          <section class="manual-event-list">
            <header>
              <h3>{{ $t('auto.timeline_manual_events') }}</h3>
            </header>
            <div v-if="filteredEvents.length === 0" class="empty-state">
              <ion-icon :icon="imagesOutline" size="large" />
              <p>
                <span v-if="searchQuery">{{ $t('auto.timeline_no_event_matches') }}</span>
                <span v-else>{{ $t('auto.timeline_no_manual_events') }}</span>
              </p>
            </div>
            <article
              v-for="event in filteredEvents"
              :key="event.id"
              class="event-row"
            >
              <div class="event-content">
                <div class="event-title">{{ event.title }}</div>
                <div class="event-date">
                  {{ formatDate(event.startDate) }}
                  <span v-if="event.endDate">− {{ formatDate(event.endDate) }}</span>
                </div>
                <p v-if="event.description" class="event-description">{{ event.description }}</p>
              </div>
              <div class="event-meta">
                <ion-badge v-if="getAttachmentsForEvent(event.id)?.length">
                  {{ getAttachmentsForEvent(event.id).length }}
                </ion-badge>
                <div class="attachment-preview" v-if="getAttachmentsForEvent(event.id).length">
                  <img
                    v-for="photo in getAttachmentsForEvent(event.id)"
                    :key="photo.id"
                    :src="getAttachmentSrc(photo.filepath)"
                    loading="lazy"
                  />
                </div>
              </div>
            </article>
          </section>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">

import { computed, onMounted, ref } from 'vue';
const activeTab = ref('timeline');
const activeFilter = ref<'gallery' | 'route' | 'event'>('gallery');

import { db, type Route } from '@/services/database';
const routes = ref<Route[]>([]);
const loadRoutes = async () => {
  routes.value = await db.getRoutes();
};

onMounted(async () => {
  isTimelineLoading.value = true;
  await loadGalleries();
  await loadEvents();
  await loadRoutes();
  isTimelineLoading.value = false;
});
import { calendarNumber } from 'ionicons/icons';
import type { CSSProperties } from 'vue';

interface TimelineEvent {
  id?: number;
  title: string;
  startDate: string;
  endDate?: string | null;
  description?: string;
}

const eventBarStyle = (event: TimelineEvent): CSSProperties => {
  // Positioniere Event unter der Linie, nach Datum
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  const start = Math.max(min, Date.parse(event.startDate) || min);
  const left = Math.min(100, Math.max(0, ((start - min) / span) * 100));
  return {
    left: `${left}%`,
    width: 'auto',
    top: '18px',
    position: 'absolute'
  };
};
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonInput,
  IonTextarea,
  IonDatetime,
  IonButton,
  IonIcon,
  IonSpinner,
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonSearchbar
} from '@ionic/vue';
import { imagesOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { useGallery } from '@/composables/useGallery';
import { useTimeline } from '@/composables/useTimeline';
import { usePhoto } from '@/composables/usePhoto';

type PickedPhoto = { path: string | null; data?: string | null };

const router = useRouter();
const { galleries, loadGalleries, isLoading: isGalleryLoading } = useGallery();
const { events, attachments, loadEvents, createManualEvent, addEventPhotos } = useTimeline();
const { pickMultiplePhotos } = usePhoto();

const manualTitle = ref('');
const manualDescription = ref('');
const manualStart = ref('');
const manualEnd = ref('');
const pendingPhotos = ref<PickedPhoto[]>([]);
const isSubmitting = ref(false);
const isTimelineLoading = ref(true);
const searchQuery = ref('');
const showStartPicker = ref(false);
const showEndPicker = ref(false);

// Filter 
const activeFilterGallery = ref(true);
const activeFilterRoutes = ref(true);
const activeFilterEvents = ref(true);

const isBusy = computed(() => isGalleryLoading.value || isTimelineLoading.value);
const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase());

const timelineGalleries = computed(() => {
  return galleries.value
    .map(gallery => {
      const start = gallery.startDate || gallery.created;
      const end = gallery.endDate || gallery.updated || gallery.startDate || gallery.created;
      return {
        ...gallery,
        _start: start,
        _end: end
      };
    })
    .filter(gallery => !!gallery._start)
    .sort((a, b) => new Date(a._start).getTime() - new Date(b._start).getTime());
});

const timelineRoutes = computed(() => {
  return routes.value
    .map((route: Route) => {
      const start = route.startTime || route.created;
      const end = route.endTime || route.startTime || route.created;
      return {
        ...route,
        _start: start,
        _end: end
      };
    })
    .filter((route: Route & { _start: string }) => !!route._start)
    .sort((a: Route & { _start: string }, b: Route & { _start: string }) => new Date(a._start).getTime() - new Date(b._start).getTime());
});

const filteredTimelineGalleries = computed(() => {
  const q = normalizedSearch.value;
  if (!q) return timelineGalleries.value;
  return timelineGalleries.value.filter(gallery => (gallery.name || '').toLowerCase().includes(q));
});

const filteredTimelineRoutes = computed(() => {
  const q = normalizedSearch.value;
  if (!q) return timelineRoutes.value;
  return timelineRoutes.value.filter((route: Route & { _start: string }) => (route.name || '').toLowerCase().includes(q));
});

const timelineBounds = computed(() => {
  const points: number[] = [];
  filteredTimelineGalleries.value.forEach(gallery => {
    const start = Date.parse(gallery._start || gallery.created);
    const end = Date.parse(gallery._end || gallery._start || gallery.updated || gallery.created);
    if (!Number.isNaN(start)) points.push(start);
    if (!Number.isNaN(end)) points.push(end);
  });

  const baseline = Date.now();
  const min = points.length ? Math.min(...points) : baseline;
  const max = points.length ? Math.max(...points) : baseline + 60_000;

  return {
    min,
    max: min === max ? min + 60_000 : max
  };
});

const timelineBars = computed(() => {
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);

  let bars: Array<{ id: number; name: string; color: string; left: string; width: string; key: string; start?: string; end?: string }> = [];
  if (activeFilter.value === 'gallery') {
    bars = filteredTimelineGalleries.value.map(gallery => {
      const start = Math.max(min, Date.parse(gallery._start || gallery.created) || min);
      const end = Math.max(start, Date.parse(gallery._end || gallery._start || gallery.updated || gallery.created) || start + 1);
      const left = Math.min(100, Math.max(0, ((start - min) / span) * 100));
      const width = Math.min(100 - left, Math.max(2, ((end - start) / span) * 100));
      return {
        id: gallery.id ?? 0,
        name: gallery.name,
        color: gallery.color ?? '#3880ff',
        left: `${left}%`,
        width: `${width}%`,
        key: `gallery-${gallery.id}-${gallery._start}`
      };
    });
  } else if (activeFilter.value === 'route') {
    bars = filteredTimelineRoutes.value.map((route: Route & { _start: string; _end: string }) => {
      const start = Math.max(min, Date.parse(route._start || route.created) || min);
      const end = Math.max(start, Date.parse(route._end || route._start || route.created) || start + 1);
      const left = Math.min(100, Math.max(0, ((start - min) / span) * 100));
      const width = Math.min(100 - left, Math.max(2, ((end - start) / span) * 100));
      return {
        id: route.id ?? 0,
        name: route.name,
        color: '#6c5ce7',
        left: `${left}%`,
        width: `${width}%`,
        key: `route-${route.id}-${route._start}`,
        start: route._start,
        end: route._end
      };
    });
  }
  return bars;
});

const axisStart = computed(() => timelineBounds.value.min);
const axisEnd = computed(() => timelineBounds.value.max);

const formatDate = (value: string | number) => {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const openGallery = (galleryId?: number) => {
  if (galleryId) {
    router.push(`/gallery/${galleryId}`);
  }
};

const filteredEvents = computed(() => {
  const q = normalizedSearch.value;
  if (!q) return events.value;
  return events.value.filter(event => {
    const haystack = `${event.title || ''} ${event.description || ''}`.toLowerCase();
    return haystack.includes(q);
  });
});

const toggleFilterGallery = () => {
  activeFilterGallery.value = !activeFilterGallery.value;
};
const toggleFilterRoutes = () => {
  activeFilterRoutes.value = !activeFilterRoutes.value;
};
const toggleFilterEvents = () => {
  activeFilterEvents.value = !activeFilterEvents.value;
};

const handlePickPhotos = async () => {
  try {
    const picked = await pickMultiplePhotos();
    if (picked && picked.length > 0) {
      pendingPhotos.value.push(...picked);
    }
  } catch (error) {
    console.error('Error picking timeline photos', error);
  }
};

const removePendingPhoto = (index: number) => {
  pendingPhotos.value.splice(index, 1);
};

const getPendingPhotoSrc = (photo: PickedPhoto) => {
  const path = photo.path || photo.data;
  if (!path) return '';
  return path.startsWith('data:') ? path : Capacitor.convertFileSrc(path);
};

const handleSaveManualEvent = async () => {
  if (!manualTitle.value.trim() || !manualStart.value) return;
  isSubmitting.value = true;

  try {
    const createdId = await createManualEvent({
      title: manualTitle.value.trim(),
      description: manualDescription.value.trim() || undefined,
      startDate: manualStart.value,
      endDate: manualEnd.value || null
    });

    if (pendingPhotos.value.length > 0) {
      await addEventPhotos(createdId, pendingPhotos.value);
    }

    manualTitle.value = '';
    manualDescription.value = '';
    manualStart.value = '';
    manualEnd.value = '';
    pendingPhotos.value = [];
    showStartPicker.value = false;
    showEndPicker.value = false;
  } catch (error) {
    console.error('Failed to save timeline event', error);
  } finally {
    isSubmitting.value = false;
  }
};

const getAttachmentsForEvent = (eventId?: number) => {
  if (!eventId) return [];
  return attachments.value[eventId] || [];
};

const getAttachmentSrc = (filepath: string) => {
  if (!filepath) return '';
  return filepath.startsWith('data:') ? filepath : Capacitor.convertFileSrc(filepath);
};


// ...existing code...

</script>

<style scoped>
/* Gallery markers above the line */
.gallery-bar {
  position: absolute;
  top: -18px;
  height: 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0 8px;
  font-size: 0.85rem;
  z-index: 2;
}

/* Event markers below the line */
.timeline-event-bar {
  position: absolute;
  top: 18px;
  height: 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0 8px;
  font-size: 0.85rem;
  z-index: 2;
}

.timeline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2.5rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.timeline-axis {
  position: relative;
  height: 152px;
  border-radius: 16px;
  background: var(--ion-color-light);
  padding-top: 1rem;
  overflow: hidden;
}

.axis-line {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.05),
    rgba(0, 0, 0, 0.05) 1px,
    transparent 1px,
    transparent 10px
  );
  pointer-events: none;
}

.timeline-bar {
  position: absolute;
  top: 32px;
  height: 50px;
  border-radius: 14px;
  padding: 0.35rem;
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
  display: flex;
  align-items: flex-end;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.timeline-bar span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-bar:hover {
  transform: translateY(-2px);
}

.timeline-labels {
  position: absolute;
  bottom: 0.5rem;
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  padding: 0 0.75rem;
}

.timeline-empty {
  padding: 2rem;
  text-align: center;
  color: var(--ion-color-medium);
}

.manual-event-form {
  padding: 0 1rem 1rem;
}

.manual-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.pending-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.pending-thumb {
  position: relative;
  width: 70px;
  height: 70px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--ion-color-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.pending-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.manual-event-list {
  padding: 0 1rem 2rem;
}

.manual-event-list header {
  padding: 1rem 0 0.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
  color: var(--ion-color-medium);
}

.event-row {
  position: relative;
  background: var(--ion-color-light);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.event-row:hover .attachment-preview {
  opacity: 1;
  transform: translateY(0);
}

.event-content {
  flex: 1;
}

.event-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.event-date {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-bottom: 0.25rem;
}

.event-description {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attachment-preview {
  display: flex;
  gap: 0.35rem;
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%) translateY(8px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.attachment-preview img {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
