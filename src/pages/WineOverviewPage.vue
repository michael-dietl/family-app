<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Weinübersicht</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-list v-if="groupedWines && Object.keys(groupedWines).length">
        <template v-for="(wines, cat) in groupedWines" :key="cat">
          <ion-item-divider color="light">
            <ion-label>{{ cat || 'Ohne Kategorie' }}</ion-label>
          </ion-item-divider>
          <ion-item v-for="wine in wines" :key="wine.id">
            <ion-label>
              <h2>{{ wine.name }}</h2>
              <p>{{ wine.winery }}{{ wine.year ? ', ' + wine.year : '' }}</p>
              <p v-if="wine.type">{{ wine.type }}</p>
            </ion-label>
          </ion-item>
        </template>
      </ion-list>
      <div v-else class="empty-state">
        <ion-icon :icon="wineIcon" size="large" />
        <p>Keine Weine vorhanden.</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonItemDivider, IonIcon } from '@ionic/vue';
import { wine as wineIcon } from 'ionicons/icons';
import { db, type Wine, type WineCategory } from '@/services/database';

const wines = ref<Wine[]>([]);
const categories = ref<WineCategory[]>([]);
const groupedWines = ref<Record<string, Wine[]>>({});

const loadWines = async () => {
  wines.value = await db.getWines();
  categories.value = await db.getWineCategories();
  // Gruppieren nach Kategorie
  const catMap: Record<number, string> = {};
  categories.value.forEach(cat => { if (cat.id) catMap[cat.id] = cat.name; });
  const grouped: Record<string, Wine[]> = {};
  wines.value.forEach(wine => {
    const catName = wine.categoryId ? catMap[wine.categoryId] || 'Ohne Kategorie' : 'Ohne Kategorie';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(wine);
  });
  groupedWines.value = grouped;
};

onMounted(loadWines);
</script>

<style scoped>
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
</style>
