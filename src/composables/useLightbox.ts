import { ref } from 'vue';
import GLightbox from 'glightbox';
import 'glightbox/dist/css/glightbox.css';
import type { Photo } from '@/services/database';

export interface MediaItem extends Photo {
  isVideo?: boolean;
  videoUrl?: string;
}

const videoExtensions = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'm4v'];

const isVideoItem = (photo: MediaItem) => {
  if (photo.isVideo) return true;
  if (photo.mimeType?.startsWith('video/')) return true;
  const filenameExt = photo.filename?.split('.').pop()?.toLowerCase() || '';
  if (videoExtensions.includes(filenameExt)) return true;
  const cleanPath = (photo.filepath || '').split('?')[0].split('#')[0];
  const pathExt = cleanPath.split('.').pop()?.toLowerCase() || '';
  return videoExtensions.includes(pathExt);
};

export function useLightbox() {
  const lightbox = ref<any>(null);
  let autoplayInterval: ReturnType<typeof setInterval> | null = null;
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let progressStart = 0;
  const autoplayDelay = 3000;
  let timelineEl: HTMLDivElement | null = null;
  let progressEl: HTMLDivElement | null = null;
  const isLightboxOpen = ref(false);
  const autoplayActive = ref(false);
  const autoplayRequested = ref(false);

  const resetTimelineProgress = () => {
    progressStart = Date.now();
    if (progressEl) {
      progressEl.style.width = '0%';
    }
  };

  const clearAutoplayIntervals = () => {
    if (autoplayInterval) {
      clearInterval(autoplayInterval);
      autoplayInterval = null;
    }
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  };

  const initLightbox = (
    gallerySelector: string,
    photos: MediaItem[],
    onPhotoChange?: (index: number) => void
  ) => {
    if (lightbox.value) {
      lightbox.value.destroy();
    }

    const options: any = {
      selector: `${gallerySelector} .glightbox`,
      loop: true,
      touchNavigation: true,
      autoplayVideos: true,
      autoplay: true,
      autoplayDelay,
      openEffect: 'fade',
      closeEffect: 'fade',
      slideEffect: 'fade',
      zoomable: true,
      draggable: true
    };

    lightbox.value = GLightbox(options);

    lightbox.value.on('open', () => {
      if (!timelineEl || !progressEl) {
        const container = document.querySelector('.glightbox-container');
        if (container) {
          timelineEl = document.createElement('div');
          timelineEl.className = 'glightbox-timeline';
          progressEl = document.createElement('div');
          progressEl.className = 'glightbox-timeline-progress';
          timelineEl.appendChild(progressEl);
          container.appendChild(timelineEl);
        }
      }

      resetTimelineProgress();
      isLightboxOpen.value = true;
      if (autoplayRequested.value) {
        startAutoplay();
      }
    });

    lightbox.value.on('close', () => {
      isLightboxOpen.value = false;
      autoplayRequested.value = false;
      stopAutoplay();
      if (timelineEl) {
        timelineEl.remove();
        timelineEl = null;
        progressEl = null;
      }
    });

    lightbox.value.on('slide_changed', (payload: any) => {
      if (autoplayActive.value) {
        resetTimelineProgress();
      }
      const nextIndex = payload?.current?.index
        ?? payload?.detail?.current?.index
        ?? payload?.detail?.index;
      if (onPhotoChange && nextIndex !== undefined) {
        onPhotoChange(nextIndex);
      }
    });
  };

  const startAutoplay = () => {
    if (!isLightboxOpen.value) {
      autoplayRequested.value = true;
      return;
    }
    if (autoplayActive.value) {
      return;
    }
    autoplayRequested.value = false;
    autoplayActive.value = true;
    resetTimelineProgress();
    if (!autoplayInterval) {
      autoplayInterval = setInterval(() => {
        lightbox.value?.nextSlide();
      }, autoplayDelay);
    }
    if (!progressInterval) {
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - progressStart;
        const ratio = Math.min(elapsed / autoplayDelay, 1);
        if (progressEl) {
          progressEl.style.width = `${ratio * 100}%`;
        }
      }, 50);
    }
  };

  const stopAutoplay = () => {
    if (!autoplayActive.value && !autoplayRequested.value) {
      return;
    }
    autoplayRequested.value = false;
    autoplayActive.value = false;
    clearAutoplayIntervals();
    if (progressEl) {
      progressEl.style.width = '0%';
    }
  };


  const openLightbox = (index: number) => {
    if (lightbox.value?.openAt) {
      lightbox.value.openAt(index);
    }
  };

  const destroyLightbox = () => {
    stopAutoplay();
    if (timelineEl) {
      timelineEl.remove();
      timelineEl = null;
      progressEl = null;
    }
    if (lightbox.value) {
      lightbox.value.destroy();
      lightbox.value = null;
    }
  };

  return {
    initLightbox,
    openLightbox,
    destroyLightbox,
    startAutoplay,
    stopAutoplay,
    autoplayActive,
    isLightboxOpen,
  };
}
