# Attribution and licences

The game is a static site (GitHub Pages, base `/rat-race-game/`). Everything it loads at run time is served from this
repository: no CDN, no hotlinked fonts or models. (The only network calls are to the game's own Supabase backend.)

## Third-party code and fonts shipped with the game

| What | Version | Where | Licence | Source |
|---|---|---|---|---|
| three.js (core, minified ES module build) | 0.170.0 | `vendor/three/build/three.module.min.js` | MIT, `vendor/three/LICENSE` | npm `three@0.170.0` |
| three.js addons: `controls/OrbitControls.js`, `loaders/GLTFLoader.js`, `environments/RoomEnvironment.js`, `utils/BufferGeometryUtils.js` | 0.170.0 | `vendor/three/examples/jsm/` | MIT (same file) | npm `three@0.170.0` |
| Rubik (variable, weights 300–900; Hebrew and Latin subsets) | Fontsource 5.3.0 | `vendor/fonts/rubik-*-wght-normal.woff2` | SIL Open Font License 1.1, `vendor/fonts/OFL-Rubik.txt` | npm `@fontsource-variable/rubik@5.3.0` (Copyright 2015 The Rubik Project Authors) |
| Secular One (400; Hebrew and Latin subsets) | Fontsource 5.3.0 | `vendor/fonts/secular-one-*-400-normal.woff2` | SIL Open Font License 1.1, `vendor/fonts/OFL-SecularOne.txt` | npm `@fontsource/secular-one@5.3.0` (Copyright 2016 The Secular One Project Authors) |

Notes:
- The files are unmodified copies from the npm packages. The fonts are the subset files Fontsource publishes (the same
  Hebrew / Latin split Google Fonts serves); the `@font-face` rules are in `css/stability.css`.
- Only the addons the game imports are vendored. `tests/fallback_reasons.test.mjs` fails if a module imports a
  `three/addons/…` file that is not under `vendor/three/examples/jsm/`.
- Upgrading three.js: replace the files under `vendor/three/` from the new npm package (same paths, like every other file of
  the site; GitHub Pages revalidates them with ETags), update `vendor/three/VERSION`, this table and the version check in
  `tests/fallback_reasons.test.mjs`. The paths stay `…/three/build/…` and `…/three/examples/jsm/…`, which the browser tests
  (`tests/stability_e2e.py` S2/S3) block to simulate a failed or slow download.

## The game's own assets

- 3D models (`assets/**/*.glb`), card art (`assets/**/*.png|webp`): made for this game in Blender from the scripts in
  `blender/` (`build_*.py`, `rr_lib.py`). Owned by the project; no third-party models or textures.
- Sound effects: synthesised at run time with the Web Audio API (`js/audio.js`); no audio files.
- Icons: inline SVG and emoji drawn by the browser's own emoji font.

## Test-only tools (not shipped to players)

- axe-core 4.14.1, `tests/vendor/axe-core/` — Mozilla Public License 2.0 (`tests/vendor/axe-core/LICENSE`). Used by
  `tests/a11y_e2e.py` only.
