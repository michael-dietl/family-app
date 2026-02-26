<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/gallery" />
        </ion-buttons>
        <ion-title>{{ t('shareTarget.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen class="share-target-page">
      <section class="share-target-body">
        <ion-text class="share-target-intro">
          {{ t('shareTarget.intro') }}
        </ion-text>

        <ion-item lines="none" class="share-target-progress" v-if="isUploading">
          <ion-progress-bar :value="progressRatio" :buffer="1"></ion-progress-bar>
        </ion-item>

        <ion-card v-if="items.length > 0" class="share-target-card">
          <ion-card-header>
            <ion-card-title>{{ t('shareTarget.itemsReceived') }}</ion-card-title>
            <ion-card-subtitle>
              {{ items.length }} {{ t('shareTarget.itemsLabel') }}
            </ion-card-subtitle>
          </ion-card-header>
            <div class="share-target-list">
              <article v-for="item in items" :key="item.uri" class="share-target-entry">
                <div class="share-target-entry-preview" role="presentation">
                  <video
                    v-if="isVideoMimeType(item.mimeType) && previewFor(item.uri, item.mimeType)"
                    :src="previewFor(item.uri, item.mimeType)"
                    autoplay
                    loop
                    muted
                    playsinline
                    preload="metadata"
                  />
                  <img
                    v-else-if="previewFor(item.uri, item.mimeType)"
                    :src="previewFor(item.uri, item.mimeType)"
                    alt="{{ mimeLabel(item.mimeType) }}"
                  />
                  <span v-else class="share-target-entry-placeholder"></span>
                </div>
                <div class="share-target-entry-info">
                  <p class="share-target-entry-title">{{ mimeLabel(item.mimeType) }}</p>
                  <p class="share-target-entry-uri">{{ shortenUri(item.uri) }}</p>
                </div>
                <div class="share-target-entry-actions">
                  <ion-badge :color="badgeColor(item.mimeType)">
                    {{ badgeText(item.mimeType) }}
                  </ion-badge>
                  <ion-button
                    fill="clear"
                    size="small"
                    color="medium"
                    @click.stop="removeItem(item.uri)"
                  >
                    {{ t('shareTarget.removeItem') }}
                  </ion-button>
                </div>
              </article>
            </div>
        </ion-card>

        <ion-text v-else class="share-target-empty">
          {{ t('shareTarget.noItems') }}
        </ion-text>

        <ion-item lines="full">
          <ion-label position="stacked">{{ t('shareTarget.chooseGallery') }}</ion-label>
          <ion-select
            :value="selectedGalleryId"
            :disabled="galleries.length === 0"
            @ionChange="handleGalleryChange"
          >
            <ion-select-option
              v-for="gallery in galleries"
              :key="gallery.id"
              :value="gallery.id"
            >
              {{ gallery.name || t('shareTarget.defaultGalleryName') }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-note v-if="galleries.length === 0" class="share-target-note">
          {{ t('shareTarget.noGalleries') }}
        </ion-note>

        <ion-button
          expand="block"
          class="share-target-action"
          :disabled="!canUpload || isUploading"
          @click="importSharedMedia"
        >
          {{ t('shareTarget.importButton') }}
        </ion-button>

        <ion-button expand="block" fill="outline" @click="createShareGallery">
          {{ t('shareTarget.createGalleryButton') }}
        </ion-button>

        <ion-button expand="block" fill="clear" color="medium" @click="cancelShareImport">
          {{ t('shareTarget.cancelButton') }}
        </ion-button>

        <ion-toast
          :is-open="toast.isOpen"
          :message="toast.message"
          :color="toast.color"
          duration="2500"
          @did-dismiss="toast.isOpen = false"
        />
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonText,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonProgressBar,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonNote,
  IonButton,
  IonBadge,
  IonToast
} from '@ionic/vue';
import { useGallery } from '@/composables/useGallery';
import { usePhoto } from '@/composables/usePhoto';
import { useShareTarget } from '@/composables/useShareTarget';
import { readContentUri } from '@/services/contentReader';
import { getPocketbaseAuthorId } from '@/services/pocketbase';

import type { SharedTargetItem } from '@/composables/useShareTarget';

const router = useRouter();
const { t } = useI18n();
const { galleries, initialize, createGallery, currentGallery } = useGallery();
const { sharedItems, clearSharedItems, removeSharedItem } = useShareTarget();
const { saveMultiplePhotos, isProcessing } = usePhoto();

const selectedGalleryId = ref<number | null>(null);
const toast = ref({ isOpen: false, message: '', color: 'success' as 'success' | 'danger' });
const uploadProgress = ref({ current: 0, total: 0 });
const isUploading = ref(false);

const normalizeGalleryId = (value: number | string | null | undefined): number | null => {
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const selectedGalleryIdNumber = computed(() => normalizeGalleryId(selectedGalleryId.value));
const items = computed(() => sharedItems.value || []);
const canUpload = computed(
  () => items.value.length > 0 && selectedGalleryIdNumber.value != null && !isProcessing.value
);

const progressRatio = computed(() => {
  const { current, total } = uploadProgress.value;
  if (!total) {
    return 0;
  }
  return Math.min(1, current / total);
});

const DEFAULT_GALLERY_KEY = 'shareTargetDefaultGallery';

const getStoredGalleryId = (): number | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(DEFAULT_GALLERY_KEY);
    if (!stored) {
      return null;
    }
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  } catch (error) {
    console.warn('Could not read stored gallery preference', error);
    return null;
  }
};

const persistGalleryId = (value: number | null) => {
  if (typeof window === 'undefined' || value == null) {
    return;
  }
  try {
    window.localStorage.setItem(DEFAULT_GALLERY_KEY, value.toString());
  } catch (error) {
    console.warn('Could not persist gallery preference', error);
  }
};

const ensureGallerySelection = (list: typeof galleries.value) => {
  if (!list || list.length === 0) {
    return;
  }
  const current = normalizeGalleryId(currentGallery.value?.id);
  const normalizedSelection = normalizeGalleryId(selectedGalleryId.value);

  if (
    normalizedSelection != null &&
    list.some((gallery) => normalizeGalleryId(gallery.id) === normalizedSelection)
  ) {
    return;
  }

  if (current != null && list.some((gallery) => normalizeGalleryId(gallery.id) === current)) {
    selectedGalleryId.value = current;
    return;
  }

  const stored = getStoredGalleryId();
  if (stored != null && list.some((gallery) => normalizeGalleryId(gallery.id) === stored)) {
    selectedGalleryId.value = stored;
    return;
  }

  const first = list[0];
  if (first?.id) {
    selectedGalleryId.value = first.id;
  }
};

const shareAuthorId = ref<string | null>(null);

const resolveShareAuthorId = async () => {
  if (shareAuthorId.value) return shareAuthorId.value;
  shareAuthorId.value = await getPocketbaseAuthorId();
  return shareAuthorId.value;
};

watch(
  () => galleries.value,
  (list) => {
    ensureGallerySelection(list || []);
  },
  { immediate: true }
);

watch(selectedGalleryId, (value) => {
  const normalized = normalizeGalleryId(value);
  if (normalized != null) {
    persistGalleryId(normalized);
  }
});

const handleGalleryChange = (event: CustomEvent<{ value?: string | number | null | undefined }>) => {
  selectedGalleryId.value = normalizeGalleryId(event.detail?.value);
};

onMounted(async () => {
  try {
    await initialize();
  } catch (error) {
    console.error('Could not load galleries', error);
  }
});

const isVideoMimeType = (mime?: string | null) => !!mime?.startsWith('video/');

const previewCache = ref<Record<string, string>>({});
const rawPreviewBase64 = ref<Record<string, string>>({});
const loadingPreviewUris = new Set<string>();

const buildDataUrl = (base64: string, mime?: string | null) => {
  const prefix = mime ? `data:${mime};base64,` : 'data:image/jpeg;base64,';
  return `${prefix}${base64}`;
};

const loadPreviewFor = async (item: SharedTargetItem) => {
  const { uri, mimeType } = item;
  if (!uri || previewCache.value[uri] || loadingPreviewUris.has(uri)) {
    return;
  }
  if (typeof window === 'undefined') return;
  if (!uri.startsWith('content://') && !uri.startsWith('file://')) {
    return;
  }
  loadingPreviewUris.add(uri);
  try {
    const result = await readContentUri(uri);
    if (result?.data) {
      rawPreviewBase64.value[uri] = result.data;
      previewCache.value[uri] = buildDataUrl(result.data, mimeType);
    }
  } catch (error) {
    console.warn('Could not read share preview', uri, error);
  } finally {
    loadingPreviewUris.delete(uri);
  }
};

const resetPreviewCache = () => {
  previewCache.value = {};
  rawPreviewBase64.value = {};
  loadingPreviewUris.clear();
};

watch(
  items,
  (list) => {
    if (!list.length) {
      resetPreviewCache();
      return;
    }
    list.forEach((item) => {
      void loadPreviewFor(item);
    });
  },
  { immediate: true }
);

const previewFor = (uri: string, mime?: string | null) => {
  if (!uri) {
    return '';
  }
  if (previewCache.value[uri]) {
    return previewCache.value[uri];
  }
  try {
    return Capacitor.convertFileSrc(uri);
  } catch (error) {
    console.warn('Could not convert share preview uri', uri, error);
    return '';
  }
};

const shortenUri = (uri: string) => {
  if (!uri) {
    return '';
  }
  if (uri.length <= 60) {
    return uri;
  }
  return `${uri.slice(0, 30)}…${uri.slice(-25)}`;
};

const mimeLabel = (mime?: string | null) => {
  if (!mime) {
    return t('shareTarget.unknownType');
  }
  return mime.startsWith('video/') ? t('shareTarget.videoType') : t('shareTarget.imageType');
};

const badgeText = (mime?: string | null) => {
  if (!mime) {
    return t('shareTarget.unknownType');
  }
  return mime.startsWith('video/') ? t('shareTarget.videoType') : t('shareTarget.imageType');
};

const badgeColor = (mime?: string | null) => (mime && mime.startsWith('video/') ? 'warning' : 'primary');

const showToast = (message: string, color: 'success' | 'danger') => {
  toast.value = { isOpen: true, message, color };
};

const collectSharePayload = async () => {
  const payload: Array<string | { path: string | null; data?: string | null }> = [];
  for (const item of items.value) {
    if (!item?.uri) continue;
    if (item.uri.startsWith('content://') || item.uri.startsWith('file://')) {
      await loadPreviewFor(item);
    }
    const base64 = rawPreviewBase64.value[item.uri];
    if (base64) {
      payload.push({ path: item.uri, data: base64 });
    } else {
      payload.push(item.uri);
    }
  }
  return payload;
};

const importSharedMedia = async () => {
  const galleryId = selectedGalleryIdNumber.value;
  if (!canUpload.value || galleryId == null) {
    return;
  }

  const uris = await collectSharePayload();
  if (uris.length === 0) {
    return;
  }

  isUploading.value = true;
  uploadProgress.value = { current: 0, total: uris.length };

  try {
    await saveMultiplePhotos(uris, galleryId, (current, total) => {
      uploadProgress.value = { current, total };
    });
    showToast(t('shareTarget.successToast'), 'success');
    clearSharedItems();
    resetPreviewCache();
    await router.replace('/gallery');
  } catch (error) {
    console.error('Import failed', error);
    showToast(t('shareTarget.errorToast'), 'danger');
  } finally {
    isUploading.value = false;
    uploadProgress.value = { current: 0, total: 0 };
  }
};

const createShareGallery = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  const defaultName = t('shareTarget.newGalleryDefault');
  const name = window.prompt(t('shareTarget.newGalleryPrompt'), defaultName);
  if (!name || !name.trim()) {
    return;
  }

  try {
    const authorId = await resolveShareAuthorId();
    const newId = await createGallery(
      name.trim(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      authorId
    );
    selectedGalleryId.value = newId;
    await importSharedMedia();
  } catch (error) {
    console.error('Could not create gallery', error);
    showToast(t('shareTarget.errorCreateGallery'), 'danger');
  }
};

const cancelShareImport = () => {
  clearSharedItems();
  resetPreviewCache();
  selectedGalleryId.value = null;
  router.replace('/gallery').catch(() => {});
};

const removeItem = (uri: string) => {
  if (!uri) return;
  removeSharedItem(uri);
  delete previewCache.value[uri];
  delete rawPreviewBase64.value[uri];
};


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
</script>

<style scoped>
.share-target-page {
  --background: var(--ion-color-light-shade);
}

.share-target-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-target-intro {
  display: block;
  font-size: 0.95rem;
  color: var(--ion-color-medium);
}

.share-target-card {
  --ion-card-background: var(--ion-color-step-50);
}

.share-target-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-target-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 13px;
  background: var(--ion-color-step-50);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.share-target-entry-preview {
  flex: 0 0 72px;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--ion-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.share-target-entry-preview img,
.share-target-entry-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.share-target-entry-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0));
}

.share-target-entry-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.share-target-entry-title {
  font-weight: 600;
  margin: 0;
  font-size: 0.95rem;
}

.share-target-entry-uri {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  word-break: break-all;
}

.share-target-entry-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.share-target-entry-actions ion-button {
  font-size: 0.75rem;
  --padding-start: 6px;
  --padding-end: 6px;
}

.share-target-empty {
  display: block;
  text-align: center;
  font-size: 0.95rem;
  color: var(--ion-color-medium);
}

.share-target-note {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.share-target-action {
  --ion-color-base: var(--ion-color-primary);
}

.share-target-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 0;
}

.share-target-progress ion-progress-bar {
  width: 100%;
}
</style>
