# Harborline continuation state

Updated: 2026-10-05. Continue this implementation; do not regenerate the game.

## Resume inspection

- A procedural city, detailed Estate vehicle, 120 Hz dynamics, chase/close/hood cameras, 14-car traffic, six deliveries, routing/maps, fuel/repairs, damage/cargo, economy, audio, menus/settings and autosaving were present.
- The original 10 simulation tests and production build passed on resumption.
- Partially completed work was present in `career.ts`, `progression.ts`, `physics.ts` and settings definitions: ranks, milestone rewards, persistent upgrades, world-hour saving, camera shake and frame limits. These were not fully exposed/wired through the UI/coordinator.
- No durable previous TODO/session file or Git metadata was found in this project directory. This file now records the recovered work and follow-ups explicitly. Historical screenshots were preserved.

## Completed implementation this session

- [x] Connect ranks, XP, promotion/milestone rewards and complete receipts.
- [x] Add career journal, customer history and clean-delivery best times.
- [x] Add Quayside repair/upgrade workshop, rank/price/max-level checks and persistent handling/fuel/cargo upgrades.
- [x] Wire render limits and camera-shake settings; preserve fixed-rate simulation independently of display rate.
- [x] Use saved simulation world time for lighting/HUD and freeze it in menus.
- [x] Share traffic signal states between lamps and AI; improve following, bounded acceleration and moving-car impacts.
- [x] Improve GPS distances/turn guidance and map orientation, service footprints and paved forecourt grip.
- [x] Improve camera building occlusion, actual hood placement, reset placement and stale-control cleanup.
- [x] Improve fuel/repair messages, mission cancellation, career reset confirmation, save warnings and corrupt-save recovery.
- [x] Preserve synthesized audio and separate paused driving sounds from service/receipt chimes.
- [x] Add context negotiation/feature diagnostics, classify unrelated code errors correctly and handle context loss/restoration.
- [x] Preserve the existing Three.js WebGL1 fallback; do not repeatedly probe the known-failing VM.
- [x] Extract the existing coordinator into `game.ts` with a small bootstrap, enabling non-GPU game-loop integration tests.
- [x] Prepare a local-only Electron host, fullscreen/quit/save-on-close bridge and portable compiled asset paths.
- [x] Add non-rendering coverage for career, traffic, navigation, cameras, input/HUD/menus, renderer negotiation and desktop host wiring.
- [x] Update running/architecture documentation and record the VM rendering blocker explicitly.

## Verification before session close

- [x] Final `npm run verify`: application/test type-checks, desktop syntax, production build, **53/53 non-rendering tests**, production HTTP asset smoke check.
- [x] Record browser/GPU checks as environment-blocked, without launching a browser.
- [x] Download pinned Electron developer runtime and resolve Linux runtime libraries without a native-window launch.
- [x] Check `start.sh` and browser/benchmark/inspection/build helper syntax; dependency tree resolves.

## Review / next phase

- [ ] Visual and audible review on a WebGL2-capable machine: city/lighting, hood/chase cameras, maps, new dialogs, and compact layouts.
- [ ] Execute the real-browser suite, actual GPU context-restoration test and performance benchmark on suitable hardware.
- [ ] Native Electron window, fullscreen, save/reopen and offline-play checks on Windows and supported Ubuntu/Linux x64.
- [ ] Longer human playtesting for traffic behavior, all customer routes, vehicle tuning and economy balance.
- [ ] If browser careers need to be moved to desktop, add explicit save export/import.
- [ ] After development/testing and a separate user release instruction: real installers/app icons/license bundle, platform packaging, tags and a GitHub Release.

## Development source repository

- Dedicated repository: https://github.com/hussnainahmedd/astra-3d-car-game
- Primary branch: `main`; status: **WORK IN PROGRESS / ACTIVE DEVELOPMENT**.
- Continue in `/home/ubuntu/Desktop/something`, preserving the existing Harborline implementation, identifiers and save behavior.
- Future workflow: modify → test → inspect status/diff → stage intended files → commit the actual milestone → push to the same origin/main.
- Source publication is a development backup. Final installers, Windows/Linux distribution builds, release tags and GitHub Releases remain deferred.

## Environment blocker — not a game failure

The user-reported Ubuntu 20.04 VMware guest has 3D acceleration configured, vmwgfx/open-vm-tools installed and an SVGA3D renderer, but reports `Accelerated: no`, 1 MB guest video memory, OpenGL 3.3 and OpenGL ES 2.0. The renderer error is `WebGL 2 requires support for transform_feedback2` / `Error creating WebGL context`.

Do not retry browser/GPU tests repeatedly on this machine. Use `npm run verify`. `HARBORLINE_RENDER_BLOCKED=vmware npm run test:browser` records an explicit environment-blocked result in `test-results/rendering-status.json`. Existing screenshots are historical and do not certify this session's build.
