# Spotify Playlist Sync - Setup

## Übersicht

Das Spotify Playlist Sync Feature ermöglicht es, Spotify-Track-Informationen automatisch aus einer Playlist zu extrahieren und in die mucajey-Cards zu synchronisieren.

## Voraussetzungen

1. **Spotify Developer Account**: Du benötigst einen Spotify Developer Account
2. **Spotify App**: Eine registrierte App im Spotify Developer Dashboard

## Setup-Schritte

### 1. Spotify Developer App erstellen

1. Gehe zu [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Logge dich mit deinem Spotify Account ein
3. Klicke auf "Create an App"
4. Gib einen Namen ein (z.B. "mucajey Sync")
5. Gib eine Beschreibung ein (optional)
6. Akzeptiere die Terms of Service
7. Klicke auf "Create"

### 2. Client Credentials kopieren

1. Klicke auf deine neu erstellte App
2. Kopiere die **Client ID**
3. Klicke auf "Show Client Secret"
4. Kopiere das **Client Secret**

⚠️ **Wichtig**: Halte das Client Secret geheim und committe es niemals in Git!

### 3. Environment Variables konfigurieren

1. Kopiere `.env.example` zu `.env`:
   ```bash
   cp .env.example .env
   ```

2. Öffne `.env` und füge deine Spotify Credentials ein:
   ```bash
   SPOTIFY_CLIENT_ID=deine_client_id_hier
   SPOTIFY_CLIENT_SECRET=dein_client_secret_hier
   ```

### 4. Docker Container neu starten

```bash
docker-compose down
docker-compose up -d
```

## Verwendung

### Im Admin Frontend

1. Navigiere zur **Files**-Seite
2. Finde das JSON-File, das du synchronisieren möchtest
3. Klicke auf den **"Sync"**-Button in der "Spotify Sync"-Spalte
4. Ein Modal öffnet sich und zeigt den Fortschritt an
5. Nach Abschluss werden die Statistiken angezeigt:
   - **Gesamt Cards**: Anzahl aller Cards im File
   - **Aktualisiert**: Cards, die neue Spotify-Daten erhalten haben
   - **Übersprungen**: Cards, die bereits Spotify-Daten hatten
   - **Nicht gefunden**: Cards, für die kein Match in der Playlist gefunden wurde
   - **Playlist Tracks**: Anzahl der Tracks in der Spotify Playlist

### Playlist URL im JSON-File

Jedes JSON-File benötigt eine `spotify_playlist` URL:

```json
{
  "edition": "Hitster Deutschland 2020s",
  "identifier": "aaaa0007",
  "spotify_playlist": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  "cards": [...]
}
```

Wenn keine Playlist verfügbar ist, setze den Wert auf einen leeren String:

```json
"spotify_playlist": ""
```

## Funktionsweise

### Matching-Algorithmus

Der Sync-Prozess:

1. Lädt alle Tracks aus der Spotify Playlist
2. Iteriert durch alle Cards im JSON-File
3. Für jede Card:
   - **Überspringt** die Card, wenn `card.spotify.id` bereits existiert
   - **Sucht** nach einem Match in den Playlist-Tracks basierend auf:
     - Artist-Name (case-insensitive substring match)
     - Track-Titel (case-insensitive substring match)
   - **Aktualisiert** die Card mit Spotify-Daten bei Match:
     ```json
     {
       "spotify": {
         "id": "3n3Ppam7vgaVa1iaRUc9Lp",
         "uri": "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp",
         "url": "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
       }
     }
     ```

### API Endpoint

**POST** `/api/files/:filename/spotify-sync`

Response:
```json
{
  "message": "Spotify sync completed",
  "filename": "hitster-de-aaaa0007.json",
  "edition": "Hitster Deutschland 2020s",
  "playlistId": "37i9dQZF1DXcBWIGoYBM5M",
  "playlistUrl": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  "statistics": {
    "totalCards": 100,
    "updated": 85,
    "skipped": 10,
    "notFound": 5,
    "playlistTracks": 120
  },
  "updates": [
    {
      "cardId": "card-001",
      "title": "Blinding Lights",
      "artist": "The Weeknd",
      "spotifyTrack": "3n3Ppam7vgaVa1iaRUc9Lp",
      "spotifyArtists": ["The Weeknd"]
    }
  ]
}
```

## Troubleshooting

### Fehler: "No spotify_playlist URL found"

Das JSON-File hat kein `spotify_playlist` Feld oder es ist leer.

**Lösung**: Füge eine gültige Spotify Playlist URL zum JSON-File hinzu.

### Fehler: "Invalid Spotify playlist URL"

Die `spotify_playlist` URL hat ein ungültiges Format.

**Lösung**: Verwende eine URL im Format `https://open.spotify.com/playlist/{playlist_id}`

### Fehler: 401 Unauthorized

Die Spotify API Credentials sind ungültig.

**Lösung**: 
- Überprüfe `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` in `.env`
- Stelle sicher, dass die Credentials von einer aktiven Spotify App stammen
- Starte die Docker Container neu nach Änderungen an `.env`

### Viele "Not Found" Matches

Tracks aus der Playlist können nicht mit Cards gematcht werden.

**Mögliche Ursachen**:
- Artist/Title schreibweise unterscheidet sich stark
- Playlist enthält andere Tracks als die Cards
- Playlist ist nicht aktuell

**Lösungen**:
- Überprüfe, ob die richtige Playlist verlinkt ist
- Verwende eine offizielle Hitster-Playlist für das entsprechende Deck
- Prüfe die Card-Daten auf Tippfehler

## Rate Limiting

Die Spotify API hat Rate Limits. Bei vielen gleichzeitigen Syncs kann es zu Fehlern kommen.

**Best Practice**: Synchronisiere Files einzeln und warte zwischen Syncs.

## Token Caching

OAuth Access Tokens werden für 55 Minuten gecacht, um API-Aufrufe zu minimieren. Token werden automatisch erneuert, wenn sie ablaufen.
