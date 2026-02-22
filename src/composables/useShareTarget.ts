import { ref, computed } from 'vue';
import router from '@/router';

export interface SharedTargetItem {
  uri: string;
  mimeType?: string | null;
}

const sharedItems = ref<SharedTargetItem[]>([]);
let listenerRegistered = false;
let lastProcessedShareToken: string | null = null;

const navigateToSharePage = () => {
  const go = () => {
    const currentPath = router.currentRoute.value?.path;
    if (currentPath !== '/share-target') {
      router.replace({ path: '/share-target' }).catch(() => {});
    }
  };

  if (!router.isReady()) {
    router.isReady().then(go).catch(() => {});
  } else {
    go();
  }
};

const handleNativeShare = (event: Event) => {
  const customEvent = event as CustomEvent<{ items?: SharedTargetItem[]; token?: string }>; 
  const items = customEvent?.detail?.items;
  const token = customEvent?.detail?.token;
  if (token && token === lastProcessedShareToken) {
    return;
  }
  if (token) {
    lastProcessedShareToken = token;
  }
  if (!items || items.length === 0) {
    return;
  }

  console.debug('[share-target] received', items.length);

  sharedItems.value = items
    .filter((item) => Boolean(item?.uri))
    .map((item) => ({ uri: item.uri, mimeType: item.mimeType || null }));

  navigateToSharePage();
};

const flushPendingNativeShare = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const bridge = (window as any).ShareTargetBridge;
  if (!bridge || typeof bridge.consumePendingSharePayload !== 'function') {
    return;
  }
  try {
    const raw = bridge.consumePendingSharePayload();
    if (!raw) {
      return;
    }

    const container = JSON.parse(raw);
    const token = typeof container?.token === 'string' ? container.token : null;
    if (token && token === lastProcessedShareToken) {
      return;
    }

    let items: SharedTargetItem[] = [];
    if (typeof container?.payload === 'string') {
      items = JSON.parse(container.payload);
    } else if (Array.isArray(container?.payload)) {
      items = container.payload;
    }

    if (items.length === 0) {
      return;
    }

    if (token) {
      lastProcessedShareToken = token;
    }

    window.dispatchEvent(new CustomEvent('share-target', { detail: { items, token } }));
  } catch (error) {
    console.warn('[share-target] flush failed', error);
  }
};

const ensureListener = () => {
  if (listenerRegistered) {
    return;
  }
  listenerRegistered = true;
  if (typeof window === 'undefined') {
    return;
  }
  window.addEventListener('share-target', handleNativeShare as EventListener);
  flushPendingNativeShare();
  setTimeout(flushPendingNativeShare, 200);
};

export function useShareTarget() {
  ensureListener();

  const hasPendingItems = computed(() => sharedItems.value.length > 0);

  const clearSharedItems = () => {
    sharedItems.value = [];
  };

  return {
    sharedItems,
    hasPendingItems,
    clearSharedItems
  };
}
