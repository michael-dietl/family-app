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
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ currentList?.name || 'ToDo' }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <template v-else>
        <section class="add-task-card">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ $t('auto.neue_aufgabe') }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item lines="none" class="task-input-row">
                <ion-input
                  v-model="newItemTitle"
                  placeholder="Titel der Aufgabe"
                  @keyup.enter="handleAddItem"
                />
                <ion-button
                  slot="end"
                  :disabled="!newItemTitle.trim()"
                  @click="handleAddItem"
                >
                  <ion-icon slot="icon-only" :icon="add" />
                </ion-button>
              </ion-item>
              <ion-item lines="full">
                <ion-textarea
                  v-model="newItemDescription"
                  placeholder="Beschreibung (optional)"
                  :rows="2"
                  auto-grow
                />
              </ion-item>
              <ion-item lines="full" class="due-date-item">
                <ion-label position="stacked">Fälligkeitsdatum</ion-label>
                <ion-datetime
                  v-model="newItemDueDate"
                  presentation="date"
                  display-format="DD.MM.YYYY"
                />
              </ion-item>
              <div class="add-task-actions">
                <ion-button fill="clear" @click="handlePickPhotos">
                  <ion-icon :icon="images" />
                  {{ $t('auto.fotos_hinzufuegen') }}
                </ion-button>
                <ion-button fill="clear" @click="handleTakePhoto">
                  <ion-icon :icon="camera" />
                  {{ $t('auto.foto_machen') }}
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <div v-if="tempPhotos.length > 0" class="photo-preview-grid">
          <div v-for="(p, idx) in tempPhotos" :key="idx" class="thumb">
            <img :src="getImageSrc(p.path || p.data)" />
            <ion-button fill="clear" color="danger" @click="removeTempPhoto(idx)">
              ×
            </ion-button>
          </div>
        </div>

        <ion-segment v-model="activeSegment" scrollable class="todo-segment">
          <ion-segment-button value="pending">
            {{ $t('auto.offene_aufgaben') }}
          </ion-segment-button>
          <ion-segment-button value="completed">
            {{ $t('auto.erledigte_aufgaben') }}
          </ion-segment-button>
        </ion-segment>

        <div v-if="visibleItems.length === 0" class="empty-state small">
          <ion-icon :icon="checkboxOutline" size="large" />
          <p>
            {{ activeSegment === 'pending' ? 'Keine offenen Aufgaben' : 'Keine erledigten Aufgaben' }}
          </p>
        </div>

        <ion-list v-else class="todo-list">
          <ion-item
            v-for="item in visibleItems"
            :key="item.id"
            class="todo-row"
            lines="full"
          >
            <ion-checkbox
              slot="start"
              :checked="item.completed"
              @ionChange="toggleItemCompleted(item.id!, !item.completed, listId)"
            />
            <ion-label class="todo-item-content">
              <div class="todo-title">{{ item.title }}</div>
              <p v-if="item.description" class="todo-description">{{ item.description }}</p>
              <div class="todo-meta">
                <span v-if="item.dueDate">Fällig {{ formatDate(item.dueDate) }}</span>
                <span v-if="item.completed && item.completionDate">Erledigt {{ formatDate(item.completionDate) }}</span>
              </div>
            </ion-label>
            <div class="item-actions" slot="end">
              <div v-if="getPhotosForItem(item.id).length > 0" class="thumb-row">
                <img
                  v-for="photo in getPhotosForItem(item.id).slice(0, 3)"
                  :key="photo.id"
                  :src="getImageSrc(photo.filepath)"
                />
              </div>
              <ion-button
                fill="clear"
                size="small"
                @click.stop="openItemDetail(item)"
              >
                <ion-icon :icon="chevronForwardOutline" />
              </ion-button>
              <ion-button
                fill="clear"
                color="danger"
                size="small"
                @click.stop="deleteItem(item.id!, listId)"
              >
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </div>
          </ion-item>
        </ion-list>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonList,
  IonItem,
  IonLabel,
  IonCheckbox,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonSegment,
  IonSegmentButton,
  IonDatetime
} from '@ionic/vue';
import {
  add,
  checkboxOutline,
  trashOutline,
  camera,
  images,
  chevronForwardOutline
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useTodoList } from '@/composables/useTodoList';
import { usePhoto } from '@/composables/usePhoto';

const route = useRoute();
const router = useRouter();
const listId = Number(route.params.id);

const {
  currentList,
  items,
  isLoading,
  loadList,
  loadItems,
  createItem,
  toggleItemCompleted,
  deleteItem,
  photosMap,
  attachFilesToItem
} = useTodoList();

const { pickMultiplePhotos } = usePhoto();

const newItemTitle = ref('');
const newItemDescription = ref('');
const newItemDueDate = ref('');
const tempPhotos = ref<Array<{ path?: string | null; data?: string | null }>>([]);
const activeSegment = ref<'pending' | 'completed'>('pending');

const pendingItems = computed(() => items.value.filter(item => !item.completed));
const completedItems = computed(() => items.value.filter(item => item.completed));
const visibleItems = computed(() =>
  activeSegment.value === 'pending' ? pendingItems.value : completedItems.value
);

onMounted(async () => {
  await loadList(listId);
  await loadItems(listId);
});

const handleAddItem = async () => {
  const title = newItemTitle.value.trim();
  if (!title) return;

  try {
    const id = await createItem(
      listId,
      title,
      newItemDescription.value.trim() || undefined,
      newItemDueDate.value || undefined
    );

    if (tempPhotos.value.length > 0) {
      await attachFilesToItem(
        id,
        tempPhotos.value.map(p => ({ path: p.path || null, data: p.data || null }))
      );
    }

    newItemTitle.value = '';
    newItemDescription.value = '';
    newItemDueDate.value = '';
    tempPhotos.value = [];
  } catch (err) {
    console.error('Error creating todo item:', err);
  }
};

const handleTakePhoto = async () => {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 85,
      allowEditing: false,
      saveToGallery: false
    });

    if (!photo?.webPath) return;

    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const reader = new FileReader();
    const base64Data: string = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    tempPhotos.value.push({ data: base64Data });
  } catch (error) {
    console.error('Error taking todo photo:', error);
  }
};

const removeTempPhoto = (index: number) => {
  tempPhotos.value.splice(index, 1);
};

const handlePickPhotos = async () => {
  try {
    const picked = await pickMultiplePhotos();
    if (picked && picked.length > 0) {
      for (const p of picked) {
        tempPhotos.value.push({ path: p.path, data: p.data || null });
      }
    }
  } catch (e) {
    console.error('Error picking photos', e);
  }
};

const getImageSrc = (path: string | null | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const getPhotosForItem = (itemId?: number) => {
  if (!itemId) return [];
  return photosMap.value[itemId] || [];
};

const openItemDetail = (item: { id?: number }) => {
  if (!item.id) return;
  router.push(`/todo/${listId}/item/${item.id}`);
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.add-task-card {
  padding: 1rem;
}

.task-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.due-date-item ion-datetime {
  width: 100%;
}

.add-task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.photo-preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 1rem 1rem;
}

.photo-preview-grid .thumb {
  position: relative;
  width: 70px;
  height: 70px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.photo-preview-grid .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-preview-grid .thumb ion-button {
  position: absolute;
  top: 0;
  right: 0;
  --padding-start: 4px;
  --padding-end: 4px;
}

.todo-segment {
  margin: 0 1rem 0.5rem;
}

.empty-state.small {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
  color: var(--ion-color-medium);
}

.todo-list {
  padding: 0 0 2rem;
}

.todo-row {
  min-height: 80px;
  align-items: center;
  gap: 0.75rem;
  --inner-border-width: 0;
}

.todo-item-content {
  flex: 1;
}

.todo-title {
  font-weight: 600;
}

.todo-description {
  margin: 0.25rem 0;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.thumb-row {
  display: flex;
  gap: 0.35rem;
}

.thumb-row img {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}
</style>
