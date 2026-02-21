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

    <ion-content :fullscreen="false">
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
              <div class="task-input-row">
                <ion-input
                  v-model="newItemTitle"
                  :placeholder="$t('auto.todo_title_placeholder')"
                  @keyup.enter="handleAddItem"
                />
              </div>
              <ion-item lines="full">
                <ion-textarea
                  v-model="newItemDescription"
                  :placeholder="$t('auto.todo_description_placeholder')"
                  :rows="2"
                  auto-grow
                />
              </ion-item>
              <ion-item lines="none" class="due-date-item">
                <ion-label>
                  <span class="date-label">{{ $t('auto.faelligkeitsdatum') }}</span>
                  <span class="date-value">{{ dueDateLabel }}</span>
                </ion-label>
                <ion-button
                  fill="clear"
                  class="date-picker-icon"
                  @click="openDueDatePicker"
                >
                  <ion-icon :icon="calendarOutline" />
                </ion-button>
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
              <div class="save-task-row">
                <ion-button
                  expand="block"
                  color="primary"
                  :disabled="!newItemTitle.trim()"
                  @click="handleAddItem"
                >
                  {{ $t('auto.speichern') }}
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <div v-if="tempPhotos.length > 0" class="photo-preview-grid">
          <div v-for="(p, idx) in tempPhotos" :key="idx" class="thumb">
            <img :src="getImageSrc(p.path || p.data)" />
            <ion-button fill="clear" color="danger" @click="removeTempPhoto(idx)">
              {{ $t('entfernen') }}
            </ion-button>
          </div>
        </div>

        <ion-segment class="todo-segment" v-model="activeSegment">
          <ion-segment-button value="pending">{{ $t('auto.todo_segment_pending') }}</ion-segment-button>
          <ion-segment-button value="completed">{{ $t('auto.todo_segment_completed') }}</ion-segment-button>
        </ion-segment>

        <ion-list v-if="visibleItems.length > 0" class="todo-list">
          <ion-item
            v-for="item in visibleItems"
            :key="item.id"
            class="todo-row"
            lines="full"
          >
            <ion-checkbox
              slot="start"
              :checked="item.completed"
              @ionChange="() => handleToggleTodoCompletion(item, !item.completed)"
            />
            <div class="todo-item-content">
              <h3 class="todo-title">{{ item.title }}</h3>
              <p v-if="item.description" class="todo-description">{{ item.description }}</p>
               <ion-datetime-button datetime="duedate"></ion-datetime-button>
              <ion-datetime id="duedate" v-model="item.dueDate" presentation="date-time" hidden>

              </ion-datetime>
              <div class="todo-meta">
                <span v-if="!item.completed && item.dueDate">
                  {{ $t('auto.faelligkeitsdatum') }}: {{ formatSimpleDate(item.dueDate) }}
                </span>
                <span v-if="item.completed && item.completionDate">
                  {{ $t('auto.todo_done_on') }}: {{ formatSimpleDate(item.completionDate) }}
                </span>
              </div>
            </div>
            <ion-button slot="end" fill="clear" color="danger" @click="handleDeleteTodoItem(item)">
              <ion-icon :icon="trashOutline" slot="icon-only" />
            </ion-button>
          </ion-item>
        </ion-list>

        <div v-else class="empty-state small">
          <ion-icon :icon="checkboxOutline" size="large" />
          <p>
            {{ activeSegment === 'pending' ? $t('auto.todo_empty_pending') : $t('auto.todo_empty_completed') }}
          </p>
        </div>
      </template>
    </ion-content>
    <ion-modal css-class="half-modal" :is-open="showDueDateModal" @didDismiss="cancelDueDatePicker">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="cancelDueDatePicker">{{ $t('buttons.cancel') }}</ion-button>
          </ion-buttons>
          <ion-title>{{ $t('auto.faelligkeitsdatum') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button strong @click="confirmDueDate">{{ $t('auto.speichern') }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div class="date-picker-wrapper">
          <ion-datetime
            v-model="dueDatePickerValue"
            presentation="date"
            display-format="DD.MM.YYYY"
            :show-default-buttons="false"
          />
        </div>
        <div class="modal-actions">
          <ion-button expand="block" fill="clear" color="medium" @click="clearDueDate">
            {{ $t('auto.zuruecksetzen') }}
          </ion-button>
        </div>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonDatetime,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonCheckbox,
  IonModal
} from '@ionic/vue';
import {
  checkboxOutline,
  camera,
  images,
  trashOutline,
  calendarOutline
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useTodoList } from '@/composables/useTodoList';
import { usePhoto } from '@/composables/usePhoto';
import { type TodoItem } from '@/services/database';

const route = useRoute();
const router = useRouter();
const numericListId = computed<number | null>(() => {
  const parsedId = Number(route.params.id);
  return Number.isFinite(parsedId) ? parsedId : null;
});

const {
  currentList,
  items,
  isLoading,
  loadList,
  loadItems,
  createItem,
  toggleItemCompleted,
  deleteItem,
  attachFilesToItem
} = useTodoList();

const { pickMultiplePhotos } = usePhoto();

const newItemTitle = ref('');
const newItemDescription = ref('');
const newItemDueDate = ref('');
const showDueDateModal = ref(false);
const dueDatePickerValue = ref('');
const tempPhotos = ref<Array<{ path?: string | null; data?: string | null }>>([]);
const activeSegment = ref<'pending' | 'completed'>('pending');

const formatSimpleDate = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const dueDateLabel = computed(() => formatSimpleDate(newItemDueDate.value) || '-');

const openDueDatePicker = () => {
  dueDatePickerValue.value = newItemDueDate.value || new Date().toISOString();
  showDueDateModal.value = true;
};

const confirmDueDate = () => {
  newItemDueDate.value = dueDatePickerValue.value || '';
  showDueDateModal.value = false;
};

const cancelDueDatePicker = () => {
  showDueDateModal.value = false;
};

const clearDueDate = () => {
  newItemDueDate.value = '';
  showDueDateModal.value = false;
};

const pendingItems = computed(() => items.value.filter(item => !item.completed));
const completedItems = computed(() => items.value.filter(item => item.completed));
const visibleItems = computed(() =>
  activeSegment.value === 'pending' ? pendingItems.value : completedItems.value
);

const loadCurrentList = async (id: number) => {
  await loadList(id);
  await loadItems(id);
};

const hydrateList = async () => {
  const id = numericListId.value;
  if (id === null) {
    router.replace('/todo');
    return;
  }
  await loadCurrentList(id);
};

onMounted(() => {
  void hydrateList();
});

watch(
  () => numericListId.value,
  (newId, oldId) => {
    if (newId === oldId) return;
    void hydrateList();
  }
);

const handleAddItem = async () => {
  const title = newItemTitle.value.trim();
  if (!title) return;

  try {
    const currentListId = numericListId.value;
    if (currentListId === null) return;

    const id = await createItem(
      currentListId,
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

const handleToggleTodoCompletion = async (item: TodoItem, completed: boolean) => {
  const listId = numericListId.value;
  if (!item.id || listId === null) return;
  await toggleItemCompleted(item.id, completed, listId);
};

const handleDeleteTodoItem = async (item: TodoItem) => {
  const listId = numericListId.value;
  if (!item.id || listId === null) return;
  await deleteItem(item.id, listId);
};

const getImageSrc = (path: string | null | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

// ...existing code...

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

.due-date-item {
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0.5rem;
}

.due-date-item ion-label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.due-date-item .date-label {
  font-weight: 500;
}

.due-date-item .date-value {
  font-size: 0.85rem;
  color: var(--ion-color-dark);
}

.calendar-icon-only {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.calendar-icon-only::part(text) {
  display: none;
}
.date-picker-icon {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.modal-actions {
  margin-top: 1rem;
}

.date-picker-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 0.25rem;
}

.date-picker-wrapper ion-datetime {
  width: min(360px, 100%);
}

.calendar-icon-only::part(icon) {
  font-size: 1.25rem;
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

.save-task-row {
  margin-top: 0.75rem;
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

::v-deep .half-modal .modal-wrapper {
  height: 55vh;
  max-height: 75vh;
  border-radius: 20px 20px 0 0;
  overflow: hidden;
}

::v-deep .half-modal .modal-wrapper ion-content {
  --border-radius: 0;
  padding-bottom: 0;
}

::v-deep .half-modal .modal-wrapper ion-datetime {
  max-width: 100%;
}
</style>
