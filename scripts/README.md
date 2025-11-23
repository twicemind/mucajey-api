# Spotify ID Updater für Hitster

Dieses Script aktualisiert automatisch die Spotify IDs in `hitster-de.json` basierend auf einer Spotify Playlist.

## Setup

1. **Spotify Developer Account erstellen:**
   - Gehe zu https://developer.spotify.com/dashboard
   - Erstelle eine neue App
   - Notiere dir `Client ID` und `Client Secret`

2. **Python Dependencies installieren:**
   ```bash
   pip install spotipy
   ```

3. **Umgebungsvariablen setzen:**
   ```bash
   export SPOTIFY_CLIENT_ID='deine_client_id'
   export SPOTIFY_CLIENT_SECRET='dein_client_secret'
   ```

## Verwendung

```bash
cd backend
python scripts/update-spotify-ids.py
```

Das Script:
- ✅ Lädt alle Tracks aus der Playlist `26zIHVncgI9HmHlgYWwnDi`
- ✅ Matched sie mit den Karten in `hitster-de.json` (basierend auf Titel + Artist)
- ✅ Aktualisiert `spotifyId` und `spotifyUri`
- ✅ Erstellt automatisch ein Backup (`hitster-de.backup.json`)
- ✅ Zeigt Statistiken über aktualisierte Karten

## Alternative: Manuelles Matching

Falls das automatische Matching nicht perfekt funktioniert, kannst du auch manuell die Spotify Web Console nutzen:

1. Öffne https://developer.spotify.com/console/get-playlist-tracks/
2. Playlist ID: `26zIHVncgI9HmHlgYWwnDi`
3. Kopiere die Track-IDs und füge sie manuell in die JSON ein
