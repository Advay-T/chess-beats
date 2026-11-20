# Plan: open work

Only work that is still to do. Lasting rules and facts live in `CLAUDE.md`; delete items here when
they are done.

## To check on real devices

- [ ] **iPhone audio.** Confirm the fixes in `audio.js` on a real iPhone:
  - with the ring/silent switch on, pressing play is audible;
  - after locking and unlocking (or switching apps) mid-game, sound comes back;
  - the library's ▶ Preview plays.

  If a case is still silent, note which one. The fallback (a silent looping `<audio>` element) may
  need adjusting.
- [ ] **Phone layout of the new header logo** on the player and library pages. Only desktop width
  was checked in a browser; the landing page was checked at 390px.
- [ ] **Reduced motion on the landing page.** It should rest on the final position with no marquee,
  float or grain. The browser tools used so far couldn't emulate the setting.

## To do

- [ ] **README file list** is missing `pieces.js`, `sling.js`, `brand/` and `tools/logo/`, and
  `background.js` is described only for the player (the landing page uses it too).
