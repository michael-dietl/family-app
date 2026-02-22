import { ref, computed } from 'vue';
import type { PluginListenerHandle } from '@capacitor/core';
import { CapacitorShareTarget } from '@capgo/capacitor-share-target';
import router from '@/router';

export interface SharedTargetItem {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
}

const sharedItems = ref<SharedTargetItem[]>([]);
let listenerRegistered = false;
let lastProcessedShareToken: string | null = null;
let shareReceivedListener: PluginListenerHandle | null = null;
let lastSharedItemsFingerprint: string | null = null;
let focusListenerRegistered = false;

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

const processSharedItems = (items: SharedTargetItem[], token?: string) => {
  if (token && token === lastProcessedShareToken) {
    return;
  }
  if (token) {
    lastProcessedShareToken = token;
  }

  const filtered = items
    .filter((item) => Boolean(item?.uri))
    .map((item) => ({ uri: item.uri, mimeType: item.mimeType || null, name: item.name || null }));

  if (filtered.length === 0) {
    return;
  }

  const fingerprint = buildItemsFingerprint(filtered);
  if (fingerprint && fingerprint === lastSharedItemsFingerprint) {
    return;
  }

  lastSharedItemsFingerprint = fingerprint;
  console.debug('[share-target] received', filtered.length);
  sharedItems.value = filtered;
  navigateToSharePage();
};

const handleNativeShare = (event: Event) => {
  const customEvent = event as CustomEvent<{ items?: SharedTargetItem[]; token?: string }>;
  const items = customEvent?.detail?.items;
  const token = customEvent?.detail?.token;
  if (!items || items.length === 0) {
    return;
  }
  processSharedItems(items, token);
};

const buildItemsFingerprint = (items: SharedTargetItem[]) => {
  return items
    .map((item) => `${item.uri}|${item.mimeType || ''}|${item.name || ''}`)
    .join('||');
};

const registerCapgoListener = async () => {
  if (shareReceivedListener) {
    return;
  }
  try {
    shareReceivedListener = await CapacitorShareTarget.addListener('shareReceived', (event) => {
      const files = event?.files || [];
      if (files.length === 0) {
        return;
      }
      const sharedItemsFromPlugin = files.map((file) => ({
        uri: file.uri,
        mimeType: file.mimeType || null,
        name: file.name || null
      }));
      processSharedItems(sharedItemsFromPlugin);
    });
  } catch (error) {
    console.warn('[share-target] could not register plugin listener', error);
  }
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

const scheduleShareFlush = () => {
  flushPendingNativeShare();
  if (typeof window === 'undefined') return;
  [500, 1000, 1500].forEach((delay) => {
    window.setTimeout(() => flushPendingNativeShare(), delay);
  });
};

const registerFocusFlush = () => {
  if (focusListenerRegistered || typeof window === 'undefined' || typeof document === 'undefined') return;
  focusListenerRegistered = true;
  const handler = () => flushPendingNativeShare();
  window.addEventListener('focus', handler);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      flushPendingNativeShare();
    }
  });
};

const ensureListener = () => {
  if (listenerRegistered) {
    return;
  }
  listenerRegistered = true;
  if (typeof window === 'undefined') {
    return;
  }
  void registerCapgoListener();
  window.addEventListener('share-target', handleNativeShare as EventListener);
  scheduleShareFlush();
  setTimeout(scheduleShareFlush, 200);
  registerFocusFlush();
};

export function useShareTarget() {
  ensureListener();

  const hasPendingItems = computed(() => sharedItems.value.length > 0);

  const clearSharedItems = () => {
    sharedItems.value = [];
    lastSharedItemsFingerprint = null;
    lastProcessedShareToken = null;
  };

  const removeSharedItem = (uri: string) => {
    const remaining = sharedItems.value.filter((item) => item.uri !== uri);
    sharedItems.value = remaining;
    if (remaining.length === 0) {
      lastSharedItemsFingerprint = null;
      lastProcessedShareToken = null;
      return;
    }
    lastSharedItemsFingerprint = buildItemsFingerprint(remaining);
  };

  return {
    sharedItems,
    hasPendingItems,
    clearSharedItems,
    removeSharedItem
  };
}
