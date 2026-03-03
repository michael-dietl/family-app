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
  IonButton, IonIcon, IonSpinner, IonSegment, IonSegmentButton, IonReorderGroup, IonReorder
} from '@ionic/vue';
import { add, cartOutline, trashOutline, createOutline } from 'ionicons/icons';
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

  const targetIndex = from < to ? to - 1 : to;

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
