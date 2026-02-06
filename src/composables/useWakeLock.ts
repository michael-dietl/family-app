import { ref } from 'vue';

let plugin: any = null;
let wakeLockActive = false;

async function ensurePlugin() {
  if (plugin) return plugin;
  try {
    // Dynamisch importieren, damit SSR/Build nicht fehlschlägt
    const mod = await import('@capgo/capacitor-keep-awake');
    plugin = mod.KeepAwake;
    return plugin;
  } catch (e) {
    console.warn('KeepAwake Plugin konnte nicht geladen werden:', e);
    return null;
  }
}

export function useWakeLock() {
  const isActive = ref(false);

  async function activate() {
    const p = await ensurePlugin();
    if (!p) return;
    try {
      await p.keepAwake();
      isActive.value = true;
      wakeLockActive = true;
    } catch (e) {
      console.warn('WakeLock konnte nicht aktiviert werden:', e);
    }
  }

  async function deactivate() {
    const p = await ensurePlugin();
    if (!p) return;
    try {
      await p.allowSleep();
      isActive.value = false;
      wakeLockActive = false;
    } catch (e) {
      console.warn('WakeLock konnte nicht deaktiviert werden:', e);
    }
  }

  return { isActive, activate, deactivate };
}
