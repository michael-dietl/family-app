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
          <ion-progress-bar :value="progressRatio" buffer="1"></ion-progress-bar>
        </ion-item>

        <ion-card v-if="items.length > 0" class="share-target-card">
          <ion-card-header>
            <ion-card-title>{{ t('shareTarget.itemsReceived') }}</ion-card-title>
            <ion-card-subtitle>
              {{ items.length }} {{ t('shareTarget.itemsLabel') }}
            </ion-card-subtitle>
          </ion-card-header>
          <ion-list>
            <ion-item v-for="item in items" :key="item.uri">
              <ion-thumbnail slot="start" v-if="previewFor(item.uri)" class="share-target-thumb">
                <img :src="previewFor(item.uri)" alt="" />
              </ion-thumbnail>
              <ion-label>
                <h3>{{ mimeLabel(item.mimeType) }}</h3>
                <p>{{ shortenUri(item.uri) }}</p>
              </ion-label>
              <ion-badge :color="badgeColor(item.mimeType)" slot="end">
                {{ badgeText(item.mimeType) }}
              </ion-badge>
            </ion-item>
          </ion-list>
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
import { useGallery } from '@/composables/useGallery';
import { usePhoto } from '@/composables/usePhoto';
import { useShareTarget } from '@/composables/useShareTarget';

const router = useRouter();
const { t } = useI18n();
const { galleries, initialize, createGallery } = useGallery();
const { sharedItems, clearSharedItems } = useShareTarget();
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
  const matchingSelection = list.some((gallery) => gallery.id === normalizeGalleryId(selectedGalleryId.value));
  if (matchingSelection) {
    return;
  }

  const stored = getStoredGalleryId();
  if (stored != null && list.some((gallery) => gallery.id === stored)) {
    selectedGalleryId.value = stored;
    return;
  }

  const first = list[0];
  if (first?.id) {
    selectedGalleryId.value = first.id;
  }
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

const previewFor = (uri: string) => {
  if (!uri) {
    return '';
  }
  try {
    return Capacitor.convertFileSrc(uri);
  } catch (error) {
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

const importSharedMedia = async () => {
  const galleryId = selectedGalleryIdNumber.value;
  if (!canUpload.value || galleryId == null) {
    return;
  }

  const uris = items.value.map((item) => item.uri);
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
    const newId = await createGallery(name.trim());
    selectedGalleryId.value = newId;
    await importSharedMedia();
  } catch (error) {
    console.error('Could not create gallery', error);
    showToast(t('shareTarget.errorCreateGallery'), 'danger');
  }
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

.share-target-thumb img {
  object-fit: cover;
  height: 56px;
  width: 56px;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
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
