// src/services/CoverService.ts

import { Filesystem, Directory } from "@capacitor/filesystem";

export class CoverService {
  // -------- PUBLIC API --------

  async getCover(isbn: string): Promise<string | null> {
    // 1) Versuche local gespeichertes Cover
    //const localUrl = await this.getLocalCoverUrl(isbn);
    //if (localUrl) return localUrl;

    // 2) Versuche Google Books
    const google = await this.fetchGoogleCover(isbn);
    if (google) {
      const blob = await this.fetchBlob(google);
      return await this.saveAndReturnUrl(isbn, blob);
    }

    // 3) Fallback: OpenLibrary
    const ol = this.getOpenLibraryUrl(isbn);
    const blob = await this.fetchBlob(ol);
    return await this.saveAndReturnUrl(isbn, blob);
  }

  // -------- GOOGLE BOOKS --------

  private async fetchGoogleCover(isbn: string): Promise<string | null> {
    const rootUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;

    const res = await fetch(rootUrl);
    console.log('Google Books API response', { rootUrl, status: res.status });
    if (!res.ok) return null;

    const json = await res.json();
    if (!json.items?.length) return null;

    const links = json.items[0].volumeInfo?.imageLinks;
    if (!links) return null;

   const url =
      links.extraLarge ||
      links.large ||
      links.medium ||
      links.small ||
      links.thumbnail ||
      null;

    return url ? this.enforceHttps(url) : null;

  }


  private enforceHttps(url: string): string {
    if (url.startsWith("http://")) {
      return "https://" + url.substring(7);
    }
    return url;
  }


  // -------- OPENLIBRARY --------

  private getOpenLibraryUrl(isbn: string): string {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  }

  // -------- FETCH & SAVE --------

  private async fetchBlob(url: string): Promise<Blob> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Cover not found");
    return await res.blob();
  }

  private async saveAndReturnUrl(isbn: string, blob: Blob): Promise<string> {
    await this.saveCoverToDisk(isbn, blob);
    return URL.createObjectURL(blob);
  }

  // -------- LOCAL STORAGE --------

  private async saveCoverToDisk(isbn: string, blob: Blob, directory: Directory = Directory.External) {
    const buffer = await blob.arrayBuffer();
    const base64 = this.bufferToBase64(buffer);

    await Filesystem.writeFile({
      path: `books/${isbn}.jpg`,
      data: base64,
      directory,
      recursive: true
    });
  }

  private async getLocalCoverUrl(isbn: string, directory: Directory = Directory.External): Promise<string | null> {
    try {
      const ret = await Filesystem.readFile({
        path: `books/${isbn}.jpg`,
        directory
      });

      const base64Data =
        typeof ret.data === 'string' ? ret.data : await this.blobToBase64(ret.data);
      const blob = this.base64ToBlob(base64Data, "image/jpeg");
      return URL.createObjectURL(blob);
    } catch (_) {
      return null;
    }
  }

  // -------- HELPERS --------

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  private base64ToBlob(base64Data: string, type: string): Blob {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length)
      .fill(0)
      .map((_, i) => byteCharacters.charCodeAt(i));

    return new Blob([new Uint8Array(byteNumbers)], { type });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
  }

   async fetchAndSaveCover(isbn: string, rawUrl: string, directory: Directory = Directory.Data) {
    const url = this.enforceHttps(rawUrl);

    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);

    const ct = res.headers.get('Content-Type') || '';
    if (!ct.startsWith('image/')) {
      const text = await res.text();
      console.warn('Unerwartete Antwort:', ct, text.slice(0, 200));
      throw new Error('Antwort ist kein Bild');
    }

    const blob = await res.blob();
    console.log('Blob empfangen:', ct, 'Größe:', blob.size);

    if (blob.size < 200) {
      // 43 Bytes etc. -> mit Inhalt loggen:
      const text = await blob.text().catch(() => "");
      console.warn('Blob sehr klein, Inhalt:', text.slice(0, 200));
      throw new Error('Cover-Blob zu klein – vermutlich Fehlerseite');
    }

    await this.saveCoverToDisk(isbn, blob, directory);
    console.log('Cover gespeichert:', `covers/${isbn}.jpg`);

    return await this.getLocalCoverUrl(isbn, directory);
  }  
}