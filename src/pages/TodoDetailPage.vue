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
          <ion-button slot="end" fill="clear" @click="handlePickPhotos">
            <ion-icon slot="icon-only" :icon="images" />
          </ion-button>
          <ion-button slot="end" fill="clear" @click="handleTakePhoto">
            <ion-icon slot="icon-only" :icon="camera" />
          </ion-button>
          <ion-button slot="end" @click="handleAddItem" :disabled="!newItemTitle.trim()">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-item>

        <div v-if="tempPhotos.length > 0" class="photo-preview-grid">
          <div v-for="(p, idx) in tempPhotos" :key="idx" class="thumb">
            <img :src="getImageSrc(p.path || p.data)" />
            <ion-button fill="clear" color="danger" @click="removeTempPhoto(idx)">×</ion-button>
          </div>
        </div>

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
            <div class="item-photos" slot="end">
              <div v-if="photosMap[item.id!] && photosMap[item.id!].length > 0" class="thumb-row">
                <img v-for="p in photosMap[item.id!].slice(0,3)" :key="p.id" :src="getImageSrc(p.filepath)" />
              </div>
              <ion-button fill="clear" @click="openAttachForItem(item.id!)">
                <ion-icon :icon="camera" />
              </ion-button>
              <ion-button fill="clear" color="danger" @click="deleteItem(item.id!, listId)">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </div>
          </ion-item>
        </ion-list>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <ion-icon :icon="checkboxOutline" size="large" />
          <p>{{ $t('auto.keine_aufgaben_in_der_liste') }}</p>
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
import { add, checkboxOutline, trashOutline, camera, images } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useTodoList } from '@/composables/useTodoList';
import { usePhoto } from '@/composables/usePhoto';

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
  deleteItem,
  photosMap,
  attachFilesToItem,
  loadPhotosForItem
} = useTodoList();

const { pickMultiplePhotos } = usePhoto();

const newItemTitle = ref('');
const tempPhotos = ref<Array<{ path?: string | null; data?: string | null }>>([]);

onMounted(async () => {
  await loadList(listId);
  await loadItems(listId);
});

const handleAddItem = async () => {
  if (!newItemTitle.value.trim()) return;
  try {
    const id = await createItem(listId, newItemTitle.value.trim());
    if (!id || id <= 0) {
      console.error('Failed to create todo item, invalid id returned:', id);
      // keep temp photos so user doesn't lose them
      return;
    }

    if (tempPhotos.value.length > 0) {
      console.log('Attaching', tempPhotos.value.length, 'photos to new item', id);
      await attachFilesToItem(id, tempPhotos.value.map(p => ({ path: p.path || null, data: p.data || null })));
    }

    newItemTitle.value = '';
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

    if (!photo || !photo.webPath) return;

    // fetch blob, convert to base64 and store in tempPhotos (defer saving until item created)
    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const reader = new FileReader();
    const base64Data: string = await new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
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

const openAttachForItem = async (itemId: number) => {
  try {
    // allow picking multiple images for existing item
    const picked = await pickMultiplePhotos();
    if (picked && picked.length > 0) {
      await attachFilesToItem(itemId, picked.map(p => ({ path: p.path || null, data: p.data || null })));
      await loadPhotosForItem(itemId);
    }
  } catch (e) {
    console.error('Error attaching to item', e);
  }
};

const getImageSrc = (path: string | null | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
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
