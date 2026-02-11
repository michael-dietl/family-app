import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { buildSharedStoragePath, ensureDirectoryExists, getSharedStorageDirectory } from '@/services/storagePaths';




export interface Gallery {
  id?: number;
  foreignID?: string;
  name: string;
  description?: string;
  coverPhotoId?: number;
  color?: string;  // Hex-Farbe für Map-Marker (z.B. '#FF5733')
  startDate?: string;
  endDate?: string;
  created: string;
  updated: string;
}

export interface Photo {
  id?: number;
  foreignID?: string;
  galleryId: number;
  filename: string;
  filepath: string;
  storagePath?: string; // Native filesystem path for cleanup operations
  thumbnail?: string;
  width?: number;
  height?: number;
  orientation?: number;
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
  updated: string;
}

export interface BookCategory {
  id?: number;
  foreignID?: string;
  name: string;
  description?: string;
  created: string;
  updated: string;
}

export interface TimelineEvent {
  id?: number;
  foreignID?: string;
  title: string;
  description?: string;
  location?: string;
  startDate: string;
  endDate?: string | null;
  created: string;
  updated: string;
}

export interface TimelineEventPhoto {
  id?: number;
  foreignID?: string;
  eventId: number;
  filename: string;
  filepath: string;
  created: string;
  updated: string;
}

export interface Book {
  id?: number;
  isbn: string;
  title: string;
  subtitle?: string;
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
  updated: string;
  foreignID?: string;
}

// Route Tracking Types
export interface Route {
  id?: number;
  foreignID?: string;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  distance?: number; // in meters
  duration?: number; // in seconds
  isRecording: boolean;
  created: string;
  updated: string;
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
  foreignID?: string;
  updated: string;
}

export interface WineCategory {
  id?: number;
  foreignID?: string;
  name: string;
  description?: string;
  created: string;
  updated: string;
}

export interface Wine {
  id?: number;
  foreignID?: string;
  name: string;
  winery?: string; // Weingut
  region?: string; // Region (z.B. "Mosel", "Bordeaux")
  country?: string; // Land
  year?: number; // Jahrgang
  grapeVariety?: string; // Rebsorte (z.B. "Riesling", "Cabernet Sauvignon")
  type?: string; // z.B. "Rot", "Weiß", "Rosé"
  price?: number; // Kaufpreis
  quantity?: number; // Anzahl Flaschen
  rating?: number; // Bewertung 1-5
  notes?: string; // Notizen
  photoPath?: string; // Pfad zum Foto
  latitude?: number; // GPS Position des Weinbergs/Weinguts
  longitude?: number;
  purchaseDate?: string; // Kaufdatum
  storageLocation?: string; // Lagerort (z.B. "Regal 3, Fach 2")
  categoryId?: number; // Kategorie-Referenz (analog Buchmodul)
  created: string;
  updated: string;
}

// Shopping List Types
export interface ShoppingList {
  id?: number;
  foreignID?: string;
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
  updated: string;
  foreignID?: string;
}

// Todo List Types
export interface TodoList {
  id?: number;
  foreignID?: string;
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
  photoPath?: string;
  dueDate?: string | null;
  completionDate?: string | null;
  created: string;
  updated: string;
  foreignID?: string;
}

export interface TodoPhoto {
  id?: number;
  foreignID?: string;
  todoItemId: number;
  filename: string;
  filepath: string;
  mimeType?: string;
  filesize?: number;
  created: string;
  updated: string;
}

type CreationParams<T extends { updated: string }> = Omit<T, 'id' | 'created' | 'updated'> & Partial<Pick<T, 'updated'>>;

// In-Memory Storage für Web-Development
class InMemoryStorage {
  private galleries: Gallery[] = [];
  private photos: Photo[] = [];
  private galleryIdCounter = 1;
  private photoIdCounter = 1;
  private timelineEvents: TimelineEvent[] = [];
  private timelineEventPhotos: TimelineEventPhoto[] = [];
  private timelineEventIdCounter = 1;
  private timelineEventPhotoIdCounter = 1;

  createGallery(gallery: CreationParams<Gallery>): number {
    const id = this.galleryIdCounter++;
    const now = new Date().toISOString();
    const updated = gallery.updated ?? now;
    this.galleries.push({ ...gallery, id, created: now, updated });
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

  createPhoto(photo: CreationParams<Photo>): number {
    const id = this.photoIdCounter++;
    const now = new Date().toISOString();
    const updated = photo.updated ?? now;
    this.photos.push({ ...photo, id, created: now, updated });
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
      this.photos[index] = { ...this.photos[index], ...updates, updated: new Date().toISOString() };
    }
  }

  deletePhoto(id: number): void {
    this.photos = this.photos.filter(p => p.id !== id);
  }

  getPhotoCount(galleryId: number): number {
    return this.photos.filter(p => p.galleryId === galleryId).length;
  }

  createTimelineEvent(event: CreationParams<TimelineEvent>): number {
    const id = this.timelineEventIdCounter++;
    const now = new Date().toISOString();
    const updated = event.updated ?? now;
    this.timelineEvents.push({ ...event, id, created: now, updated });
    return id;
  }

  getTimelineEvents(): TimelineEvent[] {
    return [...this.timelineEvents].sort((a, b) => {
      const dateA = Date.parse(a.startDate || a.created);
      const dateB = Date.parse(b.startDate || b.created);
      return dateB - dateA;
    });
  }

  createTimelineEventPhoto(photo: CreationParams<TimelineEventPhoto>): number {
    const id = this.timelineEventPhotoIdCounter++;
    const now = new Date().toISOString();
    const updated = photo.updated ?? now;
    this.timelineEventPhotos.push({ ...photo, id, created: now, updated });
    return id;
  }

  getTimelineEventPhotos(eventId: number): TimelineEventPhoto[] {
    return this.timelineEventPhotos
      .filter(photo => photo.eventId === eventId)
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }
}

class DatabaseService {
  private isInitialized = false;
  private useInMemory = false;
  private db: SQLiteDBConnection | null = null;
  private sqlite: SQLiteConnection | null = null;
  private initializationPromise: Promise<void> | null = null;
  private dbName = 'gallerydb';
  private inMemory = new InMemoryStorage();
  private readonly sharedDbFolder = 'databases';
  private readonly sqliteSuffix = 'SQLite.db';

  constructor() {
    // Web: Fallback auf InMemory
    if (!Capacitor.isNativePlatform()) {
      this.useInMemory = true;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.useInMemory) {
      this.isInitialized = true;
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
      this.db = await this.sqlite.createConnection(this.dbName, false, 'no-encryption', 1, false);
      await this.db.open();
      await this.migrateAndSetupTables();
      await this.mirrorDatabaseToSharedStorage();
      this.isInitialized = true;
    })();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }


  async updateWaypoint(id: number, updates: Partial<Waypoint>): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) throw new Error('Waypoints not supported in web mode');
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'routeId' || key === 'timestamp') return;
      fields.push(`${key} = ?`);
      values.push(value);
    });

    if (fields.length === 0) return;

    values.push(id);
    const sql = `UPDATE waypoints SET ${fields.join(', ')} WHERE id = ?;`;
    await this.db.run(sql, values);
  }

  private getLocalDatabaseFileName(): string {
    return `${this.dbName}${this.sqliteSuffix}`;
  }

  private async mirrorDatabaseToSharedStorage(): Promise<void> {
    if (this.useInMemory || !Capacitor.isNativePlatform()) return;
    const sourcePath = `databases/${this.getLocalDatabaseFileName()}`;
    const targetPath = buildSharedStoragePath(this.sharedDbFolder, this.getLocalDatabaseFileName());
    try {
      await ensureDirectoryExists(getSharedStorageDirectory(), buildSharedStoragePath(this.sharedDbFolder));
      const { data } = await Filesystem.readFile({
        directory: Directory.Data,
        path: sourcePath
      });
      if (!data) return;
      await Filesystem.writeFile({
        directory: getSharedStorageDirectory(),
        path: targetPath,
        data,
        recursive: true
      });
    } catch (error) {
      console.warn('Could not mirror sqlite database file to shared storage', error);
    }
  }

  // Migration: Prüfe ob color Spalte in galleries existiert

  private async migrateAndSetupTables() {
    // Gallerien Tabelle
    const wineCategoriesTable = `
      CREATE TABLE IF NOT EXISTS wine_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        name TEXT NOT NULL,
        description TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    const galleriesTable = `
      CREATE TABLE IF NOT EXISTS galleries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        name TEXT NOT NULL,
        description TEXT,
        coverPhotoId INTEGER,
        color TEXT,
        startDate TEXT,
        endDate TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    // Fotos Tabelle
    const photosTable = `
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        galleryId INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        storagePath TEXT,
        thumbnail TEXT,
        width INTEGER,
        height INTEGER,
        filesize INTEGER,
        mimeType TEXT,
        isVideo INTEGER DEFAULT 0,
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
        updated TEXT NOT NULL,
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
        foreignID TEXT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    // Bücher Tabelle
    const booksTable = `
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        isbn TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        subtitle TEXT,
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
        updated TEXT NOT NULL,
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
        foreignID TEXT,
        name TEXT NOT NULL,
        description TEXT,
        startTime TEXT NOT NULL,
        endTime TEXT,
        distance REAL,
        duration INTEGER,
        isRecording INTEGER DEFAULT 1,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    // Wegpunkte Tabelle
    const waypointsTable = `
      CREATE TABLE IF NOT EXISTS waypoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
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
        updated TEXT NOT NULL,
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
        foreignID TEXT,
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
        categoryId INTEGER,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        FOREIGN KEY (categoryId) REFERENCES wine_categories(id) ON DELETE SET NULL
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
        foreignID TEXT,
        name TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    const shoppingItemsTable = `
      CREATE TABLE IF NOT EXISTS shopping_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        listId INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER,
        completed INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
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
        foreignID TEXT,
        name TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    const todoItemsTable = `
      CREATE TABLE IF NOT EXISTS todo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        listId INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        photoPath TEXT,
        dueDate TEXT,
        completionDate TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        FOREIGN KEY (listId) REFERENCES todo_lists(id) ON DELETE CASCADE
      );
    `;
    const todoPhotosTable = `
      CREATE TABLE IF NOT EXISTS todo_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        todoItemId INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        mimeType TEXT,
        filesize INTEGER,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        FOREIGN KEY (todoItemId) REFERENCES todo_items(id) ON DELETE CASCADE
      );
    `;
    const todoPhotosIndexes = `
      CREATE INDEX IF NOT EXISTS idx_todo_photos_item ON todo_photos(todoItemId);
    `;
    const todoIndexes = `
      CREATE INDEX IF NOT EXISTS idx_todo_items_list ON todo_items(listId);
    `;
    const timelineEventsTable = `
      CREATE TABLE IF NOT EXISTS timeline_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        title TEXT NOT NULL,
        description TEXT,
        startDate TEXT NOT NULL,
        endDate TEXT,
        location TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `;
    const timelineEventPhotosTable = `
      CREATE TABLE IF NOT EXISTS timeline_event_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        foreignID TEXT,
        eventId INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        FOREIGN KEY (eventId) REFERENCES timeline_events(id) ON DELETE CASCADE
      );
    `;
    const timelineIndexes = `
      CREATE INDEX IF NOT EXISTS idx_timeline_events_start ON timeline_events(startDate);
      CREATE INDEX IF NOT EXISTS idx_timeline_event_photos_event ON timeline_event_photos(eventId);
    `;
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execute(wineCategoriesTable);
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
    await this.db.execute(todoPhotosTable);
    await this.db.execute(todoPhotosIndexes);
    await this.db.execute(timelineEventsTable);
    await this.db.execute(timelineEventPhotosTable);
    await this.db.execute(timelineIndexes);

    // Migration: ensure photos.isVideo exists for video handling
    try {
      const columns = await this.db.query("PRAGMA table_info(photos);");
      const hasIsVideo = columns.values?.some((col: any) => col.name === 'isVideo');
      if (!hasIsVideo) {
        await this.db.execute('ALTER TABLE photos ADD COLUMN isVideo INTEGER DEFAULT 0;');
        await this.db.execute("UPDATE photos SET isVideo = 1 WHERE mimeType LIKE 'video/%';");
      }
    } catch (error) {
      console.warn('Photo isVideo migration skipped:', error);
    }

    const runAlter = async (statement: string) => {
      try {
        await this.db!.execute(statement);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/duplicate column name/i.test(message)) {
          console.warn('Todo column migration skipped:', message);
          return;
        }
      }
    };

    await runAlter('ALTER TABLE galleries ADD COLUMN startDate TEXT;');
    await runAlter('ALTER TABLE galleries ADD COLUMN endDate TEXT;');
    await runAlter('ALTER TABLE todo_items ADD COLUMN dueDate TEXT;');
    await runAlter('ALTER TABLE todo_items ADD COLUMN completionDate TEXT;');
    await runAlter('ALTER TABLE galleries ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE galleries ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE photos ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE photos ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE photos ADD COLUMN storagePath TEXT;');
    try {
      await this.db.execute('UPDATE photos SET storagePath = filepath WHERE storagePath IS NULL;');
    } catch (error) {
      console.warn('Photos storagePath initialization skipped:', error);
    }
    await runAlter('ALTER TABLE book_categories ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE book_categories ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE books ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE books ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE routes ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE routes ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE waypoints ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE waypoints ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE wines ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE wines ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE shopping_lists ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE shopping_items ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE shopping_items ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE todo_lists ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE todo_items ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE todo_items ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE todo_photos ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE todo_photos ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE timeline_events ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE timeline_events ADD COLUMN updated TEXT;');
    await runAlter('ALTER TABLE timeline_events ADD COLUMN location TEXT;');
    await runAlter('ALTER TABLE timeline_event_photos ADD COLUMN foreignID TEXT;');
    await runAlter('ALTER TABLE timeline_event_photos ADD COLUMN updated TEXT;');
  }

  // Galerie CRUD Operationen
  async createGallery(gallery: CreationParams<Gallery>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.createGallery(gallery);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sql = `
      INSERT INTO galleries (foreignID, name, description, coverPhotoId, color, startDate, endDate, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const updated = gallery.updated ?? now;
    const result = await this.db.run(sql, [
      gallery.foreignID || null,
      gallery.name,
      gallery.description || null,
      gallery.coverPhotoId || null,
      gallery.color || null,
      gallery.startDate || null,
      gallery.endDate || null,
      now,
      updated
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

    const updated = updates.updated ?? new Date().toISOString();
    const sql = `
      UPDATE galleries 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          coverPhotoId = COALESCE(?, coverPhotoId),
          color = COALESCE(?, color),
          startDate = COALESCE(?, startDate),
          endDate = COALESCE(?, endDate),
          foreignID = COALESCE(?, foreignID),
          updated = ?
      WHERE id = ?;
    `;

    await this.db.run(sql, [
      updates.name || null,
      updates.description || null,
      updates.coverPhotoId || null,
      updates.color || null,
      updates.startDate || null,
      updates.endDate || null,
      updates.foreignID || null,
      updated,
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

  async createTimelineEvent(event: CreationParams<TimelineEvent>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.createTimelineEvent(event);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = event.updated ?? now;
    const sql = `
      INSERT INTO timeline_events (foreignID, title, description, startDate, endDate, location, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const result = await this.db.run(sql, [
      event.foreignID || null,
      event.title,
      event.description || null,
      event.startDate,
      event.endDate || null,
      event.location || null,
      now,
      updated
    ]);

    return result.changes?.lastId || 0;
  }

  async getTimelineEvents(): Promise<TimelineEvent[]> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getTimelineEvents();
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM timeline_events ORDER BY startDate DESC, created DESC;';
    const result = await this.db.query(sql);
    return result.values as TimelineEvent[] || [];
  }

  async createTimelineEventPhoto(photo: CreationParams<TimelineEventPhoto>): Promise<number> {
    if (!this.isInitialized) await this.initialize();

    if (this.useInMemory) {
      return this.inMemory.createTimelineEventPhoto(photo);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = photo.updated ?? now;
    const sql = 'INSERT INTO timeline_event_photos (foreignID, eventId, filename, filepath, created, updated) VALUES (?, ?, ?, ?, ?, ?);';

    const result = await this.db.run(sql, [
      photo.foreignID || null,
      photo.eventId,
      photo.filename,
      photo.filepath,
      now,
      updated
    ]);

    return result.changes?.lastId || 0;
  }

  async getTimelineEventPhotos(eventId: number): Promise<TimelineEventPhoto[]> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.getTimelineEventPhotos(eventId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM timeline_event_photos WHERE eventId = ? ORDER BY created DESC;';
    const result = await this.db.query(sql, [eventId]);
    return result.values as TimelineEventPhoto[] || [];
  }

  // Foto CRUD Operationen
  async createPhoto(photo: CreationParams<Photo>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    
    if (this.useInMemory) {
      return this.inMemory.createPhoto(photo);
    }

    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = photo.updated ?? now;
    const sql = `
      INSERT INTO photos (
        foreignID, galleryId, filename, filepath, storagePath, thumbnail, width, height, filesize, mimeType, isVideo,
        latitude, longitude, dateTaken, camera, lens, focalLength, aperture, shutterSpeed, iso, created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const result = await this.db.run(sql, [
      photo.foreignID || null,
      photo.galleryId,
      photo.filename,
      photo.filepath,
      photo.storagePath || null,
      photo.thumbnail || null,
      photo.width || null,
      photo.height || null,
      photo.filesize || null,
      photo.mimeType || null,
      photo.isVideo ? 1 : 0,
      photo.latitude || null,
      photo.longitude || null,
      photo.dateTaken || null,
      photo.camera || null,
      photo.lens || null,
      photo.focalLength || null,
      photo.aperture || null,
      photo.shutterSpeed || null,
      photo.iso || null,
      now,
      updated
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
    if (updates.storagePath !== undefined) {
      fields.push('storagePath = ?');
      values.push(updates.storagePath);
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
    if (updates.foreignID !== undefined) {
      fields.push('foreignID = ?');
      values.push(updates.foreignID ?? null);
    }

    if (fields.length === 0) return;

    fields.push('updated = ?');
    values.push(updates.updated ?? new Date().toISOString());

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
      this.sqlite = null;
      this.isInitialized = false;
    }
  }

  // Book Category CRUD Operations
  async createBookCategory(category: CreationParams<BookCategory>): Promise<number> {
    if (!this.isInitialized) await this.initialize();

    const now = new Date().toISOString();

    if (this.useInMemory) {
      // TODO: Add to InMemoryStorage if needed
      return 0;
    }

    if (!this.db) throw new Error('Database not initialized');

    const updated = category.updated ?? now;
    const sql = 'INSERT INTO book_categories (foreignID, name, description, created, updated) VALUES (?, ?, ?, ?, ?);';
    const result = await this.db.run(sql, [
      category.foreignID || null,
      category.name,
      category.description || null,
      now,
      updated
    ]);

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
  async createBook(book: CreationParams<Book>): Promise<number> {
    if (!this.isInitialized) await this.initialize();

    const now = new Date().toISOString();

    if (this.useInMemory) {
      // TODO: Add to InMemoryStorage if needed
      return 0;
    }

    if (!this.db) throw new Error('Database not initialized');

    const updated = book.updated ?? now;
    const sql = `
      INSERT INTO books (
        foreignID, isbn, title, subtitle, authors, publisher, publishedDate, description,
        pageCount, categories, language, coverImage, categoryId,
        notes, rating, read, quantity, created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const result = await this.db.run(sql, [
      book.foreignID || null,
      book.isbn,
      book.title,
      book.subtitle || null,
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
      now,
      updated
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
      if (key === 'id' || key === 'created' || key === 'updated') return;
      
      fields.push(`${key} = ?`);
      
      if (key === 'read') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value ?? null);
      }
    });

    if (fields.length === 0) return;

    fields.push('updated = ?');
    values.push(updates.updated ?? new Date().toISOString());

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
  async createRoute(route: CreationParams<Route>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) throw new Error('Routes not supported in web mode');
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = route.updated ?? now;
    const sql = `
      INSERT INTO routes (foreignID, name, description, startTime, endTime, distance, duration, isRecording, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    const result = await this.db.run(sql, [
      route.foreignID || null,
      route.name,
      route.description || null,
      route.startTime,
      route.endTime || null,
      route.distance || null,
      route.duration || null,
      route.isRecording ? 1 : 0,
      now,
      updated
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
      if (key === 'id' || key === 'created' || key === 'updated') return;
      
      fields.push(`${key} = ?`);
      
      if (key === 'isRecording') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value ?? null);
      }
    });

    if (fields.length === 0) return;

    const updated = updates.updated ?? new Date().toISOString();
    fields.push('updated = ?');
    values.push(updated);

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
  async createWaypoint(waypoint: CreationParams<Waypoint>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) throw new Error('Waypoints not supported in web mode');
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      INSERT INTO waypoints (
        foreignID, routeId, type, latitude, longitude, altitude, accuracy, 
        name, description, photoId, timestamp, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    const result = await this.db.run(sql, [
      waypoint.foreignID || null,
      waypoint.routeId,
      waypoint.type,
      waypoint.latitude,
      waypoint.longitude,
      waypoint.altitude || null,
      waypoint.accuracy || null,
      waypoint.name || null,
      waypoint.description || null,
      waypoint.photoId || null,
      waypoint.timestamp,
      waypoint.updated ?? waypoint.timestamp
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

  async deletePositionWaypoints(routeId: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = "DELETE FROM waypoints WHERE routeId = ? AND type = 'position';";
    await this.db.run(sql, [routeId]);
  }

  // ==================== Wine Management ====================

  async createWine(wine: CreationParams<Wine>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = wine.updated ?? now;
    const sql = `
      INSERT INTO wines (foreignID, name, winery, region, country, year, grapeVariety, type, price, quantity, rating, notes, photoPath, latitude, longitude, purchaseDate, storageLocation, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    
    const result = await this.db.run(sql, [
      wine.foreignID || null,
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
      updated
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

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created' || key === 'updated') return;
      
      fields.push(`${key} = ?`);
      values.push(value ?? null);
    });

    if (fields.length === 0) return;

    const updated = updates.updated ?? new Date().toISOString();
    fields.push('updated = ?');
    values.push(updated);

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
  
    // Wine Category CRUD Operations
    async getWineCategories(): Promise<WineCategory[]> {
      if (!this.isInitialized) await this.initialize();
      if (this.useInMemory) {
        return [];
      }
      if (!this.db) throw new Error('Database not initialized');

      const sql = 'SELECT * FROM wine_categories ORDER BY name ASC;';
      const result = await this.db.query(sql);
      return result.values as WineCategory[] || [];
    }

  // Shopping List CRUD Operations
  async createShoppingList(list: CreationParams<ShoppingList>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = list.updated ?? now;
    const sql = 'INSERT INTO shopping_lists (foreignID, name, created, updated) VALUES (?, ?, ?, ?);';
    const result = await this.db.run(sql, [list.foreignID || null, list.name, now, updated]);
    
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

    if (updates.foreignID !== undefined) {
      fields.push('foreignID = ?');
      values.push(updates.foreignID ?? null);
    }

    const updated = updates.updated ?? now;
    fields.push('updated = ?');
    values.push(updated);
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

  async createShoppingItem(item: CreationParams<ShoppingItem>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = item.updated ?? now;
    const sql = 'INSERT INTO shopping_items (foreignID, listId, name, quantity, completed, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?);';
    const result = await this.db.run(sql, [
      item.foreignID || null,
      item.listId,
      item.name,
      item.quantity || null,
      item.completed ? 1 : 0,
      now,
      updated
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
    if (updates.foreignID !== undefined) {
      fields.push('foreignID = ?');
      values.push(updates.foreignID ?? null);
    }

    if (fields.length === 0) return;

    const updated = updates.updated ?? new Date().toISOString();
    fields.push('updated = ?');
    values.push(updated);

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
  async createTodoList(list: CreationParams<TodoList>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = list.updated ?? now;
    const sql = 'INSERT INTO todo_lists (foreignID, name, created, updated) VALUES (?, ?, ?, ?);';
    const result = await this.db.run(sql, [list.foreignID || null, list.name, now, updated]);
    
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

    if (updates.foreignID !== undefined) {
      fields.push('foreignID = ?');
      values.push(updates.foreignID ?? null);
    }

    const updated = updates.updated ?? new Date().toISOString();
    fields.push('updated = ?');
    values.push(updated);
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

  async createTodoItem(item: CreationParams<TodoItem>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = item.updated ?? now;
    const sql = 'INSERT INTO todo_items (foreignID, listId, title, description, completed, photoPath, dueDate, completionDate, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);';
    const result = await this.db.run(sql, [
      item.foreignID || null,
      item.listId,
      item.title,
      item.description || null,
      item.completed ? 1 : 0,
      (item as any).photoPath || null,
      item.dueDate || null,
      item.completionDate || null,
      now,
      updated
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

  async getTodoItemById(id: number): Promise<TodoItem | null> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return null;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM todo_items WHERE id = ?;';
    const result = await this.db.query(sql, [id]);
    const row = (result.values || [])[0];
    if (!row) return null;

    return {
      ...row,
      completed: row.completed === 1
    };
  }

  // Todo Photo CRUD
  async createTodoPhoto(photo: CreationParams<TodoPhoto>): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return 0;
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const updated = photo.updated ?? now;
    const sql = 'INSERT INTO todo_photos (foreignID, todoItemId, filename, filepath, mimeType, filesize, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?);';
    const result = await this.db.run(sql, [
      photo.foreignID || null,
      photo.todoItemId,
      photo.filename,
      photo.filepath,
      photo.mimeType || null,
      photo.filesize || null,
      now,
      updated
    ]);
    return result.changes?.lastId || 0;
  }

  async getTodoPhotosByItem(todoItemId: number): Promise<TodoPhoto[]> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return [];
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM todo_photos WHERE todoItemId = ? ORDER BY created DESC;';
    const result = await this.db.query(sql, [todoItemId]);
    return result.values || [];
  }

  async deleteTodoPhoto(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (this.useInMemory) return;
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'DELETE FROM todo_photos WHERE id = ?;';
    await this.db.run(sql, [id]);
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
    if ((updates as any).photoPath !== undefined) {
      fields.push('photoPath = ?');
      values.push((updates as any).photoPath ?? null);
    }
    if ((updates as any).dueDate !== undefined) {
      fields.push('dueDate = ?');
      values.push((updates as any).dueDate ?? null);
    }
    if ((updates as any).completionDate !== undefined) {
      fields.push('completionDate = ?');
      values.push((updates as any).completionDate ?? null);
    }
    if (updates.foreignID !== undefined) {
      fields.push('foreignID = ?');
      values.push(updates.foreignID ?? null);
    }

    if (fields.length === 0) return;

    const updated = updates.updated ?? new Date().toISOString();
    fields.push('updated = ?');
    values.push(updated);

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
