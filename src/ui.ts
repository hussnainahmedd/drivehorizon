import { DEPOT, DESTINATIONS, FUEL_STATION, GARAGE, ROADS, district, roadInfo, type Settings } from './config';
import { clamp, formatDistance, formatMoney, type Point } from './math';
import type { VehiclePhysics } from './physics';
import type { Progression, DeliveryResult } from './progression';
import type { World } from './world';
import type { Traffic } from './traffic';
import { MILESTONES, RANKS, UPGRADES, type UpgradeId } from './career';
import { mapProjection, roadDistance, routeLength } from './navigation';
import { desktopBridge } from './platform';

export type Screen = 'menu' | 'drive' | 'pause' | 'settings' | 'jobs' | 'map' | 'result' | 'help' | 'career' | 'garage' | 'new-career' | 'graphics';
export interface UIState {
  vehicle: VehiclePhysics; progress: Progression; world: World; traffic: Traffic;
  screen: Screen; target: Point; route: Point[]; headlights: boolean; prompt: string; promptSub: string; promptKey: string;
  fps: number; camera: string; navigation: string; navDistance: string;
}
const icons: Record<string, string> = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',
  fuel: '<path d="M4 21V4h10v17M2 21h14M4 10h10M14 8h3l3 4v6a2 2 0 0 0 4 0V9l-4-4"/>',
  wrench: '<path d="m14 7 3 3 4-4a6 6 0 0 1-8 8l-7 7-3-3 7-7a6 6 0 0 1 8-8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon: '<path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  light: '<path d="M15 5a7 7 0 0 0 0 14V5zm4 1h4m-4 4h4m-4 4h4m-4 4h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M9 15v6"/>',
  road: '<path d="m7 3-4 18M17 3l4 18M12 3v4m0 3v4m0 3v4"/>',
};
export const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.compass}</svg>`;
const kbd = (key: string) => `<kbd>${key}</kbd>`;

export class GameUI {
  private overlay: HTMLElement;
  private hud: HTMLElement;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private elements: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private currentScreen: Screen = 'menu';
  private currentMapState?: UIState;
  private lastPrompt = '';
  private isNight = false;
  onAction: (action: string, value?: string) => void = () => {};
  onSetting: (key: keyof Settings, value: string) => void = () => {};
  onImport: (raw: string) => void = () => {};

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="screen-grain"></div><div class="edge-vignette"></div>
      <div id="hud" class="hud hidden">
        <header class="topbar"><div class="wordmark"><span class="brand-symbol">H<span>Ⅱ</span></span><div>HARBORLINE<small>COASTAL COURIER</small></div></div>
          <div class="location"><span id="district">SOUTH QUAY</span><strong id="street">Harbor Boulevard</strong></div>
          <div class="top-right"><div class="weather"><span id="time-icon">${icon('sun')}</span><span id="clock">16:48</span><span class="weather-temp">18°</span></div><div class="wallet"><span class="wallet-label">BALANCE</span><strong id="money">$350</strong></div><button class="icon-button" data-action="pause" aria-label="Pause game">Ⅱ</button></div>
        </header>
        <section class="assignment glass" id="assignment"><div class="eyebrow"><i class="live-dot"></i><span id="mission-label">ON YOUR OWN TIME</span><span class="assignment-index" id="mission-index">01</span></div><h2 id="mission-title">A city of possibilities.</h2><p id="mission-copy">Visit dispatch to pick up your first delivery.</p><div class="assignment-footer"><span id="mission-detail">${icon('box')} DISPATCH IS OPEN</span><span id="mission-reward">LET’S DRIVE</span></div><div class="cargo-line hidden" id="cargo-line"><span>PACKAGE CONDITION</span><div><i id="cargo-fill"></i></div><b id="cargo-value">100%</b></div><div class="career-line"><span id="career-rank">NEW COURIER</span><span id="career-xp">0 XP</span></div></section>
        <div class="navigation glass" id="navigation"><span class="nav-icon" id="nav-icon">↑</span><div><strong id="nav-distance">21 m</strong><span id="nav-instruction">Harborline dispatch</span></div><span class="nav-badge">GPS</span></div>
        <div class="destination-label hidden" id="destination-label"><span>${icon('box')}</span><strong id="destination-distance">100 m</strong></div>
        <div class="interaction hidden" id="interaction"><kbd id="interact-key">E</kbd><div><strong id="interact-title">Open dispatch</strong><span id="interact-sub">Find your next delivery</span></div></div>
        <div class="map-corner"><div class="map-heading"><span><i class="live-dot"></i> LIVE NAVIGATION</span><button data-action="map">EXPAND ${kbd('M')}</button></div><div class="minimap glass"><canvas id="minimap" width="440" height="340" aria-label="Local street map"></canvas><span class="map-north">N</span><span class="map-scale">100 M</span></div><div class="map-caption"><span id="map-target">HARBORLINE DISPATCH</span><span id="route-distance">21 m</span></div></div>
        <div class="drive-hints"><span>${kbd('W A S D')} DRIVE</span><span>${kbd('SPACE')} HANDBRAKE</span><span>${kbd('C')} CAMERA</span><button data-action="help">${kbd('?')} CONTROLS</button></div>
        <section class="instruments glass"><div class="instrument-top"><span class="vehicle-name">ESTATE 2.0 <i>TOURING</i></span><span id="headlights-icon">${icon('light')}</span></div><div class="speed-row"><div class="gear" id="gear">N</div><strong id="speed">000</strong><div class="speed-unit"><span id="speed-unit">KM/H</span><b id="drive-state">READY</b></div></div><div class="rpm-track"><i id="rpm-fill"></i></div><div class="rpm-labels"><span>0</span><span>2</span><span>4</span><span>6</span><span>8 <small>×1000 RPM</small></span></div><div class="car-status"><div>${icon('fuel')}<div class="status-bar"><i id="fuel-fill"></i></div><b id="fuel">100%</b></div><div>${icon('wrench')}<div class="status-bar"><i id="health-fill"></i></div><b id="health">100%</b></div></div></section>
        <div id="damage-flash"></div>
      </div>
      <div id="overlay"></div><div class="toast hidden" id="toast" role="status"></div><div class="save-indicator" id="save-indicator"></div>
    `;
    this.overlay = root.querySelector('#overlay')!; this.hud = root.querySelector('#hud')!;
    this.map = root.querySelector('#minimap')!; this.mapCtx = this.map.getContext('2d')!;
    root.querySelectorAll<HTMLElement>('[id]').forEach(e => this.elements[e.id] = e);
    root.addEventListener('click', e => { const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (!button || button.hasAttribute('disabled')) return; if (button.dataset.action === 'import-save') { this.overlay.querySelector<HTMLInputElement>('#save-file')?.click(); return; } this.onAction(button.dataset.action!, button.dataset.value); });
    root.addEventListener('change', e => { const input = e.target as HTMLInputElement; if (input.id === 'save-file') { const file = input.files?.[0]; input.value = ''; if (file) void file.text().then(raw => this.onImport(raw)).catch(() => this.toast('That career backup could not be read.', 'error')); return; } if (input.dataset.setting) this.onSetting(input.dataset.setting as keyof Settings, input.type === 'checkbox' ? String(input.checked) : input.value); });
    root.addEventListener('input', e => { const input = e.target as HTMLInputElement; if (input.dataset.setting && input.type === 'range') { this.onSetting(input.dataset.setting as keyof Settings, input.value); const out = input.parentElement?.querySelector('output'); if (out) out.textContent = input.dataset.setting === 'volume' ? `${Math.round(Number(input.value) * 100)}%` : `${Number(input.value).toFixed(1)}×`; } });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || this.currentScreen === 'drive') return;
      const controls = [...this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')];
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !this.overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !this.overlay.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
  }

  show(screen: Screen, progress: Progression, result?: DeliveryResult) {
    this.currentScreen = screen; this.lastPrompt = '';
    this.hud.classList.toggle('hidden', screen === 'menu');
    this.hud.classList.toggle('dimmed', screen !== 'drive');
    this.overlay.className = screen === 'drive' ? 'hidden' : `overlay screen-${screen}`;
    if (screen === 'drive') { this.overlay.innerHTML = ''; return; }
    if (screen === 'menu') this.overlay.innerHTML = this.menu(progress);
    if (screen === 'pause') this.overlay.innerHTML = this.pause(progress);
    if (screen === 'settings') this.overlay.innerHTML = this.settings(progress.settings);
    if (screen === 'jobs') this.overlay.innerHTML = this.jobs(progress);
    if (screen === 'help') this.overlay.innerHTML = this.help();
    if (screen === 'map') this.overlay.innerHTML = this.bigMap(progress);
    if (screen === 'result' && result) this.overlay.innerHTML = this.result(result, progress);
    if (screen === 'career') this.overlay.innerHTML = this.career(progress);
    if (screen === 'garage') this.overlay.innerHTML = this.garage(progress);
    if (screen === 'new-career') this.overlay.innerHTML = `<div class="modal pause-modal"><div class="eyebrow">A NEW CHAPTER</div><h1>Start a fresh career?</h1><p class="modal-copy">This replaces your current deliveries, balance and vehicle upgrades. Your settings stay with you.</p><button class="primary-button" data-action="confirm-new-game">START NEW CAREER ${icon('arrow')}</button><button class="secondary-button" data-action="back">KEEP MY JOURNEY</button></div>`;
    if (screen === 'graphics') this.overlay.innerHTML = `<div class="modal pause-modal"><div class="eyebrow">GRAPHICS INTERRUPTED</div><h1>Your journey is paused.</h1><p class="modal-copy">The graphics driver lost its context. The game will return to pause if it recovers. ${progress.saveAvailable ? 'Your latest progress is saved.' : 'Saving is unavailable on this device.'}</p><button class="primary-button" data-action="reload">RELOAD THE GAME ${icon('arrow')}</button><div class="modal-footnote">NO SIMULATION OR FUEL CONSUMPTION WHILE INTERRUPTED</div></div>`;
    this.overlay.setAttribute('role', screen === 'menu' ? 'main' : 'dialog');
    this.overlay.setAttribute('aria-label', screen === 'new-career' ? 'Start new career' : screen);
    this.overlay.setAttribute('aria-modal', String(screen !== 'menu'));
    window.setTimeout(() => this.overlay.querySelector<HTMLButtonElement>('.primary-button')?.focus({ preventScroll: true }), 60);
  }

  private menu(p: Progression) { return `
    <div class="menu-top"><div class="wordmark"><span class="brand-symbol">H<span>Ⅱ</span></span><div>HARBORLINE<small>COASTAL COURIER</small></div></div><span class="edition">AN OPEN-WORLD DRIVING EXPERIENCE <i>01 / 2026</i></span></div>
    <main class="menu-content"><div class="eyebrow"><span class="line"></span> THE COAST IS CALLING</div><h1>Take the<br>scenic route<span>.</span></h1><p>A full tank. An open road. A city to call your own.<br>Make a living, one delivery at a time.</p><div class="menu-actions"><button class="primary-button" data-action="start"><span>${p.hasSave ? 'CONTINUE YOUR JOURNEY' : 'GET BEHIND THE WHEEL'}</span>${icon('arrow')} ${kbd('↵')}</button><div class="menu-secondary"><button data-action="settings">${icon('settings')} SETTINGS</button><button data-action="help">${icon('road')} HOW TO PLAY</button>${p.hasSave ? '<button data-action="new-game">NEW CAREER</button>' : ''}${desktopBridge() ? '<button data-action="quit">QUIT</button>' : ''}</div></div><div class="menu-meta"><span><i class="live-dot"></i> HARBOR CITY</span><span>FREE ROAM + DELIVERIES</span><span>100% LOCAL</span></div></main>
    <div class="menu-vehicle"><span class="eyebrow">YOUR FIRST SET OF KEYS</span><strong>Estate 2.0 Touring</strong><p>1480 KG <span>•</span> REAR-WHEEL DRIVE <span>•</span> YOUR NEXT CHAPTER</p></div>
    <footer class="menu-footer"><span>BUILT FOR THE LONG WAY HOME.</span><span>KEYBOARD + MOUSE <span class="footer-dot">•</span> ${desktopBridge() ? 'DESKTOP EDITION' : 'BROWSER DEVELOPMENT BUILD'}</span><span class="version">V 1.0 · REVIEW BUILD</span></footer>`; }

  private pause(p: Progression) { return `<div class="modal pause-modal"><div class="eyebrow">TAKE A BREATHER</div><h1>Parked for a moment.</h1><p class="modal-copy">The city can wait. ${p.saveAvailable ? 'Your journey is saved automatically.' : 'Saving is unavailable. Your journey is session-only.'}</p><div class="career-stats"><div><strong>${formatMoney(p.money)}</strong><span>BALANCE</span></div><div><strong>${String(p.completed).padStart(2, '0')}</strong><span>DELIVERIES</span></div><div><strong>${(p.vehicle.totalDistance / 1000).toFixed(1)}<small> KM</small></strong><span>DISTANCE</span></div></div><div class="rank-summary"><strong>${p.career.rank.name}</strong><span>${p.xp} XP ${p.career.next ? ` / ${p.career.next.xp}` : ' · MAX RANK'}</span></div><button class="primary-button" data-action="resume">BACK ON THE ROAD ${icon('arrow')} ${kbd('ESC')}</button><div class="pause-grid"><button class="secondary-button" data-action="settings">${icon('settings')} Settings</button><button class="secondary-button" data-action="map">${icon('compass')} City map</button><button class="secondary-button" data-action="help">${icon('road')} Controls</button><button class="secondary-button" data-action="career">${icon('box')} Career journal</button><button class="secondary-button" data-action="rescue">${icon('wrench')} Tow to dispatch · ${formatMoney(Math.min(p.money, 75))}</button>${p.mission ? '<button class="secondary-button" data-action="cancel-mission">Return cargo · no charge</button>' : ''}</div><button class="text-button" data-action="menu">SAVE & RETURN TO MAIN MENU</button>${desktopBridge() ? '<button class="text-button" data-action="quit">SAVE & QUIT TO DESKTOP</button>' : ''}<div class="modal-footnote">${p.saveAvailable ? 'PROGRESS SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE · PROGRESS IS SESSION-ONLY'}</div></div>`; }

  private settings(s: Settings) {
    const select = (key: keyof Settings, items: [string, string][]) => `<select data-setting="${key}">${items.map(([value, label]) => `<option value="${value}" ${String(s[key]) === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
    return `<div class="modal settings-modal"><div class="modal-title"><div><div class="eyebrow">MAKE YOURSELF AT HOME</div><h1>Fine tuning.</h1></div><button class="icon-button" data-action="back" aria-label="Close settings">${icon('close')}</button></div><div class="settings-list">
      <label><div><strong>Graphics quality</strong><span>Resolution, shadows & draw distance</span></div>${select('quality', [['low', 'Performance'], ['medium', 'Balanced'], ['high', 'High fidelity']])}</label>
      <label><div><strong>Time of day</strong><span>A full day unfolds in 30 minutes</span></div>${select('timeMode', [['cycle', 'Living day / night'], ['day', 'Clear afternoon'], ['sunset', 'Golden hour'], ['night', 'After dark']])}</label>
      <label><div><strong>Camera</strong><span>Also cycle with C while driving</span></div>${select('camera', [['chase', 'Cinematic chase'], ['close', 'Close chase'], ['hood', 'Hood view']])}</label>
      <label><div><strong>Render frame limit</strong><span>Physics always runs at 120 Hz</span></div>${select('frameLimit', [['30', '30 FPS'], ['60', '60 FPS'], ['120', '120 FPS'], ['0', 'Uncapped']])}</label>
      <label><div><strong>Speed units</strong><span>Your preferred instrument display</span></div>${select('units', [['kmh', 'Kilometers / hour'], ['mph', 'Miles / hour']])}</label>
      <label><div><strong>Audio volume</strong><span>Engine, tires & city sounds</span></div><div class="range-control"><input aria-label="Audio volume" data-setting="volume" type="range" min="0" max="1" step="0.05" value="${s.volume}"><output>${Math.round(s.volume * 100)}%</output></div></label>
      <label><div><strong>Look sensitivity</strong><span>Hold right mouse button to look around</span></div><div class="range-control"><input aria-label="Look sensitivity" data-setting="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${s.sensitivity}"><output>${s.sensitivity.toFixed(1)}×</output></div></label>
      <label><div><strong>Road guidance</strong><span>Subtle route markers on the road</span></div><input data-setting="showRoute" type="checkbox" ${s.showRoute ? 'checked' : ''} aria-label="Road guidance"></label>
      <label><div><strong>Camera shake</strong><span>Impact feedback without changing handling</span></div><input data-setting="cameraShake" type="checkbox" ${s.cameraShake ? 'checked' : ''} aria-label="Camera shake"></label>
    </div><div class="save-tools"><div><strong>Career backup</strong><span>Move your local career between browser ports or a future desktop build.</span></div><div><button class="secondary-button" data-action="export-save">EXPORT</button><button class="secondary-button" data-action="import-save">IMPORT</button><input id="save-file" type="file" accept="application/json,.json" hidden></div></div><button class="secondary-button" data-action="fullscreen">${icon('compass')} Toggle fullscreen · F11</button><button class="primary-button" data-action="back">ALL SET ${icon('check')}</button></div>`;
  }

  private career(p: Progression) {
    const customers = DESTINATIONS.map((d, i) => `<div><span>${d.name}</span><strong>${p.visits[i]} ${p.visits[i] === 1 ? 'delivery' : 'deliveries'} · ${p.bestTimes[i] === null ? '—' : `${p.bestTimes[i]!.toFixed(1)}s`}</strong></div>`).join('');
    return `<div class="modal career-modal"><div class="modal-title"><div><div class="eyebrow">ONE DELIVERY AT A TIME</div><h1>Your coastal career.</h1></div><button class="icon-button" data-action="back" aria-label="Close career">${icon('close')}</button></div><div class="rank-summary"><strong>${p.career.rank.name}</strong><span>${p.xp} XP · ${formatMoney(p.earnings)} LIFETIME EARNINGS</span></div><div class="career-progress" role="progressbar" aria-label="Rank progress" aria-valuenow="${Math.round(p.career.fraction * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p.career.fraction * 100}%"></i></div><p class="modal-copy">${p.career.next ? `${p.career.next.xp - p.xp} XP to ${p.career.next.name} · promotion reward ${formatMoney(p.career.next.bonus)}.` : 'Coastal Professional. Every road here knows your name.'}</p><div class="milestone-list">${MILESTONES.map(m => `<div class="milestone ${p.awards.includes(m.id) ? 'earned' : ''}"><span>${icon(p.awards.includes(m.id) ? 'check' : 'box')}</span><div><strong>${m.name}</strong><p>${m.description}</p></div><b>${p.awards.includes(m.id) ? 'EARNED' : formatMoney(m.reward)}</b></div>`).join('')}</div><h3 class="section-heading">CUSTOMER LOG · CLEAN-DELIVERY BEST TIMES</h3><div class="customer-log">${customers}</div><button class="primary-button" data-action="back">KEEP GOING ${icon('arrow')}</button></div>`;
  }

  private garage(p: Progression) {
    const repairCost = Math.ceil((100 - p.vehicle.health) * 3.2);
    return `<div class="modal garage-modal"><div class="modal-title"><div><div class="eyebrow">QUAYSIDE MOTOR WORKS</div><h1>A little more touring.</h1><p class="modal-copy">Maintain your Estate, then make it your own. Upgrades stay with this career.</p></div><button class="icon-button" data-action="resume" aria-label="Leave workshop">${icon('close')}</button></div><div class="dispatch-summary"><span>CONDITION <b>${Math.ceil(p.vehicle.health)}%</b></span><span>BALANCE <b>${formatMoney(p.money)}</b></span></div><button class="secondary-button service-button" data-action="repair" ${p.vehicle.health >= 99.99 || p.money <= 0 ? 'disabled' : ''}>${icon('wrench')} Repair vehicle · ${formatMoney(Math.min(p.money, repairCost))}${p.money < repairCost ? ' (partial repair)' : ''}</button><div class="upgrade-list">${(Object.keys(UPGRADES) as UpgradeId[]).map(id => { const u = UPGRADES[id], offer = p.upgradeOffer(id); return `<div class="upgrade"><div><div class="eyebrow">LEVEL ${offer.level} / 3</div><h3>${u.name}</h3><p>${u.description}</p></div><button class="secondary-button" data-action="upgrade" data-value="${id}" ${offer.available ? '' : 'disabled'}>${offer.maxed ? 'FULLY EQUIPPED' : p.career.index < offer.requiredRank ? `REQUIRES ${RANKS[offer.requiredRank].name.toUpperCase()}` : `${formatMoney(offer.price)} · FIT LEVEL ${offer.level + 1}`}</button></div>`; }).join('')}</div><p class="help-note">Higher upgrade levels unlock with courier ranks. Earn XP and milestone rewards by completing deliveries.</p><button class="primary-button" data-action="resume">BACK ON THE ROAD ${icon('arrow')}</button></div>`;
  }

  private jobs(p: Progression) { return `<div class="modal dispatch-modal"><div class="modal-title"><div><div class="eyebrow"><i class="live-dot"></i> HARBORLINE DISPATCH</div><h1>Good things in transit.</h1><p class="modal-copy">Choose a delivery. We’ll load up; you take the wheel.</p></div><button class="icon-button" data-action="resume" aria-label="Close dispatch">${icon('close')}</button></div><div class="dispatch-summary"><span>AVAILABLE CONTRACTS <b>06</b></span><span>YOUR BALANCE <b>${formatMoney(p.money)}</b></span></div><div class="contract-list">${DESTINATIONS.map((d, i) => `<button class="contract ${i === p.completed % DESTINATIONS.length ? 'recommended' : ''}" data-action="accept" data-value="${i}"><span class="contract-number">${String(i + 1).padStart(2, '0')}</span><span class="contract-content"><span class="contract-area">${d.district} ${i === p.completed % DESTINATIONS.length ? '<b>RECOMMENDED</b>' : ''}</span><strong>${d.name}</strong><span class="contract-desc">${d.description}</span><span class="contract-tags">${icon('box')} ${d.cargo}<i>•</i> ${formatDistance(roadDistance(DEPOT, d))}</span></span><span class="contract-pay"><strong>${formatMoney(d.reward)}</strong><small>+ BONUSES</small>${icon('arrow')}</span></button>`).join('')}</div><div class="dispatch-footer">${icon('compass')} Park in the destination’s green loading bay, then press E to deliver.<span>NO HARD DEADLINES. DRIVE WELL.</span></div></div>`; }

  private help() { return `<div class="modal help-modal"><div class="modal-title"><div><div class="eyebrow">A LITTLE LOCAL KNOWLEDGE</div><h1>Know your way around.</h1></div><button class="icon-button" data-action="back" aria-label="Close controls">${icon('close')}</button></div><div class="help-columns"><section><h3>BEHIND THE WHEEL</h3>${[['W / ↑', 'Accelerate'], ['S / ↓', 'Brake · hold at rest to reverse'], ['A D / ← →', 'Steer left / right'], ['SPACE', 'Handbrake'], ['E / ENTER', 'Interact · accept / deliver / service'], ['R', 'Reset to the nearest road'], ['H', 'Toggle headlights'], ['B', 'Horn']].map(([key, text]) => `<div class="control-row">${kbd(key)}<span>${text}</span></div>`).join('')}</section><section><h3>THE BIGGER PICTURE</h3>${[['C', 'Cycle chase / close / hood camera'], ['Q / F', 'Look left / right'], ['MOUSE RIGHT', 'Hold and drag to orbit camera'], ['SCROLL', 'Adjust chase camera distance'], ['M', 'Open city map'], ['ESC / P', 'Pause & settings'], ['?', 'This handy guide']].map(([key, text]) => `<div class="control-row">${kbd(key)}<span>${text}</span></div>`).join('')}</section></div><div class="help-tips"><div><b>01 / PICK SOMETHING UP</b><p>Stop at Harborline dispatch in South Quay. Press E and choose a contract.</p></div><div><b>02 / ENJOY THE DRIVE</b><p>Follow your GPS and green marker. Brake before a corner; smooth inputs preserve grip and cargo.</p></div><div><b>03 / MAKE IT COUNT</b><p>Park within 9 m of the destination and press E. Earn money, then return to dispatch for another run.</p></div></div><p class="help-note">Tidal refuels your car. Quayside repairs damage. Both are marked on the map. Stuck or out of fuel? Pause and call a tow.</p><button class="primary-button" data-action="back">GOT IT. LET’S DRIVE. ${icon('arrow')}</button></div>`; }

  private bigMap(p: Progression) { return `<div class="modal map-modal"><div class="modal-title"><div><div class="eyebrow">YOUR CORNER OF THE COAST</div><h1>Harbor City.</h1></div><button class="icon-button" data-action="back" aria-label="Close map">${icon('close')}</button></div><div class="full-map-layout"><div class="full-map-wrap"><canvas id="full-map" width="1100" height="1100" aria-label="Map of Harbor City"></canvas><span class="full-map-north">N ↑</span><span class="full-map-water">H A R B O R &nbsp; B A Y</span></div><aside><h3>SET A DESTINATION</h3><button class="map-place" data-action="waypoint" data-value="depot">${icon('box')}<span><b>Harborline dispatch</b><small>CONTRACTS · SOUTH QUAY</small></span>${icon('arrow')}</button><button class="map-place" data-action="waypoint" data-value="fuel">${icon('fuel')}<span><b>Tidal fuel station</b><small>$1.80 / % · FOUNDRY STREET</small></span>${icon('arrow')}</button><button class="map-place" data-action="waypoint" data-value="garage">${icon('wrench')}<span><b>Quayside Motor Works</b><small>$3.20 / % · JUNIPER AVENUE</small></span>${icon('arrow')}</button>${p.mission ? `<div class="map-active"><div class="eyebrow">CURRENT DELIVERY</div><h3>${DESTINATIONS[p.mission.index].name}</h3><p>${DESTINATIONS[p.mission.index].cargo}</p><button class="text-button" data-action="waypoint" data-value="mission">TRACK DELIVERY ${icon('arrow')}</button></div>` : '<p class="map-hint">Need a destination? There’s always work waiting at dispatch.</p>'}<div class="map-legend"><span><i class="legend-dot lime"></i> DELIVERY / DISPATCH</span><span><i class="legend-dot amber"></i> FUEL STATION</span><span><i class="legend-dot blue"></i> REPAIR SHOP</span><span><i class="legend-dot white"></i> YOUR VEHICLE</span></div></aside></div><div class="modal-footnote">${kbd('M')} OR ${kbd('ESC')} TO RETURN TO THE ROAD · SIMULATION PAUSED</div></div>`; }

  private result(r: DeliveryResult, p: Progression) { return `<div class="modal result-modal"><div class="delivery-stamp">${icon('check')}</div><div class="eyebrow">ANOTHER GOOD ARRIVAL</div><h1>Right on their doorstep.</h1><p class="modal-copy">Delivery complete at <strong>${r.name}</strong>.</p><div class="reward-total"><span>YOU EARNED</span><strong>+${formatMoney(r.total)}</strong></div><div class="receipt"><div><span>Delivery payment</span><strong>${formatMoney(r.base)}</strong></div><div><span>On-time bonus</span><strong>+${formatMoney(r.bonus)}</strong></div><div><span>Careful handling · ${Math.round(r.cargo)}%</span><strong>+${formatMoney(r.condition)}</strong></div>${r.rankBonus ? `<div><span>Promotion · ${RANKS[r.rankAfter].name}</span><strong>+${formatMoney(r.rankBonus)}</strong></div>` : ''}${r.milestoneBonus ? `<div><span>Milestones · ${r.milestones.join(', ')}</span><strong>+${formatMoney(r.milestoneBonus)}</strong></div>` : ''}<div class="receipt-total"><span>NEW BALANCE</span><strong>${formatMoney(p.money)}</strong></div></div><div class="rank-summary"><strong>+${r.xp} XP · ${p.career.rank.name}</strong><span>${r.seconds.toFixed(1)}s JOURNEY</span></div><button class="primary-button" data-action="next-job">BACK TO DISPATCH ${icon('arrow')}</button><button class="text-button" data-action="resume">TAKE THE SCENIC ROUTE</button><div class="modal-footnote">${p.completed} DELIVERY${p.completed === 1 ? '' : 'S'} COMPLETED · ${p.saveAvailable ? 'PROGRESS SAVED' : 'SAVE UNAVAILABLE'}</div></div>`; }

  update(s: UIState, dt: number) {
    this.currentMapState = s;
    const v = s.vehicle, p = s.progress, m = p.mission, d = m ? DESTINATIONS[m.index] : null;
    const set = (id: string, text: string) => { if (this.elements[id].textContent !== text) this.elements[id].textContent = text; };
    set('district', district(v.x, v.z)); set('street', roadInfo(v.x, v.z).street);
    set('clock', `${String(Math.floor(s.world.hour)).padStart(2, '0')}:${String(Math.floor(s.world.hour % 1 * 60)).padStart(2, '0')}`);
    if (this.isNight !== (s.world.night > 0.5)) { this.isNight = s.world.night > 0.5; this.elements['time-icon'].innerHTML = icon(this.isNight ? 'moon' : 'sun'); }
    set('money', formatMoney(p.money)); set('speed', String(Math.round(v.speed * (p.settings.units === 'mph' ? 2.23694 : 3.6))).padStart(3, '0'));
    set('career-rank', p.career.rank.name.toUpperCase()); set('career-xp', `${p.xp} XP`);
    set('save-indicator', !p.saveAvailable ? 'SAVE UNAVAILABLE · SESSION ONLY' : p.lastSavedAt && Date.now() - p.lastSavedAt < 2000 ? 'JOURNEY SAVED' : '');
    set('speed-unit', p.settings.units === 'mph' ? 'MPH' : 'KM/H');
    set('gear', v.forwardSpeed < -0.5 ? 'R' : v.speed < 0.4 ? 'N' : String(v.gear));
    set('drive-state', v.handbraking ? 'HANDBRAKE' : v.fuel <= 0 ? 'NO FUEL' : v.health <= 0 ? 'DISABLED' : !v.onRoad ? 'OFF ROAD' : v.braking > 0.1 ? 'BRAKING' : 'TOURING');
    this.elements['drive-state'].classList.toggle('warning', v.handbraking || v.health < 25 || v.fuel < 15);
    set('fuel', `${Math.ceil(v.fuel)}%`); set('health', `${Math.ceil(v.health)}%`);
    this.elements['fuel-fill'].style.width = `${v.fuel}%`; this.elements['health-fill'].style.width = `${v.health}%`;
    this.elements['fuel-fill'].style.background = v.fuel < 20 ? '#eda477' : ''; this.elements['health-fill'].style.background = v.health < 35 ? '#eda477' : '';
    this.elements['rpm-fill'].style.width = `${v.rpm / 8000 * 100}%`;
    this.elements['headlights-icon'].classList.toggle('active', s.headlights);
    set('nav-distance', s.navDistance); set('nav-instruction', s.navigation);
    set('nav-icon', s.navigation.includes('around') ? '↶' : s.navigation.includes('left') ? '↰' : s.navigation.includes('right') ? '↱' : '↑');
    if (m && d) {
      set('mission-label', 'DELIVERY IN PROGRESS'); set('mission-index', String(m.index + 1).padStart(2, '0')); set('mission-title', d.name); set('mission-copy', d.cargo);
      const left = Math.max(0, d.time - m.elapsed); set('mission-detail', left > 0 ? `BONUS WINDOW  ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : 'NO RUSH. GET IT THERE SAFELY.');
      set('mission-reward', `EST. ${formatMoney(p.deliveryEstimate!.total)}`);
      this.elements['cargo-line'].classList.remove('hidden'); this.elements['cargo-fill'].style.width = `${m.cargo}%`; set('cargo-value', `${Math.round(m.cargo)}%`);
    } else {
      set('mission-label', 'ON YOUR OWN TIME'); set('mission-index', String(p.completed + 1).padStart(2, '0')); set('mission-title', p.completed ? 'The road is yours.' : 'A city of possibilities.');
      set('mission-copy', 'Visit dispatch to pick up your next delivery.'); set('mission-detail', 'DISPATCH IS OPEN'); set('mission-reward', 'LET’S DRIVE'); this.elements['cargo-line'].classList.add('hidden');
    }
    const targetName = s.target === FUEL_STATION ? 'TIDAL FUEL STATION' : s.target === GARAGE ? 'QUAYSIDE MOTOR WORKS' : d && s.target === d ? d.name.toUpperCase() : 'HARBORLINE DISPATCH';
    set('map-target', targetName);
    set('route-distance', formatDistance(routeLength(s.route)));
    const prompt = s.prompt + s.promptSub + s.promptKey;
    if (this.lastPrompt !== prompt) {
      this.elements.interaction.classList.toggle('hidden', !s.prompt); set('interact-title', s.prompt); set('interact-sub', s.promptSub); set('interact-key', s.promptKey || 'E'); this.lastPrompt = prompt;
    }
    this.drawMap(this.mapCtx, this.map.width, this.map.height, s, false);
    if (this.currentScreen === 'map') { const canvas = this.overlay.querySelector<HTMLCanvasElement>('#full-map'); if (canvas) this.drawMap(canvas.getContext('2d')!, canvas.width, canvas.height, s, true); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.elements.toast.classList.add('hidden'); }
  }

  marker(x: number, y: number, distance: number, visible: boolean) {
    const el = this.elements['destination-label']; el.classList.toggle('hidden', !visible || this.currentScreen !== 'drive');
    if (visible) { el.style.left = `${x}px`; el.style.top = `${y}px`; this.elements['destination-distance'].textContent = formatDistance(distance); }
  }

  private drawMap(ctx: CanvasRenderingContext2D, w: number, h: number, s: UIState, full: boolean) {
    const cx = full ? 12 : s.vehicle.x, cz = full ? 0 : s.vehicle.z;
    const scale = full ? w / 660 : w / 210;
    const { x: px, z: pz } = mapProjection({ x: cx, z: cz }, w, h, scale);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#23373b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#34403c'; ctx.fillRect(px(300), pz(364), 630 * scale, 650 * scale);
    ctx.fillStyle = '#43504a'; ctx.fillRect(px(286), pz(290), 21 * scale, 570 * scale);
    for (const r of ROADS) { ctx.fillStyle = '#606c65'; ctx.fillRect(px(r + 9), pz(286), 18 * scale, 572 * scale); ctx.fillRect(px(286), pz(r + 9), 572 * scale, 18 * scale); }
    for (const b of s.world.buildingFootprints) { ctx.fillStyle = b.park ? '#51644b' : '#424e47'; ctx.fillRect(px(b.x + b.w / 2), pz(b.z + b.d / 2), b.w * scale, b.d * scale); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.route.length) {
      ctx.strokeStyle = '#c9e9a1'; ctx.lineWidth = full ? 5 : 4; ctx.beginPath(); s.route.forEach((p, i) => i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))); ctx.stroke();
    }
    if (!full) for (const car of s.traffic.cars) { ctx.fillStyle = '#abb3a5'; ctx.beginPath(); ctx.arc(px(car.x), pz(car.z), 2.5, 0, Math.PI * 2); ctx.fill(); }
    const marker = (p: Point, color: string, letter: string, radius = full ? 13 : 8) => {
      ctx.fillStyle = '#213330'; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(p.x), pz(p.z), radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (full) { ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, px(p.x), pz(p.z) + 1); }
    };
    marker(DEPOT, '#c9e9a1', 'D'); marker(FUEL_STATION, '#dfb178', 'F'); marker(GARAGE, '#93bbd0', 'R');
    if (full) DESTINATIONS.forEach((d, i) => marker(d, s.progress.mission?.index === i ? '#e2f8b6' : '#93a68f', String(i + 1), 11));
    if (s.target !== DEPOT && s.target !== FUEL_STATION && s.target !== GARAGE) marker(s.target, '#e2f8b6', '●', full ? 16 : 10);
    const x = px(s.vehicle.x), z = pz(s.vehicle.z), size = full ? 12 : 10, fx = -Math.sin(s.vehicle.heading), fz = -Math.cos(s.vehicle.heading);
    ctx.fillStyle = 'rgba(207,237,183,.09)'; ctx.beginPath(); ctx.arc(x, z, size * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f9f4df'; ctx.strokeStyle = '#243632'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + fx * size * 1.5, z + fz * size * 1.5); ctx.lineTo(x - fx * size + fz * size * 0.75, z - fz * size - fx * size * 0.75); ctx.lineTo(x - fx * size * 0.5, z - fz * size * 0.5); ctx.lineTo(x - fx * size - fz * size * 0.75, z - fz * size + fx * size * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (full) {
      ctx.font = '500 15px sans-serif'; ctx.fillStyle = '#a8b5a2'; ctx.textAlign = 'center';
      for (const [name, x, z] of [['SOUTH QUAY', 15, -271], ['NORTH GARDENS', -65, 277], ['OLD TOWN', -180, 57], ['MARKET DISTRICT', 60, 70]] as const) ctx.fillText(name, px(x), pz(z));
    }
  }

  toast(message: string, type = 'info') { this.elements.toast.innerHTML = `${icon(type === 'success' ? 'check' : 'compass')}<span></span>`; this.elements.toast.querySelector('span')!.textContent = message; this.elements.toast.classList.remove('hidden'); this.toastTimer = 4.5; }
  flash() { const e = this.elements['damage-flash']; e.classList.remove('hit'); void e.offsetWidth; e.classList.add('hit'); }
}
