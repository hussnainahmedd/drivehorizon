# DriveHorizon — 3D Driving Simulator

DriveHorizon is a local-first, single-player 3D driving simulator set in a
procedurally generated coastal city. Drive an Estate 2.0 Touring, accept
delivery contracts, follow the road network through traffic, maintain the car,
and build a courier career. The current packaged milestone is **v0.1.0**.

Repository: <https://github.com/hussnainahmedd/astra-3d-car-game>

The repository name is retained as requested. The game, desktop application,
package metadata and user-facing interface are branded DriveHorizon.

## Game overview

The game starts at dispatch in South Quay. A delivery is accepted from the
dispatch board, loaded into the vehicle, and shown on the GPS, minimap, city
map and 3D destination marker. The player drives to the loading bay, parks,
and delivers the cargo. Completion rewards money and XP; fuel, vehicle
condition, cargo condition, upgrades and career history persist locally.

There are six repeatable contracts, five courier ranks, five milestones, a fuel
station, a repair/workshop location, roadside assistance and free-roam driving
between jobs. A delivery's bonus window affects the bonus only; late or damaged
cargo still pays a base reward.

## Implemented features

### Driving and vehicle simulation

- Fixed-step 120 Hz force-based vehicle simulation independent of render rate.
- Acceleration, automatic gears, braking, reversing, steering and speed-
  sensitive steering response.
- Front/rear slip forces, road and curb grip, rolling resistance, drag, engine
  power, brake force and rear-grip handbrake behavior.
- Static building/barrier/tree collisions and moving traffic collisions with
  impact damage, cargo damage, response forces and a traffic-free road reset.
- Persistent fuel and vehicle condition; damage limits engine power and is
  visible on the player vehicle.
- Visual chassis pitch, roll and heave, wheel rotation, brake lights,
  headlights, tire marks and a procedural Estate 2.0 Touring model.

### City, traffic and presentation

- Approximately 570 m × 570 m of drivable city with five east-west and five
  north-south streets, named districts, intersections and service forecourts.
- Procedural buildings, facade/window textures, shopfronts, sidewalks, curbs,
  crosswalks, signals, streetlights, trees, park/fountain, boardwalk,
  warehouses, containers, port cranes, water, hills and sailboats.
- Fourteen AI vehicles on rounded multi-block routes. Traffic follows signals,
  corners and other vehicles, slows behind the player, and exposes colliders
  to the player simulation.
- A 30-minute cycle with afternoon, sunset and night settings. Sun, ambient
  light, fog, sky, windows, streetlights and headlights respond to time.
- Synthesized Web Audio for engine, road noise, tire scrub, horn, impacts,
  service sounds and delivery completion chimes.

### Career, interface and persistence

- Six delivery contracts with cargo types, reward values, distance guidance and
  fragile-cargo handling.
- Money, delivery bonuses, XP, five ranks, promotion rewards, milestones,
  customer visits, best clean-delivery times and lifetime earnings.
- Four upgrade paths with three levels each: touring tires, engine tuning,
  economy tune and cargo restraints. Upgrades affect the actual simulation and
  are rank-gated and persistent.
- Tidal fuel station, Quayside Motor Works repair shop and roadside assistance.
  Assistance returns the car near dispatch, restores minimum resources and
  applies a time penalty to an active delivery.
- HUD with speed, gear, RPM, fuel, condition, cargo, balance, clock, district,
  street, delivery bonus and route guidance.
- Title, pause, dispatch, workshop, career journal, settings, controls, city
  map, delivery receipt, graphics-recovery and new-career screens.
- Local autosave while driving and on important state changes. Career data,
  vehicle state, active delivery, settings, upgrades and cycle time survive a
  reload. Existing project saves are migrated into the DriveHorizon save
  profile on their next save.
- Local JSON career backup export/import from Settings. No save or gameplay
  data is uploaded.

## Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Accelerate; brake first when reversing |
| `S` / `↓` | Brake; hold at low speed to reverse |
| `A` / `←`, `D` / `→` | Steer left/right |
| `Space` | Handbrake |
| `E` / `Enter` | Open dispatch, deliver, refuel or open the workshop |
| `C` | Cycle cinematic chase, close chase and hood cameras |
| `Q` / `F` | Look left/right |
| Right mouse + drag | Orbit the camera |
| Mouse wheel | Change chase-camera distance |
| `H` | Toggle headlights |
| `B` | Horn |
| `R` | Reset to a nearby traffic-free road position |
| `M` | Open/close the city map |
| `Esc` / `P` | Pause/resume or close a menu |
| `Shift` + `/` (`?`) | Open the controls guide |
| `F11` | Toggle fullscreen |

The game pauses and clears held driving input when the window loses focus or a
document becomes hidden.

## Verified technology stack

- **Language:** TypeScript, targeting ES2022.
- **3D:** Three.js `0.160.1`, WebGL 2 preferred with a compatible WebGL 1
  fallback.
- **Web application:** Vite `7.x`, HTML, DOM APIs and CSS.
- **Audio:** Web Audio API with locally synthesized oscillators and noise.
- **Desktop:** Electron `44.5.1` with a sandboxed, context-isolated preload;
  electron-builder `26.15.3` for distribution.
- **Persistence:** browser/Electron `localStorage` and local JSON backup files.
- **Tests:** Node's built-in test runner through `tsx`, TypeScript checks,
  JSDOM `30.1.2`, synthetic canvas/audio adapters, Playwright `1.48.2`, and
  production HTTP asset smoke checks.
- **Runtime tools:** Node.js `24.21.0` and npm for development/building.

There are no API keys, hosted game services, runtime CDNs, paid game assets or
runtime network calls. Procedural geometry, textures, interface artwork and
audio are created locally. The packaged game includes the Electron/Chromium
runtime and compiled assets, so players do not need Node.js, npm, Vite, a
browser or a development server.

## Application architecture

The same TypeScript/Three.js application is compiled by Vite for browser
development and loaded from packaged local assets by Electron. Electron serves
only the compiled `dist/` files through the restricted `drivehorizon://` local
protocol. The renderer has no Node integration; the preload exposes only
fullscreen, quit and save-on-close callbacks.

The simulation uses a fixed-step accumulator. Physics, fuel, cargo time and
career time are independent of display frame limits. World generation,
vehicle dynamics, traffic, navigation, rendering, UI, audio and persistence
are separate modules. Tests can run the coordinator using non-GPU adapters;
those tests verify logic and wiring rather than rendered pixels.

## Project structure

```text
index.html                 Entry page, metadata and loading screen
src/
  main.ts                  Application bootstrap and fatal-error boundary
  game.ts                  DriveHorizon coordinator, loop, input and actions
  physics.ts               Vehicle dynamics and collision response
  vehicle.ts               Procedural player/traffic vehicle models
  world.ts                 City generation, scenery, signals and lighting
  traffic.ts               AI routes, following and signal behavior
  config.ts                Streets, landmarks, contracts, settings and routing
  progression.ts           Career, delivery rewards, services and save/load
  career.ts                Ranks, milestones and upgrade definitions
  navigation.ts            GPS guidance, route distance and map projection
  camera.ts                Camera occlusion calculations
  recovery.ts              Traffic-free road reset placement
  audio.ts                 Procedural Web Audio engine
  ui.ts                    HUD, menus, maps, receipts and notifications
  graphics.ts              WebGL negotiation and diagnostics
  render-quality.ts        Lightweight/PBR material switching
  timing.ts                Fixed physics clock and render cadence
  signals.ts               Shared signal phases and AI limits
  math.ts                  Math, random and spatial-hash helpers
  platform.ts              Browser/desktop platform bridge
  style.css                Interface styling and responsive layouts
electron/
  main.cjs                 Native window and local asset protocol
  preload.cjs              Isolated fullscreen/quit/close-save bridge
  assets.cjs               Local asset allowlist and sender validation
  check-assets.cjs         Packaged local-asset/runtime diagnostic
public/favicon.svg         Browser and desktop application icon source
  simulation.test.ts       Physics, collision, economy, persistence and routes
  career.test.ts           Progression, upgrades, migration and backup tests
  systems.test.ts          Timing, traffic, navigation, camera and materials
  game.test.ts             DOM/input/game-loop integration without a GPU
  graphics.test.ts         WebGL selection and error classification
  desktop.test.ts          Electron host/preload/protocol tests
  build-smoke.mjs          Production asset and portable-path checks
  browser.mjs              Real-browser gameplay/rendering suite
  benchmark.mjs            Optional rendering/performance inspection
  inspect.mjs               Optional Chromium visual inspection helper
  DESKTOP.md               Desktop architecture and packaging details
  RELEASE.md               Release notes template and v0.1.0 notes
.github/workflows/release.yml  Tagged Windows/Linux build and release workflow
package.json               Scripts, dependencies and electron-builder metadata
package-lock.json          Reproducible npm dependency resolution
vite.config.ts             Portable Vite build and local ports
start.sh                   Linux browser-preview launcher
LICENSE                    MIT license
```

## Installing a desktop release

Download the actual assets from [GitHub Releases](https://github.com/hussnainahmedd/astra-3d-car-game/releases).
The tagged release workflow is configured to publish these names after both
platform jobs succeed:

### Windows x64

- `DriveHorizon-Setup-Windows-x64.exe` — assisted NSIS installer with Start
  Menu/Desktop shortcuts and uninstall support.
- `DriveHorizon-Windows-x64.zip` — portable ZIP containing the packaged app.

Run the installer, or extract the ZIP and launch `DriveHorizon.exe`. Windows
packages are built on GitHub Actions `windows-latest`.

### Linux x64

- `DriveHorizon-Linux-x64.AppImage` — portable Linux package.
- `DriveHorizon-Linux-x64.deb` — Debian/Ubuntu package.

```bash
chmod +x DriveHorizon-Linux-x64.AppImage
./DriveHorizon-Linux-x64.AppImage
sudo apt install ./DriveHorizon-Linux-x64.deb
```

Linux packages are built on GitHub Actions Ubuntu x64. The package contains
the app runtime and core gameplay assets and does not require a hosted server.
Actual graphics/audio quality depends on the host GPU and desktop libraries.

## Development environment setup

Requirements:

- Node.js `24.21.0` and npm.
- A desktop browser or Electron runtime with WebGL support for interactive
  review. A WebGL 2-capable physical or fully accelerated machine is needed
  for rendering qualification.
- Python 3 only for the optional `start.sh` preview launcher.

Install the pinned dependency tree:

```bash
npm ci
```

Run the Vite development server:

```bash
npm run dev -- --host 127.0.0.1
```

Open <http://127.0.0.1:5173>. For a compiled browser preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

The preview is at <http://127.0.0.1:4173>. The Linux convenience launcher
builds when needed and serves the same local `dist/` directory:

```bash
./start.sh --no-open
# Optional alternate port:
DRIVEHORIZON_PORT=4180 ./start.sh
```

To review the local desktop shell during development:

```bash
npm run desktop:dev
```

This builds `dist/` and opens the Electron window directly; it does not start
an HTTP server.

## Build desktop applications

Build the Linux x64 AppImage and Debian package on Linux:

```bash
npm run desktop:package:linux
```

After a Linux package build, validate the unpacked Electron application and its
bundled local assets without opening a game window:

```bash
npm run test:package
```

Build the Windows x64 NSIS installer and ZIP on Windows:

```powershell
npm run desktop:package:win
```

Both commands first run the production Vite build and write artifacts to the
ignored `release/` directory. The repository workflow performs the Windows
build on `windows-latest` and the Linux build on Ubuntu, then uploads the
artifacts and publishes a release for a `v*` tag. Do not upload files from
`dist/` as desktop installers; `dist/` is only the compiled web application.

## Testing and validation

The environment-compatible verification command is:

```bash
npm run verify
```

It runs application/test type checks, Electron JavaScript syntax checks, the
production build, non-rendering tests and the production asset smoke check.
Individual commands are also available:

```bash
npm run typecheck
npm run desktop:check
npm test
npm run test:build
```

On a graphics-capable machine, the real-browser suite can be run against the
Vite server:

```bash
npx playwright install firefox
npm run dev -- --host 127.0.0.1
npm run test:browser
```

The suite drives a delivery with real keyboard events and checks rendering,
menus, settings, services, collisions, save/reload and context restoration.
It is not part of `npm run verify` because it requires an actual browser and
usable WebGL. On the known VMware guest, record the explicit environment
limitation without retrying rendering:

```bash
DRIVEHORIZON_RENDER_BLOCKED=vmware npm run test:browser
```

That result is `environment-blocked`, not a passing render test. The same
boundary applies to `tests/benchmark.mjs` and `tests/inspect.mjs`.

## GitHub Releases

Source changes are pushed to the `main` branch of the existing repository.
Pushing a version tag such as `v0.1.0` starts
`.github/workflows/release.yml`. The workflow builds and uploads Windows x64
and Linux x64 packages, verifies that all four expected artifacts exist, and
creates a GitHub Release titled `DriveHorizon vX.Y.Z` using the release notes
in `docs/RELEASE.md`.

The release workflow uses the short-lived GitHub Actions token supplied by the
runner. No repository credentials are stored in source. Release assets are
generated build outputs and are intentionally excluded from Git.

## Known limitations

- The current Ubuntu VMware guest reports an incomplete virtual WebGL driver
  (`transform_feedback2` is unavailable and acceleration is not active). This
  blocks reliable local 3D rendering, audio, frame-rate and context-loss
  qualification; it does not invalidate the non-rendering logic suite.
- Native Windows and Linux window launch, fullscreen, offline reopen, audio
  quality, clean-system installation and measured performance require testing
  on the corresponding supported host hardware.
- Vehicle dynamics use a planar force-based bicycle model with visual
  suspension, and traffic uses bounded road routes; this is the implemented
  simulator model rather than a full rigid-body physics engine or adaptive
  citywide traffic network.
- Browser and packaged desktop saves use separate browser/Electron profiles.
  Use the Settings career-backup export/import controls to transfer a career.

## License

The project is released under the MIT License; see [LICENSE](LICENSE).
Three.js, Electron, Vite, TypeScript, JSDOM, Playwright and other dependencies
retain their own licenses in the installed npm packages and are not replaced
by the project license.
