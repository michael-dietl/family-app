import { ref } from 'vue';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import type { Photo } from '@/services/database';

export interface MediaItem extends Photo {
  isVideo?: boolean;
  videoUrl?: string;
}

export function useLightbox() {
  const lightbox = ref<any>(null);
  const isPlaying = ref(false);
  let autoplayInterval: ReturnType<typeof setInterval> | null = null;

  const initLightbox = (
    gallerySelector: string,
    photos: MediaItem[],
    onPhotoChange?: (index: number) => void
  ) => {
    if (lightbox.value) {
      lightbox.value.destroy();
    }

    lightbox.value = new PhotoSwipeLightbox({
      gallery: gallerySelector,
      children: 'a',
      pswpModule: () => import('photoswipe'),
      bgOpacity: 0.9,
      showHideAnimationType: 'zoom',
      
      // Browser-History Integration für Hardware-Zurück-Button
      // @ts-ignore - history option exists but not in types
      history: true,
      returnFocus: true,
      
      // Lade Bildabmessungen dynamisch
      dataSource: photos.map((photo) => {
        if (photo.isVideo) {
          return {
            type: 'video',
            width: 1920,
            height: 1080,
            objectFit: 'contain',
            videoSrc: photo.filepath,
            mimeType: photo.mimeType || 'video/mp4'
          };
        }
        
        // Berücksichtige EXIF-Orientation: bei 90°/270° rotierter Bilder sind Breite/Höhe vertauscht
        const orientation = (photo as any).orientation as number | undefined;
        let width = photo.width || undefined;
        let height = photo.height || undefined;

        if (orientation && (orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8)) {
          // swap if both exist
          if (width !== undefined && height !== undefined) {
            const tmp = width;
            width = height;
            height = tmp;
            console.log('useLightbox: swapped width/height due to orientation', orientation, width, height);
          }
        }

        return {
          src: photo.filepath,
          width: width,
          height: height,
          objectFit: 'contain',
          alt: photo.filename,
        };
      }),
    });

    // Custom Content für Videos
    lightbox.value.on('contentLoad', (e: any) => {
      const { content } = e;
      
      // Handle Video Content
      if (content.data.type === 'video') {
        e.preventDefault();
        
        content.element = document.createElement('div');
        content.element.className = 'pswp__video-wrapper';
        
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        video.style.objectFit = 'contain';
        
        const source = document.createElement('source');
        source.src = content.data.videoSrc;
        source.type = content.data.mimeType;
        
        video.appendChild(source);
        content.element.appendChild(video);
        
        content.onLoaded();
        return;
      }
      
      // Handle Image Content
      if (!content.data.width || !content.data.height) {
        e.preventDefault();
        
        const img = new Image();
        img.onload = () => {
          content.data.width = img.naturalWidth;
          content.data.height = img.naturalHeight;
          content.onLoaded();
        };
        img.onerror = () => {
          content.onError();
        };
        img.src = content.data.src || '';
      }
    });

    // Event-Handler für Änderungen
    if (onPhotoChange) {
      lightbox.value.on('change', () => {
        const currentIndex = lightbox.value?.pswp?.currIndex;
        if (currentIndex !== undefined) {
          onPhotoChange(currentIndex);
        }
      });
    }

    // Play/Pause Button hinzufügen
    lightbox.value.on('uiRegister', function() {
      lightbox.value?.pswp?.ui?.registerElement({
        name: 'play-button',
        order: 9,
        isButton: true,
        html: '<svg class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><path d="M8 5v22l18-11L8 5z" fill="currentColor"/></svg>',
        onClick: (event: MouseEvent, el: HTMLElement) => {
          event.preventDefault();
          toggleAutoplay();
          updatePlayButton(el);
        }
      });
    });

    lightbox.value.init();
  };

  const toggleAutoplay = () => {
    if (isPlaying.value) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  };

  const startAutoplay = () => {
    if (autoplayInterval) return;
    
    isPlaying.value = true;
    autoplayInterval = setInterval(() => {
      if (lightbox.value?.pswp) {
        const pswp = lightbox.value.pswp;
        if (pswp.currIndex < pswp.getNumItems() - 1) {
          pswp.next();
        } else {
          // Am Ende angekommen, von vorne beginnen
          pswp.goTo(0);
        }
      }
    }, 3000); // 3 Sekunden pro Bild
  };

  const stopAutoplay = () => {
    if (autoplayInterval) {
      clearInterval(autoplayInterval);
      autoplayInterval = null;
    }
    isPlaying.value = false;
  };

  const updatePlayButton = (buttonElement: HTMLElement) => {
    if (isPlaying.value) {
      // Pause Icon
      buttonElement.innerHTML = '<svg class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><path d="M8 5h6v22H8V5zm10 0h6v22h-6V5z" fill="currentColor"/></svg>';
    } else {
      // Play Icon
      buttonElement.innerHTML = '<svg class="pswp__icn" viewBox="0 0 32 32" width="32" height="32"><path d="M8 5v22l18-11L8 5z" fill="currentColor"/></svg>';
    }
  };

  const openLightbox = (index: number) => {
    if (lightbox.value?.pswp) {
      lightbox.value.loadAndOpen(index);
    }
  };

  const destroyLightbox = () => {
    stopAutoplay();
    if (lightbox.value) {
      lightbox.value.destroy();
      lightbox.value = null;
    }
  };

  return {
    initLightbox,
    openLightbox,
    destroyLightbox,
    isPlaying,
  };
}
