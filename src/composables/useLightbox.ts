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
      autoplayDelay: 3000,
      openEffect: 'fade',
      closeEffect: 'fade',
      slideEffect: 'fade',
      zoomable: true,
      draggable: true
    };

    lightbox.value = GLightbox(options);

    lightbox.value.on('open', () => {
      if (autoplayInterval) return;
      autoplayInterval = setInterval(() => {
        lightbox.value?.nextSlide();
      }, 3000);
    });

    lightbox.value.on('close', () => {
      if (autoplayInterval) {
        clearInterval(autoplayInterval);
        autoplayInterval = null;
      }
    });

    if (onPhotoChange) {
      lightbox.value.on('slide_changed', (payload: any) => {
        if (payload?.current?.index !== undefined) {
          onPhotoChange(payload.current.index);
        }
      });
    }
  };


  const openLightbox = (index: number) => {
    if (lightbox.value?.openAt) {
      lightbox.value.openAt(index);
    }
  };

  const destroyLightbox = () => {
    if (autoplayInterval) {
      clearInterval(autoplayInterval);
      autoplayInterval = null;
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
  };
}
