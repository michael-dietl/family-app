<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>Bibliothek</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="scanBarcode">
            <ion-icon :icon="barcodeOutline" />
          </ion-button>
          <ion-button @click="showMenu">
            <ion-icon :icon="ellipsisVertical" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Bibliothek</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Search Bar -->
      <ion-searchbar 
        v-model="searchQuery" 
        placeholder="Bücher durchsuchen..."
        :debounce="300"
        @ionInput="handleSearch"
      />

      <!-- Category Filter -->
      <div v-if="categories.length > 0" class="category-filter ion-padding-horizontal">
        <ion-segment :value="selectedCategoryId?.toString() || 'all'" @ionChange="handleCategoryChange">
          <ion-segment-button value="all">
            <ion-label>Alle</ion-label>
          </ion-segment-button>
          <ion-segment-button v-for="cat in categories" :key="cat.id" :value="cat.id?.toString()">
            <ion-label>{{ cat.name }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredBooks.length === 0" class="empty-state">
        <ion-icon :icon="bookOutline" size="large" />
        <h2>Keine Bücher vorhanden</h2>
        <p>Scanne einen ISBN-Barcode um ein Buch hinzuzufügen</p>
        <ion-button @click="scanBarcode" expand="block" class="ion-margin-top">
          <ion-icon :icon="barcodeOutline" slot="start" />
          Barcode scannen
        </ion-button>
      </div>

      <!-- Books List -->
      <ion-list v-else>
        <ion-item-sliding v-for="book in filteredBooks" :key="book.id">
          <ion-item 
            button
            @click="openBookDetail(book)"
            lines="full"
          >
            <ion-thumbnail slot="start">
            <img 
              v-if="book.coverImage" 
              :src="getImageSrc(book.coverImage)" 
              :alt="book.title"
              @error="handleImageError($event, book)"
            />
            <div v-else class="placeholder-cover">
              <ion-icon :icon="bookOutline" />
            </div>
          </ion-thumbnail>
          
          <ion-label>
            <h2>{{ book.title }}</h2>
            <p v-if="book.authors">{{ book.authors }}</p>
            <p v-if="book.publishedDate" class="book-meta">
              {{ book.publisher }} • {{ book.publishedDate }}
            </p>
            <div class="book-badges">
              <ion-badge v-if="book.quantity && book.quantity > 1" color="primary">
                {{ book.quantity }}x
              </ion-badge>
              <ion-badge v-if="book.read" color="success">Gelesen</ion-badge>
              <ion-badge v-if="book.rating">
                <ion-icon :icon="star" /> {{ book.rating }}/5
              </ion-badge>
            </div>
          </ion-label>

          <ion-icon :icon="chevronForward" slot="end" />
        </ion-item>
        
        <ion-item-options side="end">
          <ion-item-option color="danger" @click="confirmDeleteBook(book)">
            <ion-icon :icon="trashOutline" slot="icon-only" />
          </ion-item-option>
        </ion-item-options>
      </ion-item-sliding>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { onIonViewWillEnter } from '@ionic/vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonThumbnail,
  IonBadge,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  toastController,
  actionSheetController,
  alertController,
  loadingController
} from '@ionic/vue';
import {
  barcodeOutline,
  ellipsisVertical,
  bookOutline,
  chevronForward,
  star,
  add,
  folderOutline,
  keyOutline,
  trashOutline
} from 'ionicons/icons';
import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { db, type Book, type BookCategory } from '@/services/database';
import { lookupBookByISBN, formatAuthors, formatCategories, setGoogleBooksApiKey, getGoogleBooksApiKey } from '@/services/books';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';

const router = useRouter();

const books = ref<Book[]>([]);
const categories = ref<BookCategory[]>([]);
const isLoading = ref(false);
const isLookingUp = ref(false);
const selectedCategoryId = ref<number | null>(null);
const searchQuery = ref('');
const { autoSyncIfEnabled } = usePocketbaseSync();

const filteredBooks = computed(() => {
  let result = books.value;
  
  console.log('🔍 Filter - selectedCategoryId:', selectedCategoryId.value);
  console.log('📚 Alle Bücher:', JSON.stringify(result.map(b => ({ title: b.title, categoryId: b.categoryId }))));
  
  // Filter by category
  if (selectedCategoryId.value) {
    result = result.filter(b => b.categoryId === selectedCategoryId.value);
    console.log('🎯 Gefilterte Bücher:', JSON.stringify(result.map(b => ({ title: b.title, categoryId: b.categoryId }))));
  }
  
  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(b => 
      b.title.toLowerCase().includes(query) ||
      b.authors?.toLowerCase().includes(query) ||
      b.isbn.includes(query)
    );
  }
  
  return result;
});

const getImageSrc = (coverImage: string): string => {
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

const takeCoverPhotoForBook = async (bookId: number) => {
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
    const fileName = `book_cover_${bookId}_${Date.now()}.jpg`;
    const savedFile = await Filesystem.writeFile({
      path: `books/${fileName}`,
      data: base64Data,
      directory: Directory.Data,
      recursive: true
    });

    // Update Buch mit neuem Cover-Pfad
    const coverPath = savedFile.uri;
    await db.updateBook(bookId, { coverImage: coverPath });
    await loadBooks();

    const toast = await toastController.create({
      message: 'Cover-Foto gespeichert',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
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

const confirmDeleteBook = async (book: Book) => {
  const alert = await alertController.create({
    header: 'Buch löschen?',
    message: `Möchtest du "${book.title}" wirklich aus deiner Bibliothek löschen?`,
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          try {
            await db.deleteBook(book.id!);
            await loadBooks();
            
            const toast = await toastController.create({
              message: 'Buch gelöscht',
              duration: 2000,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            console.error('Error deleting book:', error);
            const toast = await toastController.create({
              message: 'Fehler beim Löschen',
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
  // Setze API Key beim App-Start
  setGoogleBooksApiKey('AIzaSyDOZB6WI3oXu89DvsEl7TnEFFrWMLrOd_c');
  
  await loadBooks();
  await loadCategories();
  await autoSyncIfEnabled();
});

// Lade Bücher neu wenn Seite angezeigt wird (z.B. nach Rückkehr von Detail-Seite)
onIonViewWillEnter(async () => {
  await loadBooks();
});

const loadBooks = async () => {
  isLoading.value = true;
  try {
    books.value = await db.getBooks();
  } catch (error) {
    console.error('Error loading books:', error);
  } finally {
    isLoading.value = false;
  }
};

const loadCategories = async () => {
  try {
    categories.value = await db.getBookCategories();
  } catch (error) {
    console.error('Error loading categories:', error);
  }
};

const handleCategoryChange = (event: CustomEvent) => {
  const value = event.detail.value;
  selectedCategoryId.value = value === 'all' ? null : parseInt(value);
};

const handleSearch = (event: CustomEvent) => {
  searchQuery.value = event.detail.value || '';
};

const scanBarcode = async () => {
  const isNative = Capacitor.getPlatform() !== 'web';
  
  if (!isNative) {
    // Web fallback: Manual ISBN input
    const alert = await alertController.create({
      header: 'ISBN eingeben',
      message: 'Barcode-Scanning wird nur auf nativen Plattformen unterstützt',
      inputs: [
        {
          name: 'isbn',
          type: 'text',
          placeholder: '978-3-16-148410-0'
        }
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Suchen',
          handler: async (data) => {
            if (data.isbn) {
              await lookupAndSaveBook(data.isbn.replace(/-/g, ''));
            }
          }
        }
      ]
    });
    await alert.present();
    return;
  }

  try {
    // Request camera permission
    const { camera } = await BarcodeScanner.requestPermissions();
    
    if (camera !== 'granted') {
      const toast = await toastController.create({
        message: 'Kamera-Berechtigung verweigert',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
      return;
    }

    // Prüfe ob Google Barcode Scanner Module verfügbar ist
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    
    if (!available) {
      // Module muss erst installiert werden
      const installAlert = await alertController.create({
        header: 'Scanner-Modul benötigt',
        message: 'Das Google Barcode Scanner Modul muss installiert werden. Dies ist ein einmaliger Download (ca. 10 MB).',
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          {
            text: 'Installieren',
            handler: async () => {
              const loading = await loadingController.create({
                message: 'Lade Scanner-Modul...'
              });
              await loading.present();
              
              await BarcodeScanner.installGoogleBarcodeScannerModule();
              await loading.dismiss();
              
              // Nach Installation nochmal scannen
              await scanBarcode();
            }
          }
        ]
      });
      await installAlert.present();
      return;
    }

    // Verwende native Google Barcode Scanner UI
    const { barcodes } = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
      ]
    });

    console.log('Scanned barcodes:', barcodes);

    if (barcodes && barcodes.length > 0) {
      const barcode = barcodes[0];
      const isbn = barcode.rawValue;
      
      console.log('Barcode format:', barcode.format, 'Value:', isbn, 'Length:', isbn?.length);
      
      if (isbn && isbn.length >= 8 && isbn.length <= 13) {
        const cleanIsbn = isbn.replace(/[-\s]/g, '');
        await lookupAndSaveBook(cleanIsbn);
      } else {
        const toast = await toastController.create({
          message: `Ungültiger ISBN Barcode (${isbn?.length} Zeichen)`,
          duration: 2000,
          color: 'warning'
        });
        await toast.present();
      }
    }

  } catch (error) {
    console.error('Error scanning barcode:', error);
    const toast = await toastController.create({
      message: 'Fehler beim Scannen: ' + (error instanceof Error ? error.message : String(error)),
      duration: 3000,
      color: 'danger'
    });
    await toast.present();
  }
};

const stopScanning = async () => {
  try {
    document.querySelector('body')?.classList.remove('barcode-scanner-active');
    await BarcodeScanner.removeAllListeners();
    await BarcodeScanner.stopScan();
  } catch (error) {
    console.error('Error stopping scanner:', error);
  }
};

const lookupAndSaveBook = async (isbn: string) => {
  isLookingUp.value = true;

  try {
    // Prüfe ob Buch bereits existiert
    const existingBook = await db.getBookByISBN(isbn);
    
    if (existingBook) {
      // Dublettenprüfung
      const alert = await alertController.create({
        header: 'Buch bereits vorhanden',
        message: `"${existingBook.title}" ist bereits in deiner Bibliothek. Möchtest du die Anzahl erhöhen?`,
        buttons: [
          {
            text: 'Abbrechen',
            role: 'cancel'
          },
          {
            text: 'Anzahl erhöhen',
            handler: () => {
              // Alert-Handler muss synchron true zurückgeben
              const newQuantity = (existingBook.quantity || 1) + 1;
              const updates: Partial<Book> = { quantity: newQuantity };
              
              // Wenn Kategorie ausgewählt ist, auch categoryId aktualisieren
              if (selectedCategoryId.value) {
                updates.categoryId = selectedCategoryId.value;
              }
              
              console.log('🔄 Update Duplikat mit:', updates);
              
              // Async Operationen nach Alert-Dismiss
              setTimeout(async () => {
                try {
                  await db.updateBook(existingBook.id!, updates);
                  await loadBooks();
                  
                  const toast = await toastController.create({
                    message: `Anzahl auf ${newQuantity} erhöht`,
                    duration: 2000,
                    color: 'success',
                    position: 'bottom'
                  });
                  await toast.present();
                } catch (error) {
                  console.error('Error updating quantity:', error);
                  const toast = await toastController.create({
                    message: 'Fehler beim Aktualisieren der Anzahl',
                    duration: 2000,
                    color: 'danger'
                  });
                  await toast.present();
                }
              }, 0);
              
              return true;
            }
          }
        ]
      });
      await alert.present();
      return;
    }

    const result = await lookupBookByISBN(isbn);
    
    // Detaillierte Fehlerbehandlung
    if (result.error) {
      const error = result.error;
      let message = error.message;
      let buttons: any[] = ['OK'];
      
      // Zeige erweiterte Fehlerdetails und biete Lösungen an
      if (error.needsApiKey && error.type === 'quota') {
        message = `${error.message}\n\n${error.details}\n\nEin API-Key erhöht die Anzahl kostenloser Anfragen deutlich.`;
        buttons = [
          {
            text: 'API-Key eingeben',
            handler: async () => {
              await promptForApiKey();
            }
          },
          {
            text: 'Später',
            role: 'cancel'
          }
        ];
      } else if (error.type === 'network') {
        message = `${error.message}\n\n${error.details}\n\nBitte überprüfe deine Internetverbindung.`;
      } else if (error.type === 'not_found') {
        message = `${error.message}\n\n${error.details}`;
        buttons = [
          {
            text: 'Manuell eingeben',
            handler: () => {
              // TODO: Implementiere manuelle Bucheingabe
            }
          },
          {
            text: 'OK',
            role: 'cancel'
          }
        ];
      } else {
        message = `${error.message}\n\n${error.details || ''}`;
      }
      
      const alert = await alertController.create({
        header: '📚 API Fehler',
        message,
        buttons
      });
      await alert.present();
      return;
    }
    
    const bookInfo = result.data;
    
    if (!bookInfo) {
      const toast = await toastController.create({
        message: 'Buch nicht gefunden',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    // Save to database
    const bookData: Omit<Book, 'id' | 'created'> = {
      isbn: bookInfo.isbn,
      title: bookInfo.title,
      authors: formatAuthors(bookInfo.authors),
      publisher: bookInfo.publisher,
      publishedDate: bookInfo.publishedDate,
      description: bookInfo.description,
      pageCount: bookInfo.pageCount,
      categories: formatCategories(bookInfo.categories),
      language: bookInfo.language,
      coverImage: bookInfo.imageLinks?.thumbnail || bookInfo.imageLinks?.smallThumbnail,
      categoryId: selectedCategoryId.value || undefined,
      read: false,
      quantity: 1
    };

    console.log('📚 Speichere Buch mit categoryId:', selectedCategoryId.value, 'bookData:', bookData);

    const bookId = await db.createBook(bookData);

    const toast = await toastController.create({
      message: `"${bookInfo.title}" hinzugefügt`,
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    await loadBooks();

    // Frage nach Cover-Foto wenn keins vorhanden
    if (!bookData.coverImage) {
      const alert = await alertController.create({
        header: 'Kein Cover gefunden',
        message: `Für "${bookInfo.title}" wurde kein Cover-Bild gefunden. Möchtest du jetzt ein Foto vom Buchcover machen?`,
        buttons: [
          {
            text: 'Später',
            role: 'cancel'
          },
          {
            text: 'Foto machen',
            handler: async () => {
              // Kurz warten damit Alert sich schließen kann
              setTimeout(async () => {
                await takeCoverPhotoForBook(bookId);
              }, 300);
            }
          }
        ]
      });
      await alert.present();
    }

  } finally {
    isLookingUp.value = false;
  }
};

const showMenu = async () => {
  const hasApiKey = getGoogleBooksApiKey() !== null;
  
  const actionSheet = await actionSheetController.create({
    header: 'Optionen',
    buttons: [
      {
        text: 'Kategorie erstellen',
        icon: add,
        handler: () => createCategory()
      },
      {
        text: 'Kategorien verwalten',
        icon: folderOutline,
        handler: () => {
          router.push('/library/categories');
        }
      },
      {
        text: hasApiKey ? 'API-Key ändern' : 'API-Key einrichten',
        icon: keyOutline,
        handler: () => promptForApiKey()
      },
      {
        text: 'Abbrechen',
        role: 'cancel'
      }
    ]
  });
  await actionSheet.present();
};

const promptForApiKey = async () => {
  const currentKey = getGoogleBooksApiKey();
  
  const alert = await alertController.create({
    header: '🔑 Google Books API Key',
    message: 'Ein API-Key erhöht die Anzahl kostenloser Anfragen von 100 auf 1000 pro Tag.\n\nErhalte deinen Key auf: console.cloud.google.com',
    inputs: [
      {
        name: 'apiKey',
        type: 'text',
        placeholder: 'AIza...',
        value: currentKey || ''
      }
    ],
    buttons: [
      { text: 'Abbrechen', role: 'cancel' },
      ...(currentKey ? [{
        text: 'Entfernen',
        role: 'destructive' as const,
        handler: () => {
          setGoogleBooksApiKey(null);
          const toast = toastController.create({
            message: 'API-Key entfernt',
            duration: 2000,
            color: 'medium'
          });
          toast.then(t => t.present());
        }
      }] : []),
      {
        text: 'Speichern',
        handler: (data: any) => {
          if (data.apiKey && data.apiKey.trim()) {
            setGoogleBooksApiKey(data.apiKey.trim());
            const toast = toastController.create({
              message: 'API-Key gespeichert',
              duration: 2000,
              color: 'success'
            });
            toast.then(t => t.present());
          }
        }
      }
    ]
  });
  await alert.present();
};

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
      { text: 'Abbrechen', role: 'cancel' },
      {
        text: 'Erstellen',
        handler: async (data) => {
          if (data.name) {
            await db.createBookCategory({
              name: data.name,
              description: data.description || undefined
            });
            await loadCategories();
            const toast = await toastController.create({
              message: 'Kategorie erstellt',
              duration: 2000,
              color: 'success'
            });
            await toast.present();
          }
        }
      }
    ]
  });
  await alert.present();
};

const openBookDetail = (book: Book) => {
  router.push(`/library/book/${book.id}`);
};

const handleImageError = (event: Event, book: Book) => {
  console.warn('Failed to load cover image for:', book.title);
  // Verstecke broken image
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};
</script>

<style scoped>
.category-filter {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  overflow-x: auto;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.empty-state ion-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

.empty-state h2 {
  color: var(--ion-color-dark);
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

ion-thumbnail {
  --size: 80px;
  --border-radius: 8px;
}

.placeholder-cover {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
  color: var(--ion-color-medium);
}

.placeholder-cover ion-icon {
  font-size: 32px;
}

ion-item h2 {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

ion-item p {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  margin: 0.25rem 0;
}

.book-meta {
  font-size: 0.85rem !important;
}

.book-badges {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.book-badges ion-badge {
  font-size: 0.75rem;
}

.book-badges ion-icon {
  font-size: 0.75rem;
  margin-right: 0.25rem;
}

/* Barcode Scanner: Make WebView transparent when scanning */
:global(body.barcode-scanner-active) {
  background: transparent !important;
}

:global(body.barcode-scanner-active ion-app),
:global(body.barcode-scanner-active ion-content),
:global(body.barcode-scanner-active .ion-page),
:global(body.barcode-scanner-active ion-router-outlet) {
  background: transparent !important;
}

:global(body.barcode-scanner-active ion-tab-bar) {
  display: none !important;
}
</style>
