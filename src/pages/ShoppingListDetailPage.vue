<!-- eslint-disable vue/no-deprecated-slot-attribute -->
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/shopping" />
        </ion-buttons>
        <ion-title>{{ currentList?.name || 'Einkaufsliste' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="shareShoppingList" :disabled="pendingShoppingItems.length === 0">
            <ion-icon slot="icon-only" :icon="shareSocialOutline" />
          </ion-button>
          <ion-button fill="clear" @click="startShoppingSpeechInput" :disabled="speechListening">
            <ion-spinner v-if="speechListening" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="micOutline" />
          </ion-button>
          <ion-button fill="clear" @click="openEditListModal">
            <ion-icon slot="icon-only" :icon="createOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <template v-else>
        <!-- Add Item -->
        <ion-item>
          <ion-input
            v-model="newItemName"
            placeholder="Artikel hinzufügen..."
            autocapitalize="sentences"
            @keyup.enter="handleAddItem"
          />
          <ion-input
            v-model.number="newItemQuantity"
            type="number"
            :placeholder="$t('auto.anzahl')"
            style="max-width: 80px"
          />
          <ion-button slot="end" @click="handleAddItem" :disabled="!newItemName.trim()">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-item>

        <ion-segment class="shopping-segment" v-model="shoppingSegment">
          <ion-segment-button value="pending">Offen</ion-segment-button>
          <ion-segment-button value="completed">Erledigt</ion-segment-button>
        </ion-segment>

        <div v-if="items.length === 0" class="empty-state">
          <ion-icon :icon="cartOutline" size="large" />
          <p>{{ $t('auto.keine_artikel_in_der_liste') }}</p>
        </div>

        <ion-list v-else-if="visibleShoppingItems.length > 0">
          <ion-reorder-group :disabled="false" @ionItemReorder="handleReorder">
            <ion-item v-for="item in visibleShoppingItems" :key="item.id">
              <ion-checkbox
                slot="start"
                :checked="item.completed"
                @ionChange="() => handleToggleShoppingItem(item)"
              />
              <ion-label :class="{ 'completed-item': item.completed }">
                <h3>{{ item.name }}</h3>
                <p v-if="item.quantity">{{ $t('auto.anzahl') }}: {{ item.quantity }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" @click="item.id && deleteItem(item.id, listId)">
                <ion-icon slot="icon-only" :icon="trashOutline" color="danger" />
              </ion-button>
              <ion-reorder slot="end" />
            </ion-item>
          </ion-reorder-group>
        </ion-list>

        <div v-else class="empty-state">
          <ion-icon :icon="cartOutline" size="large" />
          <p>
            {{ shoppingSegment === 'pending' ? 'Keine offenen Artikel' : 'Keine erledigten Artikel' }}
          </p>
        </div>
      </template>
    </ion-content>
    <ion-modal :is-open="showEditListModal" @did-dismiss="closeEditListModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>Liste bearbeiten</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeEditListModal">{{ $t('auto.abbrechen') }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-item>
          <ion-input
            v-model="editListName"
            :label="$t('auto.listenname')"
            label-placement="stacked"
            autocapitalize="sentences"
          />
        </ion-item>
        <ion-button expand="block" :disabled="!editListName.trim()" @click="saveListEdits">
          {{ $t('auto.speichern') }}
        </ion-button>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonBackButton, IonList, IonItem, IonLabel, IonCheckbox, IonInput,
  IonButton, IonIcon, IonSpinner, IonSegment, IonSegmentButton, IonReorderGroup, IonReorder,
  toastController
} from '@ionic/vue';
import { add, cartOutline, trashOutline, createOutline, micOutline, shareSocialOutline } from 'ionicons/icons';
import { useShoppingList } from '@/composables/useShoppingList';
import { type ShoppingItem } from '@/services/database';
import type { ItemReorderEventDetail } from '@ionic/core';

const route = useRoute();
const listId = Number(route.params.id);

const {
  currentList,
  items,
  isLoading,
  loadList,
  loadItems,
  createItem,
  toggleItemCompleted,
  updateList,
  deleteItem,
  updateItemOrder
} = useShoppingList();

const shoppingSegment = ref<'pending' | 'completed'>('pending');

const pendingShoppingItems = computed(() => items.value.filter(item => !item.completed));
const completedShoppingItems = computed(() => items.value.filter(item => item.completed));
const visibleShoppingItems = computed(() =>
  shoppingSegment.value === 'pending' ? pendingShoppingItems.value : completedShoppingItems.value
);

const newItemName = ref('');
const newItemQuantity = ref<number | undefined>();
const showEditListModal = ref(false);
const editListName = ref('');
const speechListening = ref(false);

const numberWords: Record<string, number> = {
  null: 0,
  ein: 1,
  eins: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fuenf: 5,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwoelf: 12,
  zwölf: 12
};

onMounted(async () => {
  await loadList(listId);
  await loadItems(listId);
});

const handleAddItem = async () => {
  if (!newItemName.value.trim()) return;
  
  await createItem(listId, newItemName.value.trim(), newItemQuantity.value);
  newItemName.value = '';
  newItemQuantity.value = undefined;
};

const parseQuantityFromSpoken = (input: string): number | undefined => {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;

  const numericMatch = normalized.match(/[-+]?\d+[\d.,]*/);
  if (numericMatch?.[0]) {
    const parsed = Number(numericMatch[0].replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  const token = normalized.split(/\s+/)[0];
  if (token in numberWords) {
    return numberWords[token];
  }

  return undefined;
};

const splitNameAndQuantityFromSpeech = (transcript: string): { name: string; quantity?: number } => {
  const cleaned = transcript.trim().replace(/\s+/g, ' ');
  if (!cleaned) return { name: '' };

  const markerMatch = cleaned.match(/\b(?:anzahl|x|mal|stück|stueck|stücke|stuecke|stk)\b/i);
  if (markerMatch?.index !== undefined) {
    const markerStart = markerMatch.index;
    const markerEnd = markerStart + markerMatch[0].length;
    const name = cleaned.slice(0, markerStart).trim();
    const quantity = parseQuantityFromSpoken(cleaned.slice(markerEnd).trim());
    return { name, quantity };
  }

  // Fallback: allow "Produkt 2" / "Produkt zwei" without explicit marker.
  const trailingQtyMatch = cleaned.match(/^(.*?)(?:\s+)([-+]?\d+[\d.,]*|ein|eins|eine|einen|zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun|zehn|elf|zwoelf|zwölf)$/i);
  if (trailingQtyMatch) {
    const name = trailingQtyMatch[1].trim();
    const quantity = parseQuantityFromSpoken(trailingQtyMatch[2]);
    return { name, quantity };
  }

  // Fallback: allow "2 Tomaten" / "zwei Tomaten".
  const leadingQtyMatch = cleaned.match(/^([-+]?\d+[\d.,]*|ein|eins|eine|einen|zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun|zehn|elf|zwoelf|zwölf)(?:\s+)(.+)$/i);
  if (leadingQtyMatch) {
    const quantity = parseQuantityFromSpoken(leadingQtyMatch[1]);
    const name = leadingQtyMatch[2].trim();
    return { name, quantity };
  }

  return { name: cleaned };
};

const buildShoppingShareText = (): string => {
  const title = currentList.value?.name?.trim() || 'Einkaufsliste';
  const lines = pendingShoppingItems.value.map((item) => {
    const quantity = item.quantity ? `${item.quantity}x ` : '';
    return `• ${quantity}${item.name}`;
  });

  return [`${title} (offen)`, '', ...lines].join('\n').trim();
};

const shareShoppingList = async () => {
  const text = buildShoppingShareText();
  if (!text) return;

  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      await navigator.share({
        title: currentList.value?.name || 'Einkaufsliste',
        text
      });
      return;
    }
  } catch (error) {
    const abortError = (error as { name?: string })?.name === 'AbortError';
    if (abortError) {
      return;
    }
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const openedWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

  const fallbackToast = await toastController.create({
    message: openedWindow ? 'WhatsApp-Freigabe geöffnet.' : 'Teilen nicht verfügbar.',
    duration: 1800,
    color: openedWindow ? 'success' : 'medium',
    position: 'bottom'
  });
  await fallbackToast.present();
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
      const spoken = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
      resolve(spoken);
    };
    recognition.onerror = (event: any) => {
      recognition.stop();
      reject(new Error(event.error || 'Spracherkennung fehlgeschlagen.'));
    };
    recognition.start();
  });
};

const startShoppingSpeechInput = async () => {
  if (speechListening.value) return;
  speechListening.value = true;

  try {
    const transcript = await transcribeSpeech();
    if (!transcript) {
      const emptyToast = await toastController.create({
        message: 'Keine Sprache erkannt.',
        duration: 1800,
        color: 'medium',
        position: 'bottom'
      });
      await emptyToast.present();
      return;
    }

    const parsed = splitNameAndQuantityFromSpeech(transcript);
    if (parsed.name) {
      newItemName.value = parsed.name;
    }
    newItemQuantity.value = parsed.quantity;

    const successToast = await toastController.create({
      message: parsed.quantity !== undefined
        ? `Erkannt: ${parsed.name} (${parsed.quantity})`
        : `Erkannt: ${parsed.name}`,
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await successToast.present();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Spracherkennung fehlgeschlagen.';
    const errorToast = await toastController.create({
      message,
      duration: 2200,
      color: 'danger',
      position: 'bottom'
    });
    await errorToast.present();
  } finally {
    speechListening.value = false;
  }
};

const handleToggleShoppingItem = async (item: ShoppingItem) => {
  if (!item.id) return;
  await toggleItemCompleted(item.id, !item.completed, listId);
};

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  const updated = [...list];
  const [moved] = updated.splice(from, 1);
  updated.splice(to, 0, moved);
  return updated;
};

const handleReorder = async (event: CustomEvent<ItemReorderEventDetail>) => {
  const { from, to } = event.detail;
  if (from === to) {
    event.detail.complete();
    return;
  }

  const targetIndex = to;

  const pending = items.value.filter(item => !item.completed);
  const completed = items.value.filter(item => item.completed);

  if (shoppingSegment.value === 'pending') {
    const reorderedPending = moveItem(pending, from, targetIndex);
    items.value = [...reorderedPending, ...completed];
    await updateItemOrder(listId, reorderedPending.map(item => item.id!).filter(Boolean), false);
  } else {
    const reorderedCompleted = moveItem(completed, from, targetIndex);
    items.value = [...pending, ...reorderedCompleted];
    await updateItemOrder(listId, reorderedCompleted.map(item => item.id!).filter(Boolean), true);
  }

  event.detail.complete();
};

const openEditListModal = () => {
  editListName.value = currentList.value?.name || '';
  showEditListModal.value = true;
};

const closeEditListModal = () => {
  showEditListModal.value = false;
};

const saveListEdits = async () => {
  const name = editListName.value.trim();
  if (!name) return;
  await updateList(listId, { name });
  showEditListModal.value = false;
};


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.shopping-segment {
  margin: 0 1rem 0.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state ion-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
}

.completed-item {
  text-decoration: line-through;
  opacity: 0.5;
}
</style>
