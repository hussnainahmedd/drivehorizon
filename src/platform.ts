interface DesktopBridge {
  readonly platform: 'desktop';
  toggleFullscreen(): Promise<boolean>;
  quit(): Promise<void>;
  onClose(callback: () => void): () => void;
}

declare global { interface Window { driveHorizonDesktop?: DesktopBridge } }

export function desktopBridge() { return typeof window !== 'undefined' ? window.driveHorizonDesktop : undefined; }

export async function toggleFullscreen() {
  const desktop = desktopBridge();
  if (desktop) return desktop.toggleFullscreen();
  if (document.fullscreenElement) { await document.exitFullscreen(); return false; }
  await document.documentElement.requestFullscreen(); return true;
}
