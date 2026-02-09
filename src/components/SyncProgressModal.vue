<template>
  <ion-modal :is-open="open" :backdrop-dismiss="false" class="sync-progress-modal">
    <ion-content>
      <div class="sync-progress-content">
        <h2>{{ entityLabel }}</h2>
        <p>{{ progressText }}</p>
        <ion-progress-bar :value="progressValue" color="primary" />
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, defineProps } from 'vue';
import { IonModal, IonContent, IonProgressBar } from '@ionic/vue';

const props = defineProps<{
  open: boolean;
  entity: string; // z.B. 'Bücher', 'Fotos', 'Galerien'
  current: number;
  total: number;
}>();

const entityLabel = computed(() => props.entity);
const progressText = computed(() => `${props.current} von ${props.total}`);
const progressValue = computed(() => props.total > 0 ? props.current / props.total : 0);
</script>

<style scoped>
.sync-progress-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1.5rem;
}
.sync-progress-modal {
  --width: 320px;
  --height: 220px;
}
</style>
