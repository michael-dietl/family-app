<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>Kategorien verwalten</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page-content">
      <ion-list>
        <ion-item lines="none" v-if="isLoading">
          <ion-spinner slot="start" />
          <ion-label>Lädt Kategorien…</ion-label>
        </ion-item>

        <ion-item v-for="category in categories" :key="category.id">
          <ion-label>
            <h3>{{ category.name }}</h3>
            <p v-if="category.description">{{ category.description }}</p>
          </ion-label>
          <ion-buttons slot="end">
            <ion-button size="small" fill="clear" @click="editCategory(category)">
              <ion-icon slot="icon-only" :icon="createOutline" />
            </ion-button>
            <ion-button size="small" fill="clear" color="danger" @click="confirmDeleteCategory(category)">
              <ion-icon slot="icon-only" :icon="trashOutline" />
            </ion-button>
          </ion-buttons>
        </ion-item>
      </ion-list>

      <div v-if="!isLoading && categories.length === 0" class="empty-state">
        <p>Keine Kategorien vorhanden.</p>
      </div>

      <ion-button expand="block" class="create-button" @click="createCategory">
        <ion-icon slot="start" :icon="add" />
        Neue Kategorie
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
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
  IonButton,
  IonIcon,
  IonSpinner,
  alertController,
  toastController
} from '@ionic/vue';
import { add, createOutline, trashOutline } from 'ionicons/icons';
import { db, type BookCategory } from '@/services/database';

const categories = ref<BookCategory[]>([]);
const isLoading = ref(false);

const loadCategories = async () => {
  isLoading.value = true;
  try {
    categories.value = await db.getBookCategories();
  } catch (error) {
    console.error('Error loading categories', error);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadCategories();
});

const createCategory = async () => {
  const alert = await alertController.create({
    header: 'Neue Kategorie',
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: 'z.B. Krimis'
      },
      {
        name: 'description',
        type: 'textarea',
        placeholder: 'Beschreibung (optional)'
      }
    ],
    buttons: [
      {
        text: 'Erstellen',
        handler: async (data: any) => {
          const name = data.name?.trim();
          if (!name) {
            const toast = await toastController.create({
              message: 'Name darf nicht leer sein',
              duration: 2000,
              color: 'warning'
            });
            await toast.present();
            return false;
          }

          try {
            await db.createBookCategory({
              name,
              description: data.description?.trim() || undefined
            });
            await loadCategories();
            const toast = await toastController.create({
              message: 'Kategorie erstellt',
              duration: 2000,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            console.error('Error creating category', error);
            const toast = await toastController.create({
              message: 'Kategorie konnte nicht erstellt werden',
              duration: 2000,
              color: 'danger'
            });
            await toast.present();
          }
        }
      }
    ]
  });
  await alert.present();
};

const editCategory = async (category: BookCategory) => {
  if (!category.id) return;
  const categoryId = category.id;

  const alert = await alertController.create({
    header: 'Kategorie bearbeiten',
    inputs: [
      {
        name: 'name',
        type: 'text',
        value: category.name,
        placeholder: 'Name'
      },
      {
        name: 'description',
        type: 'textarea',
        value: category.description || '',
        placeholder: 'Beschreibung (optional)'
      }
    ],
    buttons: [
      {
        text: 'Speichern',
        handler: async (data: any) => {
          const name = data.name?.trim();
          if (!name) {
            const toast = await toastController.create({
              message: 'Name darf nicht leer sein',
              duration: 2000,
              color: 'warning'
            });
            await toast.present();
            return false;
          }

          try {
            await db.updateBookCategory(categoryId, {
              name,
              description: data.description?.trim() || null
            });
            await loadCategories();
            const toast = await toastController.create({
              message: 'Kategorie aktualisiert',
              duration: 1500,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            console.error('Error updating category', error);
            const toast = await toastController.create({
              message: 'Kategorie konnte nicht gespeichert werden',
              duration: 2000,
              color: 'danger'
            });
            await toast.present();
          }
        }
      }
    ]
  });

  await alert.present();
};

const confirmDeleteCategory = async (category: BookCategory) => {
  if (!category.id) return;

  const alert = await alertController.create({
    header: 'Kategorie löschen?',
    message: `Möchtest du "${category.name}" wirklich löschen?`,
    buttons: [
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          try {
            await db.deleteBookCategory(category.id!);
            await loadCategories();
            const toast = await toastController.create({
              message: 'Kategorie gelöscht',
              duration: 2000,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            console.error('Error deleting category', error);
            const toast = await toastController.create({
              message: 'Kategorie konnte nicht gelöscht werden',
              duration: 2000,
              color: 'danger'
            });
            await toast.present();
          }
        }
      }
    ]
  });

  await alert.present();
};


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
</script>

<style scoped>
.page-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.empty-state {
  text-align: center;
  color: var(--ion-color-medium);
  margin-top: 1rem;
}

.create-button {
  margin-top: auto;
}
</style>