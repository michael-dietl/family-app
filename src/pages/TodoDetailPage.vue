<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/todo" />
        </ion-buttons>
        <ion-title>{{ currentList?.name || 'ToDo' }}</ion-title>
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
            v-model="newItemTitle"
            placeholder="Aufgabe hinzufügen..."
            @keyup.enter="handleAddItem"
          />
          <ion-button slot="end" @click="handleAddItem" :disabled="!newItemTitle.trim()">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-item>

        <!-- Items List -->
        <ion-list v-if="items.length > 0">
          <ion-item v-for="item in items" :key="item.id">
            <ion-checkbox
              slot="start"
              :checked="item.completed"
              @ionChange="toggleItemCompleted(item.id!, !item.completed, listId)"
            />
            <ion-label :class="{ 'completed-item': item.completed }">
              <h3>{{ item.title }}</h3>
              <p v-if="item.description">{{ item.description }}</p>
            </ion-label>
            <ion-button slot="end" fill="clear" @click="deleteItem(item.id!, listId)">
              <ion-icon slot="icon-only" :icon="trashOutline" color="danger" />
            </ion-button>
          </ion-item>
        </ion-list>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <ion-icon :icon="checkboxOutline" size="large" />
          <p>Keine Aufgaben in der Liste</p>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonBackButton, IonList, IonItem, IonLabel, IonCheckbox, IonInput,
  IonButton, IonIcon, IonSpinner
} from '@ionic/vue';
import { add, checkboxOutline, trashOutline } from 'ionicons/icons';
import { useTodoList } from '@/composables/useTodoList';

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
} = useTodoList();

const newItemTitle = ref('');

onMounted(async () => {
  await loadList(listId);
  await loadItems(listId);
});

const handleAddItem = async () => {
  if (!newItemTitle.value.trim()) return;
  
  await createItem(listId, newItemTitle.value.trim());
  newItemTitle.value = '';
};
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
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
