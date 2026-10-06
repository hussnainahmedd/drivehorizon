import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GameAudio } from './audio';
import { DEPOT, DESTINATIONS, FUEL_STATION, GARAGE, findRoute, type Settings } from './config';
import { clamp, damp, dampAngle, distance, formatDistance, formatMoney, type Point } from './math';
import { VehiclePhysics, type DriveInput } from './physics';
import { Progression } from './progression';
import { Traffic } from './traffic';
import { GameUI, type Screen } from './ui';
import { CarModel } from './vehicle';
import { World } from './world';
import { MaterialQuality } from './render-quality';
import { FIXED_DT, FixedStepper, RenderCadence } from './timing';
import { navigationGuidance } from './navigation';
import { sanitizeSettings } from './progression';
import { UPGRADES, type UpgradeId } from './career';
import { createGraphicsRenderer, showFailure, type GraphicsInfo } from './graphics';
import { desktopBridge, toggleFullscreen } from './platform';
import { cameraClearFraction } from './camera';
import { roadResetPosition } from './recovery';

export class Harborline {
  readonly renderer: THREE.WebGLRenderer;
  readonly graphics: GraphicsInfo;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.15, 1800);
  readonly vehicle = new VehiclePhysics();
  readonly progress = new Progression(this.vehicle);
  readonly audio = new GameAudio();
  readonly materials = new MaterialQuality();
  readonly ui = new GameUI(document.querySelector('#ui')!);
  readonly world: World;
  readonly traffic: Traffic;
  readonly car = new CarModel(0x789d92, true);
  screen: Screen = 'menu';
  private previousScreen: Screen = 'menu';
  private keys = new Set<string>();
  private elapsed = 0;
  private stepper = new FixedStepper();
  private renderCadence = new RenderCadence();
  private renderTime = 0;
  private graphicsInterrupted = false;
  private environment?: THREE.WebGLRenderTarget;
  private audioWarning = false;
  private saveWarning = false;
  private lastTime = 0;
  private uiAccumulator = 0;
  private saveTimer = 0;
  private routeTimer = 0;
  private waypoint: Point | null = null;
  private route: Point[] = [];
  private headlights = false;
  private headlightsManual = false;
  private cameraYaw = 0;
  private cameraOrbit = 0;
  private cameraPitch = 0;
  private cameraDistance = 1;
  private dragging = false;
  private cameraTarget = new THREE.Vector3();
  private cameraDesired = new THREE.Vector3();
  private cameraForward = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private cameraInitialized = false;
  private shake = 0;
  private marker = new THREE.Group();
  private markerRing: THREE.Mesh;
  private routeDots: THREE.InstancedMesh;
  private prompt = '';
  private promptSub = '';
  private promptKey = 'E';
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lowFpsTime = 0;
  private resolutionScale = 1;
  private skidMarks: THREE.InstancedMesh;
  private skidIndex = 0;
  private skidTimer = 0;
  private dummy = new THREE.Object3D();
  private lowFuelWarning = false;
  private lowHealthWarning = false;
  private trafficAccumulator = 0;

  constructor(rendererFactory = createGraphicsRenderer) {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const graphics = rendererFactory(canvas);
    this.renderer = graphics.renderer; this.graphics = graphics.info;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.17;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!this.progress.hasSave && (this.graphics.api === 'WebGL 1' || /swiftshader|llvmpipe|software|svga3d/i.test(this.graphics.gpu))) this.progress.settings.quality = 'low';
    this.world = new World(this.scene); this.traffic = new Traffic(this.scene); this.scene.add(this.car.group);
    this.markerRing = new THREE.Mesh(new THREE.RingGeometry(4.7, 5, 64), new THREE.MeshBasicMaterial({ color: 0xd1ed9f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    this.markerRing.rotation.x = -Math.PI / 2; this.markerRing.position.y = 0.055; this.marker.add(this.markerRing);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(4.65, 48), new THREE.MeshBasicMaterial({ color: 0xd1ed9f, transparent: true, opacity: 0.055, depthWrite: false })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.047; this.marker.add(inner);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.4, 12, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xd5edaf, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 6; this.marker.add(beam); this.scene.add(this.marker);
    const dotGeo = new THREE.CircleGeometry(0.3, 8); dotGeo.rotateX(-Math.PI / 2);
    this.routeDots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xd1e9aa, transparent: true, opacity: 0.38, depthWrite: false }), 200); this.routeDots.count = 0; this.routeDots.frustumCulled = false; this.scene.add(this.routeDots);
    const skidGeo = new THREE.PlaneGeometry(0.22, 0.85); skidGeo.rotateX(-Math.PI / 2);
    this.skidMarks = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x252d2c, transparent: true, opacity: 0.32, depthWrite: false }), 400); this.skidMarks.count = 0; this.skidMarks.frustumCulled = false; this.scene.add(this.skidMarks);
    this.applyQuality();
    this.ui.onAction = (action, value) => this.action(action, value);
    this.ui.onSetting = (key, value) => this.setSetting(key, value);
    this.ui.onImport = raw => this.importSave(raw);
    this.ui.show('menu', this.progress);
    this.vehicle.onImpact = impact => { this.progress.impact(impact.speed); this.audio.impact(impact.speed); this.shake = Math.min(0.25, impact.speed * 0.012); this.ui.flash(); if (impact.speed > 6) this.ui.toast('A little less hurry. Your car and cargo felt that.'); };
    this.attachInput(canvas);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pagehide', () => { if (this.progress.hasSave) this.progress.save(); this.audio.mute(); });
    desktopBridge()?.onClose(() => { if (this.progress.hasSave) this.progress.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'drive') this.setScreen('pause'); this.audio.mute(); } this.lastTime = performance.now() / 1000; });
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; if (this.screen === 'drive') this.setScreen('pause'); this.audio.mute(); });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.graphicsInterrupted = true; this.audio.mute(); if (this.progress.hasSave) this.progress.save(); this.setScreen('graphics'); });
    canvas.addEventListener('webglcontextrestored', () => {
      try { this.graphicsInterrupted = false; this.environment?.dispose(); this.environment = undefined; this.applyQuality(); this.cameraInitialized = false; this.setScreen('pause'); this.ui.toast('Graphics restored. Your journey is ready to continue.', 'success'); }
      catch (error) { this.graphicsInterrupted = true; showFailure(error); }
    });
    this.updateRoute();
    this.world.update(0, this.vehicle.position, this.progress.settings, 0, this.progress.worldHour);
    this.traffic.update(0, this.vehicle.position, 0, 0, 0);
    this.car.update(this.vehicle, false, 0);
    this.updateCamera(1);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => { const loading = document.querySelector<HTMLElement>('#loading')!; loading.style.opacity = '0'; window.setTimeout(() => loading.remove(), 550); });
    this.lastTime = performance.now() / 1000;
    this.scheduleFrame();
    if (!desktopBridge() && new URLSearchParams(location.search).has('debug')) this.exposeDebug();
    if (this.progress.loadWarning) this.ui.toast(this.progress.loadWarning === 'corrupt' ? 'The saved career could not be read. A new session is ready; original data is retained in a recovery backup when saving.' : 'Saving is unavailable on this device. Progress is session-only.');
  }

  get target(): Point { return this.waypoint || (this.progress.mission ? DESTINATIONS[this.progress.mission.index] : DEPOT); }

  private setScreen(screen: Screen) {
    if (this.graphicsInterrupted && screen !== 'graphics') return;
    if (screen !== 'drive') { this.keys.clear(); this.dragging = false; this.stepper.reset(); this.audio.pauseDriving(); }
    this.screen = screen; this.ui.show(screen, this.progress);
    if (screen === 'pause' && this.progress.hasSave) this.progress.save();
    if (screen === 'drive') { this.audio.start().catch(() => { if (!this.audioWarning) { this.audioWarning = true; this.ui.toast('Audio could not start. You can still continue your journey.'); } }); this.updateRoute(); this.updatePrompt(); }
  }

  private action(action: string, value?: string) {
    if (action === 'reload') { if (this.progress.hasSave) this.progress.save(); location.reload(); return; }
    if (this.graphicsInterrupted) return;
    if (action === 'start' || action === 'resume') { const first = !this.progress.hasSave; this.setScreen('drive'); this.cameraInitialized = false; if (first) { this.progress.save(); this.ui.toast('Welcome to Harbor City. Press E at dispatch to choose your first delivery.'); } }
    if (action === 'new-game') { this.previousScreen = this.screen; this.setScreen('new-career'); }
    if (action === 'confirm-new-game' && this.screen === 'new-career') { this.progress.newGame(); this.safeSpawn(); this.waypoint = null; this.elapsed = 0; this.saveTimer = this.routeTimer = this.trafficAccumulator = 0; this.headlightsManual = false; this.lowFuelWarning = this.lowHealthWarning = false; this.setScreen('drive'); this.cameraInitialized = false; this.ui.toast('A fresh set of keys. Your new career starts at dispatch.'); }
    if (action === 'pause') this.setScreen('pause');
    if (action === 'menu') { this.progress.save(); this.cameraInitialized = false; this.setScreen('menu'); }
    if (action === 'settings' || action === 'help' || action === 'career') { this.previousScreen = this.screen; this.setScreen(action); }
    if (action === 'map') { this.previousScreen = this.screen === 'pause' ? 'pause' : 'drive'; this.setScreen('map'); }
    if (action === 'back') this.setScreen(this.previousScreen === 'settings' || this.previousScreen === 'help' || this.previousScreen === 'map' ? 'drive' : this.previousScreen);
    if (action === 'cancel-mission' && this.screen === 'pause' && this.progress.cancelMission()) { this.waypoint = null; this.setScreen('pause'); this.updateRoute(); this.ui.toast('Cargo returned to dispatch. There is no cancellation fee.'); }
    if (this.screen === 'garage' && this.vehicle.speed < 1.5 && distance(this.vehicle.x, this.vehicle.z, GARAGE.x, GARAGE.z) < 10) {
      if (action === 'repair') { const cost = this.progress.repair(); this.lowHealthWarning = this.vehicle.health < 25; this.setScreen('garage'); if (cost) this.audio.chime(); this.ui.toast(cost ? `Repairs completed: ${formatMoney(cost)}.` : 'No repairs purchased.'); }
      if (action === 'upgrade' && value && Object.hasOwn(UPGRADES, value)) { const id = value as UpgradeId; if (this.progress.buyUpgrade(id)) { this.setScreen('garage'); this.audio.chime(); this.ui.toast(`${UPGRADES[id].name} fitted · level ${this.progress.upgrades[id]}.`, 'success'); } }
    }
    if (action === 'accept' && this.screen === 'jobs') {
      if (distance(this.vehicle.x, this.vehicle.z, DEPOT.x, DEPOT.z) <= 33 && this.vehicle.speed < 1.5 && this.progress.startMission(Number(value))) {
        this.waypoint = null; this.audio.chime(); this.setScreen('drive'); this.ui.toast(`Loaded up. ${DESTINATIONS[Number(value)].name} is marked on your GPS.`, 'success');
      }
    }
    if (action === 'next-job') { this.waypoint = null; this.setScreen('drive'); this.ui.toast('Dispatch is on your GPS. There’s more good work waiting.'); }
    if (action === 'waypoint') {
      this.waypoint = value === 'fuel' ? FUEL_STATION : value === 'garage' ? GARAGE : value === 'depot' ? DEPOT : null;
      this.setScreen('drive'); this.ui.toast('Destination set. Follow your GPS.');
    }
    if (action === 'rescue' && this.screen === 'pause') { const cost = this.progress.rescue(); this.safeSpawn(); this.waypoint = null; this.cameraInitialized = false; this.lowFuelWarning = this.lowHealthWarning = false; this.setScreen('drive'); this.ui.toast(`Back at dispatch. Roadside assistance: ${formatMoney(cost)}.`, 'success'); }
    if (action === 'fullscreen') toggleFullscreen().catch(() => this.ui.toast('Fullscreen is unavailable in this window.'));
    if (action === 'export-save') this.exportSave();
    if (action === 'quit' && desktopBridge()) { if (this.progress.hasSave) this.progress.save(); void desktopBridge()!.quit(); }
  }

  private exportSave() {
    try {
      const blob = new Blob([this.progress.exportSave()], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'harborline-career-backup.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.ui.toast('Career backup downloaded.', 'success');
    } catch { this.ui.toast('Career backup could not be exported.', 'error'); }
  }

  private importSave(raw: string) {
    if (!window.confirm('Import this career backup? Your current local career will be replaced.')) return;
    if (!this.progress.importSave(raw)) { this.ui.toast('That career backup is invalid or from an incompatible game version.', 'error'); return; }
    if (!this.progress.saveAvailable) { this.ui.toast('Career loaded for this session, but storage is unavailable.'); return; }
    location.reload();
  }

  private setSetting(key: keyof Settings, value: string) {
    const s = this.progress.settings;
    if (key === 'volume' || key === 'sensitivity' || key === 'frameLimit') (s as unknown as Record<string, unknown>)[key] = Number(value);
    else if (key === 'showRoute' || key === 'cameraShake') s[key] = value === 'true';
    else (s as unknown as Record<string, string | number | boolean>)[key] = value;
    this.progress.settings = sanitizeSettings(s);
    if (key === 'quality') { this.resolutionScale = 1; this.lowFpsTime = 0; this.applyQuality(); }
    if (key === 'camera') this.cameraInitialized = false;
    this.progress.save(false);
  }

  private applyQuality() {
    const quality = this.progress.settings.quality;
    if (quality !== 'low' && !this.environment) {
      const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
      try { this.environment = pmrem.fromScene(room, 0.03); } finally { room.dispose(); pmrem.dispose(); }
    }
    this.scene.environment = quality === 'low' ? null : this.environment?.texture ?? null;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.7 : quality === 'medium' ? 1.2 : 0.85) * this.resolutionScale);
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.traffic.drawDistance = quality === 'high' ? 280 : quality === 'medium' ? 220 : 170;
    this.materials.set(this.scene, quality === 'low');
    const size = quality === 'high' ? 2048 : 1024;
    if (this.world.sun.shadow.mapSize.x !== size) { this.world.sun.shadow.mapSize.set(size, size); this.world.sun.shadow.map?.dispose(); this.world.sun.shadow.map = null; }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private resize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }

  private attachInput(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      const code = e.code;
      if ((e.target as HTMLElement).matches('input,select') && code !== 'Escape') return;
      if ((e.target as HTMLElement).closest('button') && (code === 'Enter' || code === 'Space')) return;
      if (code === 'F11') { e.preventDefault(); this.action('fullscreen'); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(code) && this.screen === 'drive') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(code);
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        if (this.graphicsInterrupted) return;
        if (this.screen === 'drive') this.setScreen('pause');
        else if (this.screen === 'pause') this.setScreen('drive');
        else if (this.screen === 'settings' || this.screen === 'help' || this.screen === 'map' || this.screen === 'career' || this.screen === 'new-career') this.action('back');
        else if (this.screen !== 'menu') this.setScreen('drive');
        return;
      }
      if (code === 'Enter' && this.screen === 'menu') { e.preventDefault(); this.action('start'); return; }
      if (code === 'KeyM') { e.preventDefault(); if (this.screen === 'map') this.action('back'); else if (this.screen === 'drive' || this.screen === 'pause') this.action('map'); return; }
      if (code === 'Slash' && e.shiftKey && this.screen === 'drive') { e.preventDefault(); this.action('help'); return; }
      if (this.screen !== 'drive') return;
      if (code === 'KeyE' || code === 'Enter') { e.preventDefault(); this.interact(); }
      if (code === 'KeyH') { this.headlights = !this.headlights; this.headlightsManual = true; this.ui.toast(this.headlights ? 'Headlights on.' : 'Headlights off.'); }
      if (code === 'KeyB') this.audio.horn();
      if (code === 'KeyC') {
        const modes: Settings['camera'][] = ['chase', 'close', 'hood']; const s = this.progress.settings;
        s.camera = modes[(modes.indexOf(s.camera) + 1) % modes.length]; this.cameraInitialized = false; this.progress.save(); this.ui.toast(s.camera === 'hood' ? 'Hood camera.' : s.camera === 'close' ? 'Close chase camera.' : 'Cinematic chase camera.');
      }
      if (code === 'KeyR') this.resetVehicle();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { if (e.button === 2 && this.screen === 'drive') { this.dragging = true; canvas.setPointerCapture(e.pointerId); } });
    canvas.addEventListener('pointerup', e => { this.dragging = false; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', e => { if (this.dragging) { this.cameraOrbit -= e.movementX * 0.005 * this.progress.settings.sensitivity; this.cameraPitch = clamp(this.cameraPitch + e.movementY * 0.008, -1.3, 5); } });
    canvas.addEventListener('wheel', e => { if (this.screen === 'drive') { e.preventDefault(); this.cameraDistance = clamp(this.cameraDistance + e.deltaY * 0.0008, 0.65, 1.7); } }, { passive: false });
  }

  private input(): DriveInput {
    // +yaw turns left in the +Z-forward render convention.
    return { throttle: this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0, brake: this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0, steer: (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0), handbrake: this.keys.has('Space') };
  }

  private simulate(dt: number, input: DriveInput) {
    this.elapsed += dt;
    this.trafficAccumulator += dt;
    if (this.trafficAccumulator >= 1 / 30) { this.traffic.update(this.trafficAccumulator, this.vehicle.position, this.vehicle.forwardSpeed, this.elapsed, this.world.night, this.vehicle.heading); this.trafficAccumulator = 0; }
    this.vehicle.step(dt, input, this.world.colliders, this.traffic.colliders);
    this.progress.update(dt);
  }

  private scheduleFrame() {
    requestAnimationFrame(time => { try { this.frame(time); this.scheduleFrame(); } catch (error) { this.keys.clear(); this.audio.mute(); if (this.progress.hasSave) this.progress.save(); showFailure(error); } });
  }

  private frame(ms: number) {
    const now = ms / 1000, rawDt = Math.max(0, now - this.lastTime), dt = Math.min(0.25, rawDt); this.lastTime = now;
    if (document.hidden || this.graphicsInterrupted) { this.stepper.reset(); this.renderCadence.reset(); this.renderTime = 0; return; }
    this.fpsAccum += rawDt;
    if (this.fpsAccum >= 1) { this.fps = this.fpsFrames / this.fpsAccum; this.fpsFrames = 0; this.fpsAccum = 0; }
    // Automatically lower render resolution on software GPUs without changing simulation accuracy.
    if (this.fps < 28 && (this.screen === 'drive' || this.screen === 'menu')) this.lowFpsTime += rawDt; else this.lowFpsTime = Math.max(0, this.lowFpsTime - rawDt);
    if (this.lowFpsTime > 4 && this.resolutionScale > 0.55) { this.resolutionScale = Math.max(0.55, this.resolutionScale - 0.15); this.lowFpsTime = 0; this.applyQuality(); }
    if (this.screen === 'drive') {
      const input = this.input(); this.stepper.advance(dt, step => this.simulate(step, input));
      this.saveTimer += dt; this.routeTimer += dt;
      if (this.saveTimer > 8) { this.progress.save(); this.saveTimer = 0; }
      if (this.routeTimer > 0.7) { this.updateRoute(); this.routeTimer = 0; }
      this.updatePrompt(); this.updateSkids(dt);
      if (this.vehicle.fuel < 15 && !this.lowFuelWarning) { this.lowFuelWarning = true; this.ui.toast('Running low. Tidal fuel station is marked on your map.'); }
      if (this.vehicle.health < 25 && !this.lowHealthWarning) { this.lowHealthWarning = true; this.ui.toast('Engine damage is limiting power. Visit Quayside Motor Works.'); }
    } else if (this.screen === 'menu') { this.elapsed += dt; this.traffic.update(dt, this.vehicle.position, 0, this.elapsed, this.world.night); }
    if (!this.progress.saveAvailable && !this.saveWarning) { this.saveWarning = true; this.ui.toast('Saving is unavailable. Keep this window open to retain the current session.'); }
    if (this.progress.saveAvailable) this.saveWarning = false;
    this.uiAccumulator += dt; this.renderTime += dt;
    this.audio.update(this.vehicle, document.hasFocus() ? this.progress.settings.volume : 0, this.screen !== 'drive');
    if (!this.renderCadence.due(now, this.progress.settings.frameLimit)) return;
    this.fpsFrames++;
    const renderDt = Math.min(0.25, this.renderTime); this.renderTime = 0;
    this.world.update(0, this.vehicle.position, this.progress.settings, this.elapsed, this.progress.worldHour);
    if (!this.headlightsManual) this.headlights = this.world.night > 0.35;
    this.car.update(this.vehicle, this.headlights, this.world.night);
    this.materials.update();
    this.updateCamera(renderDt);
    this.marker.position.set(this.target.x, 0, this.target.z);
    this.markerRing.scale.setScalar(1 + Math.sin(this.elapsed * 2.2) * 0.025);
    this.marker.visible = this.screen !== 'menu'; this.routeDots.visible = this.screen !== 'menu' && this.progress.settings.showRoute;
    if (this.uiAccumulator > 0.075) { this.updateUI(this.uiAccumulator); this.uiAccumulator = 0; }
    this.renderer.render(this.scene, this.camera);
  }

  private updateUI(dt: number) {
    const destination = this.target === FUEL_STATION ? 'Tidal fuel station' : this.target === GARAGE ? 'Quayside Motor Works' : this.progress.mission && this.target === DESTINATIONS[this.progress.mission.index] ? DESTINATIONS[this.progress.mission.index].name : 'Harborline dispatch';
    const guidance = navigationGuidance(this.route, this.vehicle.position, this.vehicle.heading, destination);
    const navigation = guidance.instruction, navDistance = formatDistance(guidance.distance);
    this.ui.update({ vehicle: this.vehicle, progress: this.progress, world: this.world, traffic: this.traffic, screen: this.screen, target: this.target, route: this.route, headlights: this.headlights, prompt: this.prompt, promptSub: this.promptSub, promptKey: this.promptKey, fps: this.fps, camera: this.progress.settings.camera, navigation, navDistance }, dt);
    this.projected.set(this.target.x, 6.7, this.target.z).project(this.camera);
    const dist = distance(this.vehicle.x, this.vehicle.z, this.target.x, this.target.z);
    this.ui.marker((this.projected.x * 0.5 + 0.5) * window.innerWidth, (-this.projected.y * 0.5 + 0.5) * window.innerHeight, dist, this.projected.z < 1 && Math.abs(this.projected.x) < 0.86 && this.projected.y > -0.6 && this.projected.y < 0.5 && dist > 10);
  }

  private updateCamera(dt: number) {
    const v = this.vehicle, s = this.progress.settings;
    if (this.screen === 'menu') {
      const angle = v.heading - 0.68 + Math.sin(this.elapsed * 0.035) * 0.07;
      this.cameraDesired.set(v.x - Math.sin(angle) * 11.5, 4.6, v.z - Math.cos(angle) * 11.5);
      // Offset the car into the clear right-hand side of the title composition.
      this.lookTarget.set(v.x + Math.cos(angle) * 3.9, 1.35, v.z - Math.sin(angle) * 3.9);
      this.camera.position.copy(this.cameraDesired); this.camera.lookAt(this.lookTarget); this.camera.fov = 52; this.camera.updateProjectionMatrix(); this.car.group.visible = true; this.cameraInitialized = false; return;
    }
    if (!this.dragging) { this.cameraOrbit = damp(this.cameraOrbit, 0, 3.2, dt); this.cameraPitch = damp(this.cameraPitch, 0, 2.5, dt); }
    const look = this.keys.has('KeyQ') ? 1.2 : this.keys.has('KeyF') ? -1.2 : 0;
    const targetYaw = v.heading + this.cameraOrbit + look;
    this.cameraYaw = this.cameraInitialized ? dampAngle(this.cameraYaw, targetYaw, s.camera === 'hood' ? 18 : 4.5, dt) : targetYaw;
    const f = this.cameraForward.set(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    if (s.camera === 'hood') {
      this.cameraDesired.set(v.x + Math.sin(v.heading) * 1.72, 1.18 + v.heave, v.z + Math.cos(v.heading) * 1.72);
      this.lookTarget.set(v.x + f.x * 30, 1.1 + v.pitch * 15, v.z + f.z * 30); this.car.group.visible = true;
    } else {
      this.car.group.visible = true;
      const length = (s.camera === 'close' ? 6.7 : 9.6) * this.cameraDistance + Math.min(2, v.speed * 0.045);
      const height = (s.camera === 'close' ? 2.7 : 4.2) + this.cameraPitch + (this.cameraDistance - 1) * 1.5;
      this.cameraDesired.set(v.x - f.x * length, height, v.z - f.z * length);
      this.lookTarget.set(v.x + Math.sin(v.heading) * 3.8, 1.05, v.z + Math.cos(v.heading) * 3.8);
      // Pull the camera forward if a building lies between it and the car.
      const candidates = this.world.colliders.query(v.x, v.z, length + 3);
      const fraction = cameraClearFraction(v.position, { x: this.cameraDesired.x, z: this.cameraDesired.z }, candidates);
      this.cameraDesired.x = v.x + (this.cameraDesired.x - v.x) * fraction;
      this.cameraDesired.z = v.z + (this.cameraDesired.z - v.z) * fraction;
      this.cameraDesired.y = Math.max(2, height * fraction);
    }
    if (!this.cameraInitialized) { this.camera.position.copy(this.cameraDesired); this.cameraTarget.copy(this.lookTarget); this.cameraInitialized = true; }
    else { this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-7 * dt)); this.cameraTarget.lerp(this.lookTarget, 1 - Math.exp(-10 * dt)); }
    if (s.camera !== 'hood') {
      const span = Math.hypot(this.camera.position.x - v.x, this.camera.position.z - v.z);
      const fraction = cameraClearFraction(v.position, { x: this.camera.position.x, z: this.camera.position.z }, this.world.colliders.query(v.x, v.z, span + 2));
      this.camera.position.x = v.x + (this.camera.position.x - v.x) * fraction;
      this.camera.position.z = v.z + (this.camera.position.z - v.z) * fraction;
    }
    this.shake = damp(this.shake, 0, 5, dt);
    if (s.cameraShake) this.camera.position.y += Math.sin(this.elapsed * 73) * this.shake;
    this.camera.lookAt(this.cameraTarget);
    const fov = (s.camera === 'hood' ? 67 : 55) + Math.min(7, v.speed * 0.19);
    this.camera.fov = damp(this.camera.fov, fov, 3, dt); this.camera.updateProjectionMatrix();
  }

  private updateRoute() {
    this.route = findRoute(this.vehicle.position, this.target);
    let count = 0;
    for (let i = 1; i < this.route.length && count < 200; i++) {
      const a = this.route[i - 1], b = this.route[i], len = distance(a.x, a.z, b.x, b.z);
      for (let d = 4; d < len && count < 200; d += 7) {
        const t = d / len, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (distance(x, z, this.vehicle.x, this.vehicle.z) > 100) continue;
        this.dummy.position.set(x, 0.038, z); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar(1); this.dummy.updateMatrix(); this.routeDots.setMatrixAt(count++, this.dummy.matrix);
      }
    }
    this.routeDots.count = count; this.routeDots.instanceMatrix.needsUpdate = true;
  }

  private updatePrompt() {
    const v = this.vehicle, m = this.progress.mission;
    this.prompt = ''; this.promptSub = ''; this.promptKey = 'E';
    const stopped = v.speed < 1.5;
    if (m) {
      const d = DESTINATIONS[m.index];
      if (distance(v.x, v.z, d.x, d.z) < 9) { this.prompt = stopped ? 'Deliver the package' : 'Easy now. Park in the loading bay.'; this.promptSub = stopped ? `${d.name} · your customer is waiting` : 'Brake with S / ↓. Get below 5 km/h to deliver.'; this.promptKey = stopped ? 'E' : 'S'; return; }
    }
    if (distance(v.x, v.z, DEPOT.x, DEPOT.z) < 33 && !m) { this.prompt = stopped ? 'Open dispatch' : 'Dispatch is right here.'; this.promptSub = stopped ? 'Choose a contract. Make yourself a living.' : 'Stop near the green marker to view contracts.'; this.promptKey = stopped ? 'E' : 'S'; return; }
    if (distance(v.x, v.z, FUEL_STATION.x, FUEL_STATION.z) < 10) { this.prompt = stopped ? 'Fill up at Tidal' : 'Pull in and stop to refuel'; this.promptSub = `Fuel ${Math.ceil(v.fuel)}% · full tank ${formatMoney(Math.ceil((100 - v.fuel) * 1.8))}`; this.promptKey = stopped ? 'E' : 'S'; return; }
    if (distance(v.x, v.z, GARAGE.x, GARAGE.z) < 10) { this.prompt = stopped ? 'Open Quayside workshop' : 'Pull in and stop for repairs'; this.promptSub = `Repairs & upgrades · condition ${Math.ceil(v.health)}%`; this.promptKey = stopped ? 'E' : 'S'; return; }
    if (v.fuel <= 0 || v.health <= 0) { this.prompt = v.fuel <= 0 ? 'The tank is empty.' : 'Your engine needs a hand.'; this.promptSub = 'Pause to call roadside assistance.'; this.promptKey = 'ESC'; }
  }

  private interact() {
    const v = this.vehicle;
    if (v.speed >= 1.5) { this.ui.toast('Park first. Bring your speed below 5 km/h.'); return; }
    const m = this.progress.mission;
    if (m) {
      const d = DESTINATIONS[m.index];
      if (distance(v.x, v.z, d.x, d.z) < 9) {
        const result = this.progress.finish()!; this.audio.chime(true); this.waypoint = null; this.keys.clear(); this.stepper.reset(); this.dragging = false; this.screen = 'result'; this.ui.show('result', this.progress, result); this.updateRoute(); return;
      }
    }
    if (distance(v.x, v.z, DEPOT.x, DEPOT.z) < 33 && !m) { this.setScreen('jobs'); return; }
    if (distance(v.x, v.z, FUEL_STATION.x, FUEL_STATION.z) < 10) { const cost = this.progress.refuel(); this.lowFuelWarning = v.fuel < 15; if (cost) this.audio.chime(); this.ui.toast(cost ? `${v.fuel < 99.9 ? 'Partial top-up' : 'Full tank'} · fuel ${Math.ceil(v.fuel)}% · ${formatMoney(cost)} paid.` : v.fuel > 99 ? 'Already full. You’re ready for the long way home.' : 'You need a little cash. Dispatch can help with a tow.', cost ? 'success' : 'info'); return; }
    if (distance(v.x, v.z, GARAGE.x, GARAGE.z) < 10) { this.previousScreen = 'drive'; this.setScreen('garage'); return; }
    this.ui.toast(m ? 'Follow the green destination marker to your customer.' : 'Visit Harborline dispatch to pick up a delivery. It’s on your GPS.');
  }

  private resetVehicle() {
    const v = this.vehicle, point = roadResetPosition(v.position, v.heading, this.traffic.cars);
    v.reset(point.x, point.z, point.heading); this.cameraInitialized = false; this.updateRoute(); this.ui.toast('Wheels back on the road. Fuel and condition are unchanged.'); this.progress.save();
  }

  private safeSpawn() {
    const v = this.vehicle, point = roadResetPosition(v.position, v.heading, this.traffic.cars);
    v.reset(point.x, point.z, point.heading); this.progress.save();
  }

  private updateSkids(dt: number) {
    this.skidTimer += dt;
    if (this.skidTimer < 0.045 || this.vehicle.speed < 4 || !this.vehicle.onRoad || (this.vehicle.slip < 0.17 && !this.vehicle.handbraking)) return;
    this.skidTimer = 0;
    const v = this.vehicle;
    for (const side of [-1, 1]) {
      this.dummy.position.set(v.x - Math.sin(v.heading) * 1.4 + Math.cos(v.heading) * side * 0.89, 0.032, v.z - Math.cos(v.heading) * 1.4 - Math.sin(v.heading) * side * 0.89);
      this.dummy.rotation.set(0, v.heading, 0); this.dummy.scale.set(1, 1, Math.max(1, v.speed * 0.06)); this.dummy.updateMatrix(); this.skidMarks.setMatrixAt(this.skidIndex, this.dummy.matrix); this.skidIndex = (this.skidIndex + 1) % 400; this.skidMarks.count = Math.min(400, this.skidMarks.count + 1);
    }
    this.skidMarks.instanceMatrix.needsUpdate = true;
  }

  private exposeDebug() {
    // Opt-in deterministic harness, available only when launched with ?debug=1.
    (window as unknown as Record<string, unknown>).__harborline = {
      state: () => ({ screen: this.screen, x: this.vehicle.x, z: this.vehicle.z, heading: this.vehicle.heading, speed: this.vehicle.speed, forwardSpeed: this.vehicle.forwardSpeed, fuel: this.vehicle.fuel, health: this.vehicle.health, money: this.progress.money, completed: this.progress.completed, xp: this.progress.xp, rank: this.progress.career.rank.name, upgrades: { ...this.progress.upgrades }, mission: this.progress.mission ? { ...this.progress.mission } : null, fps: this.fps, graphics: this.graphics, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, settings: { ...this.progress.settings }, hour: this.world.hour, target: this.target, traffic: this.traffic.cars.map(c => ({ x: c.x, z: c.z, speed: c.speed })) }),
      advance: (seconds: number, input: Partial<DriveInput> = {}) => { for (let i = 0; i < Math.min(seconds, 60) / FIXED_DT; i++) this.simulate(FIXED_DT, { throttle: 0, brake: 0, steer: 0, handbrake: false, ...input }); this.updateRoute(); this.updatePrompt(); this.updateUI(0.1); },
      teleport: (x: number, z: number, heading = 0) => { this.vehicle.reset(x, z, heading); this.cameraInitialized = false; this.updateRoute(); this.updatePrompt(); },
      resources: (fuel: number, health: number, money?: number) => { this.vehicle.fuel = clamp(fuel, 0, 100); this.vehicle.health = clamp(health, 0, 100); if (money !== undefined) this.progress.money = Math.max(0, money); },
      interact: () => this.interact(), action: (action: string, value?: string) => this.action(action, value),
      save: () => this.progress.save(),
    };
  }
}
