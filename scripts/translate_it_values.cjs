const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'i18n', 'it.ts');
const backupPath = filePath + '.bak_safe';

if (!fs.existsSync(filePath)) {
  console.error('it.ts not found:', filePath);
  process.exit(1);
}

fs.copyFileSync(filePath, backupPath);
console.log('Safe backup created at', backupPath);

let content = fs.readFileSync(filePath, 'utf8');

const mappings = {
  "Bild bearbeiten": "Modifica immagine",
  "close": "Chiudi",
  "save": "Salva",
  "Standort wählen": "Scegli posizione",
  "Standort übernehmen": "Usa posizione",
  "Bild gespeichert": "Immagine salvata",
  "Alle auswählen": "Seleziona tutto",
  "Foto hinzufügen": "Aggiungi foto",
  "Foto aufnehmen": "Scatta foto",
  "Fehler": "Errore",
  "Nein": "No",
  "Speichern": "Salva",
  "Verbindung erfolgreich": "Connessione riuscita",
  "Verbindung fehlgeschlagen": "Connessione fallita",
  "Anmeldung erfolgreich": "Accesso riuscito",
  "Erfolgreich angemeldet": "Accesso effettuato",
  "Anmeldung fehlgeschlagen": "Accesso fallito",
  "Sprache gespeichert": "Lingua salvata",
  "Gallerien": "Gallerie",
  "Keine Gallerien vorhanden": "Nessuna galleria disponibile",
  "Erstelle deine erste Gallerie mit dem + Button": "Crea la tua prima galleria con il pulsante +",
  "Neue Gallerie": "Nuova galleria",
  "Die Gallerie konnte nicht erstellt werden.": "Impossibile creare la galleria.",
  "Keine Bücher vorhanden": "Nessun libro disponibile",
  "Buch gelöscht": "Libro eliminato",
  "ISBN eingeben": "Inserisci ISBN",
  "Suchen": "Cerca",
  "Kamera-Berechtigung verweigert": "Permesso fotocamera negato",
  "Installieren": "Installa",
  "Buch bereits vorhanden": "Libro già presente",
  "Anzahl erhöhen": "Aumenta quantità",
  "Foto machen": "Scatta foto",
  "Kategorie erstellen": "Crea categoria",
  "Kategorien verwalten": "Gestisci categorie",
  "Eine Routenaufzeichnung läuft. Möchtest du die App beenden oder im Hintergrund weiterlaufen lassen?": "È in corso una registrazione del percorso. Vuoi chiudere l'app o lasciarla in esecuzione in background?",
  "Die App läuft weiter. Drücke Home, um sie zu minimieren.": "L'app continua a funzionare. Premi Home per minimizzare.",
  "Verbindung testen": "Test connessione",
  "Server ist erreichbar (Code: ${health.code})": "Server raggiungibile (Codice: ${health.code})",
  "Server nicht erreichbar": "Server non raggiungibile",
  "Foto aufgenommen": "Foto scattata",
  "Möchtest du das Bild vor dem Speichern bearbeiten?": "Vuoi modificare l'immagine prima di salvarla?",
  "Cover-Foto gespeichert": "Copertina salvata"
};

function escapeRegex(s){return s.replace(/[.*+?^${}()|[\\]\\]/g,'\\\\$&');}

let total = 0;
Object.entries(mappings).forEach(([de,it]) => {
  const re = new RegExp(`:\\s*(["'])\\s*${escapeRegex(de)}\\s*\\1`, 'g');
  // replacement keeps the same quote char
  content = content.replace(re, (m, q) => {
    total++;
    return `: ${q}${it}${q}`;
  });
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Safe replacements done. Count:', total);
console.log('Safe backup at', backupPath);
