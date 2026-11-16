MUSICBOX v28

Files for the Musicbox repo (root): index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png
Also in the zip, unchanged: scripts/sync.mjs and .github/workflows/listening.yml (background Listening job).
optional/Shelf-sw.js: replaces sw.js in the Shelf repo so Shelf stops deleting Musicbox's offline cache.

Firestore rules live in the Libraries repo only. Nothing to publish for this version.

1. GitHub, Musicbox repo: Add file > Upload files, drop index.html and sw.js (the other files are unchanged), commit.
   If you delete firestore.rules from the Musicbox repo, do it in GitHub: open the file, trash can icon, commit.
2. Open https://annoyingkay.github.io/Musicbox/ and reload twice.
