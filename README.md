# ♞ Chess Music

Turn any chess game into music. Every move plays a note; captures, checks, castling, promotions and checkmate get their own sounds.

## Using it

1. Double-click `index.html` (any modern browser; needs internet the first time to load chess.js and Tone.js from a CDN).
2. Pick a game from the dropdown, or open **Load your own PGN** to paste one or upload a `.pgn` file.
3. Press **▶**. Change tempo, key, scale and layers any time, even while it plays.

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

## How the whole game shapes the music

Before playing, the app analyses the entire game (material, tension and phase after every move). Four layers use that, and each has a checkbox so you can switch it off and hear what it adds:

| Layer | What you hear |
|---|---|
| **Motion** | Knights leap (grace note on the start square, then the landing square). Rooks, bishops and queens moving 3+ squares glide up or down to their destination. Long moves ring longer. |
| **Harmony** | A soft background pad. Its chord follows the material balance: level = open sus2 chord, White ahead = bright major chord, Black ahead = minor chord, a sudden swing of 3+ points = a tense chord. |
| **Groove** | A beat that follows tension (captures, checks and how many captures are available). Calm = silence → hi-hats → kick + bass → full beat with snare. |
| **Phase** | Opening: sparse and dry. Middlegame: everything on. Endgame: slower, with echo and more reverb. |

**Auto key and tempo.** With Key and Scale on *Auto*, each game picks its own: tactical games (lots of captures and checks) go minor at 140 BPM, positional games major at 90 BPM, and the key comes from the opening moves, so games with the same opening share a key. Pick any key, scale or tempo to override.

**Timeline.** The strip under the board shows the shape of the game: background colour = phase, orange area = tension, white line = material (up = White ahead, down = Black ahead), red ticks = captures, yellow ticks = checks. Click it to jump to that point.

Try the two built-in games back to back: the **Immortal Game** (1851) is a storm of captures and checks ending in mate, while **Karpov vs Unzicker** (1974) is a slow positional squeeze that ends in resignation. You'll hear the difference.

## Files

- `index.html`, `style.css`: page and layout
- `app.js`: board, PGN loading, move list, playback
- `music.js`: move → notes mapping, including the motion melody (pure logic)
- `analysis.js`: whole-game pass: material, tension, phase, profile and auto key/tempo (pure logic)
- `arrangement.js`: pad chord, groove and effects for each move (pure logic)
- `audio.js`: Tone.js instruments
- `background.js`: animated glass background (WebGL). Its lit edges turn from cyan to amber as tension rises. The shader is adapted from GlassFold in [GradFlow](https://gradflow.meerbahadin.dev).
- `games.js`: built-in games

## Tests (optional, for developers)

```
npm install
npm test
```

This checks the note mapping, the game analysis and the arrangement, and that both built-in games replay legally. The app itself needs no install or build step.
