<template>
  <button
    v-if="visible"
    class="speech-mini-btn"
    :style="buttonStyle"
    type="button"
    :disabled="listening"
    @click="startSpeechInput"
    aria-label="Spracheingabe"
    title="Spracheingabe"
  >
    <ion-spinner v-if="listening" name="crescent" />
    <ion-icon v-else :icon="micOutline" />
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { IonIcon, IonSpinner, toastController } from '@ionic/vue';
import { micOutline } from 'ionicons/icons';

const listening = ref(false);
const focusedEditable = ref<HTMLElement | null>(null);
const anchorElement = ref<HTMLElement | null>(null);
const anchorRect = ref<DOMRect | null>(null);

const visible = computed(() => Boolean(anchorRect.value && focusedEditable.value));

const buttonStyle = computed(() => {
  if (!anchorRect.value) return {};
  const size = 28;
  const top = Math.max(8, anchorRect.value.top + (anchorRect.value.height - size) / 2);
  const left = Math.max(8, anchorRect.value.right - size - 8);
  return {
    top: `${top}px`,
    left: `${left}px`
  };
});

const isTextInput = (el: HTMLElement): boolean => {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel'].includes(type);
  }
  return el.isContentEditable;
};

const updateAnchorRect = () => {
  if (!anchorElement.value) {
    anchorRect.value = null;
    return;
  }
  anchorRect.value = anchorElement.value.getBoundingClientRect();
};

const resolveFromIonHost = async (host: HTMLElement): Promise<HTMLElement | null> => {
  if (host.tagName === 'ION-INPUT' || host.tagName === 'ION-TEXTAREA' || host.tagName === 'ION-SEARCHBAR') {
    const anyHost = host as any;
    if (typeof anyHost.getInputElement === 'function') {
      try {
        const inputEl = await anyHost.getInputElement();
        if (inputEl instanceof HTMLElement && isTextInput(inputEl)) {
          return inputEl;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
};

const findEditableTarget = async (rawTarget: EventTarget | null): Promise<{ editable: HTMLElement | null; anchor: HTMLElement | null }> => {
  const target = rawTarget as HTMLElement | null;
  if (!target) return { editable: null, anchor: null };

  if (isTextInput(target)) {
    return { editable: target, anchor: target };
  }

  const host = target.closest('ion-input, ion-textarea, ion-searchbar') as HTMLElement | null;
  if (host) {
    const resolved = await resolveFromIonHost(host);
    return { editable: resolved, anchor: host };
  }

  return { editable: null, anchor: null };
};

const insertTranscript = (editable: HTMLElement, transcript: string) => {
  const normalized = transcript.trim();
  if (!normalized) return;

  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    const start = editable.selectionStart ?? editable.value.length;
    const end = editable.selectionEnd ?? editable.value.length;
    const needsSpace = start > 0 && !/\s$/.test(editable.value.slice(0, start));
    const chunk = needsSpace ? ` ${normalized}` : normalized;
    editable.setRangeText(chunk, start, end, 'end');
    editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    editable.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return;
  }

  if (editable.isContentEditable) {
    const needsSpace = editable.textContent && !/\s$/.test(editable.textContent);
    editable.textContent = `${editable.textContent || ''}${needsSpace ? ' ' : ''}${normalized}`;
    editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }
};

const transcribeSpeech = async (): Promise<string> => {
  const plugin = (window as any).plugins?.speechRecognition;
  const language = (navigator.language || 'de-DE').replace('_', '-');

  if (plugin && typeof plugin.startListening === 'function') {
    const hasPermission = await new Promise<boolean>((resolve) =>
      plugin.hasPermission((result: boolean) => resolve(result), () => resolve(false))
    );

    if (!hasPermission) {
      await new Promise<void>((resolve, reject) => plugin.requestPermission(resolve, reject));
    }

    const matches: string[] = await new Promise((resolve, reject) => {
      plugin.startListening(
        (results: string[]) => resolve(results),
        (error: unknown) => reject(error),
        {
          language,
          matches: 1,
          showPopup: true,
          showPartial: false
        }
      );
    });

    return (matches[0] ?? '').trim();
  }

  const WebSpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  if (!WebSpeechRecognition) {
    throw new Error('Spracherkennung wird auf diesem Gerät nicht unterstützt.');
  }

  return new Promise<string>((resolve, reject) => {
    const recognition = new WebSpeechRecognition();
    recognition.lang = language;
    recognition.maxAlternatives = 1;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      recognition.stop();
      resolve(event.results?.[0]?.[0]?.transcript?.trim() ?? '');
    };
    recognition.onerror = (event: any) => {
      recognition.stop();
      reject(new Error(event.error || 'Spracherkennung fehlgeschlagen.'));
    };
    recognition.start();
  });
};

const startSpeechInput = async () => {
  if (listening.value || !focusedEditable.value) return;
  listening.value = true;

  try {
    const transcript = await transcribeSpeech();
    if (!transcript) {
      const toast = await toastController.create({
        message: 'Keine Sprache erkannt.',
        duration: 1400,
        color: 'medium',
        position: 'bottom'
      });
      await toast.present();
      return;
    }

    insertTranscript(focusedEditable.value, transcript);
  } catch (error) {
    const toast = await toastController.create({
      message: error instanceof Error ? error.message : 'Spracherkennung fehlgeschlagen.',
      duration: 2000,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  } finally {
    listening.value = false;
  }
};

const onFocusIn = async (event: FocusEvent) => {
  const resolved = await findEditableTarget(event.target);
  focusedEditable.value = resolved.editable;
  anchorElement.value = resolved.anchor;
  updateAnchorRect();
};

const onFocusOut = (event: FocusEvent) => {
  const nextTarget = event.relatedTarget as HTMLElement | null;
  if (nextTarget?.classList?.contains('speech-mini-btn')) {
    return;
  }

  // Hide with slight delay so click on mic still works after focus leaves input.
  window.setTimeout(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.classList?.contains('speech-mini-btn')) return;
    focusedEditable.value = null;
    anchorElement.value = null;
    anchorRect.value = null;
  }, 120);
};

onMounted(() => {
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.addEventListener('scroll', updateAnchorRect, true);
  window.addEventListener('resize', updateAnchorRect);
});

onUnmounted(() => {
  document.removeEventListener('focusin', onFocusIn);
  document.removeEventListener('focusout', onFocusOut);
  window.removeEventListener('scroll', updateAnchorRect, true);
  window.removeEventListener('resize', updateAnchorRect);
});
</script>

<style scoped>
.speech-mini-btn {
  position: fixed;
  z-index: 3000;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(56, 128, 255, 0.92);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.speech-mini-btn ion-icon {
  font-size: 14px;
}

.speech-mini-btn ion-spinner {
  width: 14px;
  height: 14px;
}
</style>
