MUSICBOX v9

Files for the Musicbox repo (root): index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png
Firebase console: publish firestore.rules (new vinylMeta block, needed for trophies to be saved)
optional/Shelf-sw.js: replaces sw.js in the Shelf repo so Shelf stops deleting Musicbox's offline cache.

1. GitHub, Musicbox repo: Add file > Upload files, drop the five files above, commit.
2. Firebase console > Firestore > Rules: paste firestore.rules, Publish.
3. Optional: upload optional/Shelf-sw.js to the Shelf repo as sw.js.
4. Open https://annoyingkay.github.io/Musicbox/ and reload twice.
