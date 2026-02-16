import { reactive, readonly } from 'vue';

interface BackgroundSyncState {
  running: boolean;
  open: boolean;
  entity: string;
  current: number;
  total: number;
  error: string | null;
}

const state = reactive<BackgroundSyncState>({
  running: false,
  open: false,
  entity: '',
  current: 0,
  total: 0,
  error: null
});

let currentRun: Promise<void> | null = null;

const waitForIdle = () => new Promise((resolve) => setTimeout(resolve, 0));

export const syncProgressState = readonly(state);

export const showSyncProgress = (entity: string, total: number) => {
  state.open = true;
  state.entity = entity;
  state.current = 0;
  state.total = Math.max(0, total);
  state.error = null;
};

export const updateSyncProgress = (current: number) => {
  state.current = Math.max(0, Math.min(state.total, current));
};

export const hideSyncProgress = () => {
  state.open = false;
  state.entity = '';
  state.current = 0;
  state.total = 0;
  state.error = null;
};

export const runBackgroundOperation = async (operation: () => Promise<void>) => {
  if (currentRun) {
    return currentRun;
  }

  state.running = true;
  state.error = null;
  currentRun = (async () => {
    await waitForIdle();
    try {
      await operation();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error ?? 'Unbekannter Fehler');
      throw error;
    } finally {
      state.running = false;
      currentRun = null;
    }
  })();

  return currentRun;
};
