<template>
  <ion-page>
        <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/todo" />
        </ion-buttons>
        <ion-title>Aufgabe</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="detail-page">
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <div v-else-if="!currentItem" class="empty-state">
        <ion-icon :icon="checkboxOutline" size="large" />
        <p>Aufgabe nicht gefunden</p>
      </div>

      <template v-else>
        <div class="detail-body">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ currentItem.title }}</ion-card-title>
              <ion-chip :color="currentItem.completed ? 'success' : 'medium'">
                <ion-label>
                  {{ currentItem.completed ? 'Erledigt' : 'Offen' }}
                </ion-label>
              </ion-chip>
            </ion-card-header>
            <ion-card-content>
              <p v-if="currentItem.description" class="description">
                {{ currentItem.description }}
              </p>
              <div class="detail-meta">
                <div>
                  <strong>Fälligkeitsdatum:</strong>
                  {{ formatDate(currentItem.dueDate) || '—' }}
                </div>
                <div v-if="currentItem.completed && currentItem.completionDate">
                  <strong>Erledigt am:</strong>
                  {{ formatDate(currentItem.completionDate) }}
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <div v-if="itemPhotos.length > 0" class="photos-section">
            <h3>Fotos</h3>
            <div class="photo-grid">
              <img v-for="photo in itemPhotos" :key="photo.id" :src="getImageSrc(photo.filepath)" />
            </div>
          </div>

          <ion-button
            expand="block"
            :color="currentItem.completed ? 'medium' : 'success'"
            @click="handleToggleStatus"
          >
            {{ currentItem.completed ? 'Als offen markieren' : 'Als erledigt markieren' }}
          </ion-button>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonChip,
  IonLabel,
  IonSpinner,
  IonButton,
  IonIcon
} from '@ionic/vue';
import { checkboxOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useTodoList } from '@/composables/useTodoList';

const route = useRoute();
const listId = Number(route.params.listId);
const itemId = Number(route.params.itemId);

const {
  items,
  isLoading,
  loadItems,
  loadPhotosForItem,
  photosMap,
  toggleItemCompleted
} = useTodoList();

const currentItem = computed(() => items.value.find(item => item.id === itemId) || null);
const itemPhotos = computed(() => photosMap.value[itemId] || []);

const getImageSrc = (path?: string | null) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

onMounted(async () => {
  await loadItems(listId);
  await loadPhotosForItem(itemId);
});

const handleToggleStatus = async () => {
  if (!currentItem.value || !currentItem.value.id) return;
  await toggleItemCompleted(itemId, !currentItem.value.completed, listId);
  await loadItems(listId);
  await loadPhotosForItem(itemId);
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
  min-height: 200px;
}

.detail-page {
  padding: 0 1rem 2rem;
}

.empty-state {
  margin-top: 2rem;
  text-align: center;
  color: var(--ion-color-medium);
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
}

.description {
  margin-bottom: 0.75rem;
  color: var(--ion-color-dark);
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.photos-section h3 {
  margin-bottom: 0.5rem;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.photo-grid img {
  width: 100px;
  height: 100px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}
</style>
