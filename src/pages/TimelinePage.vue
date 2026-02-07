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
        v-model="activeSearchQuery"
        :debounce="200"
        :placeholder="$t('auto.suchen')"
        class="timeline-search"
        show-clear-button="focus"
      />

      <div class="timeline-filter-row">
        <ion-chip
          outline="true"
          :style="chipStyle(activeFilterGallery)"
          @click="toggleFilterGallery"
        >
          <ion-label>{{ $t('auto.timeline_gallery') }}</ion-label>
        </ion-chip>
        <ion-chip
          outline="true"
          :style="chipStyle(activeFilterRoutes)"
          @click="toggleFilterRoutes"
        >
          <ion-label>{{ $t('auto.timeline_routes') }}</ion-label>
        </ion-chip>
        <ion-chip
          outline="true"
          :style="chipStyle(activeFilterEvents)"
          @click="toggleFilterEvents"
        >
          <ion-label>{{ $t('auto.timeline_events') }}</ion-label>
        </ion-chip>
      </div>
      <ion-segment v-model="activeTab" class="timeline-tabs">
        <ion-segment-button value="timeline">Timeline</ion-segment-button>
        <ion-segment-button value="events">Events</ion-segment-button>
      </ion-segment>

      <div v-if="isBusy" class="timeline-loading">
        <ion-spinner />
      </div>

      <div v-else>
        <div v-if="activeTab === 'timeline'">
          <section class="timeline-section">
            <div
              ref="timelineScroll"
              class="timeline-scroll-container"
              @wheel.prevent="handleTimelineWheel"
            >
              <div class="timeline-axis" :style="{ minWidth: '1200px', width: timelineAxisWidth }">
                <div class="timeline-middle-line" />
                <div class="axis-line" />
                <div
                  v-for="bar in timelineGalleryBars"
                  :key="bar.key"
                  class="timeline-bar gallery-bar"
                  :style="{ left: bar.left, width: bar.width, backgroundColor: bar.color || '#3880ff', top: 'calc(50% - 48px)' }"
                  @click="openGallery(bar.id)"
                >
                  <ion-icon :icon="imagesOutline" size="small" />
                  <span class="gallery-label">{{ bar.name }}</span>
                </div>
                <div
                  v-for="bar in timelineRouteBars"
                  :key="bar.key"
                  class="timeline-bar route-bar"
                  :style="{ left: bar.left, width: bar.width, backgroundColor: bar.color || '#6c5ce7', top: 'calc(50% - 18px)' }"
                >
                  <ion-icon :icon="imagesOutline" size="small" />
                  <span class="gallery-label">{{ bar.name }}</span>
                </div>
                <div
                  v-for="event in timelineEventBars"
                  :key="event.id"
                  class="timeline-event-bar"
                  :style="{ left: eventBarStyle(event).left, width: 'auto', top: 'calc(50% + 16px)' }"
                >
                  <ion-icon :icon="calendarNumber" size="small" />
                  <span class="event-label">{{ event.title }}</span>
                </div>
                <div class="timeline-labels">
                  <span>{{ formatDate(axisStart) }}</span>
                  <span>{{ formatDate(axisEnd) }}</span>
                </div>
              </div>
            </div>
            <div v-if="!hasTimelineItems" class="timeline-empty">
              <p>
                <span v-if="timelineSearch">{{ $t('auto.timeline_no_gallery_matches') }}</span>
                <span v-else>{{ $t('auto.timeline_gallery_hint') }}</span>
              </p>
            </div>

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
                    <div class="date-row">
                      <label class="date-label">{{ $t('auto.timeline_start_date') }}:</label>
                      <span class="date-value">{{ manualStart ? formatDate(manualStart) : '-' }}</span>
                      <ion-button size="small" fill="clear" @click="showStartPicker = true">
                        <ion-icon :icon="calendarNumber" />
                      </ion-button>
                    </div>
                    <ion-modal :is-open="showStartPicker" @didDismiss="showStartPicker = false">
                      <ion-datetime v-model="manualStart" presentation="date-time" display-format="DD.MM.YYYY HH:mm" />
                      <ion-button color="primary" expand="block" @click="showStartPicker = false">OK</ion-button>
                    </ion-modal>
                  </div>
                  <div class="manual-actions">
                    <div class="date-row">
                      <label class="date-label">{{ $t('auto.timeline_end_date') }}:</label>
                      <span class="date-value">{{ manualEnd ? formatDate(manualEnd) : '-' }}</span>
                      <ion-button size="small" fill="clear" @click="showEndPicker = true">
                        <ion-icon :icon="calendarNumber" />
                      </ion-button>
                    </div>
                    <ion-modal :is-open="showEndPicker" @didDismiss="showEndPicker = false">
                      <ion-datetime v-model="manualEnd" presentation="date-time" display-format="DD.MM.YYYY HH:mm" />
                      <ion-button color="primary" expand="block" @click="showEndPicker = false">OK</ion-button>
                    </ion-modal>
                  </div>
                  <div class="manual-actions">
                    <ion-button fill="clear" @click="handlePickPhotos">
                      <ion-icon :icon="imagesOutline" />
                      {{ $t('auto.timeline_attach_photos') }}
                    </ion-button>
                  </div>
                  <div class="manual-actions">
                    <ion-button fill="solid" color="primary" @click="handleSaveManualEvent" :disabled="isSubmitting" expand="block">
                      {{ $t('auto.timeline_create_event') }}
                    </ion-button>
                  </div>
                  <div v-if="pendingPhotos.length" class="pending-photos">
                    <div v-for="(photo, idx) in pendingPhotos" :key="idx" class="pending-thumb">
                      <img :src="getPendingPhotoSrc(photo)" alt="pending photo" />
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
            <div v-if="!manualEvents.length" class="empty-state">
              <ion-icon :icon="imagesOutline" size="large" />
              <p>
                <span v-if="eventsSearch">{{ $t('auto.timeline_no_event_matches') }}</span>
                <span v-else>{{ $t('auto.timeline_no_manual_events') }}</span>
              </p>
            </div>
            <article v-for="event in manualEvents" :key="event.id" class="event-row">
              <div class="event-content">
                <div class="event-title">{{ event.title }}</div>
                <div class="event-date">
                  {{ formatDate(event.startDate) }}
                  <span v-if="event.endDate">− {{ formatDate(event.endDate) }}</span>
                </div>
                <p v-if="event.description" class="event-description">{{ event.description }}</p>
              </div>
              <div class="event-meta">
                <ion-badge v-if="getAttachmentsForEvent(event.id)?.length">{{ getAttachmentsForEvent(event.id).length }}</ion-badge>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { db, type Route } from '@/services/database';
import { Capacitor } from '@capacitor/core';
import { useGallery } from '@/composables/useGallery';
import { useTimeline } from '@/composables/useTimeline';
import { usePhoto } from '@/composables/usePhoto';
import { calendarNumber, imagesOutline } from 'ionicons/icons';

interface TimelineEvent {
  id?: number;
  title: string;
  startDate: string;
  endDate?: string | null;
  description?: string;
}

type PickedPhoto = { path: string | null; data?: string | null };

const { t: $t } = useI18n();
const router = useRouter();
const activeTab = ref<'timeline' | 'events'>('timeline');

const { galleries, loadGalleries, isLoading: isGalleryLoading } = useGallery();
const { events, attachments, loadEvents, createManualEvent, addEventPhotos } = useTimeline();
const { pickMultiplePhotos } = usePhoto();

const routes = ref<Route[]>([]);
const loadRoutes = async () => {
  routes.value = await db.getRoutes();
};

const manualTitle = ref('');
const manualDescription = ref('');
const manualStart = ref<string | null>(null);
const manualEnd = ref<string | null>(null);
const pendingPhotos = ref<PickedPhoto[]>([]);
const isSubmitting = ref(false);
const isTimelineLoading = ref(true);
const timelineSearch = ref('');
const eventsSearch = ref('');
const activeSearchQuery = computed({
  get: () => (activeTab.value === 'timeline' ? timelineSearch.value : eventsSearch.value),
  set: (value: string) => {
    if (activeTab.value === 'timeline') {
      timelineSearch.value = value;
    } else {
      eventsSearch.value = value;
    }
  }
});
const showStartPicker = ref(false);
const showEndPicker = ref(false);
const activeFilterGallery = ref(true);
const activeFilterRoutes = ref(true);
const activeFilterEvents = ref(true);
const timelineScroll = ref<HTMLElement | null>(null);

const isBusy = computed(() => isGalleryLoading.value || isTimelineLoading.value);
const normalizedTimelineSearch = computed(() => timelineSearch.value.trim().toLowerCase());
const normalizedEventSearch = computed(() => eventsSearch.value.trim().toLowerCase());

const timelineGalleries = computed(() => {
  return galleries.value
    .map(gallery => {
      const start = gallery.startDate || gallery.created;
      const end = gallery.endDate || gallery.updated || gallery.startDate || gallery.created;
      return { ...gallery, _start: start, _end: end };
    })
    .filter(gallery => !!gallery._start)
    .sort((a, b) => new Date(a._start).getTime() - new Date(b._start).getTime());
});

const timelineRoutes = computed(() => {
  return routes.value
    .map(route => {
      const start = route.startTime || route.created;
      const end = route.endTime || route.startTime || route.created;
      return { ...route, _start: start, _end: end };
    })
    .filter((route: Route & { _start: string }) => !!route._start)
    .sort((a, b) => new Date(a._start).getTime() - new Date(b._start).getTime());
});

const filteredTimelineGalleries = computed(() => {
  if (!activeFilterGallery.value) return [];
  const q = normalizedTimelineSearch.value;
  if (!q) return timelineGalleries.value;
  return timelineGalleries.value.filter(gallery => (gallery.name || '').toLowerCase().includes(q));
});

const filteredTimelineRoutes = computed(() => {
  if (!activeFilterRoutes.value) return [];
  const q = normalizedTimelineSearch.value;
  if (!q) return timelineRoutes.value;
  return timelineRoutes.value.filter((route: Route & { _start: string }) => (route.name || '').toLowerCase().includes(q));
});

const timelineEventCandidates = computed(() => {
  const q = normalizedTimelineSearch.value;
  if (!q) return events.value;
  return events.value.filter(event => {
    const haystack = `${event.title || ''} ${event.description || ''}`.toLowerCase();
    return haystack.includes(q);
  });
});

const timelineBounds = computed(() => {
  const points: number[] = [];

  filteredTimelineGalleries.value.forEach(gallery => {
    const start = Date.parse(gallery._start || gallery.created);
    const end = Date.parse(gallery._end || gallery._start || gallery.updated || gallery.created);
    if (!Number.isNaN(start)) points.push(start);
    if (!Number.isNaN(end)) points.push(end);
  });

  filteredTimelineRoutes.value.forEach(route => {
    const start = Date.parse(route._start || route.created);
    const end = Date.parse(route._end || route._start || route.created);
    if (!Number.isNaN(start)) points.push(start);
    if (!Number.isNaN(end)) points.push(end);
  });

  timelineEventCandidates.value.forEach(event => {
    const start = Date.parse(event.startDate);
    const end = event.endDate ? Date.parse(event.endDate) : start;
    if (!Number.isNaN(start)) points.push(start);
    if (!Number.isNaN(end)) points.push(end);
  });

  const baseline = Date.now();
  const min = points.length ? Math.min(...points) : baseline;
  const max = points.length ? Math.max(...points) : baseline + 60_000;
  return { min, max: min === max ? min + 60_000 : max };
});

const calculatePosition = (value: number, min: number, span: number) => Math.min(100, Math.max(0, ((value - min) / span) * 100));

const timelineGalleryBars = computed(() => {
  if (!activeFilterGallery.value) return [];
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  return filteredTimelineGalleries.value.map(gallery => {
    const start = Math.max(min, Date.parse(gallery._start || gallery.created) || min);
    const end = Math.max(start, Date.parse(gallery._end || gallery._start || gallery.updated || gallery.created) || start + 1);
    const left = calculatePosition(start, min, span);
    const width = Math.min(100 - left, Math.max(2, calculatePosition(end, min, span) - left));
    return {
      id: gallery.id,
      name: gallery.name,
      color: gallery.color,
      left: `${left}%`,
      width: `${width}%`,
      key: `gallery-${gallery.id}-${gallery._start}`
    };
  });
});

const timelineRouteBars = computed(() => {
  if (!activeFilterRoutes.value) return [];
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  return filteredTimelineRoutes.value.map(route => {
    const start = Math.max(min, Date.parse(route._start || route.created) || min);
    const end = Math.max(start, Date.parse(route._end || route._start || route.created) || start + 1);
    const left = calculatePosition(start, min, span);
    const width = Math.min(100 - left, Math.max(2, calculatePosition(end, min, span) - left));
    return {
      id: route.id,
      name: route.name,
      color: '#6c5ce7',
      left: `${left}%`,
      width: `${width}%`,
      key: `route-${route.id}-${route._start}`
    };
  });
});

const timelineEventBars = computed(() => {
  if (!activeFilterEvents.value) return [];
  return timelineEventCandidates.value;
});

const hasTimelineItems = computed(() =>
  timelineGalleryBars.value.length > 0 || timelineRouteBars.value.length > 0 || timelineEventBars.value.length > 0
);


const axisStart = computed(() => timelineBounds.value.min);
const axisEnd = computed(() => timelineBounds.value.max);

const formatDate = (value: string | number) => {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const manualEvents = computed(() => {
  const q = normalizedEventSearch.value;
  if (!q) return events.value;
  return events.value.filter(event => {
    const haystack = `${event.title || ''} ${event.description || ''}`.toLowerCase();
    return haystack.includes(q);
  });
});

const eventBarStyle = (event: TimelineEvent) => {
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  const start = Math.max(min, Date.parse(event.startDate) || min);
  const left = Math.min(100, Math.max(0, ((start - min) / span) * 100));
  return { left: `${left}%`, position: 'absolute' as const };
};

const timelineAxisWidth = computed(() => {
  const pxPerDay = 40;
  const { min, max } = timelineBounds.value;
  const days = Math.max(1, Math.round((max - min) / (1000 * 60 * 60 * 24)));
  const width = Math.max(1200, days * pxPerDay);
  return width + 'px';
});

const chipStyle = (active: boolean) => ({
  borderColor: active ? 'var(--ion-color-warning)' : 'var(--ion-color-medium)',
  background: '#fff'
});

const toggleFilterGallery = () => {
  if (activeFilterGallery.value && !activeFilterRoutes.value && !activeFilterEvents.value) return;
  activeFilterGallery.value = !activeFilterGallery.value;
};
const toggleFilterRoutes = () => {
  if (activeFilterRoutes.value && !activeFilterGallery.value && !activeFilterEvents.value) return;
  activeFilterRoutes.value = !activeFilterRoutes.value;
};
const toggleFilterEvents = () => {
  if (activeFilterEvents.value && !activeFilterGallery.value && !activeFilterRoutes.value) return;
  activeFilterEvents.value = !activeFilterEvents.value;
};

const openGallery = (galleryId?: number) => {
  if (galleryId) router.push(`/gallery/${galleryId}`);
};

const handlePickPhotos = async () => {
  try {
    const picked = await pickMultiplePhotos();
    if (picked?.length) pendingPhotos.value.push(...picked);
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
      startDate: manualStart.value || '',
      endDate: manualEnd.value || null
    });
    if (pendingPhotos.value.length) {
      await addEventPhotos(createdId, pendingPhotos.value);
    }
    manualTitle.value = '';
    manualDescription.value = '';
    manualStart.value = null;
    manualEnd.value = null;
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

const handleTimelineWheel = (event: WheelEvent) => {
  const container = timelineScroll.value;
  if (!container) return;
  const rawDelta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
  if (!rawDelta) return;
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  const progress = maxScroll ? container.scrollLeft / maxScroll : 0;
  const boost = 1 + Math.max(0, 0.75 - progress) * 2;
  const step = Math.sign(rawDelta) * Math.pow(Math.abs(rawDelta), 1.15) * 0.35 * boost;
  const next = Math.min(maxScroll, Math.max(0, container.scrollLeft + step));
  container.scrollLeft = next;
};

const scrollToToday = () => {
  nextTick(() => {
    const container = timelineScroll.value;
    if (!container) return;
    const axis = container.querySelector('.timeline-axis');
    if (!axis) return;
    const { min, max } = timelineBounds.value;
    const now = Date.now();
    const span = Math.max(max - min, 1);
    const percent = Math.min(1, Math.max(0, (now - min) / span));
    const scrollLeft = (axis.scrollWidth - container.clientWidth) * percent;
    container.scrollLeft = scrollLeft;
  });
};

onMounted(async () => {
  isTimelineLoading.value = true;
  await Promise.all([loadGalleries(), loadEvents(), loadRoutes()]);
  isTimelineLoading.value = false;
  scrollToToday();
});

watch([timelineBounds], scrollToToday, { immediate: true });
</script>

<style scoped>
.timeline-filter-row {
  padding: 0 1rem;
}

.timeline-scroll-container {
  overflow-x: auto;
  width: 100%;
  min-height: 180px;
  margin-bottom: 1rem;
}

.timeline-axis {
  position: relative;
  height: 152px;
  border-radius: 16px;
  background: var(--ion-color-light);
  padding-top: 1rem;
  overflow: hidden;
}

.timeline-middle-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  background: orange;
  z-index: 1;
  transform: translateY(-2px);
}

.timeline-bar,
.timeline-event-bar {
  position: absolute;
  height: 24px;
  border-radius: 12px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  z-index: 2;
  cursor: pointer;
}

.gallery-label {
  font-weight: 600;
  font-size: 1rem;
  white-space: nowrap;
}

.timeline-event-bar {
  top: calc(50% + 16px);
  background: white;
  color: var(--ion-color-dark);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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

.manual-event-form,
.manual-event-list {
  padding: 0 1rem 2rem;
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
  align-items: flex-end;
}

.pending-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.event-row {
  position: relative;
  background: var(--ion-color-light);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
  display: flex;
  gap: 1rem;
}

.attachment-preview {
  display: flex;
  gap: 0.35rem;
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
}

.attachment-preview img {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
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
</style>