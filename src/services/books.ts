// Google Books API Service

export interface GoogleBookInfo {
  isbn: string;
  title: string;
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
}

export interface BookLookupError {
  type: 'network' | 'not_found' | 'quota' | 'api_error' | 'unknown';
  message: string;
  details?: string;
  needsApiKey?: boolean;
}

let GOOGLE_BOOKS_API_KEY: string | null = null;

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

export async function lookupBookByISBN(isbn: string): Promise<{ data?: GoogleBookInfo; error?: BookLookupError }> {
  try {
    // Google Books API endpoint mit optionalem API Key
    let apiUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    
    if (GOOGLE_BOOKS_API_KEY) {
      apiUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
      console.log('📚 Looking up book with ISBN (mit API Key):', isbn);
    } else {
      console.log('📚 Looking up book with ISBN (ohne API Key):', isbn);
    }
    
    const response = await fetch(apiUrl);
    
    // Detaillierte Fehlerbehandlung basierend auf HTTP Status
    if (!response.ok) {
      const errorText = await response.text();
      let error: BookLookupError;
      
      switch (response.status) {
        case 403:
          error = {
            type: 'quota',
            message: 'API Quota überschritten',
            details: 'Die tägliche Anfragegrenze der Google Books API wurde erreicht.',
            needsApiKey: !GOOGLE_BOOKS_API_KEY
          };
          break;
        case 429:
          error = {
            type: 'quota',
            message: 'Zu viele Anfragen',
            details: 'Bitte warten Sie einen Moment und versuchen Sie es erneut.',
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
    
    // Prüfe ob Ergebnisse vorhanden sind
    if (!data.items || data.items.length === 0) {
      console.warn('⚠️ No book found for ISBN:', isbn);
      return {
        error: {
          type: 'not_found',
          message: 'Buch nicht gefunden',
          details: `Kein Buch mit ISBN ${isbn} in der Google Books Datenbank gefunden.`
        }
      };
    }
    
    const volumeInfo = data.items[0].volumeInfo;
    
    const bookInfo: GoogleBookInfo = {
      isbn,
      title: volumeInfo.title || 'Unbekannter Titel',
      authors: volumeInfo.authors,
      publisher: volumeInfo.publisher,
      publishedDate: volumeInfo.publishedDate,
      description: volumeInfo.description,
      pageCount: volumeInfo.pageCount,
      categories: volumeInfo.categories,
      language: volumeInfo.language,
      imageLinks: volumeInfo.imageLinks
    };
    
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
