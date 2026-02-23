import { ref } from 'vue';
import GLightbox from 'glightbox';
import 'glightbox/dist/css/glightbox.css';
import type { Photo } from '@/services/database';
import { KeepAwake } from "@capgo/capacitor-keep-awake"; 


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
  let playButton: HTMLButtonElement | null = null;
  const isLightboxOpen = ref(false);
  const autoplayActive = ref(false);
  const autoplayRequested = ref(false);
  let ionBackButtonListener: ((event: CustomEvent) => void) | null = null;

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

  function updatePlayButtonVisibility() {
    if (!playButton) return;
    const shouldShow = isLightboxOpen.value && !autoplayActive.value;
    playButton.style.display = shouldShow ? 'flex' : 'none';
  }

  function ensurePlayButton(container: Element) {
    if (playButton) return;
    playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'glightbox-play-button';
    playButton.setAttribute('aria-label', 'Play gallery');
    playButton.addEventListener('click', () => {
      if (!isLightboxOpen.value) return;
      startAutoplay();
    });
    container.appendChild(playButton);
  }

  const applyVideoPreviewFrame = (slideNode?: Element | null) => {
    const video = slideNode?.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;
    const seekToPreview = () => {
      try {
        if (video.currentTime < 0.5) {
          video.currentTime = 0.5;
        }
      } catch (error) {
        console.warn('Could not seek video preview', error);
      }
    };
    if (video.readyState >= 1) {
      seekToPreview();
      return;
    }
    const onMetadata = () => {
      seekToPreview();
      video.removeEventListener('loadedmetadata', onMetadata);
    };
    video.addEventListener('loadedmetadata', onMetadata);
  };

  const alignVideoPreview = () => {
    requestAnimationFrame(() => {
      const slide = document.querySelector('.glightbox-container .gslide.current');
      applyVideoPreviewFrame(slide);
    });
  };

  function removePlayButton() {
    if (!playButton) return;
    playButton.remove();
    playButton = null;
  }

  const initLightbox = (
    gallerySelector: string,
    photos: MediaItem[],
    onPhotoChange?: (index: number) => void
  ) => {
    if (lightbox.value) {
      lightbox.value.destroy();
    }
    // keep screen on while autoplaying
    KeepAwake.keepAwake ()
      .then(() => console.log('KeepAwake enabled'))
      .catch((error) => console.error('Failed to enable KeepAwake:', error));
    const options: any = {
      selector: `${gallerySelector} .glightbox`,
      loop: true,
      touchNavigation: true,
      autoplayVideos: true,
      plyr: {
        muted: true,
        autopause: false
      },
      autoplay: true,
      autoplayDelay,
      history: false,
      openEffect: 'fade',
      closeEffect: 'fade',
      slideEffect: 'fade',
      zoomable: true,
      draggable: true
    };

    lightbox.value = GLightbox(options);

    lightbox.value.on('open', () => {
      const container = document.querySelector('.glightbox-container');
      if (container) {
        if (!timelineEl || !progressEl) {
          timelineEl = document.createElement('div');
          timelineEl.className = 'glightbox-timeline';
          progressEl = document.createElement('div');
          progressEl.className = 'glightbox-timeline-progress';
          timelineEl.appendChild(progressEl);
          container.appendChild(timelineEl);
        }
        ensurePlayButton(container);
      }

      isLightboxOpen.value = true;
      updatePlayButtonVisibility();
      attachIonBackButtonListener();

      resetTimelineProgress();
      if (autoplayRequested.value) {
        startAutoplay();
      }
      alignVideoPreview();
      setTimeout(alignVideoPreview, 250);
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
      removePlayButton();
      detachIonBackButtonListener();
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
      const slideNode = payload?.current?.slideNode ?? payload?.detail?.current?.slideNode;
      applyVideoPreviewFrame(slideNode);
    });
  };

  function attachIonBackButtonListener() {
    if (ionBackButtonListener) return;
    ionBackButtonListener = (event: CustomEvent) => {
      event.detail.register(100, () => {
        if (isLightboxOpen.value && lightbox.value) {
          stopAutoplay();
          lightbox.value.close();
        }
      });
    };
    window.addEventListener('ionBackButton', ionBackButtonListener as EventListener);
  }

  function detachIonBackButtonListener() {
    if (!ionBackButtonListener) return;
    window.removeEventListener('ionBackButton', ionBackButtonListener as EventListener);
    ionBackButtonListener = null;
  }

  function startAutoplay() {
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
    updatePlayButtonVisibility();
  }
  function stopAutoplay() {
    if (!autoplayActive.value && !autoplayRequested.value) {
      return;
    }
    autoplayRequested.value = false;
    autoplayActive.value = false;
    clearAutoplayIntervals();
    if (progressEl) {
      progressEl.style.width = '0%';
    }
    updatePlayButtonVisibility();
  }


  const openLightbox = (index: number) => {
    if (lightbox.value?.openAt) {
      lightbox.value.openAt(index);
    }
  };

  const destroyLightbox = () => {
    stopAutoplay();
    removePlayButton();
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
