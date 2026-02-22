<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/shopping" />
        </ion-buttons>
        <ion-title>{{ currentList?.name || 'Einkaufsliste' }}</ion-title>
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
            @keyup.enter="handleAddItem"
          />
          <ion-input
            v-model.number="newItemQuantity"
            type="number"
            placeholder="{{ $t('auto.anzahl') }}"
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
            <ion-button slot="end" fill="clear" @click="deleteItem(item.id!, listId)">
              <ion-icon slot="icon-only" :icon="trashOutline" color="danger" />
            </ion-button>
          </ion-item>
        </ion-list>

        <div v-else class="empty-state">
          <ion-icon :icon="cartOutline" size="large" />
          <p>
            {{ shoppingSegment === 'pending' ? 'Keine offenen Artikel' : 'Keine erledigten Artikel' }}
          </p>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonBackButton, IonList, IonItem, IonLabel, IonCheckbox, IonInput,
  IonButton, IonIcon, IonSpinner, IonSegment, IonSegmentButton
} from '@ionic/vue';
import { add, cartOutline, trashOutline } from 'ionicons/icons';
import { useShoppingList } from '@/composables/useShoppingList';
import { type ShoppingItem } from '@/services/database';

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
  deleteItem
} = useShoppingList();

const shoppingSegment = ref<'pending' | 'completed'>('pending');

const pendingShoppingItems = computed(() => items.value.filter(item => !item.completed));
const completedShoppingItems = computed(() => items.value.filter(item => item.completed));
const visibleShoppingItems = computed(() =>
  shoppingSegment.value === 'pending' ? pendingShoppingItems.value : completedShoppingItems.value
);

const newItemName = ref('');
const newItemQuantity = ref<number | undefined>();

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
