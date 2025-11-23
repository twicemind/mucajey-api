const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../src/data');

// Alle JSON-Dateien im data-Verzeichnis finden
const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.startsWith('hitster-de') && f.endsWith('.json') && !f.includes('backup') && f !== 'hitster-de-import.json');

console.log(`📁 Gefundene Dateien: ${files.length}`);

let totalFixed = 0;

files.forEach(filename => {
  const filePath = path.join(DATA_DIR, filename);
  console.log(`\n🔍 Prüfe: ${filename}`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fixed = 0;
    
    if (data.cards && Array.isArray(data.cards)) {
      data.cards.forEach(card => {
        // Prüfe ob spotifyId, spotifyUri oder spotifyUrl existieren
        if (card.spotifyId || card.spotifyUri || card.spotifyUrl) {
          // Stelle sicher dass spotify-Objekt existiert
          if (!card.spotify) {
            card.spotify = { id: '', uri: '', url: '' };
          }
          
          // Migriere Daten in spotify-Objekt
          if (card.spotifyId && !card.spotify.id) {
            card.spotify.id = card.spotifyId;
          }
          if (card.spotifyUri && !card.spotify.uri) {
            card.spotify.uri = card.spotifyUri;
          }
          if (card.spotifyUrl && !card.spotify.url) {
            card.spotify.url = card.spotifyUrl;
          }
          
          // Lösche alte Felder
          delete card.spotifyId;
          delete card.spotifyUri;
          delete card.spotifyUrl;
          
          fixed++;
        }
        
        // Stelle sicher dass spotify.url existiert (falls nur id und uri vorhanden)
        if (card.spotify && !card.spotify.url) {
          card.spotify.url = '';
        }
      });
      
      if (fixed > 0) {
        // Backup erstellen
        const backupPath = filePath + '.pre-migration-backup';
        fs.writeFileSync(backupPath, fs.readFileSync(filePath));
        
        // Korrigierte Datei speichern
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ ${fixed} Cards korrigiert in ${filename}`);
        totalFixed += fixed;
      } else {
        console.log(`✓ Keine Korrekturen nötig in ${filename}`);
      }
    }
  } catch (error) {
    console.error(`❌ Fehler bei ${filename}:`, error.message);
  }
});

console.log(`\n🎉 Gesamt: ${totalFixed} Cards korrigiert`);
