<!-- eslint-disable vue/no-deprecated-slot-attribute -->
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>{{ $t('auto.timeline_title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="ion-padding-bottom">
      <ion-searchbar
        v-model="activeSearchQuery"
        :debounce="200"
        :placeholder="$t('auto.suchen')"
        class="timeline-search"
        show-clear-button="focus"
      />

      <div class="timeline-filter-row">
        <ion-chip
          outline
          :style="chipStyle(activeFilterGallery)"
          @click="toggleFilterGallery"
        >
          <ion-label>{{ $t('auto.timeline_gallery') }}</ion-label>
        </ion-chip>
        <ion-chip
          outline
          :style="chipStyle(activeFilterRoutes)"
          @click="toggleFilterRoutes"
        >
          <ion-label>{{ $t('auto.timeline_routes') }}</ion-label>
        </ion-chip>
        <ion-chip
          outline
          :style="chipStyle(activeFilterEvents)"
          @click="toggleFilterEvents"
        >
          <ion-label>{{ $t('auto.timeline_events') }}</ion-label>
        </ion-chip>
      </div>
      <ion-segment :value="activeTab" @ionChange="handleSegmentChange" class="timeline-tabs">
        <ion-segment-button value="timeline">Timeline</ion-segment-button>
        <ion-segment-button value="events">Events</ion-segment-button>
      </ion-segment>

      <div v-if="isBusy" class="timeline-loading">
        <ion-spinner />
      </div>

      <div v-else>
        <template v-if="activeTab === 'timeline'">
          <section class="timeline-section">
            <div
              ref="timelineScroll"
              class="timeline-scroll-container"
              @wheel.prevent="handleTimelineWheel"
            >
              <div class="timeline-axis" :style="{ minWidth: '1200px', width: timelineAxisWidth }" @click="handleAxisClick">
                <div class="timeline-middle-line" />
                <div class="axis-line" />
                <div class="timeline-grid-lines">
                  <div
                    v-for="segment in timelineDaySegments"
                    :key="`day-${segment.start}`"
                    class="timeline-day-boundary"
                    :style="{ left: segment.left }"
                  />
                  <div
                    v-for="segment in timelineWeekSegments"
                    :key="`week-${segment.start}`"
                    class="timeline-week-boundary"
                    :style="{ left: segment.left }"
                  />
                  <div
                    v-for="segment in timelineMonthSegments"
                    :key="`month-${segment.start}`"
                    class="timeline-month-boundary"
                    :style="{ left: segment.left }"
                  />
                  <span
                    v-for="segment in timelineMonthSegments"
                    :key="`label-${segment.start}`"
                    class="timeline-month-label"
                    :style="{ left: segment.labelPosition }"
                  >
                    {{ segment.monthLabel }}
                  </span>
                  <span
                    v-for="segment in timelineYearSegments"
                    :key="`year-${segment.start}`"
                    class="timeline-year-label"
                    :style="{ left: segment.left }"
                  >
                    {{ segment.yearLabel }}
                  </span>
                </div>
                <div
                  v-for="bar in timelineGalleryBars"
                  :key="bar.key"
                  class="timeline-bar gallery-bar"
                  :style="{ left: bar.left, width: bar.width, backgroundColor: bar.color || '#3880ff', top: '50%' }"
                  @click="openGallery(bar.id)"
                >
                  <ion-icon :icon="imagesOutline" size="small" />
                  <span class="gallery-label">{{ bar.name }}</span>
                </div>
                <div
                  v-for="bar in timelineRouteBars"
                  :key="bar.key"
                  class="timeline-bar route-bar"
                  :style="{ left: bar.left, width: bar.width, backgroundColor: bar.color || '#6c5ce7', top: '82%' }"
                  @click="openRoute(bar.id)"
                >
                  <ion-icon :icon="imagesOutline" size="small" />
                  <span class="gallery-label">{{ bar.name }}</span>
                </div>
                <div
                  v-for="event in timelineEventBars"
                  :key="event.id"
                  class="timeline-event-bar"
                  :style="{ left: eventBarStyle(event).left, width: 'auto', top: '18%' }"
                  @click.stop="openEvent(event)"
                >
                  <ion-icon :icon="calendarNumber" size="small" />
                  <span class="event-label">{{ event.title }}</span>
                </div>
                <div
                  v-if="selectedEvent"
                  class="timeline-event-flag"
                  :style="selectedEventFlagStyle"
                  @click.stop
                >
                  <div class="timeline-event-flag__header">
                    <div class="timeline-event-flag__title">{{ selectedEvent.title }}</div>
                    <div class="timeline-event-flag__location">
                      <ion-icon :icon="locationOutline" />
                      <span>{{ $t('auto.timeline_location') }}: {{ selectedEvent.location || '-' }}</span>
                    </div>
                  </div>
                  <div class="timeline-event-flag__dates">
                    <span>
                      <strong>{{ $t('auto.timeline_start_date') }}:</strong>
                      {{ formatDate(selectedEvent.startDate) }}
                    </span>
                    <span>
                      <strong>{{ $t('auto.timeline_end_date') }}:</strong>
                      {{ selectedEvent.endDate ? formatDate(selectedEvent.endDate) : '-' }}
                    </span>
                  </div>
                  <p v-if="selectedEvent.description" class="timeline-event-flag__description">
                    {{ selectedEvent.description }}
                  </p>
                  <div
                    v-if="selectedEventAttachments.length"
                    id="timeline-event-attachments"
                    class="timeline-event-flag__attachments"
                  >
                    <a
                      v-for="(photo, index) in selectedEventAttachments"
                      :key="photo.id || index"
                      :href="getAttachmentSrc(photo.filepath)"
                      class="glightbox timeline-event-flag__thumbnail"
                      :data-type="isVideoAttachment(photo) ? 'video' : 'image'"
                      @click.prevent="handleAttachmentClick(index)"
                    >
                      <img
                        :src="getAttachmentSrc(photo.filepath)"
                        :alt="photo.filename"
                        loading="lazy"
                      />
                    </a>
                  </div>
                </div>
                <div class="timeline-labels">
                  <span>{{ formatDate(axisStart) }}</span>
                  <span>{{ formatDate(axisEnd) }}</span>
                </div>
              </div>
            </div>
            <ion-segment v-model="manualTab" class="manual-tabs">
              <ion-segment-button value="create">Ereignis speichern</ion-segment-button>
              <ion-segment-button value="list">{{ $t('auto.timeline_manual_events') }}</ion-segment-button>
            </ion-segment>
            <div v-if="!hasTimelineItems" class="timeline-empty">
              <p>
                <span v-if="timelineSearch">{{ $t('auto.timeline_no_gallery_matches') }}</span>
                <span v-else>{{ $t('auto.timeline_gallery_hint') }}</span>
              </p>
            </div>

            <section v-if="manualTab === 'create'" class="manual-event-form">
              <ion-card>
                <ion-card-header>
                  <ion-card-title>{{ $t('auto.timeline_create_event') }}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                  <ion-input
                    v-model="manualTitle"
                    :placeholder="$t('auto.timeline_manual_events')"
                    @keyup.enter="handleSaveManualEvent"
                  />
                  <ion-textarea
                    v-model="manualDescription"
                    :placeholder="$t('auto.beschreibung_optional')"
                    :rows="2"
                    auto-grow
                  />
                  <ion-input
                    v-model="manualLocation"
                    :placeholder="$t('auto.timeline_location')"
                    :clear-input="true"
                  />
                  <ion-item lines="none" class="due-date-item">
                    <ion-label>
                      <span class="date-label">{{ $t('auto.timeline_start_date') }}</span>
                      <span class="date-value">{{ manualStart ? formatDate(manualStart) : '-' }}</span>
                    </ion-label>
                    <ion-button fill="clear" class="date-picker-icon" @click="openManualStartPicker">
                      <ion-icon :icon="calendarNumber" />
                    </ion-button>
                  </ion-item>
                  <ion-modal css-class="half-modal" :is-open="showStartPicker" @didDismiss="cancelManualStartPicker">
                    <ion-header>
                      <ion-toolbar>
                        <ion-buttons slot="start">
                          <ion-button @click="cancelManualStartPicker">{{ $t('buttons.cancel') }}</ion-button>
                        </ion-buttons>
                        <ion-title>{{ $t('auto.timeline_start_date') }}</ion-title>
                        <ion-buttons slot="end">
                          <ion-button strong @click="confirmManualStartPicker">{{ $t('auto.speichern') }}</ion-button>
                        </ion-buttons>
                      </ion-toolbar>
                    </ion-header>
                    <ion-content class="ion-padding">
                      <div class="date-picker-wrapper">
                        <ion-datetime
                          v-model="manualStartPickerValue"
                          presentation="date-time"
                          display-format="DD.MM.YYYY HH:mm"
                          :show-default-buttons="false"
                        />
                      </div>
                      <div class="modal-actions">
                        <ion-button expand="block" fill="clear" color="medium" @click="clearManualStartPicker">
                          {{ $t('auto.zuruecksetzen') }}
                        </ion-button>
                      </div>
                    </ion-content>
                  </ion-modal>
                  <ion-item lines="none" class="due-date-item">
                    <ion-label>
                      <span class="date-label">{{ $t('auto.timeline_end_date') }}</span>
                      <span class="date-value">{{ manualEnd ? formatDate(manualEnd) : '-' }}</span>
                    </ion-label>
                    <ion-button fill="clear" class="date-picker-icon" @click="openManualEndPicker">
                      <ion-icon :icon="calendarNumber" />
                    </ion-button>
                  </ion-item>
                  <ion-modal css-class="half-modal" :is-open="showEndPicker" @didDismiss="cancelManualEndPicker">
                    <ion-header>
                      <ion-toolbar>
                        <ion-buttons slot="start">
                          <ion-button @click="cancelManualEndPicker">{{ $t('buttons.cancel') }}</ion-button>
                        </ion-buttons>
                        <ion-title>{{ $t('auto.timeline_end_date') }}</ion-title>
                        <ion-buttons slot="end">
                          <ion-button strong @click="confirmManualEndPicker">{{ $t('auto.speichern') }}</ion-button>
                        </ion-buttons>
                      </ion-toolbar>
                    </ion-header>
                    <ion-content class="ion-padding">
                      <div class="date-picker-wrapper">
                        <ion-datetime
                          v-model="manualEndPickerValue"
                          presentation="date-time"
                          display-format="DD.MM.YYYY HH:mm"
                          :show-default-buttons="false"
                        />
                      </div>
                      <div class="modal-actions">
                        <ion-button expand="block" fill="clear" color="medium" @click="clearManualEndPicker">
                          {{ $t('auto.zuruecksetzen') }}
                        </ion-button>
                      </div>
                    </ion-content>
                  </ion-modal>
                  <div class="manual-actions">
                    <ion-button fill="clear" @click="handlePickPhotos">
                      <ion-icon :icon="imagesOutline" />
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
                      <ion-button
                        fill="clear"
                        color="danger"
                        class="pending-remove"
                        @click="removePendingPhoto(idx)"
                      >
                        ×
                      </ion-button>
                    </div>
                  </div>
                </ion-card-content>
              </ion-card>
            </section>

            <section v-else class="manual-event-list">
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
                  <p v-if="event.location" class="event-location">
                    <ion-icon :icon="locationOutline" />
                    {{ event.location }}
                  </p>
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
          </section>
        </template>
        <template v-else>
          <section class="manual-event-list">
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
                <p v-if="event.location" class="event-location">
                  <ion-icon :icon="locationOutline" />
                  {{ event.location }}
                </p>
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
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { onIonViewDidLeave, onIonViewWillEnter } from '@ionic/vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonChip,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonIcon,
  IonInput,
  IonTextarea,
  IonButton,
  IonModal,
  IonDatetime,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonBadge
} from '@ionic/vue';
import { db, type Route, type TimelineEventPhoto } from '@/services/database';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useGallery } from '@/composables/useGallery';
import { useTimeline } from '@/composables/useTimeline';
import { usePhoto } from '@/composables/usePhoto';
import { useLightbox, type MediaItem } from '@/composables/useLightbox';
import { calendarNumber, imagesOutline, locationOutline } from 'ionicons/icons';

interface TimelineEvent {
  id?: number;
  title: string;
  startDate: string;
  endDate?: string | null;
  description?: string;
  location?: string;
}

type PickedPhoto = { path: string | null; data?: string | null };

const shortMonths = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const { t: $t } = useI18n();
const router = useRouter();
const activeTab = ref<'timeline' | 'events'>('timeline');
const manualTab = ref<'create' | 'list'>('create');

const { galleries, loadGalleries, isLoading: isGalleryLoading } = useGallery();
const { events, attachments, loadEvents, createManualEvent, addEventPhotos } = useTimeline();
const { pickMultiplePhotos } = usePhoto();
const { initLightbox, openLightbox, destroyLightbox } = useLightbox();

const routes = ref<Route[]>([]);
const loadRoutes = async () => {
  try {
    routes.value = await db.getRoutes();
  } catch (error) {
    console.error('Failed to load timeline routes', error);
    routes.value = [];
  }
};

const manualTitle = ref('');
const manualDescription = ref('');
const manualLocation = ref('');
const manualStart = ref<string | null>(null);
const manualEnd = ref<string | null>(null);
const manualStartPickerValue = ref('');
const manualEndPickerValue = ref('');
const selectedEvent = ref<TimelineEvent | null>(null);
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
    const haystack = `${event.title || ''} ${event.description || ''} ${event.location || ''}`.toLowerCase();
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

  const FUTURE_PADDING = 5 * 24 * 60 * 60 * 1000; // extend axis five days beyond today
  const baseline = Date.now();
  const min = points.length ? Math.min(...points) : baseline;
  let max = points.length ? Math.max(...points) : baseline;
  if (max === min) {
    max += 60_000;
  }
  max = Math.max(max, baseline + FUTURE_PADDING);
  return { min, max };
});

const calculatePosition = (value: number, min: number, span: number) => Math.min(100, Math.max(0, ((value - min) / span) * 100));

const timelineMonthSegments = computed(() => {
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  const startOfFirstMonth = new Date(min);
  startOfFirstMonth.setDate(1);
  startOfFirstMonth.setHours(0, 0, 0, 0);
  let pointer = startOfFirstMonth.getTime();
  const segments: Array<{
    start: number;
    end: number;
    monthLabel: string;
    yearLabel?: string;
  }> = [];

  while (pointer < max) {
    const chunkStart = new Date(pointer);
    const nextMonth = new Date(chunkStart);
    nextMonth.setMonth(chunkStart.getMonth() + 1);
    nextMonth.setHours(0, 0, 0, 0);
    const chunkEnd = Math.min(nextMonth.getTime(), max);
    segments.push({
      start: pointer,
      end: Math.max(chunkEnd, pointer + 1),
      monthLabel: shortMonths[chunkStart.getMonth()],
      yearLabel: chunkStart.getMonth() === 0 ? String(chunkStart.getFullYear()) : undefined
    });
    pointer = nextMonth.getTime();
  }

  if (!segments.length) {
    const fallbackStart = startOfFirstMonth.getTime();
    const fallbackNext = new Date(startOfFirstMonth);
    fallbackNext.setMonth(startOfFirstMonth.getMonth() + 1);
    fallbackNext.setHours(0, 0, 0, 0);
    segments.push({
      start: fallbackStart,
      end: Math.max(fallbackStart + 1, fallbackNext.getTime()),
      monthLabel: shortMonths[startOfFirstMonth.getMonth()],
      yearLabel: startOfFirstMonth.getMonth() === 0 ? String(startOfFirstMonth.getFullYear()) : undefined
    });
  }

  return segments.map(segment => {
    const leftValue = calculatePosition(Math.max(min, segment.start), min, span);
    const endValue = calculatePosition(Math.min(max, segment.end), min, span);
    const center = Math.min(99.5, Math.max(0.5, (leftValue + endValue) / 2));
    return {
      ...segment,
      left: `${leftValue}%`,
      labelPosition: `${center}%`
    };
  });
});

const timelineDaySegments = computed(() => {
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  const startOfDay = new Date(min);
  startOfDay.setHours(0, 0, 0, 0);
  let pointer = startOfDay.getTime();
  const segments: Array<{ start: number }> = [];
  while (pointer <= max) {
    segments.push({ start: pointer });
    pointer += 24 * 60 * 60 * 1000;
  }
  return segments.map(segment => ({
    ...segment,
    left: `${calculatePosition(Math.max(min, segment.start), min, span)}%`
  }));
});

const timelineWeekSegments = computed(() => {
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  const startOfWeek = new Date(min);
  const dayOfWeek = startOfWeek.getDay();
  const offset = ((dayOfWeek + 6) % 7) * -1; // Monday as start
  startOfWeek.setDate(startOfWeek.getDate() + offset);
  startOfWeek.setHours(0, 0, 0, 0);
  let pointer = startOfWeek.getTime();
  const segments: Array<{ start: number }> = [];
  while (pointer <= max) {
    segments.push({ start: pointer });
    pointer += 7 * 24 * 60 * 60 * 1000;
  }
  return segments.map(segment => ({
    ...segment,
    left: `${calculatePosition(Math.max(min, segment.start), min, span)}%`
  }));
});

const timelineYearSegments = computed(() => timelineMonthSegments.value.filter(segment => segment.yearLabel));

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
  if (activeTab.value === 'timeline') return events.value;
  const q = normalizedEventSearch.value;
  if (!q) return events.value;
  return events.value.filter(event => {
    const haystack = `${event.title || ''} ${event.description || ''} ${event.location || ''}`.toLowerCase();
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

const selectedEventAttachments = computed(() => {
  const eventId = selectedEvent.value?.id;
  if (!eventId) return [];
  return getAttachmentsForEvent(eventId);
});

const selectedEventFlagStyle = computed(() => {
  if (!selectedEvent.value) return {};
  const { min, max } = timelineBounds.value;
  const span = Math.max(max - min, 1);
  const start = Math.max(min, Date.parse(selectedEvent.value.startDate) || min);
  const end = selectedEvent.value.endDate ? Math.max(start, Date.parse(selectedEvent.value.endDate) || start) : start;
  const midpoint = start + (end - start) / 2;
  return { left: `${calculatePosition(midpoint, min, span)}%` };
});

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
  if (!galleryId) return;
  router.push({ path: `/gallery/${galleryId}`, query: { from: 'timeline' } });
};

const openRoute = (routeId?: number) => {
  if (routeId) router.push(`/routes/${routeId}`);
};

const clearSelectedEvent = () => {
  if (!selectedEvent.value) return;
  selectedEvent.value = null;
  destroyLightbox();
};

const handleAttachmentClick = (index: number) => {
  openLightbox(index);
};

const handleAxisClick = () => {
  clearSelectedEvent();
};

const openEvent = (event: TimelineEvent) => {
  if (selectedEvent.value?.id === event.id) {
    clearSelectedEvent();
    return;
  }
  selectedEvent.value = event;
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

const openManualStartPicker = () => {
  manualStartPickerValue.value = manualStart.value || new Date().toISOString();
  showStartPicker.value = true;
};

const confirmManualStartPicker = () => {
  manualStart.value = manualStartPickerValue.value || '';
  showStartPicker.value = false;
};

const cancelManualStartPicker = () => {
  showStartPicker.value = false;
};

const clearManualStartPicker = () => {
  manualStart.value = '';
  showStartPicker.value = false;
};

const openManualEndPicker = () => {
  manualEndPickerValue.value = manualEnd.value || new Date().toISOString();
  showEndPicker.value = true;
};

const confirmManualEndPicker = () => {
  manualEnd.value = manualEndPickerValue.value || '';
  showEndPicker.value = false;
};

const cancelManualEndPicker = () => {
  showEndPicker.value = false;
};

const clearManualEndPicker = () => {
  manualEnd.value = '';
  showEndPicker.value = false;
};

const handleSegmentChange = (event: CustomEvent) => {
  const newValue = String((event as CustomEvent<{ value?: string | null }>).detail?.value || '');
  if (newValue === 'timeline' || newValue === 'events') {
    activeTab.value = newValue;
  }
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
      location: manualLocation.value.trim() || undefined,
      startDate: manualStart.value || '',
      endDate: manualEnd.value || null,
      updated: new Date().toISOString()
    });
    if (pendingPhotos.value.length) {
      await addEventPhotos(createdId, pendingPhotos.value);
    }
    manualTitle.value = '';
    manualDescription.value = '';
    manualLocation.value = '';
    manualStart.value = null;
    manualEnd.value = null;
    manualStartPickerValue.value = '';
    manualEndPickerValue.value = '';
    pendingPhotos.value = [];
    showStartPicker.value = false;
    showEndPicker.value = false;
    manualTab.value = 'list';
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

const videoExtensions = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'm4v'];

const isVideoAttachment = (photo: TimelineEventPhoto) => {
  const filenameExt = photo.filename?.split('.').pop()?.toLowerCase() || '';
  return videoExtensions.includes(filenameExt);
};

const selectedEventMedia = computed<MediaItem[]>(() =>
  selectedEventAttachments.value.map(photo => ({
    id: photo.id,
    galleryId: -1,
    filename: photo.filename,
    filepath: getAttachmentSrc(photo.filepath),
    created: photo.created,
    updated: photo.updated,
    isVideo: isVideoAttachment(photo)
  }))
);

const timelineEventAttachmentsSelector = '#timeline-event-attachments';

watch(selectedEventMedia, (media) => {
  destroyLightbox();
  if (!media.length) return;
  nextTick(() => {
    initLightbox(timelineEventAttachmentsSelector, media);
  });
});

onBeforeUnmount(() => {
  destroyLightbox();
});

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

const refreshTimelineData = async () => {
  isTimelineLoading.value = true;
  try {
    await Promise.all([loadGalleries(), loadEvents(), loadRoutes()]);
  } catch (error) {
    console.error('Failed to refresh timeline data', error);
  } finally {
    isTimelineLoading.value = false;
    await nextTick();
    scrollToToday();
  }
};

onMounted(() => {
  void refreshTimelineData();
});

onIonViewWillEnter(async () => {
  await refreshTimelineData();
});

onIonViewDidLeave(() => {
  clearSelectedEvent();
  destroyLightbox();
});

watch([timelineBounds], scrollToToday, { immediate: true });


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
</script>

<style scoped>
.timeline-filter-row {
  padding: 0 1rem;
}

.manual-tabs {
  margin: 0.5rem 0 0.25rem;
}

.timeline-scroll-container {
  overflow-x: auto;
  width: 100%;
  min-height: 180px;
  margin-bottom: 0.5rem;
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

.timeline-grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.timeline-month-boundary {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #303030;
  opacity: 0.45;
  z-index: 1;
}

.timeline-day-boundary {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(48, 48, 48, 0.2);
  z-index: 0;
}

.timeline-week-boundary {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(48, 48, 48, 0.35);
  z-index: 0;
}

.timeline-month-boundary {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #303030;
  opacity: 0.55;
  z-index: 1;
}

.timeline-month-label {
  position: absolute;
  top: 55%;
  transform: translate(-50%, -50%);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ion-color-medium);
  letter-spacing: 0.15em;
  z-index: 3;
}

.timeline-year-label {
  position: absolute;
  top: 12px;
  transform: translate(-50%, 0);
  font-size: 1.6rem;
  font-weight: 700;
  color: rgba(48, 48, 48, 0.35);
  letter-spacing: 0.4em;
  pointer-events: none;
  z-index: 0;
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

.timeline-event-flag {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  width: min(320px, 90vw);
  padding: 1rem;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.18);
  z-index: 5;
}

.timeline-event-flag::after {
  content: '';
  position: absolute;
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 12px solid #fff;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.12));
}

.timeline-event-flag__header {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.timeline-event-flag__title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--ion-color-dark);
}

.timeline-event-flag__location {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.timeline-event-flag__dates {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--ion-color-dark);
}

.timeline-event-flag__dates span strong {
  font-weight: 600;
  margin-right: 0.25rem;
}

.timeline-event-flag__description {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.timeline-event-flag__attachments {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.timeline-event-flag__thumbnail {
  width: 84px;
  height: 84px;
  border-radius: 12px;
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--ion-color-light);
  display: block;
}

.timeline-event-flag__thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.due-date-item {
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0.5rem;
}

.due-date-item ion-label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.due-date-item .date-label {
  font-weight: 500;
}

.due-date-item .date-value {
  font-size: 0.85rem;
  color: var(--ion-color-dark);
}

.date-picker-icon {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.date-picker-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 0.25rem;
}

:deep(.half-modal .modal-wrapper) {
  height: 55vh;
  max-height: 75vh;
  border-radius: 20px 20px 0 0;
  overflow: hidden;
}

:deep(.half-modal .modal-wrapper ion-content) {
  --border-radius: 0;
  padding-bottom: 0;
}

:deep(.half-modal .modal-wrapper ion-datetime) {
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
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

.pending-remove {
  --background: transparent;
  --background-hover: transparent;
  --background-focused: transparent;
  --background-activated: transparent;
  --box-shadow: none;
  position: absolute;
  top: 4px;
  right: 4px;
  margin: 0;
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

.event-location {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-top: 0.25rem;
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