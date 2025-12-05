#!/usr/bin/env python3
"""
Script to update Spotify IDs in hitster-de-aaaa0015.json from a Spotify playlist.

Requirements:
    pip install spotipy

Setup:
    1. Go to https://developer.spotify.com/dashboard
    2. Create an app and get your Client ID and Client Secret
    3. Set environment variables:
       export SPOTIFY_CLIENT_ID='your_client_id'
       export SPOTIFY_CLIENT_SECRET='your_client_secret'
"""

import json
import os
import sys
from pathlib import Path

try:
    import spotipy
    from spotipy.oauth2 import SpotifyClientCredentials
except ImportError:
    print("❌ spotipy nicht installiert. Bitte installieren mit: pip install spotipy")
    sys.exit(1)


def get_playlist_tracks(playlist_id):
    """Hole alle Tracks von einer Spotify Playlist."""
    
    # Spotify API Client
    client_id = os.getenv('SPOTIFY_CLIENT_ID')
    client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
    
    if not client_id or not client_secret:
        print("❌ SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET müssen als Umgebungsvariablen gesetzt sein")
        print("   Siehe: https://developer.spotify.com/dashboard")
        sys.exit(1)
    
    auth_manager = SpotifyClientCredentials(
        client_id=client_id,
        client_secret=client_secret
    )
    sp = spotipy.Spotify(auth_manager=auth_manager)
    
    print(f"🎵 Lade Playlist {playlist_id}...")
    
    results = sp.playlist_tracks(playlist_id)
    tracks = results['items']
    
    # Pagination falls mehr als 100 Tracks
    while results['next']:
        results = sp.next(results)
        tracks.extend(results['items'])
    
    print(f"✅ {len(tracks)} Tracks gefunden")
    
    return tracks


def update_hitster_json(json_path, playlist_id):
    """Update die hitster-de-aaaa0015.json mit Spotify IDs aus der Playlist."""
    
    # Lade JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cards = data.get('cards', [])
    print(f"📊 {len(cards)} Karten in {json_path.name}")
    
    # Hole Playlist Tracks
    tracks = get_playlist_tracks(playlist_id)
    
    # Erstelle ein Dict für schnelleres Matching
    track_dict = {}
    for track in tracks:
        if track['track']:
            track_info = track['track']
            key = f"{track_info['name']}_{track_info['artists'][0]['name']}".lower()
            track_dict[key] = track_info
    
    # Update Karten
    updated_count = 0
    
    for card in cards:
        # Suche passenden Track
        card_key = f"{card.get('title', '')}_{card.get('artist', '')}".lower()
        
        if card_key in track_dict:
            track_info = track_dict[card_key]
            
            # Update Spotify Felder
            old_id = card.get('spotifyId', '')
            track_id = track_info['id']
            
            # Hole die external_urls für die korrekte Spotify Web URL
            spotify_web_url = track_info.get('external_urls', {}).get('spotify', '')
            if not spotify_web_url:
                # Fallback auf Standard-URL
                spotify_web_url = f"https://open.spotify.com/track/{track_id}"
            
            card['spotifyId'] = track_id
            card['spotifyUri'] = track_info['uri']  # Format: spotify:track:ID
            card['spotifyUrl'] = spotify_web_url  # Originale Spotify Web URL
            
            if old_id != track_id:
                updated_count += 1
                print(f"✅ {card.get('cardId')}: {card.get('artist')} - {card.get('title')}")
                print(f"   URL: {spotify_web_url}")
    
    # Speichere JSON
    backup_path = json_path.parent / f"{json_path.stem}.backup.json"
    
    print(f"\n💾 Erstelle Backup: {backup_path}")
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"💾 Speichere aktualisierte Datei: {json_path}")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n✨ {updated_count} Karten aktualisiert")
    print("📊 Statistik:")
    print(f"   - Gesamt: {len(cards)} Karten")
    print(f"   - Aktualisiert: {updated_count}")
    print(f"   - Unverändert: {len(cards) - updated_count}")


def main():
    # Playlist ID aus URL extrahieren
    playlist_url = "https://open.spotify.com/playlist/2u0vgWYqU1TWVcDehJnZuN"
    playlist_id = playlist_url.split('/')[-1].split('?')[0]
    
    print(f"🎵 Spotify Playlist ID: {playlist_id}")
    
    # Pfad zur JSON-Datei
    json_path = Path(__file__).parent.parent / "src" / "data" / "hitster-de-aaaa0015.json"
    
    if not json_path.exists():
        print(f"❌ Datei nicht gefunden: {json_path}")
        sys.exit(1)
    
    print(f"📁 JSON-Datei: {json_path}\n")
    
    # Update durchführen
    update_hitster_json(json_path, playlist_id)


if __name__ == "__main__":
    main()
