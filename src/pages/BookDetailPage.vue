<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>{{ $t('auto.buchdetails') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showMenu">
            <ion-icon :icon="ellipsisVertical" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <div v-else-if="book" class="book-detail">
        <!-- Cover Image -->
        <div class="cover-section">
          <div v-if="book.coverImage" class="cover-image-wrapper">
            <img 
              :src="getImageSrc(book.coverImage)" 
              :alt="book.title"
              class="cover-image"
              @error="handleImageError"
            />
            <ion-button 
              class="edit-cover-button" 
              fill="solid" 
              size="small"
              @click="editCoverPhoto"
            >
              <ion-icon slot="icon-only" :icon="createOutline" />
            </ion-button>
          </div>
          <div v-else class="placeholder-cover-large" @click="takeCoverPhoto">
            <ion-icon :icon="bookOutline" />
            <div class="camera-overlay">
              <ion-icon :icon="cameraOutline" />
              <span>{{ $t('auto.cover_fotografieren') }}</span>
            </div>
          </div>
        </div>

        <!-- Book Info -->
        <div class="info-section ion-padding">
          <h1>{{ book.title }}</h1>
          <div v-if="book.subtitle" class="subtitle">
            <span>{{ book.subtitle }}</span>
          </div>
          
          <div v-if="book.authors" class="authors">
            <ion-icon :icon="personOutline" />
            <span>{{ book.authors }}</span>
          </div>

          <div class="meta-info">
            <div v-if="book.publisher" class="meta-item">
              <ion-icon :icon="businessOutline" />
              <span>{{ book.publisher }}</span>
            </div>
            
            <div v-if="book.publishedDate" class="meta-item">
              <ion-icon :icon="calendarOutline" />
              <span>{{ book.publishedDate }}</span>
            </div>
            
            <div v-if="book.pageCount" class="meta-item">
              <ion-icon :icon="documentTextOutline" />
              <span>{{ book.pageCount }} Seiten</span>
            </div>
            
            <div v-if="book.language" class="meta-item">
              <ion-icon :icon="languageOutline" />
              <span>{{ getLanguageName(book.language) }}</span>
            </div>
          </div>

          <!-- Zusammenfassung -->
          <div v-if="book.description" class="description-section">
            <h3>{{ $t('auto.zusammenfassung') }}</h3>
            <p v-html="book.description"></p>
          </div>

          <!-- Status Badges -->
          <div class="status-badges">
            <ion-chip @click="showQuantityPicker">
              <ion-icon :icon="cubeOutline" />
              <ion-label>{{ $t('auto.anzahl') }}: {{ book.quantity || 1 }}</ion-label>
            </ion-chip>
            
            <ion-chip :color="book.read ? 'success' : 'medium'" @click="toggleRead">
              <ion-icon :icon="book.read ? checkmarkCircle : ellipseOutline" />
              <ion-label>{{ book.read ? 'Gelesen' : 'Ungelesen' }}</ion-label>
            </ion-chip>
            
            <ion-chip @click="showRatingPicker">
              <ion-icon :icon="star" />
              <ion-label>{{ book.rating ? `${book.rating}/5` : 'Bewerten' }}</ion-label>
            </ion-chip>
          </div>

          <!-- Categories -->
          <div class="categories-section">
            <h3>
              {{ $t('auto.kategorien') }}
              <ion-button size="small" fill="clear" class="edit-category-btn" @click="editCategory" slot="middle">
                <ion-icon :icon="createOutline" />
              </ion-button>
            </h3>

            <!-- Prefer our local category (categoryId) when present -->
            <div v-if="getCategoryNameById(book.categoryId)" class="category-chips">
              <ion-chip outline>
                <ion-label>{{ getCategoryNameById(book.categoryId) }}</ion-label>
              </ion-chip>
            </div>

            <!-- Fallback to text categories (from Google) only if no local category assigned -->
            <div v-else-if="book.categories" class="category-chips">
              <ion-chip v-for="(cat, index) in getCategoryList(book.categories)" :key="index" outline>
                <ion-label>{{ cat }}</ion-label>
              </ion-chip>
            </div>

            <div v-else class="no-category">
              <p>{{ $t('auto.keine_kategorie_zugewiesen') }}</p>
            </div>
          </div>

          <!-- ISBN -->
          <div class="isbn-section">
            <h3>{{ $t('auto.isbn') }}</h3>
            <p>{{ book.isbn }}</p>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonSpinner,
  IonChip,
  IonLabel,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue';
import { onIonViewWillEnter } from '@ionic/vue';
import {
  ellipsisVertical,
  bookOutline,
  personOutline,
  businessOutline,
  calendarOutline,
  documentTextOutline,
  languageOutline,
  star,
  checkmarkCircle,
  ellipseOutline,
  trashOutline,
  cameraOutline,
  cubeOutline,
  createOutline
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { db, type Book, type BookCategory } from '@/services/database';
import { downloadRemoteCoverImage, findLocalCoverImage, isRemoteImageUrl } from '@/services/imageStorage';
import { StatusBar, Style } from '@capacitor/status-bar';

const route = useRoute();
const router = useRouter();
const book = ref<Book | null>(null);
const isLoading = ref(false);
const categories = ref<BookCategory[]>([]);

onMounted(async () => {
  await loadBook();
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });

});

// Refresh beim Zurückkehren (z.B. nach Cover-Edit)
onIonViewWillEnter(async () => {
  await loadBook();
  await loadCategories();
});

const loadCategories = async () => {
  try {
    categories.value = await db.getBookCategories();
  } catch (e) {
    console.error('Error loading categories:', e);
  }
};

const ensureLocalCoverDownloaded = async (loadedBook: Book) => {
  if (!loadedBook.coverImage || !loadedBook.id) return false;

  if (!isRemoteImageUrl(loadedBook.coverImage)) {
    return true;
  }

  const existingLocal = await findLocalCoverImage(loadedBook.id, [loadedBook.isbn]);
  if (existingLocal) {
    await db.updateBook(loadedBook.id, { coverImage: existingLocal });
    loadedBook.coverImage = existingLocal;
    return true;
  }

  const localUri = await downloadRemoteCoverImage(loadedBook.coverImage, loadedBook.id);
  if (localUri) {
    await db.updateBook(loadedBook.id, { coverImage: localUri });
    loadedBook.coverImage = localUri;
    return true;
  }

  return false;
};

const loadBook = async () => {
  isLoading.value = true;
  try {
    const bookId = parseInt(route.params.id as string);
    book.value = await db.getBook(bookId);
    // Debug log
    if (book.value) {
        await ensureLocalCoverDownloaded(book.value);
      console.log('📖 Book loaded:', {
        title: book.value.title,
        subtitle: book.value.subtitle,
        hasDescription: !!book.value.description,
        descriptionLength: book.value.description?.length || 0
      });
    }
  } catch (error) {
    console.error('Error loading book:', error);
  } finally {
    isLoading.value = false;
  }
};

const handleImageError = (event: Event) => {
  console.warn('Image load error, hiding broken image');
  if (book.value) {
    book.value.coverImage = undefined;
  }
};

const getImageSrc = (coverImage?: string): string => {
  if (!coverImage) return '';
  
  // Lokaler file:// URI - konvertiere für WebView
  if (coverImage.startsWith('file://')) {
    return Capacitor.convertFileSrc(coverImage);
  }
  
  // Remote URL - https erzwingen
  if (coverImage.startsWith('http://')) {
    return coverImage.replace('http://', 'https://');
  }
  
  return coverImage;
};

const getLanguageName = (code?: string): string => {
  const languages: Record<string, string> = {
    'de': 'Deutsch',
    'en': 'Englisch',
    'fr': 'Französisch',
    'es': 'Spanisch',
    'it': 'Italienisch'
  };
  return languages[code || ''] || code || 'Unbekannt';
};

const getCategoryList = (categories?: string): string[] => {
  if (!categories) return [];
  return categories.split(',').map(c => c.trim());
};

const getCategoryNameById = (id?: number | null) => {
  if (!id) return null;
  const c = categories.value.find(x => x.id === id);
  return c ? c.name : null;
};

const editCategory = async () => {
  if (!book.value || !book.value.id) return;

  // Prepare radio inputs
  const inputs: any[] = [
    { type: 'radio', label: 'Keine', value: '', checked: book.value.categoryId == null }
  ];

  categories.value.forEach(cat => {
    inputs.push({ type: 'radio', label: cat.name, value: String(cat.id), checked: book.value?.categoryId === cat.id });
  });

  const alert = await alertController.create({
    header: 'Kategorie wählen',
    inputs,
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      {
        text: 'Speichern',
        handler: async (value: string) => {
          try {
            if (value === '') {
              // Clear category assignment
              await db.updateBook(book.value!.id!, { categoryId: undefined });
            } else {
              await db.updateBook(book.value!.id!, { categoryId: parseInt(value) });
            }
            await loadBook();
            const toast = await toastController.create({ message: 'Kategorie aktualisiert', duration: 1500, color: 'success' });
            await toast.present();
          } catch (e) {
            console.error('Error updating category:', e);
            const toast = await toastController.create({ message: 'Fehler beim Aktualisieren der Kategorie', duration: 2000, color: 'danger' });
            await toast.present();
          }
        }
      }
    ]
  });

  await alert.present();
};

const toggleRead = async () => {
  if (!book.value || !book.value.id) return;
  
  try {
    const newReadStatus = !book.value.read;
    await db.updateBook(book.value.id, { read: newReadStatus });
    book.value.read = newReadStatus;
    
    const toast = await toastController.create({
      message: newReadStatus ? 'Als gelesen markiert' : 'Als ungelesen markiert',
      duration: 1500,
      color: 'success'
    });
    await toast.present();
  } catch (error) {
    console.error('Error updating read status:', error);
  }
};

const showRatingPicker = async () => {
  if (!book.value || !book.value.id) return;
  
  const alert = await alertController.create({
    header: 'Bewertung',
    message: 'Wie hat dir das Buch gefallen?',
    inputs: [
      { label: '⭐ 1 Stern', type: 'radio', value: 1, checked: book.value.rating === 1 },
      { label: '⭐⭐ 2 Sterne', type: 'radio', value: 2, checked: book.value.rating === 2 },
      { label: '⭐⭐⭐ 3 Sterne', type: 'radio', value: 3, checked: book.value.rating === 3 },
      { label: '⭐⭐⭐⭐ 4 Sterne', type: 'radio', value: 4, checked: book.value.rating === 4 },
      { label: '⭐⭐⭐⭐⭐ 5 Sterne', type: 'radio', value: 5, checked: book.value.rating === 5 },
      { label: 'Keine Bewertung', type: 'radio', value: 0, checked: !book.value.rating }
    ],
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      {
        text: 'OK',
        handler: async (rating) => {
          if (!book.value || !book.value.id) return;
          
          try {
            await db.updateBook(book.value.id, { rating: rating || undefined });
            book.value.rating = rating || undefined;
            
            const toast = await toastController.create({
              message: 'Bewertung gespeichert',
              duration: 1500,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            console.error('Error updating rating:', error);
          }
        }
      }
    ]
  });
  await alert.present();
};

const showQuantityPicker = async () => {
  if (!book.value || !book.value.id) return;
  
  const alert = await alertController.create({
    header: 'Anzahl',
    message: 'Wie viele Exemplare hast du?',
    inputs: [
      {
        name: 'quantity',
        type: 'number',
        value: book.value.quantity || 1,
        min: 1,
        max: 99,
        placeholder: '1'
      }
    ],
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      {
        text: 'OK',
        handler: async (data) => {
          if (!book.value || !book.value.id) return;
          
          const newQuantity = parseInt(data.quantity) || 1;
          
          if (newQuantity < 1) {
            const toast = await toastController.create({
              message: 'Anzahl muss mindestens 1 sein',
              duration: 2000,
              color: 'warning'
            });
            await toast.present();
            return;
          }
          
          try {
            await db.updateBook(book.value.id, { quantity: newQuantity });
            book.value.quantity = newQuantity;
            
            const toast = await toastController.create({
              message: 'Anzahl aktualisiert',
              duration: 1500,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            console.error('Error updating quantity:', error);
          }
        }
      }
    ]
  });
  await alert.present();
};

const showMenu = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Optionen',
    buttons: [
      {
        text: 'Buch löschen',
        role: 'destructive',
        icon: trashOutline,
        handler: () => confirmDelete()
      },
      {
        text: 'Abbrechen',
        role: 'cancel'
      }
    ]
  });
  await actionSheet.present();
};

const confirmDelete = async () => {
  if (!book.value || !book.value.id) return;
  
  const alert = await alertController.create({
    header: 'Buch löschen?',
    message: `Möchtest du "${book.value.title}" wirklich löschen?`,
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          if (!book.value || !book.value.id) return;
          
          try {
            await db.deleteBook(book.value.id);
            router.push('/library');
          } catch (error) {
            console.error('Error deleting book:', error);
          }
        }
      }
    ]
  });
  await alert.present();
};

const editCoverPhoto = async () => {
  if (!book.value || !book.value.coverImage) return;

  if (isRemoteImageUrl(book.value.coverImage)) {
    const converted = await ensureLocalCoverDownloaded(book.value);
    if (!converted) {
      const toast = await toastController.create({
        message: 'Cover konnte nicht lokal gespeichert werden. Bitte versuche es später erneut.',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }
  }

  router.push({
    path: '/editor-cover',
    query: {
      imageSrc: getImageSrc(book.value.coverImage),
      bookId: book.value.id!.toString(),
      coverPath: book.value.coverImage
    }
  });
};

const takeCoverPhoto = async () => {
  if (!book.value || !book.value.id) return;

  const isNative = Capacitor.getPlatform() !== 'web';
  
  if (!isNative) {
    const toast = await toastController.create({
      message: 'Foto-Funktion nur auf mobilen Geräten verfügbar',
      duration: 2000,
      color: 'warning'
    });
    await toast.present();
    return;
  }

  try {
    const image = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera
    });

    if (!image.webPath) {
      throw new Error('Kein Bild aufgenommen');
    }

    // Lies Bilddaten
    const response = await fetch(image.webPath);
    const blob = await response.blob();
    const base64Data = await convertBlobToBase64(blob);

    // Speichere in Filesystem
    const fileName = `book_cover_${book.value.id}_${Date.now()}.jpg`;
    const savedFile = await Filesystem.writeFile({
      path: `books/${fileName}`,
      data: base64Data,
      directory: Directory.Data,
      recursive: true
    });

    // Update Buch mit neuem Cover-Pfad
    const coverPath = savedFile.uri;
    await db.updateBook(book.value.id, { coverImage: coverPath });
    
    // Frage ob Bild bearbeitet werden soll
    const alert = await alertController.create({
      header: 'Foto aufgenommen',
      message: 'Möchtest du das Bild vor dem Speichern bearbeiten?',
      buttons: [
        {
          text: 'Nein',
          handler: async () => {
            // Lade Buch neu um aktualisiertes Cover zu zeigen
            await loadBook();
            
            const toast = await toastController.create({
              message: 'Cover-Foto gespeichert',
              duration: 2000,
              color: 'success'
            });
            await toast.present();
          }
        },
        {
          text: 'Bearbeiten',
          handler: () => {
            router.push({
              path: '/editor-cover',
              query: {
                imageSrc: Capacitor.convertFileSrc(coverPath),
                bookId: book.value!.id!.toString(),
                coverPath: coverPath
              }
            });
          }
        }
      ]
    });
    await alert.present();
  } catch (error) {
    console.error('Error taking cover photo:', error);
    if (error instanceof Error && error.message !== 'User cancelled photos app') {
      const toast = await toastController.create({
        message: 'Fehler beim Fotografieren: ' + error.message,
        duration: 3000,
        color: 'danger'
      });
      await toast.present();
    }
  }
};

const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
};
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.book-detail {
  padding-bottom: 1.25rem;
}

.cover-section {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.25rem 1rem;
  background: var(--ion-color-light);
  gap: 0.5rem;
}

.cover-image-wrapper {
  position: relative;
  display: inline-block;
}

.cover-image {
  max-width: 250px;
  max-height: 350px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.edit-cover-button {
  position: absolute;
  bottom: 10px;
  right: 10px;
  --padding-start: 10px;
  --padding-end: 10px;
  --padding-top: 10px;
  --padding-bottom: 10px;
  width: 40px;
  height: 40px;
  --border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.placeholder-cover-large {
  width: 140px;
  height: 190px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-medium);
  border-radius: 8px;
  color: white;
  position: relative;
  cursor: pointer;
  transition: all 0.3s ease;
}

.placeholder-cover-large:hover {
  background: var(--ion-color-medium-shade);
  transform: scale(1.02);
}

.placeholder-cover-large ion-icon:first-child {
  font-size: 60px;
}

.camera-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0 0 8px 8px;
}

.camera-overlay ion-icon {
  font-size: 24px;
}

.camera-overlay span {
  font-size: 0.75rem;
  text-align: center;
}

.info-section h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.1rem;
  color: var(--ion-color-medium);
  margin-bottom: 0.5rem;
}

.subtitle span {
  display: block;
}

.authors {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

.meta-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ion-color-medium);
  font-size: 0.95rem;
}

.meta-item ion-icon {
  font-size: 1.2rem;
}

.status-badges {
  display: flex;
  gap: 0.5rem;
  margin: 1.5rem 0;
}

.description-section,
.categories-section,
.isbn-section {
  margin-top: 1.5rem;
}

.description-section h3,
.categories-section h3,
.isbn-section h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.description-section p {
  line-height: 1.6;
  color: var(--ion-color-dark);
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.isbn-section p {
  font-family: monospace;
  font-size: 1rem;
  color: var(--ion-color-medium);
}
</style>
