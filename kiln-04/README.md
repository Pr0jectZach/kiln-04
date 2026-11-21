# KILN // 04 

2D industrial precision platformer built on HTML5 Canvas, custom pixel-art sprite atlases, and sampled mechanical WAV foley.

Originally built for Web-Verse 2026 at Padre Conceicao College of Engineering.

## Running Locally

Open `index.html` in any modern browser. The operator console and technical spec manual are unified in a single-page workspace (press `Tab` or click `MANUAL [TAB]` to toggle the spec drawer without interrupting your audio session or game state).

 Note: `play.html` is also included as a direct entry point so existing bookmarks continue to work.

## What Changed in Rev 3.0

1. **Bitmap Sprite & Tile Atlas (`assets/sprites/atlas.png`):** Replaced raw geometric rect calls with a 256x128 pixel-art industrial sprite sheet featuring 5-frame chassis animation (idle, run stride, thruster burn, pneumatic slam), 2-frame tracked scrubbers, pulsing hex power cells, riveted catwalk tiles, hazard gantry tiles, and mechanical blast shutters.
2. **Sampled Mechanical Foley (`assets/audio/*.wav`):** Added 9 PCM `.wav` foley samples (`jump.wav`, `double_jump.wav`, `land.wav`, `slam.wav`, `cell.wav`, `crush.wav`, `unseal.wav`, `shear.wav`, `clear.wav`) preloaded by `SoundRig` with automatic procedural synth fallback if opened under strict `file://` CORS rules.
3. **Scrolling Deadzone Camera & Parallax Bore Shaft (`js/game.js`, `js/levels.js`):** Expanded all three sectors beyond the `800x450` viewport (`1280x640` to `1400x820`) with a smooth deadzone-tracking camera, multi-layer parallax bore columns, depth markers, and a live corner radar minimap.
4. **Swept Continuous Collision Detection (`js/game.js`):** Implemented substepped swept AABB collision resolution (`MAX_STEP_PX = 6`) along both X and Y axes so high-velocity pneumatic slams (`24+ px/frame`) never tunnel through thin `14px` catwalks.
5. **Unified Single-Page Console & Spec Drawer (`index.html`):** Merged the playable operator console and the technical specification manual into a single document with an interactive slide-over drawer (`[TAB]`), preserving Web Audio context state seamlessly.

## Sectors

| Sector | Designation | Dimensions | Layout Notes |
| :--- | :--- | :--- | :--- |
| 01 | SLAG PIT | `1280 x 600` | Multi-tier smelter floor, 10 power cells, 3 patrol scrubbers |
| 02 | GANTRY BAY | `1360 x 680` | Split drop pits, 3 reciprocating crane gantries, 12 cells, 5 scrubbers |
| 03 | HIGH STACK | `1200 x 820` | Deep vertical shaft climb, high-speed scrubbers, 13 cells, 6 scrubbers |

## Input

* `A` / `D` or `Left` / `Right` : Lateral chassis drive
* `Space` / `W` / `Up` : Thruster pulse (coyote grace frames, input buffer, variable ascent cut, and mid-air secondary burn)
* `S` / `Down` (airborne) : Pneumatic drop slam (swept CCD safe at high speed)
* `Tab` : Toggle Operator Manual & Live Monitor drawer
* `M` : Toggle audio mute
* `R` : Quick-reset active sector run

## Directory Layout

```text
kiln-04/
├── index.html                  # Unified operator console + slide-over spec manual
├── play.html                   # Direct console entry point
├── assets/
│   ├── sprites/
│   │   └── atlas.png           # 256x128 pixel-art sprite & tilemap atlas
│   └── audio/
│       ├── jump.wav            # Primary pneumatic jump sample
│       ├── double_jump.wav     # Secondary burn sample
│       ├── land.wav            # Steel catwalk landing clank
│       ├── slam.wav            # Pneumatic slam engage
│       ├── cell.wav            # Hex power cell seated chime
│       ├── crush.wav           # Scrubber chassis shear impact
│       ├── unseal.wav          # Bulkhead mechanical bolt release
│       ├── shear.wav           # Hull plate damage alarm
│       └── clear.wav           # Sector clearance relay sequence
├── css/
│   ├── theme.css               # Palette tokens, typography, and structural rules
│   ├── landing.css             # Slide-over manual drawer and spec tables
│   └── game.css                # Operator console HUD, viewport, and modals
└── js/
    ├── levels.js               # Expanded multi-screen sectors, embedded asset URI, physics config
    ├── storage.js              # LocalStorage telemetry log + WAV/WebAudio hybrid engine
    ├── game.js                 # Swept CCD physics, deadzone camera, parallax & sprite renderer
    └── preview.js              # Manual drawer controller & live attract-mode monitor
```
