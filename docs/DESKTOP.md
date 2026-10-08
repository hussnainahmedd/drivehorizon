# DriveHorizon desktop application and packaging

## Decision

Preserve DriveHorizon's existing TypeScript/Three.js gameplay and distribute it with **Electron + electron-builder**. Electron bundles Chromium, giving this WebGL/Web Audio implementation a consistent engine on Windows and Linux. The practical tradeoff is a larger download and memory footprint than a small native executable.

The repository remains a web-technology game. Packaging it in a native application window is a standalone desktop deployment; `dist/` by itself is only web assets. Tagged releases are built by the committed GitHub Actions workflow and published to the project GitHub Release.

## Architecture already prepared

```text
Installed DriveHorizon launcher
  → bundled Electron runtime
    → electron/main.cjs (native window and application lifecycle)
      → drivehorizon://app/index.html (local compiled dist/ assets)
        → src/main.ts → src/game.ts → existing gameplay modules
```

- The host reads packaged assets through a registered local protocol. It does not start Vite or an HTTP server, open an external browser, or download game assets.
- The renderer is sandboxed and context-isolated, with Node integration disabled. A small preload bridge provides fullscreen, quit and close-save notifications.
- The local protocol serves only the entry page, icon and approved compiled assets. Native controls verify the sending window and main frame.
- The desktop title/pause menus provide quit; F11 and Settings toggle fullscreen.
- Closing the native window requests a synchronous career save, then acknowledges close. A short fallback handles an unresponsive renderer.
- Saves use the `drivehorizon-save-v1` key, with version-two data and version-one migration. Existing browser careers are read from the legacy key and written into the new profile on the next save. Chromium persists localStorage under the application's stable DriveHorizon user-data profile. Typical directories are `%APPDATA%/DriveHorizon` on Windows and `~/.config/DriveHorizon` on Linux, subject to OS/XDG configuration. These are profile directories, not a promised plain JSON save-file path.
- Browser preview and desktop saves are separate origins/profiles. Settings provides a local JSON career export/import path for manual transfer before or after desktop packaging.

## Developer review launch

Project path on this machine: `/home/ubuntu/Desktop/something`.

From that directory on a machine with working WebGL2 graphics:

```bash
npm ci
npm run desktop:dev
```

`desktop:dev` runs the idempotent pinned-runtime setup, production build and `electron .`. It launches the compiled local application directly. Node/npm are checkout-development requirements; they will not be player requirements.

For source development/browser review:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. For the compiled browser preview: `npm run preview -- --host 127.0.0.1`, then `http://127.0.0.1:4173`.

## Packaging and release workflow

1. `package.json` pins electron-builder and defines the DriveHorizon product metadata, local SVG icon, bundled files, Windows NSIS/ZIP targets, and Linux AppImage/`.deb` targets.
2. `.github/workflows/release.yml` builds Windows x64 on `windows-latest` and Linux x64 on Ubuntu, then publishes the four expected artifacts when a `v*` tag is pushed. It uses the runner-provided `GITHUB_TOKEN`; no credential is stored in the repository.
3. The Windows installer provides a normal setup flow, Start Menu/Desktop shortcuts and uninstall support. The portable ZIP is also published.
4. Linux users can run the AppImage or install the `.deb`; both bundle the Electron runtime and compiled game.
5. Package generation is automated. Native rendering, audio, fullscreen, save/reopen and performance qualification still require suitable Windows/Linux hardware. This Ubuntu 20.04 VMware guest is a logic-test environment, not certification of the released Linux minimum.
6. Future versions should update `package.json`, run environment-compatible checks, push source, push a `v*` tag, and let the workflow publish the matching release artifacts.

The packaging/release workflow is committed for the first DriveHorizon release, `v0.1.0`. Development continues in the existing local project and the same repository; the initial release does not replace native platform qualification.

## Verification boundary

Host/preload wiring and protocol behavior can be tested in Node without a native window. The pinned Linux Electron runtime has been downloaded, and `ldd` resolves its libraries on this guest. That does not certify native-window gameplay or GPU rendering. Desktop packaging uses the machine's graphics driver; it cannot supply the VMware guest's missing WebGL2 features.
