# Rewind: remove songs from Spotify playlists, faster
Next.js 15 + TypeScript. Spotify PKCE login; tokens in an encrypted httpOnly cookie. No database.

## Setup
1. Spotify **Premium** is required for Development Mode app owners.
2. https://developer.spotify.com/dashboard -> Create app -> Web API.
3. Redirect URI: `http://127.0.0.1:3000/api/auth/callback` (not `localhost`).
4. User Management: add each user's Spotify email (max 5 in Development Mode).
5. `cp .env.example .env.local`; set SPOTIFY_CLIENT_ID and `SESSION_SECRET=$(openssl rand -base64 32)`.
6. `npm install && npm run dev` -> http://127.0.0.1:3000

## Notes
- Scopes: playlist read/modify plus user-library read/modify (for Liked Songs).
- Playlist endpoints used: GET /me/playlists, GET|POST|DELETE /playlists/{id}/items (names per Spotify's Feb 2026 migration). Unverified by me: confirm against the current docs, all calls live in app/api/.
- Removing a song removes every copy of it in that playlist (Spotify matches by URI).
- Undo re-adds songs at the end of the playlist; original position and date-added are lost.
