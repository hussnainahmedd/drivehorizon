# Astra 3D Car Game

**WORK IN PROGRESS / ACTIVE DEVELOPMENT**

Development source repository: [hussnainahmedd/astra-3d-car-game](https://github.com/hussnainahmedd/astra-3d-car-game). This repository preserves the current implementation and unfinished work for continued development. The game is not finished or production-ready; this upload is not a final release, installer, or `v1.0.0` tag. The existing npm version field is development metadata, not a released version.

The current game, interface, package identifiers and save profile use the existing name **Harborline — Coastal Courier**. These identifiers are retained to preserve the implementation and existing careers.

### Harborline — Coastal Courier: take the scenic route.

A single-player 3D driving game set in a procedurally built coastal city, currently a **development/review build**. Take the keys to an Estate 2.0 Touring, accept delivery contracts, navigate city streets and traffic, park at your customer's loading bay, and earn money. Use your earnings to maintain and upgrade your vehicle, progress through courier ranks, or simply explore the waterfront.

**No API keys, accounts, paid assets, CDNs, or runtime network services.** The city, vehicles, textures, interface artwork, and engine audio are generated locally. `npm run build` generates `dist/` with the compiled HTML/JavaScript/CSS game; it is not an executable or an installer. Generated builds, dependencies and browser-test output are excluded from Git and rebuilt locally; all development source, the lockfile, configuration, procedural assets, tests and continuation documents are included.

## Desktop status and this VM

The gameplay uses **TypeScript, Three.js, DOM/CSS and Web Audio**. Vite is a development/build tool. A local-only **Electron desktop host** is now prepared in `electron/`; it loads the compiled game directly at `harborline://app/index.html`, with no HTTP server, and provides fullscreen, quit and save-on-close integration.

The intended future distribution targets remain **Windows x64 and Ubuntu/Linux x64**. Future packages are planned to bundle the runtime and game assets so players can launch an installed application without npm, Vite, a localhost server or OmniRush. Installer configuration, platform qualification and release artifacts remain future work, after development, testing and a separate user instruction. See [docs/DESKTOP.md](docs/DESKTOP.md).

**The current Ubuntu 20.04 VMware environment cannot be used to certify rendering.** Its reported `transform_feedback2`/WebGL2 failure, unaccelerated SVGA3D guest and incomplete graphics capabilities are treated as an environment blocker. This session uses non-rendering tests; existing screenshots are historical, not verification of the current build.

On a WebGL2-capable development machine, from the project directory:

```bash
npm ci
npm run desktop:dev
```

This installs the pinned Electron runtime if needed, builds the game, and opens the desktop host directly. No localhost server is started. Dependencies/runtime downloads initially require Internet access; the game itself is local. Native-window/rendering validation is still pending on suitable Windows and Linux machines.

## Browser preview on a graphics-capable machine

From the existing project directory (`/home/ubuntu/Desktop/something` on this development machine), after installing dependencies and building:

```bash
npm ci
npm run build
./start.sh
```

This development launcher serves the local build at **http://localhost:4173** and opens the default browser. Leave the terminal running. Press **Ctrl+C** to stop the server. If `dist/` is missing, the script runs `npm install` and builds it first. It is a browser preview, not the released desktop application. A compatible graphics driver is required; this VM's rendering remains environment-blocked.

To start without opening a browser:

```bash
./start.sh --no-open
```

To use another port:

```bash
HARBORLINE_PORT=4180 ./start.sh
```

Alternatively, the compiled game only requires Python's standard-library HTTP server:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Then open **http://localhost:4173**. Serve the game over HTTP; do not double-click `dist/index.html` as a `file://` URL.

### Development and rebuilding

Development requirements: **Node.js 24.15+** (tested with 24.21.0), npm, and a WebGL2-capable desktop browser or the bundled Electron runtime. Node 22.22.2+ is also supported by the current test dependencies. Python 3 is only used by the optional browser launch script. Players of future desktop packages will not need Node or Python.

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. Both Vite commands below bind to all interfaces by default; for a loopback-only development server, use `npm run dev -- --host 127.0.0.1`. To type-check and compile the current game for local review:

```bash
npm run build
npm run preview
```

Preview is served at **http://localhost:4173**. Installing packages initially requires Internet access; playing or serving the already-built `dist/` directory does not.

## Your first delivery

1. Click **Get behind the wheel**, or press **Enter** on the title screen.
2. You start within range of **Harborline dispatch**, in South Quay. While stopped, press **E**.
3. Choose **Sunday Coffee**. Your package is loaded and the destination appears on the GPS, minimap, road guidance, and 3D marker.
4. Drive straight along Harbor Boulevard. Keep an eye on traffic; use **S** to slow down before the loading bay.
5. Park within **9 meters** of the green destination ring at under **5.4 km/h**, then press **E** to deliver.
6. The receipt shows your payment, time bonus, careful-handling bonus, and new balance.
7. Return to dispatch for another contract, or keep exploring. **M** opens the city map; choose dispatch, fuel, repairs, or your active delivery as a GPS destination.

The time window affects your **bonus**, not whether a delivery can be completed. Late or damaged deliveries still pay. All six contracts are repeatable.

## Controls

| Key / input | Action |
|---|---|
| **W / ↑** | Accelerate; brake first if reversing |
| **S / ↓** | Brake; hold at low speed to reverse |
| **A / ←**, **D / →** | Steer left / right |
| **Space** | Handbrake; reduces rear tire grip |
| **E / Enter** | Open dispatch, deliver, refuel, or open the workshop when stopped and nearby |
| **C** | Cycle cinematic chase, close chase, and hood cameras |
| **Q / F** | Look left / right |
| **Right mouse + drag** | Orbit the camera; release to recenter |
| **Mouse wheel** | Adjust chase-camera distance |
| **H** | Toggle headlights; automatic at dusk until manually overridden |
| **B** | Horn |
| **R** | Reset to the nearest traffic-free road position; keeps fuel and damage |
| **M** | Open / close city map |
| **Esc / P** | Pause / resume, or close a menu |
| **Shift + /** (**?**) | Controls and driving guide |
| **F11** | Toggle fullscreen |

The game pauses automatically when the window loses focus or the tab is hidden. Keyboard driving is intended for a desktop or laptop.

## Features

### Driving and presentation

- Fixed **120 Hz** force-based vehicle simulation, independent of rendering frame rate.
- Dynamic bicycle tire model with front/rear slip angles, load transfer, road-dependent grip, steering response, speed-sensitive steering lock, rolling resistance, aerodynamic drag, engine power curve, braking, reverse, and rear-grip handbrake behavior.
- Automatic gears and RPM, speed-dependent engine sound, tire scrub, wind/road noise, horn, impact sounds, and completion chimes, synthesized with the Web Audio API.
- Damped chassis pitch, roll, and heave for acceleration, braking, cornering, curbs, and rough terrain. Physics position is planar; the sprung visual chassis supplies suspension motion rather than a full six-degree-of-freedom rigid-body solver.
- Detailed procedural estate car: shaped body and cabin, glass, pillars, grille, trim, mirrors, handles, plates, alloy wheels, rotating player wheels, steering wheels, brake lights, and projected headlights.
- Persistent fuel and damage. Impacts reduce engine power and cargo condition; visible scratches appear on a damaged player vehicle.
- Spring-smoothed chase cameras with look-around, zoom, speed-sensitive FOV, impact shake, and building-occlusion avoidance.
- Tire skid marks, collision response, shoreline boundaries, and road reset.

### Procedural city and traffic

- Approximately **570 × 570 meters** of drivable city, ten named streets, 25 intersections, and distinct harbor, market, garden, old-town, and waterfront areas.
- More than 100 procedural buildings, multiple facade styles, windows that illuminate at night, ground-floor shopfronts, rooftop details, and named delivery storefronts.
- Lane markings, crosswalks, curbs, sidewalks, streetlights, coordinated traffic signals, trees, a park and fountain, loading bays, a boardwalk, benches, guardrails, warehouses, port cranes, containers, distant hills, water, and sailboats.
- **14 AI vehicles** on rounded multi-block road routes. They brake for corners, signals, other traffic, and the player. AI updates at 30 Hz; vehicle collisions are checked at the player physics rate.
- A **30-minute day/night cycle**, with afternoon, golden-hour, and night overrides. Sun angle, ambient light, sky, fog, building windows, streetlight pools, and headlights change with time.

### Career and interface

- Six repeatable delivery contracts, with varied cargo, destination, base pay, suggested bonus windows, and fragile-package handling.
- A working money economy, completion receipts, lifetime earnings, delivery count, and distance driven.
- Five courier ranks, XP for every completed delivery, one-time promotion rewards, and five cash-paying milestones. The career journal tracks customer visits and clean-delivery best times.
- Quayside workshop offers three levels each of touring tires, engine tuning, fuel efficiency and cargo restraints. Higher levels require courier ranks; purchases persist and affect the actual simulation.
- **Tidal fuel station** at Foundry Street: $1.80 per percentage point of fuel restored.
- **Quayside Motor Works** at Juniper Avenue: $3.20 per percentage point of vehicle condition restored.
- Services perform affordable partial refills/repairs when the full bill exceeds your balance.
- Active cargo can be returned from the pause menu without a cancellation fee. Starting a new career requires an explicit in-game confirmation.
- Roadside assistance from the pause menu costs up to $75, returns you to dispatch, and ensures at least 25% fuel and 45% condition. It also works at a zero balance, so the career cannot be permanently stranded. An active delivery receives a 40-second time penalty.
- GPS routing through the road graph, next-turn / turn-around guidance, subtle road dots, a destination ring and marker, local minimap, and expanded city map.
- Speedometer, gear, tachometer, fuel, health, cargo condition, bonus countdown, clock, district, street, and balance displays.
- Title screen, pause menu, dispatch board, workshop, career journal, settings, controls guide, map, contextual interactions, save status and notifications.
- Graphics, time of day, camera, speed units, audio level, look sensitivity, route guidance, camera shake, fullscreen and 30/60/120/uncapped render limits. Render limits do not alter 120 Hz physics.
- Local autosave every eight driving seconds and on purchases, mission changes, pause, page exit and desktop close. Career, active cargo, vehicle location/resources, settings, upgrades, customer history and cycle time survive reloading. Version-one saves migrate in place using the original storage key. Corrupt data is retained under `harborline-save-recovery` before replacement; failed saves are reported in the interface.
- Browser storage is per browser and origin; changing ports creates a separate save. Desktop saves use the stable local app origin under Electron's user-data directory. Browser and desktop profiles are separate. **New Career** starts fresh while preserving settings.

## Graphics and performance

The renderer prefers **WebGL 2** and supports a compatible **WebGL 1** fallback. Three.js remains pinned to `0.160.1`, preserving the existing fallback. WebGL1 must provide instancing and standard derivatives; this does not guarantee a usable graphics path on the current VM. Context selection and renderer-error classification are covered by non-rendering tests.

- **Performance:** efficient vertex-lit materials, contact shadows, lower render resolution, no real-time sun shadow map.
- **Balanced:** PBR materials, environment reflections, 1024-pixel sun shadows.
- **High fidelity:** higher pixel density and 2048-pixel sun shadows.
- Performance mode is selected automatically on first launch for WebGL 1 or recognizable software/virtual graphics drivers.
- Dynamic render scaling responds to sustained low frame rates. UI remains at native resolution.
- Repeated world geometry uses GPU instancing. AI vehicle material colors and wheel geometry are baked into a small number of draw calls. Traffic draw distance follows graphics quality, collision queries use a spatial hash, and the sun shadow area follows the player. Performance mode skips environment-reflection generation and real-time shadow maps.
- Simulation catch-up is bounded after long stalls. Hidden windows stop rendering; graphics context loss saves and pauses gameplay, prevents resuming against a lost context, and returns to pause on restoration.
- Current GPU frame-rate, visual quality and actual context-restoration checks are **environment-blocked** on the VMware guest. No browser was launched to repeat the known failure during this session.

For the clearest presentation on a capable GPU, choose **Balanced** or **High fidelity** in Settings. Performance mode is available for slower compatible hardware. Desktop packaging cannot add graphics features missing from a VM's driver.

## Architecture

```text
index.html                  Entry page and loading state
src/
  main.ts                   Small application entry and fatal-error boundary
  game.ts                   Existing game coordinator, loop, input and interactions
  physics.ts                Deterministic vehicle dynamics and collision response
  vehicle.ts                Procedural vehicle geometry, lights, damage, batching
  world.ts                  City generation, environment, traffic signals, lighting
  traffic.ts                Lane routes, signal response, following and avoidance
  config.ts                 Streets, landmarks, contracts, settings, road-graph routing
  progression.ts            Career, delivery rewards, fuel/repairs, rescue, save/load
  career.ts                 Ranks, milestones and persistent upgrade definitions
  audio.ts                  Procedural Web Audio engine and effects
  ui.ts                     Menus, HUD, minimaps, receipts, notifications
  style.css                 Responsive interface presentation
  render-quality.ts         Switchable lightweight / PBR material paths
  math.ts                   Math helpers, seeded random generation, spatial hashing
  graphics.ts               Context negotiation, diagnostics and error classification
  timing.ts                 Fixed-step clock and independent render cadence
  signals.ts                Shared traffic-light states and AI speed limits
  navigation.ts             GPS guidance, route distance and map projection
  camera.ts                 Building occlusion math, without GPU dependencies
  recovery.ts               Traffic-free lane reset placement
  platform.ts               Browser/desktop fullscreen and close integration
electron/
  main.cjs                  Native local-only application host
  preload.cjs               Isolated fullscreen, quit and close-save bridge
  assets.cjs                Local asset protocol and sender validation
public/favicon.svg          Local app icon
tests/
  simulation.test.ts        Dynamics, collisions, economy, save/load, routing tests
  career.test.ts            Career completion, upgrades, migration and save failures
  systems.test.ts           Timing, traffic, cameras, navigation and material logic
  game.test.ts              DOM/input/game-loop integration with a non-GPU adapter
  graphics.test.ts          WebGL2/1 selection and error classification
  desktop.test.ts           Host/preload wiring and local asset/IPC tests, without GPU
  build-smoke.mjs           Real production HTTP asset checks, without a browser
  browser.mjs               Real-browser end-to-end gameplay and screenshot checks
  benchmark.mjs             Renderer / performance inspection
  inspect.mjs               Initial Chromium visual inspection helper
  rendering-environment.mjs Known-VM-blocker reporting for rendering helpers
  helpers/dom.ts            Synthetic DOM/audio/graphics test adapters
package.json                Dependencies and development/verification commands
package-lock.json           Pinned dependency resolution for npm ci
tsconfig*.json              Application and test TypeScript configuration
vite.config.ts              Development ports and portable build asset paths
.gitignore                  Generated output, local caches and credential exclusions
start.sh                    Ubuntu launcher for a locally compiled browser build
dist/                       Generated browser game assets (ignored by Git)
test-results/               Generated test output/historical local screenshots (ignored)
TODO.md                     Durable continuation state and remaining review work
docs/DESKTOP.md             Distribution architecture and next-phase strategy
docs/SESSION-2026-10-05.md   Historical continuation and verification report
```

The game uses a fixed-step accumulator. Physics, fuel, cargo clocks and career time stop in menus. Rendering has an independent frame limit; camera and chassis motion are smoothed, lighting reads persisted simulation time, and the DOM interface updates at a throttled rate. The minimap uses a small 2D canvas. Traffic pathing, gameplay state, rendering, audio and persistence remain separate modules. Tests can run the real coordinator with a non-GPU adapter; that checks gameplay and menu wiring, not rendered pixels.

## Verification

### All environment-compatible verification

```bash
npm run verify
```

This checks application and test TypeScript, desktop-host syntax, the compiled build, all non-rendering tests, and production HTTP assets. It never starts a browser or creates a GPU context. The continuation report records **53/53 passing non-rendering tests** on 2026-10-05; rerun this command to check the current checkout.

### Simulation, career, interface and host logic

```bash
npm test
```

Tests retain the original simulation coverage and add complete career progression, one-time rewards, rank-gated upgrades, three minutes of AI simulation, renderer negotiation, corrupted-save recovery, version-one migration, paused clocks, frame-rate-independent physics, camera occlusion, and actual keyboard delivery/menu/workshop flows through the coordinator. DOM canvas, audio and GPU adapters are synthetic in these tests; visual quality and audible quality require a real-machine review.

### End-to-end play test

On a **graphics-capable machine**, start `npm run dev` in one terminal. Install the test browser once, then run:

```bash
npx playwright install firefox
npm run test:browser
```

The test uses real browser keyboard events to drive the first delivery. It then checks rewards, pause, settings, night mode, cameras, headlights, map waypoints, fuel, workshop repairs/upgrades, collisions, reset, broke-player rescue, persistence, compact UI and GPU context restoration. This current-build browser suite has not been executed successfully on this VM.

To record the known VM blocker **without launching a browser**:

```bash
HARBORLINE_RENDER_BLOCKED=vmware npm run test:browser
```

The result is explicitly `environment-blocked` in `test-results/rendering-status.json`, not a passed render test. The benchmark/inspection helpers accept the same flag. Omit this flag on suitable hardware.

The subsequent isolated service/collision cases use an opt-in deterministic harness, available only with `?debug=1`. Normal gameplay exposes no debug API. Screenshots are written to `test-results/`.

To test the compiled game instead, run the production server and use:

```bash
GAME_URL=http://127.0.0.1:4173 npm run test:browser
```

Optional Chromium testing on suitable hardware:

```bash
npx playwright install chromium
BROWSER=chromium npm run test:browser
```

Playwright is pinned to the existing version that provides Ubuntu 20.04 test-browser builds. Browser installations are testing dependencies only. Software emulation can be explicitly requested with `SOFTWARE_RENDERING=1 BROWSER=chromium`, but does not certify hardware performance or repair this VM's driver.

## Environment configuration

No secret environment variables or `.env` file are required to develop or run the game, so no `.env.example` is needed for the current implementation. Optional launcher/test variables (`HARBORLINE_PORT`, `GAME_URL`, `BROWSER`, `HEADED`, `SOFTWARE_RENDERING`, and `HARBORLINE_RENDER_BLOCKED`) select local ports or test behavior; examples are shown above. `DISPLAY` is the normal Linux graphical-session variable. Keep credentials, authentication files, tokens and browser session data outside the source repository.

## Known issues, unfinished features and planned work

- **Rendering validation is blocked on the current VMware guest.** Existing context-negotiation tests do not certify actual 3D rendering, image quality, frame rate or GPU context restoration. Historical screenshots in the local ignored `test-results/` directory do not verify the current build.
- Current-build city/lighting, hood/chase cameras, maps, menus, compact layouts and synthesized audio still need visual/audible review on compatible hardware.
- The real-browser end-to-end suite, GPU restoration exercise and performance benchmarks need to run on a graphics-capable machine.
- The Electron host is implemented, but native-window gameplay, fullscreen, offline operation and save/close/reopen behavior need real Windows and supported Ubuntu/Linux x64 validation.
- Vehicle physics are planar bicycle dynamics with visual suspension; traffic follows rounded road routes. Longer human playtesting and handling, traffic, delivery-route and economy tuning remain.
- Browser and desktop careers are separate profiles; explicit save export/import is not implemented and can be added if career transfer is needed. Browser origins/ports also have separate local saves.
- Desktop installer tooling/configuration, proper platform app icons, bundled license notices, clean-system checks and downloadable Windows/Linux binaries remain unfinished. Electron-builder is planned but is not currently installed or configured.
- Actual supported Windows/Ubuntu versions, distribution formats and hardware requirements must be qualified before a future release. The proposed NSIS/AppImage/`.deb` strategy in `docs/DESKTOP.md` is a plan.

See [TODO.md](TODO.md) for the durable development checklist and [docs/SESSION-2026-10-05.md](docs/SESSION-2026-10-05.md) for historical verification. Development continues from this implementation; future installers, release tags and GitHub Releases require a separate instruction after testing is complete.

## Continuing development in this repository

The existing local directory remains the active working copy. Continue with the normal workflow: **modify → test → review status/diff → commit → push to the same repository**.

```bash
npm run verify
git status
git diff
# Stage only the intended, reviewed files, then commit the changes that occurred.
git add <reviewed-files>
git commit -m "feat: improve vehicle physics"
git remote -v
git push origin main
```

Choose a commit message that describes the actual change, such as `fix: resolve navigation issue` or `perf: optimize city rendering`. Before pushing, verify that origin still points only to `https://github.com/hussnainahmedd/astra-3d-car-game.git`. Keep development on `main` in this project directory. This is an active development source repository; final Windows/Linux packaging and release publication come later.

## Assets and license

All city, car, texture, sound, and interface assets in this project are generated from code or created specifically for this game. There are no third-party asset downloads at runtime. Project code is MIT licensed; see `LICENSE`. Three.js and Vite are MIT licensed; TypeScript and Playwright use Apache-2.0. Dependency license files are included in their respective npm packages.
