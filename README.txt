MUSICBOX v35

Upload to the Musicbox repo (root): index.html, sw.js
Nothing else changed. No Firestore rules change.

1. GitHub, Musicbox repo: Add file > Upload files, drop index.html and sw.js, commit.
2. Open https://annoyingkay.github.io/Musicbox/ and reload twice.
   Settings should show "Musicbox version 35".
3. Stats > Listening > Setup > "Remove double counted plays". Run once.

What changed: songs are counted by title and artist (all versions together), and plays seen
by both the import and Sync are no longer counted twice.
