<template>
  <ion-modal :is-open="isOpen" @didDismiss="onCancel">
    <ion-header>
      <ion-toolbar>
        <ion-title>Wegpunkt bearbeiten</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="onCancel">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-label position="stacked">Name</ion-label>
          <ion-input v-model="editName" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Beschreibung</ion-label>
          <ion-textarea v-model="editDescription" auto-grow />
        </ion-item>
      </ion-list>
      <ion-footer>
        <ion-toolbar>
          <ion-button expand="block" color="primary" @click="onSave">Speichern</ion-button>
          <ion-button expand="block" color="danger" fill="outline" @click="onDelete" style="margin-top:8px;">
            Löschen
          </ion-button>
        </ion-toolbar>
      </ion-footer>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonInput, IonTextarea, IonFooter } from '@ionic/vue';


const props = defineProps<{
  isOpen: boolean;
  name: string;
  description: string;
}>();
const emit = defineEmits(['save', 'cancel', 'delete']);

const editName = ref(props.name);
const editDescription = ref(props.description);

watch(() => props.isOpen, (open) => {
  if (open) {
    editName.value = props.name;
    editDescription.value = props.description;
  }
});

function onSave() {
  emit('save', { name: editName.value, description: editDescription.value });
}
function onCancel() {
  emit('cancel');
}
function onDelete() {
  emit('delete');
}
</script>
