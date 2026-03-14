<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>{{ $t('auto.video_studio') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <section class="hero">
        <div>
          <h1>{{ projectName }}</h1>
          <p>{{ $t('auto.video_studio_description') }}</p>
        </div>
        <div class="hero-actions">
          <ion-chip color="primary">
            <ion-label>{{ formattedDuration }} {{ $t('auto.total_duration') }}</ion-label>
          </ion-chip>
          <ion-button size="small" fill="outline" @click="addExampleClip">
            {{ $t('auto.video_studio_add_clip') }}
          </ion-button>
        </div>
      </section>

      <section class="timeline">
        <ion-list lines="full" class="timeline-list">
          <ion-item v-for="clip in clips" :key="clip.id">
            <ion-label>
              <h2>{{ clip.title }}</h2>
              <p>{{ formatDuration(clip.duration) }} · {{ clip.status }}</p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button fill="clear" size="small" @click="markClipReady(clip.id)">
                {{ $t('auto.video_studio_mark_ready') }}
              </ion-button>
              <ion-button fill="clear" size="small" color="danger" @click="removeClip(clip.id)">
                {{ $t('auto.video_studio_remove_clip') }}
              </ion-button>
            </ion-buttons>
          </ion-item>
        </ion-list>
      </section>

      <section class="actions">
        <ion-button size="large" expand="block" color="secondary" :disabled="autoEditStatus === 'processing'" @click="onAutoEdit">
          <ion-spinner v-if="autoEditStatus === 'processing'" />
          <span v-else>{{ autoEditButtonLabel }}</span>
        </ion-button>
        <p class="status-text" v-if="autoEditStatus === 'ready'">{{ $t('auto.video_studio_auto_edit_ready') }}</p>
        <p class="status-text" v-else-if="autoEditStatus === 'processing'">{{ $t('auto.video_studio_auto_edit_running') }}</p>
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonChip, IonLabel, IonButton, IonList, IonItem, IonSpinner } from '@ionic/vue';
import { useVideoStudio } from '@/composables/useVideoStudio';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const {
  clips,
  projectName,
  autoEditStatus,
  formattedDuration,
  addClip,
  removeClip,
  markClipReady,
  applyAutoEdit,
  resetAutoEdit
} = useVideoStudio();

const { t } = useI18n();

const autoEditButtonLabel = computed(() => {
  if (autoEditStatus.value === 'processing') {
    return '...' ;
  }
  if (autoEditStatus.value === 'ready') {
    return '✅ ' + t('auto.video_studio_reapply');
  }
  return t('auto.video_studio_start_auto_edit');
});

const addExampleClip = () => {
  addClip(undefined, 18);
  if (autoEditStatus.value === 'ready') {
    resetAutoEdit();
  }
};

const onAutoEdit = async () => {
  await applyAutoEdit();
};

const formatDuration = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
</script>

<style scoped>
.hero {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.hero h1 {
  margin: 0 0 0.5rem 0;
  font-size: 1.4rem;
}

.hero-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.timeline {
  margin-bottom: 1.5rem;
}

.timeline-list ion-item h2 {
  margin: 0;
}

.timeline-list ion-item p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.actions {
  text-align: center;
}

.status-text {
  margin-top: 0.75rem;
  font-size: 0.95rem;
  color: var(--ion-color-medium);
}
</style>
