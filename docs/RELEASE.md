# DriveHorizon release notes

## DriveHorizon v0.1.0

DriveHorizon v0.1.0 is the first packaged desktop release of the existing
Three.js driving simulator. It keeps the complete procedural city, driving
simulation, delivery career and local save system in a bundled Electron
application.

### Included

- Procedural coastal city with roads, districts, buildings, landmarks,
  traffic signals, waterfront scenery, lighting and a day/night cycle.
- Force-based vehicle acceleration, braking, reversing, steering, handbrake,
  collisions, damage, fuel use, visible wear and roadside recovery.
- Three chase/close/hood cameras with mouse orbit, zoom, look-around, reset and
  fullscreen controls.
- Fourteen route-following traffic vehicles with signal, corner, following and
  player-avoidance behavior.
- Six repeatable delivery contracts, GPS routing, minimap, city map, money,
  bonuses, XP, ranks, milestones, repairs, refuelling and vehicle upgrades.
- Procedural Web Audio engine, HUD, pause/help/settings/career/workshop screens
  and local autosave with career backup export/import.
- Windows x64 NSIS installer and ZIP, plus Linux x64 AppImage and `.deb`
  packages. Each package includes Electron/Chromium and compiled game assets.

### Installation

**Windows x64**

Run `DriveHorizon-Setup-Windows-x64.exe`, or extract
`DriveHorizon-Windows-x64.zip` and launch `DriveHorizon.exe`.

**Linux x64**

Make `DriveHorizon-Linux-x64.AppImage` executable and launch it, or install the
Debian package:

```bash
chmod +x DriveHorizon-Linux-x64.AppImage
./DriveHorizon-Linux-x64.AppImage
sudo apt install ./DriveHorizon-Linux-x64.deb
```

### Controls

`W`/`↑` accelerate, `S`/`↓` brake or reverse, `A`/`D` and arrow keys steer,
`Space` handbrakes, `E`/`Enter` interacts, `C` changes camera, `Q`/`F` looks
around, right mouse drag orbits, mouse wheel changes chase distance, `H`
toggles headlights, `B` sounds the horn, `R` resets to a nearby road, `M`
opens the map, `Esc`/`P` pauses, `Shift+/` opens controls and `F11` toggles
fullscreen.

### Validation boundary

The source verification suite covers TypeScript, deterministic simulation,
career/save logic, traffic, navigation, UI/input wiring, desktop protocol
security and production asset loading without starting WebGL. Windows artifacts
are built on `windows-latest`; Linux artifacts are built on Ubuntu. Native
window, audio and 3D rendering qualification requires a supported physical or
fully accelerated machine. The development VMware guest is not used to claim
rendering success because its virtual GPU lacks the required WebGL features.
