# Google Books API Setup

## Übersicht

Die Bibliotheksfunktion verwendet die **Google Books API**, um Buchinformationen per ISBN abzurufen. Die API kann sowohl **ohne API-Key** als auch **mit API-Key** verwendet werden.

## Unterschiede

| Feature | Ohne API-Key | Mit API-Key |
|---------|--------------|-------------|
| **Tägliche Anfragen** | ~100 | 1.000 |
| **Kosten** | Kostenlos | Kostenlos |
| **Einrichtung** | Keine | 5 Minuten |
| **Empfohlen für** | Gelegentliche Nutzung | Häufige Nutzung |

## Verwendung ohne API-Key

Die App funktioniert **out-of-the-box** ohne API-Key mit folgenden Einschränkungen:

- ⚠️ Limitiert auf ca. **100 Anfragen pro Tag**
- Bei Überschreitung: **HTTP 403 Fehler** (Quota exceeded)
- Die App zeigt dann eine **detaillierte Fehlermeldung** mit Lösungsvorschlägen

## API-Key einrichten (empfohlen)

### 1. Google Cloud Console Setup

1. Besuche [Google Cloud Console](https://console.cloud.google.com/)
2. Erstelle ein neues Projekt oder wähle ein bestehendes
3. Gehe zu **APIs & Services** → **Library**
4. Suche nach **"Books API"**
5. Klicke auf **Enable** (Aktivieren)

### 2. API-Key erstellen

1. Gehe zu **APIs & Services** → **Credentials**
2. Klicke auf **+ CREATE CREDENTIALS** → **API Key**
3. Kopiere den generierten Key (z.B. `AIzaSyD...`)

### 3. API-Key sichern (optional aber empfohlen)

1. Klicke auf den erstellten Key
2. Unter **API restrictions** → **Restrict key**
3. Wähle **Books API** aus
4. Unter **Application restrictions** kannst du optional:
   - **HTTP referrers** für Web-Version angeben
   - **Android apps** für native App mit Package Name + SHA-1 Fingerprint

### 4. In der App einrichten

#### Option A: Über die Benutzeroberfläche (einfach)

1. Öffne die Bibliothek in der App
2. Klicke auf das **Menü** (⋮) oben rechts
3. Wähle **"API-Key einrichten"**
4. Füge deinen API-Key ein
5. Klicke auf **"Speichern"**

#### Option B: Per Code (für Entwickler)

```typescript
import { setGoogleBooksApiKey } from '@/services/books';

// Beim App-Start (z.B. in main.ts oder App.vue)
setGoogleBooksApiKey('AIzaSyD...');
```

Empfehlung: **Speichere den Key sicher**, z.B. in:
- Environment Variables (`.env.local`)
- Capacitor Preferences Plugin (persistenter Storage)
- Verschlüsseltem Storage

## Fehlerbehandlung

Die App zeigt jetzt **detaillierte Fehlermeldungen** bei API-Problemen:

### Fehlertypen

| Fehler | Bedeutung | Lösung |
|--------|-----------|--------|
| **API Quota überschritten** | Tägliches Limit erreicht | API-Key einrichten oder morgen erneut versuchen |
| **Zu viele Anfragen** | Rate Limit | Kurz warten und erneut versuchen |
| **Buch nicht gefunden** | ISBN nicht in Datenbank | Andere ISBN versuchen oder manuell eingeben |
| **Netzwerkfehler** | Keine Internetverbindung | Internetverbindung prüfen |
| **API Fehler (4xx/5xx)** | Google Server Problem | Später erneut versuchen |

### Beispiel Fehlermeldung

```
📚 API Fehler
API Quota überschritten

Die tägliche Anfragegrenze der Google Books API wurde erreicht.

Ein API-Key erhöht die Anzahl kostenloser Anfragen deutlich.

[API-Key eingeben] [Später]
```

## Troubleshooting

### "403 Forbidden" trotz API-Key

- Prüfe ob die **Books API** in der Cloud Console **aktiviert** ist
- Prüfe **API Restrictions** (muss Books API erlauben)
- Warte 2-3 Minuten nach Key-Erstellung (Propagierung)

### "API Key not valid"

- Prüfe auf **Tippfehler** beim Kopieren
- Prüfe **Application Restrictions** (eventuell zu streng)
- Erstelle einen neuen Key ohne Restrictions zum Testen

### Quota trotzdem erschöpft

- Die 1.000 Anfragen/Tag gelten pro API-Key
- Bei sehr intensiver Nutzung: Mehrere Keys verwenden (rotation)
- Oder: Erweiterte Quota in Google Cloud anfragen (kostenpflichtig)

## Datenschutz

- Der API-Key wird **lokal** in der App gespeichert
- **Keine Übertragung** an externe Server (außer Google)
- Bei Bedarf **jederzeit entfernbar** über das Menü

## Alternative APIs (Future)

Falls Google Books API nicht ausreicht, können folgende Alternativen integriert werden:

- **Open Library API** (komplett kostenlos, aber weniger Daten)
- **ISBNdb.com** (kostenpflichtig, sehr umfangreich)
- **WorldCat Search API**
- **Eigene Datenbank** (offline-fähig)

## Support

Bei Problemen:
1. Prüfe die **Browser Console** (Web) oder **Logcat** (Android) auf detaillierte Fehler
2. Teste mit einem **bekannten ISBN** (z.B. `9783551551672` - Harry Potter)
3. Überprüfe die **Netzwerkverbindung**
4. Erstelle ein Issue im Projekt-Repository
