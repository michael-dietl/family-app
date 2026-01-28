import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
export interface Gallery {
  id?: number;
  name: string;
  description?: string;
  coverPhotoId?: number;
  color?: string;  // Hex-Farbe für Map-Marker (z.B. '#FF5733')
  created: string;
  updated: string;
}

export interface Photo {
  id?: number;
  galleryId: number;
  filename: string;
  filepath: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  filesize?: number;
  mimeType?: string;
  isVideo?: boolean;
  // EXIF Daten
  latitude?: number;
  longitude?: number;
  dateTaken?: string;
  camera?: string;
  lens?: string;
  focalLength?: number;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  created: string;
}

export interface BookCategory {
  id?: number;
  name: string;
  description?: string;
  created: string;
}

export interface Book {
  id?: number;
  isbn: string;
  title: string;
  authors?: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string;
  language?: string;
  coverImage?: string;
  categoryId?: number;
  notes?: string;
  rating?: number;
  read?: boolean;
  quantity?: number;
  created: string;
}

// Route Tracking Types
export interface Route {
  id?: number;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  distance?: number; // in meters
  duration?: number; // in seconds
  isRecording: boolean;
  created: string;
}

export interface Waypoint {
  id?: number;
  routeId: number;
  type: 'photo' | 'video' | 'manual' | 'position'; // position = GPS track point
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  name?: string;
  description?: string;
  photoId?: number; // Reference to photo if type is photo/video
  timestamp: string;
}

export interface Wine {
  id?: number;
  name: string;
  winery?: string; // Weingut
  region?: string; // Region (z.B. "Mosel", "Bordeaux")
  country?: string; // Land
  year?: number; // Jahrgang
  grapeVariety?: string; // Rebsorte (z.B. "Riesling", "Cabernet Sauvignon")
  type?: string; // Weintyp (z.B. "Rotwein", "Weißwein", "Rosé")
  price?: number; // Kaufpreis
  quantity?: number; // Anzahl Flaschen
  rating?: number; // Bewertung 1-5
  notes?: string; // Notizen
  photoPath?: string; // Pfad zum Foto
  latitude?: number; // GPS Position des Weinbergs/Weinguts
  longitude?: number;
  purchaseDate?: string; // Kaufdatum
  storageLocation?: string; // Lagerort (z.B. "Regal 3, Fach 2")
  created: string;
  updated: string;
}

// Shopping List Types
export interface ShoppingList {
  id?: number;
  name: string;
  created: string;
  updated: string;
}

export interface ShoppingItem {
  id?: number;
  listId: number;
  name: string;
  quantity?: number;
  completed: boolean;
  created: string;
}

// Todo List Types
export interface TodoList {
  id?: number;
  name: string;
  created: string;
  updated: string;
}

export interface TodoItem {
  id?: number;
  listId: number;
  title: string;
  description?: string;
  completed: boolean;
  created: string;
}

// In-Memory Storage für Web-Development
class InMemoryStorage {
  private galleries: Gallery[] = [];
  private photos: Photo[] = [];
  private galleryIdCounter = 1;
  private photoIdCounter = 1;

  createGallery(gallery: Omit<Gallery, 'id' | 'created' | 'updated'>): number {
    const id = this.galleryIdCounter++;
    const now = new Date().toISOString();
    this.galleries.push({ ...gallery, id, created: now, updated: now });
    return id;
  }

  getGalleries(): Gallery[] {
    return [...this.galleries].sort((a, b) => 
      new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );
  }

  getGallery(id: number): Gallery | null {
    return this.galleries.find(g => g.id === id) || null;
  }

  updateGallery(id: number, updates: Partial<Gallery>): void {
    const index = this.galleries.findIndex(g => g.id === id);
    if (index !== -1) {
      this.galleries[index] = { 
        ...this.galleries[index], 
        ...updates, 
        updated: new Date().toISOString() 
      };
    }
  }

  deleteGallery(id: number): void {
    this.galleries = this.galleries.filter(g => g.id !== id);
    this.photos = this.photos.filter(p => p.galleryId !== id);
  }

  createPhoto(photo: Omit<Photo, 'id' | 'created'>): number {
    const id = this.photoIdCounter++;
    const now = new Date().toISOString();
    this.photos.push({ ...photo, id, created: now });
    return id;
  }

  getPhotosByGallery(galleryId: number): Photo[] {
    return this.photos
      .filter(p => p.galleryId === galleryId)
      .sort((a, b) => {
        const dateA = a.dateTaken || a.created;
        const dateB = b.dateTaken || b.created;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
  }

  getPhoto(id: number): Photo | null {
    return this.photos.find(p => p.id === id) || null;
  }

  updatePhoto(id: number, updates: Partial<Photo>): void {
    const index = this.photos.findIndex(p => p.id === id);
    if (index !== -1) {
      this.photos[index] = { ...this.photos[index], ...updates };
    }
  }

  deletePhoto(id: number): void {
    this.photos = this.photos.filter(p => p.id !== id);
  }

  getPhotoCount(galleryId: number): number {
    return this.photos.filter(p => p.galleryId === galleryId).length;
  }
}

class DatabaseService {
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private inMemory: InMemoryStorage = new InMemoryStorage();
  private isInitialized = false;
  private useInMemory = false;
  private readonly dbName = 'dietlmobi.db';

  constructor() {
    // Prüfe ob Web-Plattform
    if (Capacitor.getPlatform() === 'web') {
      this.useInMemory = true;
      console.log('🌐 Using in-memory storage for web development');
    } else {
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Starting database initialization...');
      
      if (this.useInMemory) {
        this.isInitialized = true;
        console.log('✅ In-memory storage ready');
        return;
      }

      // Native SQLite initialization
      if (!this.sqlite) throw new Error('SQLite not available');
      
      this.db = await this.sqlite.createConnection(
        this.dbName,
        false,
        'no-encryption',
        1,
        false
      );

      await this.db.open();
      await this.createTables();
      
      this.isInitialized = true;
      console.log('✅ SQLite database initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Migration: Prüfe ob quantity Spalte existiert und füge sie hinzu falls nicht
    try {
      const checkColumn = await this.db.query('PRAGMA table_info(books);');
      const hasQuantity = checkColumn.values?.some((col: any) => col.name === 'quantity');
      
      if (!hasQuantity && checkColumn.values && checkColumn.values.length > 0) {
        console.log('📦 Migrating books table: Adding quantity column');
        await this.db.execute('ALTER TABLE books ADD COLUMN quantity INTEGER DEFAULT 1;');
      }
    } catch (error) {
      // Tabelle existiert noch nicht, wird gleich erstellt
      console.log('📋 Books table does not exist yet, will be created');
    }

    // Migration: Prüfe ob color Spalte in galleries existiert
    try {
      const checkGalleriesColumn = await this.db.query('PRAGMA table_info(galleries);');
      const hasColor = checkGalleriesColumn.values?.some((col: any) => col.name === 'color');
      
      if (!hasColor && checkGalleriesColumn.values && checkGalleriesColumn.values.length > 0) {
        console.log('🎨 Migrating galleries table: Adding color column');
        await this.db.execute('ALTER TABLE galleries ADD COLUMN color TEXT;');
      }
    } catch (error) {
      console.log('📋 Galleries table does not exist yet, will be created');
    }

    // Migration: Bereinige Photos mit Base64 Data-URLs (OutOfMemory Fix)
    try {
      const checkPhotos = await this.db.query('SELECT COUNT(*) as count FROM photos WHERE filepath LIKE "data:%";');
      const countWithDataUrl = checkPhotos.values?.[0]?.count || 0;
      
      if (countWithDataUrl > 0) {
        console.log(`🧹 Migration: Removing ${countWithDataUrl} photos with data URLs (OutOfMemory fix)`);
        await this.db.execute('DELETE FROM photos WHERE filepath LIKE "data:%";');
        console.log('✅ Migration completed - please re-upload photos');
      }
    } catch (error) {
      console.log('⚠️ Could not check photos for migration:', error);
    }

    // Gallerien Tabelle
    const galleriesTable = `
      CREATE TABLE IF NOT EXISTS galleries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        coverPhotoId INTEGER,
        color TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;

    // Fotos Tabelle
    const photosTable = `
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        galleryId INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        thumbnail TEXT,
        width INTEGER,
        height INTEGER,
        filesize INTEGER,
        mimeType TEXT,
        latitude REAL,
        longitude REAL,
        dateTaken TEXT,
        camera TEXT,
        lens TEXT,
        focalLength REAL,
        aperture TEXT,
        shutterSpeed TEXT,
        iso INTEGER,
        created TEXT NOT NULL,
        FOREIGN KEY (galleryId) REFERENCES galleries(id) ON DELETE CASCADE
      );
    `;

    // Indizes für Performance
    const indexes = `
      CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(galleryId);
      CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(dateTaken);
    `;

    // Buch-Kategorien Tabelle
    const bookCategoriesTable = `
      CREATE TABLE IF NOT EXISTS book_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created TEXT NOT NULL
      );
    `;

    // Bücher Tabelle
    const booksTable = `
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        authors TEXT,
        publisher TEXT,
        publishedDate TEXT,
        description TEXT,
        pageCount INTEGER,
        categories TEXT,
        language TEXT,
        coverImage TEXT,
        categoryId INTEGER,
        notes TEXT,
        rating INTEGER,
        read INTEGER DEFAULT 0,
        quantity INTEGER DEFAULT 1,
        created TEXT NOT NULL,
        FOREIGN KEY (categoryId) REFERENCES book_categories(id) ON DELETE SET NULL
      );
    `;

    // Buch-Indizes
    const bookIndexes = `
      CREATE INDEX IF NOT EXISTS idx_books_category ON books(categoryId);
      CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
    `;

    // Routen Tabelle
    const routesTable = `
      CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        startTime TEXT NOT NULL,
        endTime TEXT,
        distance REAL,
        duration INTEGER,
        isRecording INTEGER DEFAULT 1,
        created TEXT NOT NULL
      );
    `;

    // Wegpunkte Tabelle
    const waypointsTable = `
      CREATE TABLE IF NOT EXISTS waypoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routeId INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('photo', 'video', 'manual', 'position')),
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        name TEXT,
        description TEXT,
        photoId INTEGER,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (routeId) REFERENCES routes(id) ON DELETE CASCADE,
        FOREIGN KEY (photoId) REFERENCES photos(id) ON DELETE SET NULL
      );
    `;

    // Route-Indizes
    const routeIndexes = `
      CREATE INDEX IF NOT EXISTS idx_waypoints_route ON waypoints(routeId);
      CREATE INDEX IF NOT EXISTS idx_waypoints_type ON waypoints(type);
      CREATE INDEX IF NOT EXISTS idx_waypoints_timestamp ON waypoints(timestamp);
    `;

    // Weine Tabelle
    const winesTable = `
      CREATE TABLE IF NOT EXISTS wines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        winery TEXT,
        region TEXT,
        country TEXT,
        year INTEGER,
        grapeVariety TEXT,
        type TEXT,
        price REAL,
        quantity INTEGER DEFAULT 1,
        rating INTEGER,
        notes TEXT,
        photoPath TEXT,
        latitude REAL,
        longitude REAL,
        purchaseDate TEXT,
        storageLocation TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;

    // Wein-Indizes
    const wineIndexes = `
      CREATE INDEX IF NOT EXISTS idx_wines_name ON wines(name);
      CREATE INDEX IF NOT EXISTS idx_wines_region ON wines(region);
      CREATE INDEX IF NOT EXISTS idx_wines_year ON wines(year);
    `;

    // Einkaufslisten Tabellen
    const shoppingListsTable = `
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;

    const shoppingItemsTable = `
      CREATE TABLE IF NOT EXISTS shopping_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listId INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER,
        completed INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        FOREIGN KEY (listId) REFERENCES shopping_lists(id) ON DELETE CASCADE
      );
    `;

    const shoppingIndexes = `
      CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(listId);
    `;

    // ToDo Listen Tabellen
    const todoListsTable = `
      CREATE TABLE IF NOT EXISTS todo_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;

    const todoItemsTable = `
      CREATE TABLE IF NOT EXISTS todo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listId INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        FOREIGN KEY (listId) REFERENCES todo_lists(id) ON DELETE CASCADE
      );
    `;

    const todoIndexes = `
      CREATE INDEX IF NOT EXISTS idx_todo_items_list ON todo_items(listId);
    `;

    await this.db.execute(galleriesTable);
    await this.db.execute(photosTable);
    await this.db.execute(indexes);
    await this.db.execute(bookCategoriesTable);
    await this.db.execute(booksTable);
    await this.db.execute(bookIndexes);
    await this.db.execute(routesTable);
    await this.db.execute(waypointsTable);
    await this.db.execute(routeIndexes);
    await this.db.execute(winesTable);
    await this.db.execute(wineIndexes);
    await this.db.execute(shoppingListsTable);
    await this.db.execute(shoppingItemsTable);
    await this.db.execute(shoppingIndexes);
    await this.db.execute(todoListsTable);
    await this.db.execute(todoItemsTable);
    await this.db.execute(todoIndexes);
  }

  // Galerie CRUD Operationen
  async createGallery(gallery: Omit<Gallery, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.createGallery(gallery);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = `
      INSERT INTO galleries (name, description, coverPhotoId, color, created, updated)
      VALUES (?, ?, ?, ?, ?, ?);
    `;

    const result = await this.db.run(sql, [
      gallery.name,
      gallery.description || null,
      gallery.coverPhotoId || null,
      gallery.color || null,
      now,
      now
    ]);

    return result.changes?.lastId || 0;
  }

  async getGalleries(): Promise<Gallery[]> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getGalleries();
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM galleries ORDER BY updated DESC;';
    const result = await this.db.query(sql);
    
    return result.values as Gallery[] || [];
  }

  async getGallery(id: number): Promise<Gallery | null> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getGallery(id);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM galleries WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    
    return result.values?.[0] as Gallery || null;
  }

  async updateGallery(id: number, updates: Partial<Gallery>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.updateGallery(id, updates);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = `
      UPDATE galleries 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          coverPhotoId = COALESCE(?, coverPhotoId),
          color = COALESCE(?, color),
          updated = ?
      WHERE id = ?;
    `;

    await this.db.run(sql, [
      updates.name || null,
      updates.description || null,
      updates.coverPhotoId || null,
      updates.color || null,
      now,
      id
    ]);
  }

  async deleteGallery(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.deleteGallery(id);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM galleries WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  // Foto CRUD Operationen
  async createPhoto(photo: Omit<Photo, 'id' | 'created'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.createPhoto(photo);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = `
      INSERT INTO photos (
        galleryId, filename, filepath, thumbnail, width, height, filesize, mimeType,
        latitude, longitude, dateTaken, camera, lens, focalLength, aperture, 
        shutterSpeed, iso, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const result = await this.db.run(sql, [
      photo.galleryId,
      photo.filename,
      photo.filepath,
      photo.thumbnail || null,
      photo.width || null,
      photo.height || null,
      photo.filesize || null,
      photo.mimeType || null,
      photo.latitude || null,
      photo.longitude || null,
      photo.dateTaken || null,
      photo.camera || null,
      photo.lens || null,
      photo.focalLength || null,
      photo.aperture || null,
      photo.shutterSpeed || null,
      photo.iso || null,
      now
    ]);

    return result.changes?.lastId || 0;
  }

  async getPhotosByGallery(galleryId: number): Promise<Photo[]> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getPhotosByGallery(galleryId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM photos WHERE galleryId = ? ORDER BY dateTaken DESC, created DESC;';
    const result = await this.db.query(sql, [galleryId]);
    
    return result.values as Photo[] || [];
  }

  async getPhoto(id: number): Promise<Photo | null> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getPhoto(id);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM photos WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    
    return result.values?.[0] as Photo || null;
  }

  async updatePhoto(id: number, updates: Partial<Photo>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.updatePhoto(id, updates);
    }

    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.filepath !== undefined) {
      fields.push('filepath = ?');
      values.push(updates.filepath);
    }
    if (updates.thumbnail !== undefined) {
      fields.push('thumbnail = ?');
      values.push(updates.thumbnail);
    }
    if (updates.width !== undefined) {
      fields.push('width = ?');
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      fields.push('height = ?');
      values.push(updates.height);
    }
    if (updates.filesize !== undefined) {
      fields.push('filesize = ?');
      values.push(updates.filesize);
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE photos SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deletePhoto(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.deletePhoto(id);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM photos WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  async getPhotoCount(galleryId: number): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getPhotoCount(galleryId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT COUNT(*) as count FROM photos WHERE galleryId = ?;';
    const result = await this.db.query(sql, [galleryId]);
    
    return result.values?.[0]?.count || 0;
  }

  async close(): Promise<void> {
    if (this.db && this.sqlite) {
      await this.sqlite.closeConnection(this.dbName, false);
      this.db = null;
      this.isInitialized = false;
    }
  }

  // Book Category CRUD Operations
  async createBookCategory(category: Omit<BookCategory, 'id' | 'created'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();

    const now = new Date().toISOString();

    if (this.useInMemory) {
      // TODO: Add to InMemoryStorage if needed
      return 0;
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'INSERT INTO book_categories (name, description, created) VALUES (?, ?, ?);';
    const result = await this.db.run(sql, [category.name, category.description || null, now]);

    return result.changes?.lastId || 0;
  }

  async getBookCategories(): Promise<BookCategory[]> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) {
      return [];
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM book_categories ORDER BY name ASC;';
    const result = await this.db.query(sql);

    return result.values as BookCategory[] || [];
  }

  async deleteBookCategory(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) return;

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM book_categories WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  // Book CRUD Operations
  async createBook(book: Omit<Book, 'id' | 'created'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();

    const now = new Date().toISOString();

    if (this.useInMemory) {
      // TODO: Add to InMemoryStorage if needed
      return 0;
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      INSERT INTO books (
        isbn, title, authors, publisher, publishedDate, description,
        pageCount, categories, language, coverImage, categoryId,
        notes, rating, read, quantity, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const result = await this.db.run(sql, [
      book.isbn,
      book.title,
      book.authors || null,
      book.publisher || null,
      book.publishedDate || null,
      book.description || null,
      book.pageCount || null,
      book.categories || null,
      book.language || null,
      book.coverImage || null,
      book.categoryId || null,
      book.notes || null,
      book.rating || null,
      book.read ? 1 : 0,
      book.quantity || 1,
      now
    ]);

    return result.changes?.lastId || 0;
  }

  async getBooks(): Promise<Book[]> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) {
      return [];
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM books ORDER BY title ASC;';
    const result = await this.db.query(sql);

    return (result.values as Book[] || []).map(book => ({
      ...book,
      read: Boolean(book.read)
    }));
  }

  async getBook(id: number): Promise<Book | null> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) {
      return null;
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM books WHERE id = ?;';
    const result = await this.db.query(sql, [id]);

    const book = result.values?.[0] as Book || null;
    if (book) {
      book.read = Boolean(book.read);
    }

    return book;
  }

  async getBookByISBN(isbn: string): Promise<Book | null> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) {
      return null;
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM books WHERE isbn = ?;';
    const result = await this.db.query(sql, [isbn]);

    const book = result.values?.[0] as Book || null;
    if (book) {
      book.read = Boolean(book.read);
    }

    return book;
  }

  async updateBook(id: number, updates: Partial<Book>): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) return;

    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created') return;
      
      fields.push(`${key} = ?`);
      
      if (key === 'read') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value ?? null);
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE books SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteBook(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) return;

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM books WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  // Route CRUD Operationen
  async createRoute(route: Omit<Route, 'id' | 'created'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) throw new Error('Routes not supported in web mode');
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = `
      INSERT INTO routes (name, description, startTime, endTime, distance, duration, isRecording, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    const result = await this.db.run(sql, [
      route.name,
      route.description || null,
      route.startTime,
      route.endTime || null,
      route.distance || null,
      route.duration || null,
      route.isRecording ? 1 : 0,
      now
    ]);

    return result.changes?.lastId || 0;
  }

  async getRoutes(): Promise<Route[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM routes ORDER BY startTime DESC;';
    const result = await this.db.query(sql);
    
    return (result.values || []).map((row: any) => ({
      ...row,
      isRecording: row.isRecording === 1
    }));
  }

  async getRoute(id: number): Promise<Route | null> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return null;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM routes WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    
    if (!result.values || result.values.length === 0) return null;
    
    const row = result.values[0];
    return {
      ...row,
      isRecording: row.isRecording === 1
    };
  }

  async updateRoute(id: number, updates: Partial<Route>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created') return;
      
      fields.push(`${key} = ?`);
      
      if (key === 'isRecording') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value ?? null);
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE routes SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteRoute(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM routes WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  // Waypoint CRUD Operationen
  async createWaypoint(waypoint: Omit<Waypoint, 'id'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) throw new Error('Waypoints not supported in web mode');
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      INSERT INTO waypoints (
        routeId, type, latitude, longitude, altitude, accuracy, 
        name, description, photoId, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    const result = await this.db.run(sql, [
      waypoint.routeId,
      waypoint.type,
      waypoint.latitude,
      waypoint.longitude,
      waypoint.altitude || null,
      waypoint.accuracy || null,
      waypoint.name || null,
      waypoint.description || null,
      waypoint.photoId || null,
      waypoint.timestamp
    ]);

    return result.changes?.lastId || 0;
  }

  async getWaypointsByRoute(routeId: number): Promise<Waypoint[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM waypoints WHERE routeId = ? ORDER BY timestamp ASC;';
    const result = await this.db.query(sql, [routeId]);
    
    return result.values || [];
  }

  async deleteWaypoint(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM waypoints WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  // ==================== Wine Management ====================

  async createWine(wine: Omit<Wine, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = `
      INSERT INTO wines (name, winery, region, country, year, grapeVariety, type, price, quantity, rating, notes, photoPath, latitude, longitude, purchaseDate, storageLocation, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    const result = await this.db.run(sql, [
      wine.name,
      wine.winery || null,
      wine.region || null,
      wine.country || null,
      wine.year || null,
      wine.grapeVariety || null,
      wine.type || null,
      wine.price || null,
      wine.quantity || 1,
      wine.rating || null,
      wine.notes || null,
      wine.photoPath || null,
      wine.latitude || null,
      wine.longitude || null,
      wine.purchaseDate || null,
      wine.storageLocation || null,
      now,
      now
    ]);

    return result.changes?.lastId || 0;
  }

  async getWines(searchTerm?: string): Promise<Wine[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM wines';
    const params: any[] = [];

    if (searchTerm) {
      sql += ` WHERE name LIKE ? OR winery LIKE ? OR region LIKE ? OR grapeVariety LIKE ?`;
      const search = `%${searchTerm}%`;
      params.push(search, search, search, search);
    }

    sql += ' ORDER BY name ASC;';
    const result = await this.db.query(sql, params);
    
    return result.values || [];
  }

  async getWine(id: number): Promise<Wine | null> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return null;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM wines WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    
    if (!result.values || result.values.length === 0) return null;
    return result.values[0];
  }

  async updateWine(id: number, updates: Partial<Wine>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created') return;
      
      fields.push(`${key} = ?`);
      values.push(value ?? null);
    });

    if (fields.length === 0) return;

    fields.push('updated = ?');
    values.push(now);
    values.push(id);

    const sql = `UPDATE wines SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteWine(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM wines WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  async getWineCount(): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT COUNT(*) as count FROM wines;';
    const result = await this.db.query(sql);
    
    return result.values?.[0]?.count || 0;
  }

  // Shopping List CRUD Operations
  async createShoppingList(list: Omit<ShoppingList, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = 'INSERT INTO shopping_lists (name, created, updated) VALUES (?, ?, ?);';
    const result = await this.db.run(sql, [list.name, now, now]);
    
    return result.changes?.lastId || 0;
  }

  async getShoppingLists(): Promise<ShoppingList[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM shopping_lists ORDER BY updated DESC;';
    const result = await this.db.query(sql);
    
    return result.values || [];
  }

  async getShoppingList(id: number): Promise<ShoppingList | null> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return null;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM shopping_lists WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    
    return result.values?.[0] || null;
  }

  async updateShoppingList(id: number, updates: Partial<ShoppingList>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    fields.push('updated = ?');
    values.push(now);
    values.push(id);

    const sql = `UPDATE shopping_lists SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteShoppingList(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM shopping_lists WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  async createShoppingItem(item: Omit<ShoppingItem, 'id' | 'created'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = 'INSERT INTO shopping_items (listId, name, quantity, completed, created) VALUES (?, ?, ?, ?, ?);';
    const result = await this.db.run(sql, [
      item.listId,
      item.name,
      item.quantity || null,
      item.completed ? 1 : 0,
      now
    ]);
    
    return result.changes?.lastId || 0;
  }

  async getShoppingItems(listId: number): Promise<ShoppingItem[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM shopping_items WHERE listId = ? ORDER BY completed ASC, created DESC;';
    const result = await this.db.query(sql, [listId]);
    
    return (result.values || []).map(row => ({
      ...row,
      completed: row.completed === 1
    }));
  }

  async updateShoppingItem(id: number, updates: Partial<ShoppingItem>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.quantity !== undefined) {
      fields.push('quantity = ?');
      values.push(updates.quantity);
    }
    if (updates.completed !== undefined) {
      fields.push('completed = ?');
      values.push(updates.completed ? 1 : 0);
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE shopping_items SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteShoppingItem(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM shopping_items WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  // Todo List CRUD Operations
  async createTodoList(list: Omit<TodoList, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = 'INSERT INTO todo_lists (name, created, updated) VALUES (?, ?, ?);';
    const result = await this.db.run(sql, [list.name, now, now]);
    
    return result.changes?.lastId || 0;
  }

  async getTodoLists(): Promise<TodoList[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM todo_lists ORDER BY updated DESC;';
    const result = await this.db.query(sql);
    
    return result.values || [];
  }

  async getTodoList(id: number): Promise<TodoList | null> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return null;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM todo_lists WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    
    return result.values?.[0] || null;
  }

  async updateTodoList(id: number, updates: Partial<TodoList>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    fields.push('updated = ?');
    values.push(now);
    values.push(id);

    const sql = `UPDATE todo_lists SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteTodoList(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM todo_lists WHERE id = ?;';
    await this.db.run(sql, [id]);
  }

  async createTodoItem(item: Omit<TodoItem, 'id' | 'created'>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = 'INSERT INTO todo_items (listId, title, description, completed, created) VALUES (?, ?, ?, ?, ?);';
    const result = await this.db.run(sql, [
      item.listId,
      item.title,
      item.description || null,
      item.completed ? 1 : 0,
      now
    ]);
    
    return result.changes?.lastId || 0;
  }

  async getTodoItems(listId: number): Promise<TodoItem[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM todo_items WHERE listId = ? ORDER BY completed ASC, created DESC;';
    const result = await this.db.query(sql, [listId]);
    
    return (result.values || []).map(row => ({
      ...row,
      completed: row.completed === 1
    }));
  }

  async updateTodoItem(id: number, updates: Partial<TodoItem>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.completed !== undefined) {
      fields.push('completed = ?');
      values.push(updates.completed ? 1 : 0);
    }

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE todo_items SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  async deleteTodoItem(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM todo_items WHERE id = ?;';
    await this.db.run(sql, [id]);
  }
}

// Singleton-Instanz
export const db = new DatabaseService();
