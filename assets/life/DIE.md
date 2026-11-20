# die.glb / hand.glb / hand_closed.glb — orientation contract

## die.glb
- Rounded cube, edge 1.0 unit, **origin at the cube centre** (extends -0.5..+0.5 on every axis).
- Materials: `DieWhite` (body), `DiePip` (dark inset pips). Opposite faces sum to 7 (verified from the GLB).
- Face → number, in **glTF / three.js local axes** (Y-up):

| local axis (outward normal) | number |
|---|---|
| +Y (up)    | 1 |
| -Y (down)  | 6 |
| +Z (front) | 2 |
| -Z (back)  | 5 |
| +X (right) | 3 |
| -X (left)  | 4 |

So with 1 on top and 2 facing the camera (+Z), 3 is on the right (a standard "right-handed" die).
To show result `n` on top (+Y world) with identity yaw, rotate the die by:
- 1: (0,0,0)
- 2: rotate X by -90° (front face +Z goes up)
- 3: rotate Z by +90° (+X goes up)
- 4: rotate Z by -90° (-X goes up)
- 5: rotate X by +90° (-Z goes up)
- 6: rotate X by 180°
(three.js Euler, radians: e.g. `die.rotation.set(-Math.PI/2,0,0)` for 2). Any extra yaw around world Y keeps the result.

## hand.glb (open, "just released") / hand_closed.glb (holding fist)
- Same scale and origin in both. **Origin = wrist** (back edge of the white cuff).
- glTF axes: **fingers point +Z**, **palm faces down (-Y)**, back of the hand (with 3 stitch lines) faces +Y, **thumb on +X**.
  (Read "palm facing down" as -Y in Y-up glTF; if you want the palm toward -Z instead, rotate the hand X by -90°.)
- Length: open hand 1.16 along +Z (width 0.87, thickness 0.52); fist 0.83 along +Z.
- Materials: `HandGlove` (golden glove), `HandCuff` (white cuff), `HandLine` (stitch lines).
