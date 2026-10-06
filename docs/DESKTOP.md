# Desktop application path

## Decision

Preserve Harborline's existing TypeScript/Three.js gameplay and distribute it with **Electron**, using **electron-builder** for installers in the next phase. Electron bundles Chromium, giving this WebGL/Web Audio implementation a consistent engine on Windows and Linux. The practical tradeoff is a larger download and memory footprint than a small native executable.

The repository remains a web-technology game. Packaging it in a native application window is a legitimate standalone desktop deployment; `dist/` by itself is only web assets. No game installer or GitHub Release has been produced in this session.

## Architecture already prepared

```text
Installed Harborline launcher
  → bundled Electron runtime
    → electron/main.cjs (native window and application lifecycle)
      → harborline://app/index.html (local compiled dist/ assets)
        → src/main.ts → src/game.ts → existing gameplay modules
```

- The host reads packaged assets through a registered local protocol. It does not start Vite or an HTTP server, open an external browser, or download game assets.
- The renderer is sandboxed and context-isolated, with Node integration disabled. A small preload bridge provides fullscreen, quit and close-save notifications.
- The local protocol serves only the entry page, icon and approved compiled assets. Native controls verify the sending window and main frame.
- The desktop title/pause menus provide quit; F11 and Settings toggle fullscreen.
- Closing the native window requests a synchronous career save, then acknowledges close. A short fallback handles an unresponsive renderer.
- Saves retain the existing `harborline-save-v1` key, with version-two data and version-one migration. Chromium persists localStorage under the application's stable user-data profile. Typical directories are `%APPDATA%/Harborline` on Windows and `~/.config/Harborline` on Linux, subject to OS/XDG configuration. These are profile directories, not a promised plain JSON save-file path.
- Browser preview and desktop saves are separate origins/profiles. Automatic browser-to-desktop career transfer is not implemented; an export/import option can be added before migration to released packages if needed.

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

## Packaging after gameplay approval

1. Add the pinned electron-builder tool and distribution metadata. Bundle `dist/`, the host/preload files, app metadata and required licenses in the application archive. Give the application stable IDs (`com.harborline.coastalcourier`) and proper Windows/Linux icons.
2. Produce **Windows x64 NSIS installers**, preferably on a Windows build runner. The installed game includes the runtime and launches normally from Start/Desktop. Sign the Windows application/installer when signing credentials are available.
3. Produce **Linux x64 AppImage and Ubuntu/Debian `.deb` packages**, on an appropriate Linux build runner. Include desktop-menu integration and declare the real system library dependencies. Test AppImage execution/FUSE behavior and `.deb` installation on clean supported systems.
4. Qualify actual supported versions: Windows 10/11 x64 and supported Ubuntu LTS x64 are the initial targets. Check supported Electron/Chromium OS versions at release time. This Ubuntu 20.04 VMware guest is a logic-test environment, not certification of the released Linux minimum.
5. Verify the installed packages offline on graphics-capable machines: driving, every customer/service, settings, fullscreen, audio, native-window close/reopen, save migration, rendering restoration and frame rates. Validate updates retain the same save origin/profile.
6. After user review, successful platform checks and a separate release instruction, prepare a tagged GitHub Release and real artifacts with checksums and run instructions in `hussnainahmedd/astra-3d-car-game`.

These packaging steps are deferred. The current GitHub task is a work-in-progress source backup to `hussnainahmedd/astra-3d-car-game`; it does not package the application or publish a GitHub Release. Development continues in the existing local project and the same repository.

## Verification boundary

Host/preload wiring and protocol behavior can be tested in Node without a native window. The pinned Linux Electron runtime has been downloaded, and `ldd` resolves its libraries on this guest. That does not certify native-window gameplay or GPU rendering. Desktop packaging uses the machine's graphics driver; it cannot supply the VMware guest's missing WebGL2 features.
