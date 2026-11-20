# ♞ Chess Music

Turn any chess game into music. Every move plays a note; captures, checks, castling, promotions and checkmate get their own sounds.

## Using it

1. Double-click `index.html` (any modern browser; needs internet the first time to load chess.js and Tone.js from a CDN).
2. Pick a game from the dropdown, or open **Load your own PGN** to paste one or upload a `.pgn` file.
3. Press **▶**. Change tempo, key and scale any time, even while it plays.

Keyboard: `Space` play/pause · `→` step forward (with sound) · `←` step back (silent) · `Home` / `End`.
Click any move in the move list to jump there.

## How moves become music

| Chess | Sound |
|---|---|
| Destination file a–h | Note in the pentatonic scale (a–e = degrees 1–5, f–h continue an octave up) |
| Destination rank 1–8 | Octave: ranks 1–2 low … ranks 7–8 high |
| White / Black | Bright triangle synth (left) / dark FM synth (right) |
| Pawn → Queen | 16th note, soft → half note, loud (knight/bishop 8th, rook/king quarter) |
| Capture | Louder note + snare |
| Check | Cymbal |
| Castling | Three-note chord |
| Promotion | Rising run |
| Checkmate | Big final hit (low chord + kick + cymbal) |
| Game ends without mate | Soft closing chord |

Try the two built-in games back to back: the **Immortal Game** (1851) is a storm of captures and checks ending in mate, while **Karpov vs Unzicker** (1974) is a slow positional squeeze that ends in resignation. You'll hear the difference.

## Files

- `index.html`, `style.css`: page and layout
- `app.js`: board, PGN loading, move list, playback
- `music.js`: move → notes mapping (pure logic)
- `audio.js`: Tone.js instruments
- `games.js`: built-in games

## Tests (optional, for developers)

```
npm install
npm test
```

This checks the note mapping and that both built-in games replay legally. The app itself needs no install or build step.
