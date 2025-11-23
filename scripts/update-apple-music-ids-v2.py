#!/usr/bin/env python3
"""
Script to update Apple Music IDs in hitster JSON files using iTunes Search API.
Mit Steuerdatei für fehlgeschlagene Suchen.

Requirements:
    pip install requests

Usage:
    python update-apple-music-ids-v2.py <json-file>                    # Verarbeite eine spezifische Datei
    python update-apple-music-ids-v2.py <json-file> --retry           # Nur fehlgeschlagene dieser Datei
    
Beispiele:
    python update-apple-music-ids-v2.py hitster-de.json
    python update-apple-music-ids-v2.py hitster-de-aaaa0007.json --retry
"""

import json
import sys
import time
import signal
from pathlib import Path
from urllib.parse import quote

try:
    import requests
except ImportError:
    print("❌ requests nicht installiert. Bitte installieren mit: pip install requests")
    sys.exit(1)


# iTunes Search API Endpoint
ITUNES_SEARCH_URL = "https://itunes.apple.com/search"

# Scripts-Verzeichnis
SCRIPT_DIR = Path(__file__).parent


def get_failed_searches_file(json_filename):
    """Gibt den Pfad zur Failed-Searches-Datei für eine bestimmte JSON-Datei zurück"""
    # Entferne .json und hänge -failed-searches.json an
    base_name = json_filename.replace('.json', '')
    return SCRIPT_DIR / f"{base_name}-failed-searches.json"


def load_failed_searches(failed_searches_file):
    """Lädt die Liste der fehlgeschlagenen Suchen"""
    if failed_searches_file.exists():
        with open(failed_searches_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"failed_searches": [], "updated": time.strftime("%Y-%m-%d %H:%M:%S")}


def save_failed_searches(failed_data, failed_searches_file, verbose=False):
    """Speichert die Liste der fehlgeschlagenen Suchen"""
    failed_data["updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(failed_searches_file, 'w', encoding='utf-8') as f:
        json.dump(failed_data, f, indent=2, ensure_ascii=False)
    if verbose:
        print(f"💾 Fehlgeschlagene Suchen gespeichert: {failed_searches_file}")


def add_failed_search(failed_data, failed_searches_file, json_file, card_id, artist, title, year, reason, search_url=None):
    """Fügt eine fehlgeschlagene Suche zur Steuerdatei hinzu und speichert sofort"""
    failed_entry = {
        "json_file": json_file,
        "card_id": card_id,
        "artist": artist,
        "title": title,
        "year": year,
        "reason": reason,
        "search_url": search_url,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    # Prüfe ob bereits vorhanden (dann update)
    found = False
    for entry in failed_data["failed_searches"]:
        if entry["json_file"] == json_file and entry["card_id"] == card_id:
            entry.update(failed_entry)
            found = True
            break
    
    # Neue Suche hinzufügen
    if not found:
        failed_data["failed_searches"].append(failed_entry)
    
    # Speichere sofort nach jedem Fail
    save_failed_searches(failed_data, failed_searches_file)


def remove_failed_search(failed_data, failed_searches_file, json_file, card_id):
    """Entfernt eine erfolgreiche Suche aus der Steuerdatei und speichert sofort"""
    failed_data["failed_searches"] = [
        entry for entry in failed_data["failed_searches"]
        if not (entry["json_file"] == json_file and entry["card_id"] == card_id)
    ]
    
    # Speichere sofort nach jeder erfolgreichen Suche (entfernt aus Failed-Liste)
    save_failed_searches(failed_data, failed_searches_file)


def clean_search_term(text):
    """Bereinigt Sonderzeichen für bessere iTunes-Suche"""
    # Ersetze problematische Zeichen
    replacements = {
        '&': 'and',
        '+': 'and',
        '/': ' ',
        '|': ' ',
        '(': '',
        ')': '',
        '[': '',
        ']': '',
        '{': '',
        '}': '',
        '"': '',
        "'": '',
        '!': '',
        '?': '',
        ':': '',
        ';': '',
        ',': '',
        '.': '',
        '_': ' ',
        '#': '',
        '@': '',
        '*': '',
        '=': ''
    }
    
    result = text
    for old, new in replacements.items():
        result = result.replace(old, new)
    
    # Entferne mehrfache Leerzeichen
    result = ' '.join(result.split())
    return result


def search_apple_music(artist, title, year=None):
    """Suche einen Track in der iTunes/Apple Music API - ein Versuch ohne Retry.
    
    Returns:
        dict mit 'id', 'uri', 'name', 'artist', optional 'fuzzy', und 'search_url'
        oder None bei Fehler
    """
    
    # Bereinige Suchbegriffe
    clean_artist = clean_search_term(artist)
    clean_title = clean_search_term(title)
    query = f"{clean_artist} {clean_title}"
    
    print(f"   🔍 Original: {artist} - {title}")
    if clean_artist != artist or clean_title != title:
        print(f"   🧹 Bereinigt: {clean_artist} - {clean_title}")
    
    params = {
        'term': query,
        'media': 'music',
        'entity': 'song',
        'limit': 5,
        'country': 'DE'
    }
    
    # Headers exakt wie Safari auf macOS
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    try:
        response = requests.get(ITUNES_SEARCH_URL, params=params, headers=headers, timeout=10)
        
        # Zeige Request URL
        search_url = response.url
        print(f"   🌐 Request: {search_url}")
        print(f"   📡 Status: {response.status_code}")
        
        # Wenn 429 (Too Many Requests) oder 403 (Forbidden)
        if response.status_code in [429, 403]:
            print(f"   ❌ Rate Limit/Forbidden (Code {response.status_code})")
            return {'error': True, 'search_url': search_url, 'status_code': response.status_code}
        
        response.raise_for_status()
        data = response.json()
        
        results = data.get('results', [])
        print(f"   📊 Gefundene Ergebnisse: {len(results)}")
        
        if not results:
            print("   ⚠️  Keine Ergebnisse gefunden")
            return {'error': True, 'search_url': search_url, 'message': 'no_results'}
        
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
                
                if track_id:
                    apple_music_url = f"https://music.apple.com/de/song/{track_id}"
                    print(f"   ✅ Perfektes Match gefunden!")
                    print(f"   🎵 Track: {result.get('artistName')} - {result.get('trackName')}")
                    print(f"   🔗 URL: {apple_music_url}")
                    return {
                        'id': str(track_id),
                        'uri': apple_music_url,
                        'name': result.get('trackName'),
                        'artist': result.get('artistName'),
                        'search_url': search_url
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
                    'fuzzy': True,
                    'search_url': search_url
                }
        
        return {'error': True, 'search_url': search_url, 'message': 'no_match'}
        
    except requests.RequestException as e:
        print(f"   ❌ API Fehler: {e}")
        # Versuche search_url zu konstruieren falls vorhanden
        try:
            import urllib.parse
            query = f"{clean_artist} {clean_title}"
            params_str = urllib.parse.urlencode({'term': query, 'media': 'music', 'entity': 'song', 'limit': 5, 'country': 'DE'})
            constructed_url = f"{ITUNES_SEARCH_URL}?{params_str}"
            return {'error': True, 'search_url': constructed_url, 'message': str(e)}
        except:
            return {'error': True, 'search_url': None, 'message': str(e)}


def update_hitster_json(json_path, retry_mode=False, failed_data=None, failed_searches_file=None):
    """Update die hitster JSON mit Apple Music IDs.
    
    Args:
        json_path: Pfad zur JSON-Datei
        retry_mode: Wenn True, werden nur Einträge aus failed_searches verarbeitet
        failed_data: Dictionary mit fehlgeschlagenen Suchen
        failed_searches_file: Pfad zur Failed-Searches-Datei
    """
    
    print(f"\n{'='*80}")
    print(f"📁 Datei: {json_path.name}")
    if retry_mode:
        print("   🔄 RETRY-MODUS: Verarbeite nur fehlgeschlagene Suchen")
    print(f"{'='*80}\n")
    
    # Lade JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cards = data.get('cards', [])
    json_filename = json_path.name
    
    # Im Retry-Modus: Erstelle Set von Card-IDs die bearbeitet werden sollen
    retry_card_ids = set()
    if retry_mode:
        retry_card_ids = {
            entry["card_id"] for entry in failed_data["failed_searches"]
            if entry["json_file"] == json_filename
        }
        if not retry_card_ids:
            print(f"   ℹ️  Keine fehlgeschlagenen Suchen für diese Datei")
            return 0, 0, 0, 0
    
    print(f"📊 {len(cards)} Karten in {json_filename}")
    if retry_mode:
        print(f"   🔄 Davon zu wiederholen: {len(retry_card_ids)}")
    
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
        
        # Überspringe IMMER wenn bereits Apple Music ID vorhanden (auch im Retry-Modus)
        existing_apple = card.get('apple', {})
        if existing_apple.get('id') and existing_apple.get('uri'):
            skipped_count += 1
            continue
        
        # Im Retry-Modus: Überspringe Cards die nicht in der Failed-Liste sind
        if retry_mode and card_id not in retry_card_ids:
            continue
        
        # Prüfe auf fehlende Daten
        if not artist or not title:
            print(f"⚠️  [{i}/{len(cards)}] Überspringe Card {card_id}: Fehlende Artist/Title Daten")
            add_failed_search(
                failed_data,
                failed_searches_file,
                json_filename,
                card_id,
                artist,
                title,
                year,
                "Fehlende Artist/Title Daten"
            )
            skipped_count += 1
            continue
        
        print(f"🔍 [{i}/{len(cards)}] Card {card_id}: {artist} - {title} ({year})")
        
        # Suche in Apple Music (mit kleinem Random-Delay zur Tarnung)
        import random
        delay = 2.0 + random.uniform(0, 1.0)  # 2-3 Sekunden
        if i > 1:  # Nicht beim ersten Request warten
            print(f"   ⏸️  Warte {delay:.1f} Sekunden...")
            time.sleep(delay)
        
        result = search_apple_music(artist, title, year)
        
        # Prüfe ob Fehler oder Erfolg
        if result and not result.get('error'):
            # Erfolgreiche Suche
            if 'apple' not in card:
                card['apple'] = {}
            
            card['apple']['id'] = result['id']
            card['apple']['uri'] = result['uri']
            
            updated_count += 1
            
            if result.get('fuzzy'):
                fuzzy_count += 1
            
            # Entferne aus Failed-Liste wenn erfolgreich
            remove_failed_search(failed_data, failed_searches_file, json_filename, card_id)
            
            print(f"   ✅ Gespeichert in Card")
        else:
            # Fehlgeschlagene Suche
            not_found_count += 1
            print("   ❌ Nicht gefunden")
            
            # Bestimme Fehlergrund und URL
            if result:
                search_url = result.get('search_url')
                if result.get('status_code') in [403, 429]:
                    reason = f"Rate Limit/Forbidden (HTTP {result.get('status_code')})"
                elif result.get('message') == 'no_results':
                    reason = "Keine iTunes-Suche Ergebnisse"
                elif result.get('message') == 'no_match':
                    reason = "Kein passendes Match gefunden"
                else:
                    reason = f"API Fehler: {result.get('message', 'Unbekannt')}"
            else:
                search_url = None
                reason = "Keine Antwort von iTunes API"
            
            # Füge zu Failed-Liste hinzu
            add_failed_search(
                failed_data,
                failed_searches_file,
                json_filename,
                card_id,
                artist,
                title,
                year,
                reason,
                search_url
            )
        
        # Längere Pause alle 5 Requests
        if (i % 5 == 0):
            print(f"   ⏸️  Längere Pause nach {i} Requests (10 Sekunden)...")
            time.sleep(10.0)
    
    # Speichere JSON nur wenn Updates gemacht wurden
    if updated_count > 0:
        backup_path = json_path.parent / f"{json_path.stem}.apple-backup.json"
        
        print(f"\n💾 Erstelle Backup: {backup_path.name}")
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Speichere aktualisierte Datei: {json_path.name}")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✨ Zusammenfassung für {json_filename}:")
    print(f"   - Gesamt: {len(cards)} Karten")
    print(f"   - Aktualisiert: {updated_count}")
    print(f"   - Nicht gefunden: {not_found_count}")
    print(f"   - Übersprungen: {skipped_count}")
    if fuzzy_count > 0:
        print(f"   - Unsichere Matches: {fuzzy_count}")
    
    return updated_count, not_found_count, skipped_count, fuzzy_count


def main():
    # Prüfe Kommandozeilen-Argumente
    if len(sys.argv) < 2:
        print("❌ Fehler: Keine JSON-Datei angegeben!")
        print()
        print("Usage:")
        print("  python update-apple-music-ids-v2.py <json-file> [--retry]")
        print()
        print("Beispiele:")
        print("  python update-apple-music-ids-v2.py hitster-de.json")
        print("  python update-apple-music-ids-v2.py hitster-de-aaaa0007.json --retry")
        sys.exit(1)
    
    # Hole Dateinamen aus Argument
    json_filename = sys.argv[1]
    retry_mode = "--retry" in sys.argv or "-r" in sys.argv
    
    print("⚠️  Hinweis: iTunes API ist sehr restriktiv!")
    print("   - Verwende Safari-identische Headers")
    print("   - Ein Versuch pro Song (kein Retry)")
    print("   - Längere Pausen zwischen Requests (2-3 Sek + Random)")
    print("   - Extra Pause alle 5 Requests (10 Sek)")
    print("   - Bei 403: Script pausieren und später mit --retry fortfahren\n")
    
    # Bestimme Failed-Searches-Datei für diese JSON
    failed_searches_file = get_failed_searches_file(json_filename)
    
    # Lade Failed-Searches früh, damit wir sie bei Ctrl+C speichern können
    failed_data = load_failed_searches(failed_searches_file)
    
    # Signal Handler für Ctrl+C
    def signal_handler(sig, frame):
        print("\n\n⚠️  Unterbrochen durch Benutzer (Ctrl+C)")
        print("✅ Fehlgeschlagene Suchen wurden bereits gespeichert!")
        print(f"   📋 Datei: {failed_searches_file}")
        print(f"   💡 Zum Fortfahren: python update-apple-music-ids-v2.py {json_filename} --retry")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    # Pfad zum data Verzeichnis
    data_dir = Path(__file__).parent.parent / "src" / "data"
    
    if not data_dir.exists():
        print(f"❌ Verzeichnis nicht gefunden: {data_dir}")
        sys.exit(1)
    
    # Prüfe ob angegebene Datei existiert
    json_path = data_dir / json_filename
    
    if not json_path.exists():
        print(f"❌ Datei nicht gefunden: {json_path}")
        print()
        print("Verfügbare Dateien:")
        available = [f.name for f in data_dir.glob("hitster-*.json") 
                    if not f.stem.endswith('backup') and not f.stem.endswith('apple-backup')]
        for fname in sorted(available):
            print(f"   - {fname}")
        sys.exit(1)
    
    print("🎵 Apple Music ID Updater (mit Steuerdatei)")
    print("=" * 80)
    print(f"📁 Ausgewählte Datei: {json_filename}")
    
    if retry_mode:
        print("🔄 RETRY-MODUS aktiviert")
        
        # Filtere nur fehlgeschlagene Suchen für diese Datei
        file_failures = [
            entry for entry in failed_data['failed_searches']
            if entry["json_file"] == json_filename
        ]
        
        print(f"   � Fehlgeschlagene Suchen für {json_filename}: {len(file_failures)}")
        
        if not file_failures:
            print("   ✅ Keine fehlgeschlagenen Suchen für diese Datei!")
            sys.exit(0)
    else:
        print("💡 Tipp: Verwende '--retry' um nur fehlgeschlagene Suchen zu wiederholen")
    
    print()
    
    # Verarbeite die angegebene Datei
    try:
        updated, not_found, skipped, fuzzy = update_hitster_json(
            json_path,
            retry_mode=retry_mode,
            failed_data=failed_data,
            failed_searches_file=failed_searches_file
        )
    except Exception as e:
        print(f"❌ Fehler bei {json_filename}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Finales Speichern (eigentlich schon nach jedem Fail/Success gespeichert)
    save_failed_searches(failed_data, failed_searches_file, verbose=True)
    
    print(f"\n{'='*80}")
    print(f"✨ Zusammenfassung:")
    print(f"   � Datei: {json_filename}")
    print(f"   ✅ Aktualisiert: {updated}")
    print(f"   ❌ Nicht gefunden: {not_found}")
    print(f"   ⏭️  Übersprungen: {skipped}")
    if fuzzy > 0:
        print(f"   ⚠️  Unsichere Matches: {fuzzy}")
    
    # Info über Failed-Searches für diese Datei
    print()
    file_failures = [
        entry for entry in failed_data['failed_searches']
        if entry["json_file"] == json_filename
    ]
    
    if file_failures:
        print(f"📋 Fehlgeschlagene Suchen für {json_filename}: {len(file_failures)}")
        print(f"   💡 Zum Wiederholen: python update-apple-music-ids-v2.py {json_filename} --retry")
        
        # Zeige erste paar Beispiele
        if len(file_failures) > 0:
            print(f"\n   Beispiele:")
            for entry in file_failures[:5]:
                print(f"      - Card {entry['card_id']}: {entry['artist']} - {entry['title']}")
                print(f"        Grund: {entry['reason']}")
            if len(file_failures) > 5:
                print(f"      ... und {len(file_failures) - 5} weitere")
    else:
        print("✅ Alle Suchen für diese Datei erfolgreich!")
    
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()
