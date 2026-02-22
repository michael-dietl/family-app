<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.back()">
            <ion-icon slot="icon-only" :icon="arrowBack" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ $t('auto.todo') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showCreateModal = true">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="false">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ $t('auto.todo') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Loading -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Empty State -->
      <div v-else-if="lists.length === 0" class="empty-state">
        <ion-icon :icon="checkboxOutline" size="large" />
        <h2>{{ $t('auto.keine_todo_listen') }}</h2>
        <p>{{ $t('auto.erstelle_deine_erste_aufgabenliste') }}</p>
        <ion-button @click="showCreateModal = true">
          <ion-icon slot="start" :icon="add" />
          {{ $t('auto.liste_erstellen') }}
        </ion-button>
      </div>

      <!-- Lists -->
      <ion-list v-else>
        <ion-item
          v-for="list in lists"
          :key="list.id"
          button
          @click="router.push(`/todo/${list.id}`)"
        >
          <ion-icon slot="start" :icon="checkboxOutline" color="primary" />
          <ion-label>
            <h2>{{ list.name }}</h2>
            <p>{{ formatDate(list.updated) }}</p>
          </ion-label>
          <ion-button slot="end" fill="clear" @click.stop="confirmDelete(list.id!)">
            <ion-icon slot="icon-only" :icon="trashOutline" color="danger" />
          </ion-button>
        </ion-item>
      </ion-list>
    </ion-content>

    <!-- Create Modal -->
    <ion-modal :is-open="showCreateModal" @did-dismiss="showCreateModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ $t('auto.neue_liste') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showCreateModal = false">{{ $t('auto.abbrechen') }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
          <ion-item>
            <ion-input
              v-model="newListName"
              :label="$t('auto.listenname')"
              label-placement="stacked"
              :placeholder="$t('auto.z-b-projekt-x')"
            />
          </ion-item>
        <ion-button expand="block" @click="handleCreate" :disabled="!newListName.trim()">
          {{ $t('auto.liste_erstellen') }}
        </ion-button>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonList, IonItem, IonLabel, IonSpinner, IonModal, IonInput,
  alertController
} from '@ionic/vue';
import { add, checkboxOutline, trashOutline, arrowBack } from 'ionicons/icons';
import { useTodoList } from '@/composables/useTodoList';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { lists, isLoading, loadLists, createList, deleteList } = useTodoList();

const showCreateModal = ref(false);
const newListName = ref('');
const { t } = useI18n();

onMounted(() => {
  loadLists();
});

const handleCreate = async () => {
  if (!newListName.value.trim()) return;
  
  const id = await createList(newListName.value.trim());
  newListName.value = '';
  showCreateModal.value = false;
  router.push(`/todo/${id}`);
};

const confirmDelete = async (id: number) => {
  const alert = await alertController.create({
    header: t('liste-loeschen'),
    message: t('alle-aufgaben-dieser-liste-werden-ebenfa'),
    buttons: [
      { text: t('abbrechen'), role: 'cancel' },
      {
        text: t('loeschen'),
        role: 'destructive',
        handler: () => deleteList(id)
      }
    ]
  });
  await alert.present();
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
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
  margin-bottom: 16px;
}

.empty-state h2 {
  color: var(--ion-color-dark);
  margin-bottom: 8px;
}

.empty-state p {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
}
</style>
