# Source PGNs

## Books

These files are copied unchanged from [brianerdelyi/ChessPGN](https://github.com/brianerdelyi/ChessPGN), released under **CC0 1.0** (public domain dedication).

| File | Book |
|---|---|
| `fischer-60.pgn` | Fischer, Bobby. *My 60 Memorable Games.* New York, Simon & Schuster, 1969 |
| `tal.pgn` | Tal, Mikhail. *The Life and Games of Mikhail Tal.* RHM, 1976 |

Only the moves and game headers are used (no book commentary).

`tal.pgn` is malformed in places (tags and games run together, move numbers glued onto moves, one tag missing its `[E`). `tools/pgn-normalize.js` repairs this at build time; the originals are left as-is so they can be re-synced from upstream.

## PGN Mentor selection

`pgnmentor-selected.pgn` is **generated** by `npm run fetch:pgnmentor`. It holds 840 games picked from the player files at [pgnmentor.com](https://www.pgnmentor.com/files.html). Each game is tagged `[Collection "<id>"]`. See `tools/collections.js` for the players and quotas, and `tools/pgn-select.js` for how games are chosen. The downloaded ZIPs are cached in `data/cache/pgnmentor/`, which isn't committed.

Regenerate `library.js` after changing anything here:

```
npm run build:library
```
