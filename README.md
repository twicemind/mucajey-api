# mucajey Backend Server

Ein Node.js Express-Server für die Hitster-Kartendatenbank mit Apple Music Integration.

## Docker (Production)
```bash
# Build optimized, non-root image (serves on 3000)
docker build -t mucajey-api:latest .

# Run with custom API key / Spotify creds and host data directory
docker run --rm -p 3000:3000 \
  -e API_KEY=dein-sicherer-api-key \
  -e SPOTIFY_CLIENT_ID=... \
  -e SPOTIFY_CLIENT_SECRET=... \
  -v $(pwd)/data:/app/data \
  mucajey-api:latest
```

- Healthcheck: `GET /health`
- Data + API key files live in `/app/data` (cards + api directories)

## Installation

```bash
cd backend
npm install
```

## Konfiguration

Erstelle eine `.env` Datei basierend auf `.env.example`:

```bash
cp .env.example .env
```

Konfiguriere die Umgebungsvariablen:

```env
PORT=3000
API_KEY=dein-sicherer-api-key-hier
```

**Wichtig:** Ändere den API-Key für Production zu einem sicheren, zufälligen String!

## Server starten

### Mit Node.js

```bash
npm start
```

Oder mit Auto-Reload für Entwicklung:

```bash
npm run dev
```

### Mit Docker

Docker Image bauen:

```bash
docker build -t mucajey-backend .
```

Container starten:

```bash
docker run -d \
  --name mucajey-backend \
  -p 3000:3000 \
  -e API_KEY=dein-sicherer-api-key \
  mucajey-backend
```

### Mit Docker Compose (empfohlen)

```bash
# Mit Standard-API-Key starten
docker-compose up -d

# Mit eigenem API-Key starten
API_KEY=dein-sicherer-api-key docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Container stoppen
docker-compose down
```

Der Server läuft standardmäßig auf `http://localhost:3000`

## API Authentifizierung

Die meisten Endpoints erfordern einen API-Key, der als `X-API-Key` Header übergeben werden muss.

### API-Key erhalten

**Neue App registrieren:**
Apps können beim ersten Start einen API-Key generieren lassen:

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "mucajey iOS",
    "appVersion": "1.0.0", 
    "deviceId": "unique-device-identifier",
    "platform": "iOS"
  }'
```

**Antwort:**
```json
{
  "message": "API-Key erfolgreich generiert",
  "apiKey": "f754b6a45e20e5734226dafd81ce1571d58546293b5056d6ec580510c4faa221",
  "appName": "mucajey iOS",
  "deviceId": "unique-device-identifier",
  "createdAt": "2025-11-10T15:22:36.044Z",
  "status": "new"
}
```

Bei erneuter Registrierung mit derselben `deviceId` wird der existierende Key zurückgegeben (`status: "existing"`).

### API-Key verwenden

```bash
curl -H "X-API-Key: dein-api-key" http://localhost:3000/api/files
```

**Endpoints ohne API-Key:**
- `GET /health` - Health Check
- `POST /api/register` - API-Key Registrierung
- `GET /:edition/:cardId` - Direkter Scan für QR-Codes

## API Endpoints

### Health Check
```
GET /health
```
Gibt den Server-Status zurück. **Keine Authentifizierung erforderlich.**

**Beispiel:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-11-10T12:34:56.789Z"
}
```

---

### App registrieren und API-Key erhalten
```
POST /api/register
```
Generiert einen neuen API-Key für eine App beim ersten Start. Bei erneuter Registrierung mit derselben `deviceId` wird der existierende Key zurückgegeben. **Keine Authentifizierung erforderlich.**

**Request Body:**
```json
{
  "appName": "mucajey iOS",
  "appVersion": "1.0.0",
  "deviceId": "unique-device-identifier",
  "platform": "iOS"
}
```

**Beispiel:**
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "mucajey iOS",
    "appVersion": "1.0.0",
    "deviceId": "ABC123-DEF456",
    "platform": "iOS"
  }'
```

**Response (neuer Key):**
```json
{
  "message": "API-Key erfolgreich generiert",
  "apiKey": "f754b6a45e20e5734226dafd81ce1571d58546293b5056d6ec580510c4faa221",
  "appName": "mucajey iOS",
  "deviceId": "ABC123-DEF456",
  "createdAt": "2025-11-10T15:22:36.044Z",
  "status": "new"
}
```

**Response (existierender Key):**
```json
{
  "message": "Device bereits registriert",
  "apiKey": "f754b6a45e20e5734226dafd81ce1571d58546293b5056d6ec580510c4faa221",
  "registeredAt": "2025-11-10T15:22:36.044Z",
  "appName": "mucajey iOS",
  "status": "existing"
}
```

---

### Sign in with Apple (API-Key erstellen/abrufen)
```
POST /apple/login
```
Erstellt oder gibt einen API-Key frei, wenn sich eine App mit Sign in with Apple anmeldet. Die Route speichert die Apple User ID zusammen mit dem Device, damit wiederkehrende Logins den selben API-Key zurückliefern.

**Request Body:**
```json
{
  "appleUserId": "000123.abc.def",
  "deviceId": "unique-device-id",
  "appName": "mucajey iOS",
  "appVersion": "1.2.0",
  "platform": "iOS"
}
```

**Response (neuer Key):**
```json
{
  "message": "API key created via Apple login",
  "apiKey": "abc123...",
  "appName": "mucajey iOS",
  "deviceId": "unique-device-id",
  "appleUserId": "000123.abc.def",
  "status": "created"
}
```

**Response (bestehender Key):**
```json
{
  "message": "API key already registered for this Apple user",
  "apiKey": "abc123...",
  "appName": "mucajey iOS",
  "deviceId": "unique-device-id",
  "appleUserId": "000123.abc.def",
  "status": "existing"
}
```

---

### Alle verfügbaren Dateien
```
GET /api/files
```
Gibt eine Liste aller JSON-Dateien im data-Verzeichnis zurück. **Authentifizierung erforderlich.**
```
Gibt eine Liste aller JSON-Dateien im data-Verzeichnis zurück. **Authentifizierung erforderlich.**

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/files
```

**Response:**
```json
{
  "files": [
    "hitster-de.json",
    "hitster-de-aaaa0007.json",
    "hitster-de-aaaa0012.json",
    "hitster-de-import.json"
  ]
}
```

---

### Alle Daten aus allen Editionen
```
GET /api/all-data
```
Gibt alle Karten aus allen JSON-Dateien zusammengefasst zurück (ohne Duplikat-Filterung). **Authentifizierung erforderlich.**

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/all-data
```

**Response:**
```json
{
  "summary": {
    "totalCards": 2382,
    "totalEditions": 9,
    "totalFiles": 9
  },
  "editions": [
    {
      "edition": "Hitster Deutschland",
      "language_short": "de",
      "language_long": "Deutsch",
      "identifier": "",
      "file": "hitster-de.json",
      "cardCount": 308
    }
  ],
  "cards": [
    {
      "id": "00001",
      "title": "Song Title",
      "artist": "Artist Name",
      "year": "1975",
      "edition": "Hitster Deutschland",
      "language_short": "de",
      "language_long": "Deutsch",
      "source_file": "hitster-de.json",
      "apple": {
        "id": "1234567890",
        "uri": "https://music.apple.com/de/song/1234567890"
      },
      "spotify": {
        "id": "",
        "uri": ""
      }
    }
  ]
}
```

---

### Hitster Deutschland Hauptedition
```
GET /api/hitster-de
```
Gibt alle Daten aus der `hitster-de.json` Datei zurück. **Authentifizierung erforderlich.**

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/hitster-de
```

**Response:**
```json
{
  "edition": "Hitster Deutschland",
  "language_short": "de",
  "language_long": "Deutsch",
  "identifier": "",
  "cards": [
    {
      "id": "00001",
      "title": "Song Title",
      "artist": "Artist Name",
      "year": "1975",
      "apple": {
        "id": "1234567890",
        "uri": "https://music.apple.com/de/song/1234567890"
      },
      "spotify": {
        "id": "",
        "uri": ""
      }
    }
  ]
}
```

---

### Spezifische Datei laden
```
GET /api/data/:filename
```
Lädt eine spezifische JSON-Datei aus dem data-Verzeichnis. **Authentifizierung erforderlich.**

**Parameter:**
- `filename` - Name der JSON-Datei (z.B. `hitster-de-aaaa0007.json`)

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/data/hitster-de-aaaa0007.json
```

**Response:**
```json
{
  "edition": "Hitster Deutschland aaaa0007",
  "language_short": "de",
  "language_long": "Deutsch",
  "identifier": "aaaa0007",
  "cards": [...]
}
```

---

### Karte nach ID suchen
```
GET /api/cards/:id
```
Sucht eine spezifische Karte anhand ihrer ID in der Hauptedition (hitster-de.json). **Authentifizierung erforderlich.**

**Parameter:**
- `id` - Karten-ID (z.B. `00001`)

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/cards/00001
```

**Response:**
```json
{
  "id": "00001",
  "title": "Song Title",
  "artist": "Artist Name",
  "year": "1975",
  "apple": {
    "id": "1234567890",
    "uri": "https://music.apple.com/de/song/1234567890"
  },
  "spotify": {
    "id": "",
    "uri": ""
  }
}
```

---

### Karten nach Jahr filtern
```
GET /api/cards/year/:year
```
Filtert alle Karten aus der Hauptedition nach einem bestimmten Jahr. **Authentifizierung erforderlich.**

**Parameter:**
- `year` - Jahr (z.B. `1975`)

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/cards/year/1975
```

**Response:**
```json
{
  "edition": "Hitster Deutschland",
  "year": "1975",
  "count": 12,
  "cards": [...]
}
```

---

### Gescannte Karte abrufen (mit /scan Prefix)
```
GET /scan/:edition/:cardId
```
Ruft eine gescannte Karte basierend auf Edition und Karten-ID ab. **Authentifizierung erforderlich.**

**Parameter:**
- `edition` - Edition-Identifier (z.B. `aaaa0007`)
- `cardId` - Karten-ID (z.B. `00001`)

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/scan/aaaa0007/00001
```

**Response:**
```json
{
  "edition": "Hitster Deutschland aaaa0007",
  "scanCode": "aaaa0007/00001",
  "card": {
    "id": "00001",
    "title": "Song Title",
    "artist": "Artist Name",
    "year": "1975",
    "apple": {...},
    "spotify": {...}
  }
}
```

---

### Nur Apple Music ID abrufen
```
GET /scan/:edition/:cardId/apple
```
Gibt nur die Apple Music Daten einer gescannten Karte zurück. **Authentifizierung erforderlich.**

**Parameter:**
- `edition` - Edition-Identifier
- `cardId` - Karten-ID

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/scan/aaaa0007/00001/apple
```

**Response:**
```json
{
  "appleId": "1234567890",
  "appleUri": "https://music.apple.com/de/song/1234567890"
}
```

---

### Direkter Scan ohne Prefix
```
GET /:edition/:cardId
```
Direkter Zugriff auf eine Karte ohne `/scan` Prefix (für QR-Code URLs). **Keine Authentifizierung erforderlich.**

**Parameter:**
- `edition` - Edition-Identifier
- `cardId` - Karten-ID

**Beispiel:**
```bash
curl http://localhost:3000/aaaa0007/00001
```

**Response:** Identisch mit `/scan/:edition/:cardId`

---

### Neue Karte zur Import-Datei hinzufügen
```
POST /api/cards
```
Fügt eine neue Karte zur Import-Datei hinzu oder aktualisiert eine bestehende. **Authentifizierung erforderlich.**

**Request Body:**
```json
{
  "id": "00999",
  "title": "New Song",
  "artist": "New Artist",
  "year": "2024",
  "edition": "Hitster Deutschland - Import",
  "language_short": "de",
  "language_long": "Deutsch",
  "apple": {
    "id": "1234567890",
    "uri": "https://music.apple.com/de/song/1234567890"
  },
  "spotify": {
    "id": "abc123",
    "uri": "spotify:track:abc123"
  }
}
```

**Beispiel:**
```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Content-Type: application/json" \
  -d '{
    "id": "00999",
    "title": "New Song",
    "artist": "New Artist",
    "year": "2024",
    "edition": "Hitster Deutschland - Import",
    "language_short": "de",
    "language_long": "Deutsch"
  }'
```

**Response:**
```json
{
  "message": "Neue Karte wurde hinzugefügt",
  "importId": "IMP-1699876543210-abc123",
  "type": "new",
  "timestamp": "2025-11-10T12:34:56.789Z",
  "card": {...},
  "totalImports": 1,
  "file": "hitster-de-import.json"
}
```

---

### Import-Datei anzeigen
```
GET /api/import
```
Zeigt alle importierten/benutzerdefinierten Karten an. **Authentifizierung erforderlich.**

**Beispiel:**
```bash
curl -H "X-API-Key: mucajey-dev-key-2024" http://localhost:3000/api/import
```

**Response:**
```json
{
  "edition": "Hitster Deutschland - Import",
  "language_short": "de",
  "language_long": "Deutsch",
  "identifier": "import",
  "imports": [
    {
      "importId": "IMP-1699876543210-abc123",
      "type": "new",
      "timestamp": "2025-11-10T12:34:56.789Z",
      "card": {...}
    }
  ]
}
```

---

### Import-Datei leeren
```
DELETE /api/import
```
Löscht alle Einträge aus der Import-Datei. **Authentifizierung erforderlich.**

**Beispiel:**
```bash
curl -X DELETE http://localhost:3000/api/import
```

**Response:**
```json
{
  "message": "Import-Datei wurde geleert",
  "file": "hitster-de-import.json"
}
```

---

### Apple Music Daten aktualisieren (Einzelne Karte)
```
PATCH /api/cards/:edition/:cardId/apple
```
Aktualisiert die Apple Music Daten einer spezifischen Karte. **Authentifizierung erforderlich.**

**Parameter:**
- `edition` - Edition-Identifier (z.B. `aaaa0007` oder `hitster-de`)
- `cardId` - Karten-ID (z.B. `00001`)

**Request Body:**
```json
{
  "appleId": "1234567890",
  "appleUri": "https://music.apple.com/de/song/1234567890"
}
```

**Beispiel:**
```bash
curl -X PATCH http://localhost:3000/api/cards/aaaa0007/00001/apple \
  -H "Content-Type: application/json" \
  -d '{
    "appleId": "1234567890",
    "appleUri": "https://music.apple.com/de/song/1234567890"
  }'
```

**Response:**
```json
{
  "message": "Apple Music Daten erfolgreich aktualisiert",
  "card": {
    "id": "00001",
    "title": "Song Title",
    "artist": "Artist Name",
    "year": "1975",
    "apple": {
      "id": "1234567890",
      "uri": "https://music.apple.com/de/song/1234567890"
    }
  },
  "file": "hitster-de-aaaa0007.json"
}
```

---

### Apple Music Daten aktualisieren (Batch)
```
PATCH /api/cards/apple/batch
```
Aktualisiert Apple Music Daten für mehrere Karten gleichzeitig. **Authentifizierung erforderlich.**

**Request Body:**
```json
{
  "updates": [
    {
      "edition": "aaaa0007",
      "cardId": "00001",
      "appleId": "1234567890",
      "appleUri": "https://music.apple.com/de/song/1234567890"
    },
    {
      "edition": "hitster-de",
      "cardId": "00123",
      "appleId": "9876543210",
      "appleUri": "https://music.apple.com/de/song/9876543210"
    }
  ]
}
```

**Beispiel:**
```bash
curl -X PATCH http://localhost:3000/api/cards/apple/batch \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "edition": "aaaa0007",
        "cardId": "00001",
        "appleId": "1234567890",
        "appleUri": "https://music.apple.com/de/song/1234567890"
      }
    ]
  }'
```

**Response:**
```json
{
  "message": "2 Karten erfolgreich aktualisiert",
  "summary": {
    "total": 2,
    "success": 2,
    "failed": 0,
    "filesUpdated": 2
  },
  "results": {
    "success": [
      { "edition": "aaaa0007", "cardId": "00001", "file": "hitster-de-aaaa0007.json" },
      { "edition": "hitster-de", "cardId": "00123", "file": "hitster-de.json" }
    ],
    "failed": []
  }
}
```

---

## Datenstruktur

### Karten-Format
```json
{
  "id": "00001",
  "title": "Song Title",
  "artist": "Artist Name",
  "year": "1975",
  "apple": {
    "id": "1234567890",
    "uri": "https://music.apple.com/de/song/1234567890"
  },
  "spotify": {
    "id": "abc123xyz",
    "uri": "spotify:track:abc123xyz"
  }
}
```

### Edition-Format
```json
{
  "edition": "Hitster Deutschland",
  "language_short": "de",
  "language_long": "Deutsch",
  "identifier": "",
  "cards": [...]
}
```

---

## Fehlerbehandlung

Alle Endpoints geben bei Fehlern entsprechende HTTP-Statuscodes zurück:
- `400` - Ungültige Anfrage (Bad Request)
- `401` - Authentifizierung erforderlich (Unauthorized) - API-Key fehlt
- `403` - Zugriff verweigert (Forbidden) - API-Key ungültig
- `404` - Ressource nicht gefunden (Not Found)
- `500` - Serverfehler (Internal Server Error)

Fehlerantworten haben folgendes Format:
```json
{
  "error": "Fehlerbeschreibung",
  "details": "Detaillierte Fehlerinformation"
}
```

**Authentifizierungsfehler:**

Fehlender API-Key (401):
```json
{
  "error": "API-Key erforderlich",
  "message": "Bitte fügen Sie den X-API-Key Header hinzu"
}
```

Ungültiger API-Key (403):
```json
{
  "error": "Ungültiger API-Key",
  "message": "Der bereitgestellte API-Key ist ungültig"
}
```

---

## Verfügbare Editionen

- **hitster-de.json** - Hauptedition (308 Karten, 307 mit Apple Music IDs)
- **hitster-de-aaaa0007.json** - Edition aaaa0007
- **hitster-de-aaaa0012.json** - Edition aaaa0012
- **hitster-de-aaaa0015.json** - Edition aaaa0015
- **hitster-de-aaaa0019.json** - Edition aaaa0019
- **hitster-de-aaaa0025.json** - Edition aaaa0025
- **hitster-de-aaaa0026.json** - Edition aaaa0026
- **hitster-de-aaaa0039.json** - Edition aaaa0039
- **hitster-de-aaaa0040.json** - Edition aaaa0040
- **hitster-de-import.json** - Import-Datei für benutzerdefinierte Karten

**Gesamt:** 2382 Karten über alle Editionen

---

## 🎨 Admin-Interface

### Zugriff
- **URL:** http://localhost:5173
- **Backend-API:** http://localhost:8000
- **API-Dokumentation:** http://localhost:8000/docs

### Features

#### 📊 Dashboard
- Übersicht über Gesamtanzahl Cards, Editionen
- Streaming-Coverage (Spotify/Apple Music in %)
- Year-basierter Coverage-Breakdown
- Letzte Failed Searches

#### 🗂️ Cards Management
- Alle Cards über alle Editionen anzeigen
- Filtern nach:
  - Textsuche (Artist/Title)
  - JSON-Datei/Edition
  - Jahr
  - Streaming-Service (Spotify/Apple Music)
- Card-Details anzeigen

#### ❌ Failed Searches
- Alle fehlgeschlagenen iTunes/Spotify-Suchen anzeigen
- Gruppiert nach JSON-Datei
- Filtern nach Datei
- Details: Artist, Title, Year, Reason, Timestamp
- Search URL zum Testen (iTunes-Link)
- Aktionen:
  - Einzelne Failed Search löschen
  - Alle für eine Datei löschen
  - Retry-Import starten

#### 🔄 Import Tools
- Spotify/Apple Music Import-Scripts starten
- Datei-Auswahl (alle JSON-Dateien)
- Service-Auswahl (Spotify/Apple Music)
- Retry-Modus für Failed Searches
- Background-Ausführung mit Status-Polling
- Progress-Anzeige während Import
- Import abbrechen

#### 📁 Files Overview
- Alle JSON-Dateien mit Metadaten
- Edition-Name, Card-Count, Dateigröße
- Failed Searches Indicator
- Link zu Card-Details

### Admin-Architektur

**Backend (FastAPI):**
- Port: 8000
- Python 3.11
- Pydantic v2 für Data Validation
- CORS-enabled für Frontend
- Background Tasks für Import-Scripts
- 5 Router-Module:
  - `cards` - Card-Management
  - `files` - Datei-Verwaltung
  - `failed_searches` - Failed Search Management
  - `imports` - Import-Script-Ausführung
  - `statistics` - Dashboard-Stats

**Frontend (React):**
- Port: 5173
- React 18 + TypeScript
- Vite Build Tool
- TailwindCSS für Styling
- React Router für Navigation
- TanStack React Query für State Management
- Axios API Client

### Admin starten

**Docker Compose:**
```bash
# Alle Services (Node.js + Admin)
docker-compose up -d

# Nur Admin-Services
docker-compose up -d admin-backend admin-frontend

# Logs anzeigen
docker-compose logs -f admin-backend
docker-compose logs -f admin-frontend
```

**Lokal (Development):**
```bash
# Backend (FastAPI)
cd admin
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (React) - in separatem Terminal
cd admin-frontend
npm install
npm run dev
```

### Failed Searches Format

Pro JSON-Datei wird eine separate Failed-Searches-Datei erstellt:
- `hitster-de-failed-searches.json`
- `hitster-de-aaaa0007-failed-searches.json`
- etc.

**Struktur:**
```json
{
  "failed_searches": [
    {
      "json_file": "hitster-de.json",
      "card_id": "00001",
      "artist": "Queen",
      "title": "Bohemian Rhapsody",
      "year": "1975",
      "reason": "Rate Limit/Forbidden (HTTP 403)",
      "search_url": "https://itunes.apple.com/search?term=...",
      "timestamp": "2025-11-15 14:30:45"
    }
  ],
  "updated": "2025-11-15 14:30:45"
}
```

### Admin-API Endpoints

#### Cards
- `GET /api/cards` - Liste (mit Filtern: search, json_file, year, has_spotify, has_apple)
- `GET /api/cards/{card_id}` - Card Details
- `PUT /api/cards/{card_id}` - Card aktualisieren
- `DELETE /api/cards/{card_id}` - Card löschen

#### Failed Searches
- `GET /api/failed-searches` - Alle Failed Searches (optional: json_file filter)
- `DELETE /api/failed-searches/{json_file}/{card_id}` - Einzelnen Eintrag löschen
- `DELETE /api/failed-searches/{json_file}` - Alle für Datei löschen
- `POST /api/failed-searches/retry` - Retry-Import starten

#### Import
- `POST /api/import/start` - Import starten (Body: file, service, retry)
- `GET /api/import/status` - Import-Status abrufen
- `POST /api/import/cancel` - Import abbrechen

#### Statistics
- `GET /api/stats/dashboard` - Dashboard-Statistiken
- `GET /api/stats/coverage` - Coverage-Breakdown (year-based)

#### Files
- `GET /api/files` - Alle Dateien mit Stats
- `GET /api/files/{filename}` - Datei-Inhalt
