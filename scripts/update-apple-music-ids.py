#!/usr/bin/env python3
"""
Script to update Apple Music IDs in hitster JSON files using iTunes Search API.

Requirements:
    pip install requests

The iTunes Search API is free and requires no authentication.
"""

import json
import sys
import time
from pathlib import Path
from urllib.parse import quote

try:
    import requests
except ImportError:
    print("❌ requests nicht installiert. Bitte installieren mit: pip install requests")
    sys.exit(1)


# iTunes Search API Endpoint
ITUNES_SEARCH_URL = "https://itunes.apple.com/search"


def search_apple_music(artist, title, year=None, max_retries=3):
    """Suche einen Track in der iTunes/Apple Music API."""
    
    # Erstelle Suchbegriff
    query = f"{artist} {title}"
    
    params = {
        'term': query,
        'media': 'music',
        'entity': 'song',
        'limit': 5,
        'country': 'DE'  # Für deutsche Apple Music Links
    }
    
    # Headers um wie ein Browser auszusehen
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.get(ITUNES_SEARCH_URL, params=params, headers=headers, timeout=10)
            
            # Zeige Request URL
            print(f"   🌐 Request: {response.url}")
            print(f"   📡 Status: {response.status_code}")
            
            # Wenn 429 (Too Many Requests) oder 403 (Forbidden), warte länger
            if response.status_code in [429, 403]:
                wait_time = (attempt + 1) * 5  # Längere Wartezeit
                print(f"   ⏳ Rate Limit/Forbidden (Code {response.status_code}), warte {wait_time} Sekunden...")
                time.sleep(wait_time)
                continue
            
            response.raise_for_status()
            data = response.json()
            
            results = data.get('results', [])
            print(f"   📊 Gefundene Ergebnisse: {len(results)}")
            
            if not results:
                print("   ⚠️  Keine Ergebnisse gefunden")
                return None
            
            # Zeige alle gefundenen Ergebnisse
            print("   📋 Gefundene Tracks:")
            for idx, result in enumerate(results, 1):
                print(f"      {idx}. {result.get('artistName')} - {result.get('trackName')} ({result.get('releaseDate', 'N/A')[:4]})")
            
            # Versuche bestes Match zu finden
            for result in results:
                result_artist = result.get('artistName', '').lower()
                result_title = result.get('trackName', '').lower()
                
                # Einfaches Matching
                if (artist.lower() in result_artist or result_artist in artist.lower()) and \
                   (title.lower() in result_title or result_title in title.lower()):
                    
                    track_id = result.get('trackId')
                    track_url = result.get('trackViewUrl', '')
                    
                    # Konvertiere zu music.apple.com URL
                    if track_id:
                        apple_music_url = f"https://music.apple.com/de/song/{track_id}"
                        print(f"   ✅ Perfektes Match gefunden!")
                        print(f"   🎵 Track: {result.get('artistName')} - {result.get('trackName')}")
                        print(f"   🔗 URL: {apple_music_url}")
                        return {
                            'id': str(track_id),
                            'uri': apple_music_url,
                            'name': result.get('trackName'),
                            'artist': result.get('artistName')
                        }
            
            # Falls kein perfektes Match, nimm erstes Ergebnis
            if results:
                result = results[0]
                track_id = result.get('trackId')
                if track_id:
                    apple_music_url = f"https://music.apple.com/de/song/{track_id}"
                    print(f"   ⚠️  Unsicheres Match - nehme erstes Ergebnis")
                    print(f"   🎵 Track: {result.get('artistName')} - {result.get('trackName')}")
                    print(f"   🔗 URL: {apple_music_url}")
                    return {
                        'id': str(track_id),
                        'uri': apple_music_url,
                        'name': result.get('trackName'),
                        'artist': result.get('artistName'),
                        'fuzzy': True  # Markiere als unsicheres Match
                    }
            
            return None
            
        except requests.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2
                print(f"   ⚠️  API Fehler (Versuch {attempt + 1}/{max_retries}): {e}")
                print(f"   ⏳ Warte {wait_time} Sekunden...")
                time.sleep(wait_time)
            else:
                print(f"   ⚠️  API Fehler nach {max_retries} Versuchen: {e}")
                return None
    
    return None


def update_hitster_json(json_path):
    """Update die hitster JSON mit Apple Music IDs."""
    
    print(f"\n{'='*80}")
    print(f"📁 Datei: {json_path.name}")
    print(f"{'='*80}\n")
    
    # Lade JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cards = data.get('cards', [])
    print(f"📊 {len(cards)} Karten in {json_path.name}")
    
    # Update Karten
    updated_count = 0
    not_found_count = 0
    skipped_count = 0
    fuzzy_count = 0
    
    for i, card in enumerate(cards, 1):
        artist = card.get('artist', '')
        title = card.get('title', '')
        year = card.get('year', '')
        card_id = card.get('cardId', card.get('id', ''))
        
        # Überspringe wenn bereits Apple Music ID vorhanden
        existing_apple = card.get('apple', {})
        if existing_apple.get('id') and existing_apple.get('uri'):
            skipped_count += 1
            if i % 10 == 0:
                print(f"⏭️  [{i}/{len(cards)}] Bereits vorhanden: {artist} - {title}")
            continue
        
        print(f"🔍 [{i}/{len(cards)}] Suche: {artist} - {title} ({year})")
        
        # Suche in Apple Music
        result = search_apple_music(artist, title, year)
        
        if result:
            # Erstelle apple Objekt falls nicht vorhanden
            if 'apple' not in card:
                card['apple'] = {}
            
            card['apple']['id'] = result['id']
            card['apple']['uri'] = result['uri']
            
            updated_count += 1
            
            if result.get('fuzzy'):
                fuzzy_count += 1
                print(f"   ⚠️  Unsicheres Match: {result['artist']} - {result['name']}")
            else:
                print(f"   ✅ Gefunden: {result['uri']}")
        else:
            not_found_count += 1
            print("   ❌ Nicht gefunden")
        
        # Rate Limiting: Warte länger zwischen Requests (2 Sekunden)
        time.sleep(2.0)
        
        # Alle 10 Requests eine längere Pause
        if i % 10 == 0:
            print(f"   ⏸️  Längere Pause nach {i} Requests (5 Sekunden)...")
            time.sleep(5.0)
    
    # Speichere JSON
    backup_path = json_path.parent / f"{json_path.stem}.apple-backup.json"
    
    print(f"\n💾 Erstelle Backup: {backup_path.name}")
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"💾 Speichere aktualisierte Datei: {json_path.name}")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✨ Zusammenfassung:")
    print(f"   - Gesamt: {len(cards)} Karten")
    print(f"   - Aktualisiert: {updated_count}")
    print(f"   - Nicht gefunden: {not_found_count}")
    print(f"   - Übersprungen (bereits vorhanden): {skipped_count}")
    if fuzzy_count > 0:
        print(f"   - Unsichere Matches: {fuzzy_count}")
    
    return updated_count


def main():
    # Pfad zum data Verzeichnis
    data_dir = Path(__file__).parent.parent / "src" / "data"
    
    if not data_dir.exists():
        print(f"❌ Verzeichnis nicht gefunden: {data_dir}")
        sys.exit(1)
    
    # Finde alle hitster JSON Dateien (ohne backup)
    json_files = [
        f for f in data_dir.glob("hitster-*.json")
        if not f.stem.endswith('backup') and not f.stem.endswith('apple-backup')
    ]
    
    if not json_files:
        print("❌ Keine hitster JSON Dateien gefunden")
        sys.exit(1)
    
    print(f"📂 Gefundene Dateien: {len(json_files)}")
    for f in json_files:
        print(f"   - {f.name}")
    
    # Verarbeite alle Dateien
    total_updated = 0
    
    for json_path in sorted(json_files):
        try:
            updated = update_hitster_json(json_path)
            total_updated += updated
        except Exception as e:
            print(f"❌ Fehler bei {json_path.name}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    print(f"\n{'='*80}")
    print(f"🎉 Fertig! Insgesamt {total_updated} Karten über alle Dateien aktualisiert")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()
