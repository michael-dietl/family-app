// Google Books API Service

import { downloadRemoteCoverImage, normalizeRemoteCoverUrl } from '@/services/imageStorage';

export interface GoogleBookInfo {
  isbn: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  language?: string;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
  localCoverUri?: string;
}

export interface BookLookupError {
  type: 'network' | 'not_found' | 'quota' | 'api_error' | 'unknown';
  message: string;
  details?: string;
  needsApiKey?: boolean;
}

let GOOGLE_BOOKS_API_KEY: string | null = null;

// Cache für ISBN-Lookups (verhindert doppelte Anfragen)
const isbnCache = new Map<string, { data: GoogleBookInfo; timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 60; // 1 Stunde

export function setGoogleBooksApiKey(apiKey: string | null) {
  GOOGLE_BOOKS_API_KEY = apiKey;
  if (apiKey) {
    console.log('✅ Google Books API Key gesetzt');
  } else {
    console.log('ℹ️ Google Books API Key entfernt (verwende freie Quota)');
  }
}

export function getGoogleBooksApiKey(): string | null {
  return GOOGLE_BOOKS_API_KEY;
}

// Hilfsfunktion für exponential backoff retry
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function lookupBookByISBN(isbn: string, retryCount = 0): Promise<{ data?: GoogleBookInfo; error?: BookLookupError }> {
  // Prüfe Cache
  const cached = isbnCache.get(isbn);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('📖 Book found in cache:', cached.data.title);
    return { data: cached.data };
  }

  try {
    // Google Books API endpoint mit optionalem API Key
    let apiUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&projection=full`;
    
    if (GOOGLE_BOOKS_API_KEY) {
      apiUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
      console.log('📚 Looking up book with ISBN (mit API Key):', isbn);
      console.log('🔑 API Key verwendet:', GOOGLE_BOOKS_API_KEY.substring(0, 10) + '...');
    } else {
      console.log('📚 Looking up book with ISBN (ohne API Key):', isbn);
    }
    
    console.log('🌐 Request URL:', apiUrl.replace(GOOGLE_BOOKS_API_KEY || '', 'KEY_HIDDEN'));
    
    const response = await fetch(apiUrl);
    
    console.log('📊 Response Status:', response.status, response.statusText);
    
    // Detaillierte Fehlerbehandlung basierend auf HTTP Status
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response Error Body:', errorText);
      
      let error: BookLookupError;
      
      switch (response.status) {
        case 400:
          // Ungültige Anfrage - möglicherweise ungültiger API Key
          error = {
            type: 'api_error',
            message: 'Ungültige Anfrage',
            details: `Die Anfrage war fehlerhaft. ${errorText.includes('API key') ? 'Der API Key könnte ungültig sein.' : ''}\n\nDetails: ${errorText}`
          };
          break;
        case 403:
          // Bei 403 mit Retry versuchen (könnte temporär sein)
          if (retryCount < 2) {
            console.warn(`⚠️ 403 Fehler - Retry ${retryCount + 1}/2 nach 2 Sekunden...`);
            await sleep(2000 * (retryCount + 1));
            return lookupBookByISBN(isbn, retryCount + 1);
          }
          error = {
            type: 'quota',
            message: 'API Zugriff eingeschränkt',
            details: GOOGLE_BOOKS_API_KEY 
              ? `Die API-Key Quota wurde überschritten oder der Key ist ungültig.\n\nAPI Antwort: ${errorText}`
              : 'Die tägliche Anfragegrenze der kostenlosen Google Books API wurde erreicht. Ein API-Key würde mehr Anfragen ermöglichen.',
            needsApiKey: !GOOGLE_BOOKS_API_KEY
          };
          break;
        case 429:
          // Exponential Backoff bei Rate Limiting
          if (retryCount < 3) {
            const waitTime = 1000 * Math.pow(2, retryCount); // 1s, 2s, 4s
            console.warn(`⏳ Rate Limit erreicht - Retry ${retryCount + 1}/3 nach ${waitTime}ms...`);
            await sleep(waitTime);
            return lookupBookByISBN(isbn, retryCount + 1);
          }
          error = {
            type: 'quota',
            message: 'Zu viele Anfragen',
            details: 'Die Google Books API hat zu viele Anfragen in kurzer Zeit erkannt. Bitte warten Sie einen Moment.',
            needsApiKey: !GOOGLE_BOOKS_API_KEY
          };
          break;
        case 404:
          error = {
            type: 'not_found',
            message: 'API Endpunkt nicht gefunden',
            details: 'Der Google Books API Dienst ist möglicherweise nicht erreichbar.'
          };
          break;
        default:
          error = {
            type: 'api_error',
            message: `API Fehler (${response.status})`,
            details: errorText || 'Unbekannter API Fehler'
          };
      }
      
      console.error('❌ API Error:', error);
      return { error };
    }
    
    const data = await response.json();
    
    // Logge die komplette Google Books API-Response für Debug-Zwecke
    console.log('📚 Google Books API JSON Response:', JSON.stringify(data, null, 2));

    // Prüfe ob Ergebnisse vorhanden sind
    if (!data.items || data.items.length === 0) {
      console.warn('⚠️ No book found for ISBN:', isbn);
      console.warn('🔎 Vollständige Google Books API-Response (bei Fehler):', JSON.stringify(data, null, 2));
      return {
        error: {
          type: 'not_found',
          message: 'Buch nicht gefunden',
          details: `Kein Buch mit ISBN ${isbn} in der Google Books Datenbank gefunden.\n\nAPI-Response: ${JSON.stringify(data)}`
        }
      };
    }
    
    const volumeInfo = data.items[0].volumeInfo;
    const coverCandidate = (
      volumeInfo.imageLinks?.thumbnail
      || volumeInfo.imageLinks?.smallThumbnail
      || volumeInfo.imageLinks?.small
      || volumeInfo.imageLinks?.medium
      || volumeInfo.imageLinks?.large
      || volumeInfo.imageLinks?.extraLarge
    );

    console.warn('Cover candidate:', coverCandidate);
    const normalizedCoverUrl = normalizeRemoteCoverUrl(coverCandidate);
    console.warn('Normalized Cover URL:', normalizedCoverUrl);
    let localCoverUri: string | undefined;

    if (normalizedCoverUrl) {
      const cachedCover = await downloadRemoteCoverImage(normalizedCoverUrl, isbn);
      if (cachedCover) {
        localCoverUri = cachedCover;
        console.log('📥 Cover cached for ISBN', isbn, '->', localCoverUri);
      } else {
        console.warn('⚠️ Cover could not be cached for ISBN', isbn);
      }
    }
    else {
      console.log('ℹ️ No normalized cover URL for ISBN', isbn, 'candidate:', coverCandidate);
    }
    
    const bookInfo: GoogleBookInfo = {
      isbn,
      title: volumeInfo.title || 'Unbekannter Titel',
      subtitle: volumeInfo.subtitle,
      authors: volumeInfo.authors,
      publisher: volumeInfo.publisher,
      publishedDate: volumeInfo.publishedDate,
      description: volumeInfo.description,
      pageCount: volumeInfo.pageCount,
      categories: volumeInfo.categories,
      language: volumeInfo.language,
      imageLinks: normalizedCoverUrl
        ? { ...volumeInfo.imageLinks, thumbnail: normalizedCoverUrl }
        : volumeInfo.imageLinks,
      localCoverUri
    };
    
    // Speichere im Cache
    isbnCache.set(isbn, { data: bookInfo, timestamp: Date.now() });
    
    console.log('✅ Book found:', bookInfo.title);
    return { data: bookInfo };
    
  } catch (error) {
    console.error('❌ Unexpected error looking up book:', error);
    
    // Unterscheide zwischen Netzwerkfehlern und anderen Fehlern
    const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
    
    return {
      error: {
        type: isNetworkError ? 'network' : 'unknown',
        message: isNetworkError ? 'Netzwerkfehler' : 'Unerwarteter Fehler',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export function formatAuthors(authors?: string[]): string {
  if (!authors || authors.length === 0) return '';
  return authors.join(', ');
}

export function formatCategories(categories?: string[]): string {
  if (!categories || categories.length === 0) return '';
  return categories.join(', ');
}

const extractIsbnFromVolume = (volumeInfo: any): string | undefined => {
  if (!volumeInfo?.industryIdentifiers) return undefined;
  const identifier = volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_13')
    || volumeInfo.industryIdentifiers[0];
  return identifier?.identifier;
};

const buildGoogleBookInfo = (volumeInfo: any, isbn: string): GoogleBookInfo => {
  const coverCandidate = (
    volumeInfo.imageLinks?.thumbnail
    || volumeInfo.imageLinks?.smallThumbnail
    || volumeInfo.imageLinks?.small
    || volumeInfo.imageLinks?.medium
    || volumeInfo.imageLinks?.large
    || volumeInfo.imageLinks?.extraLarge
  );

  const normalizedCoverUrl = normalizeRemoteCoverUrl(coverCandidate);

  return {
    isbn,
    title: volumeInfo.title || 'Unbekannter Titel',
    subtitle: volumeInfo.subtitle,
    authors: volumeInfo.authors,
    publisher: volumeInfo.publisher,
    publishedDate: volumeInfo.publishedDate,
    description: volumeInfo.description,
    pageCount: volumeInfo.pageCount,
    categories: volumeInfo.categories,
    language: volumeInfo.language,
    imageLinks: normalizedCoverUrl
      ? { ...volumeInfo.imageLinks, thumbnail: normalizedCoverUrl }
      : volumeInfo.imageLinks,
    localCoverUri: undefined
  };
};

export async function searchBooksByTitle(title: string, maxResults = 6): Promise<GoogleBookInfo[]> {
  const query = title.trim();
  if (!query) return [];

  const encodedQuery = encodeURIComponent(`intitle:${query}`);
  const limitedResults = Math.min(Math.max(maxResults, 1), 12);
  let apiUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodedQuery}&maxResults=${limitedResults}&projection=full`;

  if (GOOGLE_BOOKS_API_KEY) {
    apiUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
  }

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Books Suche fehlgeschlagen (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.items)) return [];

  const results: GoogleBookInfo[] = data.items
    .map((item: any) => {
      const volumeInfo = item.volumeInfo;
      const isbn = extractIsbnFromVolume(volumeInfo) || item.id;
      if (!isbn) return null;
      return buildGoogleBookInfo(volumeInfo, isbn);
    })
    .filter(Boolean) as GoogleBookInfo[];

  return results;
}
