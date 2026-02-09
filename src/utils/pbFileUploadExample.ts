// Beispiel: File-Upload zu PocketBase aus einer Vue Composable
// Annahme: pb ist eine authentifizierte PocketBase-Instanz
// und fileData ist ein Blob, File oder base64-String

import { pocketbase } from '@/services/pocketbase';
import { Preferences } from '@capacitor/preferences';

/**
 * Lädt ein Bild als File-Field in eine PocketBase-Collection hoch
 * @param {string} collectionName - z.B. 'photos' oder 'books'
 * @param {string} recordId - ID des Datensatzes
 * @param {File|Blob|string} fileData - Das Bild (File, Blob oder base64)
 * @param {string} fieldName - Name des File-Feldes in PB (z.B. 'image' oder 'cover')
 * @returns {Promise<any>} - Das aktualisierte Record-Objekt
 */
export async function uploadFileToPocketBase(
  collectionName: string,
  recordId: string,
  fileData: File | Blob | string,
  fieldName: string = 'image'
): Promise<any> {
  // Automatische Authentifizierung, falls nötig
  await pocketbase.initialize();
  let pb = pocketbase.getInstance();
  if (!pb || !pocketbase.isAuthenticated()) {
    const [{ value: url }, { value: email }, { value: password }] = await Promise.all([
      Preferences.get({ key: 'pocketbase_url' }),
      Preferences.get({ key: 'pocketbase_email' }),
      Preferences.get({ key: 'pocketbase_password' })
    ]);
    if (url && email && password) {
      pb = pocketbase.getInstance();
      if (pb) {
        try {
          await pb.collection('users').authWithPassword(email, password);
          await pocketbase.initialize(); // Token übernehmen
        } catch (e) {
          throw new Error('Automatische Authentifizierung fehlgeschlagen!');
        }
      }
    }
  }
  pb = pocketbase.getInstance();
  if (!pb || !pocketbase.isAuthenticated()) throw new Error('Nicht authentifiziert!');

  // File-Objekt vorbereiten
  let file;
  if (typeof fileData === 'string') {
    // base64-String → Blob
    const byteString = atob(fileData.split(',')[1] || fileData);
    const mimeString = fileData.split(',')[0]?.split(':')[1]?.split(';')[0] || 'image/jpeg';
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    file = new Blob([ab], { type: mimeString });
  } else {
    file = fileData;
  }

  const formData = new FormData();
  formData.append(fieldName, file);

  // PATCH: nur das File-Feld aktualisieren
  const updated = await pb.collection(collectionName).update(recordId, formData);
  return updated;
}

// --- Beispiel-Aufruf ---
// await uploadFileToPocketBase('photos', 'RECORD_ID', fileObj, 'image');
// await uploadFileToPocketBase('books', 'RECORD_ID', base64String, 'cover');
