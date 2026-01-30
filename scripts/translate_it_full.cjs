const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'i18n', 'it.ts');
const backupPath = filePath + '.bak_full_' + Date.now();

if (!fs.existsSync(filePath)) {
  console.error('it.ts not found:', filePath);
  process.exit(1);
}

fs.copyFileSync(filePath, backupPath);
console.log('Backup created at', backupPath);

let content = fs.readFileSync(filePath, 'utf8');
let changed = [];
let total = 0;

// Heuristic mapping (common German UI strings -> Italian)
const map = {
  'Einstellungen':'Impostazioni',
  'Sprache':'Lingua',
  'Sprache gespeichert':'Lingua salvata',
  'Galerie':'Galleria',
  'Galerien':'Gallerie',
  'Gallerie':'Galleria',
  'Galerien vorhanden':'Gallerie disponibili',
  'Foto':'Foto',
  'Fotos':'Foto',
  'Foto hinzufügen':'Aggiungi foto',
  'Foto aufnehmen':'Scatta foto',
  'Bild bearbeiten':'Modifica immagine',
  'Bild gespeichert':'Immagine salvata',
  'Cover-Foto gespeichert':'Copertina salvata',
  'Speichern':'Salva',
  'Speichern':'Salva',
  'Abbrechen':'Annulla',
  'OK':'OK',
  'Ja':'Sì',
  'Nein':'No',
  'Fehler':'Errore',
  'Verbindung erfolgreich':'Connessione riuscita',
  'Verbindung fehlgeschlagen':'Connessione fallita',
  'Anmeldung erfolgreich':'Accesso riuscito',
  'Anmeldung fehlgeschlagen':'Accesso fallito',
  'Erfolgreich angemeldet':'Accesso effettuato',
  'Version':'Versione',
  'Plattform':'Piattaforma',
  'Speicher':'Memoria',
  'Lokale Datenbank':'Database locale',
  'Auto-Synchronisation':'Sincronizzazione automatica',
  'Automatisch mit PocketBase synchronisieren':'Sincronizza automaticamente con PocketBase',
  'Server URL':'URL Server',
  'Email (optional)':'Email (opzionale)',
  'Passwort (optional)':'Password (opzionale)',
  'Verbindung testen':'Test connessione',
  'Test GPS Extraction':'Test estrazione GPS',
  'Keine Fotos vorhanden':'Nessuna foto disponibile',
  'Keine Gallerien vorhanden':'Nessuna galleria disponibile',
  'Neue Gallerie':'Nuova galleria',
  'Die Gallerie konnte nicht erstellt werden.':'Impossibile creare la galleria.',
  'Keine Bücher vorhanden':'Nessun libro disponibile',
  'Buch gelöscht':'Libro eliminato',
  'ISBN eingeben':'Inserisci ISBN',
  'Barcode scannen':'Scannerizza barcode',
  'Barcode scannen':'Scannerizza barcode',
  'Foto machen':'Scatta foto',
  'Kategorie erstellen':'Crea categoria',
  'Kategorien verwalten':'Gestisci categorie',
  'Kein Cover gefunden':'Copertina non trovata',
  'Foto aufgenommen':'Foto scattata',
  'Möchtest du das Bild vor dem Speichern bearbeiten?':'Vuoi modificare l\'immagine prima di salvarla?',
  'Alle auswählen':'Seleziona tutto',
  'Mehrere Fotos auswählen':'Seleziona più foto',
  'Route nicht gefunden':'Percorso non trovato',
  'Route Optionen':'Opzioni percorso',
  'Route bearbeiten':'Modifica percorso',
  'Route gelöscht':'Percorso eliminato',
  'Neue Route':'Nuovo percorso',
  'Routenname':'Nome percorso',
  'Starten':'Avvia',
  'Pausieren':'Pausa',
  'Fortsetzen':'Continua',
  'Aufzeichnung starten':'Avvia registrazione',
  'Aufzeichnung beenden':'Termina registrazione',
  'Aufzeichnung gestartet':'Registrazione avviata',
  'Aufzeichnung beendet':'Registrazione terminata',
  'Wegpunkt hinzufügen':'Aggiungi punto percorso',
  'Hinzufügen':'Aggiungi',
  'Verlassen':'Esci',
  'Keine Routen':'Nessun percorso',
  'Weinkeller':'Cantina',
  'Wein':'Vino',
  'Preis':'Prezzo',
  'Anzahl Flaschen':'Numero di bottiglie',
  'Lagerort':'Luogo di conservazione',
  'Kaufdatum':'Data di acquisto',
  'GPS Position':'Posizione GPS',
  'Notizen':'Note',
  'Wein nicht gefunden':'Vino non trovato',
  'Neuer Wein':'Nuovo vino',
  'Wein speichern':'Salva vino',
  'Video gespeichert':'Video salvato',
  'Keine Video-Quelle angegeben':'Nessuna sorgente video specificata',
  'Qualität':'Qualità',
  'Hoch':'Alta',
  'Mittel':'Media',
  'Niedrig':'Bassa',
  'Zur Galerie':'Vai alla galleria',
  'Details anzeigen':'Mostra dettagli'
};

// Replace only string VALUES (right side of :) and avoid code-like values
const valueRegex = /:\s*(["'])([\s\S]*?)\1/gm;
let match;
while ((match = valueRegex.exec(content)) !== null) {
  const quote = match[1];
  const val = match[2];
  // skip code-like strings
  if (/\b(const|SELECT|INSERT|UPDATE|DELETE|function|=>|return|\$\{)/i.test(val)) continue;
  const trimmed = val.trim();
  // direct mapping
  if (map[trimmed]) {
    const replacer = `${quote}${map[trimmed]}${quote}`;
    const spanStart = match.index;
    const fullMatch = match[0];
    // rebuild content safely by slicing
    const before = content.slice(0, spanStart);
    const after = content.slice(spanStart + fullMatch.length);
    content = before + ': ' + replacer + after;
    // adjust regex lastIndex to continue after replacement
    valueRegex.lastIndex = spanStart + (': '.length) + replacer.length;
    total++;
    changed.push({old: trimmed, new: map[trimmed]});
  } else {
    // try substring replacements for common words
    let newVal = val;
    Object.keys(map).forEach(k => {
      if (k.length < 3) return;
      const re = new RegExp(escapeRegex(k), 'g');
      newVal = newVal.replace(re, map[k]);
    });
    if (newVal !== val) {
      const replacer = `${quote}${newVal}${quote}`;
      const spanStart = match.index;
      const fullMatch = match[0];
      const before = content.slice(0, spanStart);
      const after = content.slice(spanStart + fullMatch.length);
      content = before + ': ' + replacer + after;
      valueRegex.lastIndex = spanStart + (': '.length) + replacer.length;
      total++;
      changed.push({old: val, new: newVal});
    }
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Full translation script finished. Replacements:', total);
if (changed.length>0) console.log('Sample changes:', JSON.stringify(changed.slice(0,10), null, 2));
console.log('Backup kept at', backupPath);

function escapeRegex(s){return s.replace(/[.*+?^${}()|[\\]\\]/g,'\\\\$&');}
