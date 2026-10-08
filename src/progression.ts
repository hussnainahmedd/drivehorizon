import { DEFAULT_SETTINGS, DESTINATIONS, SPAWN, type Settings } from './config';
import { DEFAULT_UPGRADES, MILESTONES, RANKS, UPGRADES, deliveryXP, rankIndex, rankProgress, type MilestoneId, type UpgradeId, type VehicleUpgrades } from './career';
import { clamp } from './math';
import type { VehiclePhysics } from './physics';

export interface Mission { index: number; elapsed: number; cargo: number; initialHealth: number }
export interface DeliveryQuote { base: number; bonus: number; condition: number; total: number }
export interface DeliveryResult extends DeliveryQuote { name: string; seconds: number; cargo: number; xp: number; rankBefore: number; rankAfter: number; rankBonus: number; milestoneBonus: number; milestones: string[] }
export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface SaveData {
  version: 2; started: boolean; money: number; completed: number; earnings: number; distance: number; mission: Mission | null;
  vehicle: { x: number; z: number; heading: number; fuel: number; health: number }; settings: Settings;
  xp: number; upgrades: VehicleUpgrades; awards: MilestoneId[]; visits: number[]; bestTimes: (number | null)[]; worldHour: number; drivingTime: number;
}
// The new key is the stable DriveHorizon profile. The legacy key remains a
// read-only migration source so existing browser careers are not discarded.
const KEY = 'drivehorizon-save-v1';
const LEGACY_KEY = 'harborline-save-v1';
const RECOVERY_KEY = 'drivehorizon-save-recovery';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown, fallback: number, min = 0, max = 1e9) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

export function sanitizeSettings(value: unknown): Settings {
  const s = record(value);
  return {
    quality: s.quality === 'low' || s.quality === 'high' ? s.quality : 'medium',
    volume: finite(s.volume, DEFAULT_SETTINGS.volume, 0, 1), units: s.units === 'mph' ? 'mph' : 'kmh',
    timeMode: s.timeMode === 'day' || s.timeMode === 'sunset' || s.timeMode === 'night' ? s.timeMode : 'cycle',
    camera: s.camera === 'close' || s.camera === 'hood' ? s.camera : 'chase',
    sensitivity: finite(s.sensitivity, 1, 0.4, 2), showRoute: s.showRoute !== false, cameraShake: s.cameraShake !== false,
    frameLimit: s.frameLimit === 0 || s.frameLimit === 30 || s.frameLimit === 120 ? s.frameLimit : 60,
  };
}

export function quoteDelivery(index: number, elapsed: number, cargo: number): DeliveryQuote {
  if (!Number.isInteger(index) || !DESTINATIONS[index]) throw new RangeError('Unknown delivery contract');
  elapsed = finite(elapsed, 0); cargo = finite(cargo, 0, 0, 100);
  const d = DESTINATIONS[index], conditionFraction = clamp(cargo, 0, 100) / 100;
  const base = Math.round(d.reward * (0.45 + conditionFraction * 0.55));
  const bonus = Math.round(clamp(1 - elapsed / d.time, 0, 1) * d.reward * 0.35);
  const condition = Math.round(d.reward * conditionFraction * 0.2);
  return { base, bonus, condition, total: base + bonus + condition };
}

export class Progression {
  money = 350; completed = 0; earnings = 0;
  mission: Mission | null = null;
  settings: Settings = { ...DEFAULT_SETTINGS };
  hasSave = false; saveAvailable = true;
  loadWarning: 'corrupt' | 'unavailable' | null = null;
  lastSavedAt = 0;
  xp = 0; worldHour = 16.8; drivingTime = 0;
  awards: MilestoneId[] = [];
  visits = DESTINATIONS.map(() => 0);
  bestTimes: (number | null)[] = DESTINATIONS.map(() => null);
  private storage?: SaveStorage;
  private unreadableSave: string | null = null;

  constructor(readonly vehicle: VehiclePhysics, storage?: SaveStorage) {
    try { this.storage = storage ?? globalThis.localStorage; }
    catch { this.saveAvailable = false; this.loadWarning = 'unavailable'; return; }
    let raw: string | null;
    try { raw = this.storage?.getItem(KEY) ?? this.storage?.getItem(LEGACY_KEY) ?? null; }
    catch { this.saveAvailable = false; this.loadWarning = 'unavailable'; return; }
    if (!raw) return;
    const data = this.decodeSave(raw);
    if (!data) { this.loadWarning = 'corrupt'; this.unreadableSave = raw; return; }
    this.applySave(data);
  }

  private decodeSave(raw: string) {
    try {
      const data = record(JSON.parse(raw)), v = record(data.vehicle);
      if ((data.version !== 1 && data.version !== 2) || typeof data.money !== 'number' || !Number.isFinite(data.money) || typeof v.x !== 'number' || !Number.isFinite(v.x) || typeof v.z !== 'number' || !Number.isFinite(v.z)) return null;
      return data;
    } catch { return null; }
  }

  private applySave(data: Record<string, unknown>) {
    const v = record(data.vehicle);
    this.money = finite(data.money, 350); this.completed = Math.floor(finite(data.completed, 0)); this.earnings = finite(data.earnings, 0);
    this.settings = sanitizeSettings(data.settings);
    this.vehicle.reset(finite(v.x, SPAWN.x, -280, 280), finite(v.z, SPAWN.z, -280, 280), finite(v.heading, 0, -1e6, 1e6));
    this.vehicle.fuel = finite(v.fuel, 100, 0, 100); this.vehicle.health = finite(v.health, 100, 0, 100); this.vehicle.totalDistance = finite(data.distance, 0);
    const m = record(data.mission), index = m.index;
    this.mission = null;
    if (typeof index === 'number' && Number.isInteger(index) && DESTINATIONS[index] && typeof m.elapsed === 'number' && Number.isFinite(m.elapsed) && typeof m.cargo === 'number' && Number.isFinite(m.cargo)) this.mission = { index, elapsed: finite(m.elapsed, 0), cargo: finite(m.cargo, 100, 0, 100), initialHealth: finite(m.initialHealth, this.vehicle.health, 0, 100) };
    this.xp = finite(data.xp, this.completed * 90); this.worldHour = finite(data.worldHour, 16.8, 0, 24) % 24; this.drivingTime = finite(data.drivingTime, 0);
    const upgrades = record(data.upgrades);
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) this.vehicle.upgrades[id] = Math.floor(finite(upgrades[id], 0, 0, 3));
    this.awards = Array.isArray(data.awards) ? MILESTONES.filter(milestone => (data.awards as unknown[]).includes(milestone.id)).map(milestone => milestone.id) : [];
    this.visits = DESTINATIONS.map((_, i) => Math.floor(finite(Array.isArray(data.visits) ? data.visits[i] : undefined, 0)));
    this.bestTimes = DESTINATIONS.map((_, i) => { const time = Array.isArray(data.bestTimes) ? data.bestTimes[i] : undefined; return typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : null; });
    this.hasSave = data.started !== false;
    this.loadWarning = null;
    this.unreadableSave = null;
  }

  get career() { return rankProgress(this.xp); }
  get upgrades() { return this.vehicle.upgrades; }
  get deliveryEstimate() { return this.mission ? quoteDelivery(this.mission.index, this.mission.elapsed, this.mission.cargo) : null; }

  startMission(index: number) {
    if (this.mission || !Number.isInteger(index) || !DESTINATIONS[index]) return false;
    this.mission = { index, elapsed: 0, cargo: 100, initialHealth: this.vehicle.health }; this.save(); return true;
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.mission) this.mission.elapsed += dt;
    this.drivingTime += dt;
    if (this.settings.timeMode === 'cycle') this.worldHour = (this.worldHour + dt * 24 / 1800) % 24;
  }

  impact(speed: number) {
    if (!this.mission || !Number.isFinite(speed)) return;
    const multiplier = (DESTINATIONS[this.mission.index].fragile ? 2.8 : 1.3) * (1 - this.upgrades.protection * 0.16);
    this.mission.cargo = clamp(this.mission.cargo - Math.max(0, speed - 2) * multiplier, 0, 100);
  }

  finish(): DeliveryResult | null {
    if (!this.mission) return null;
    const m = this.mission, d = DESTINATIONS[m.index];
    const quote = quoteDelivery(m.index, m.elapsed, m.cargo), rankBefore = rankIndex(this.xp), xp = deliveryXP(m.cargo, m.elapsed <= d.time);
    this.xp += xp; this.completed++; this.visits[m.index]++;
    if (m.cargo >= 90 && m.elapsed > 0) this.bestTimes[m.index] = Math.min(this.bestTimes[m.index] ?? Infinity, m.elapsed);
    const rankAfter = rankIndex(this.xp);
    const rankBonus = RANKS.slice(rankBefore + 1, rankAfter + 1).reduce((total, rank) => total + rank.bonus, 0);
    const achieved: Record<MilestoneId, boolean> = { first: this.completed >= 1, fragile: d.fragile && m.cargo >= 95, city: this.visits.every(count => count > 0), ten: this.completed >= 10, distance: this.vehicle.totalDistance >= 10000 };
    const milestones = MILESTONES.filter(milestone => achieved[milestone.id] && !this.awards.includes(milestone.id));
    this.awards.push(...milestones.map(milestone => milestone.id));
    const milestoneBonus = milestones.reduce((total, milestone) => total + milestone.reward, 0), total = quote.total + rankBonus + milestoneBonus;
    this.money += total; this.earnings += total;
    const result = { ...quote, name: d.name, total, seconds: m.elapsed, cargo: m.cargo, xp, rankBefore, rankAfter, rankBonus, milestoneBonus, milestones: milestones.map(milestone => milestone.name) };
    this.mission = null; this.save(); return result;
  }

  upgradeOffer(id: UpgradeId) {
    if (!Object.hasOwn(UPGRADES, id)) throw new RangeError('Unknown vehicle upgrade');
    const level = this.upgrades[id], price = UPGRADES[id].prices[level] ?? 0;
    const maxed = level >= 3, requiredRank = Math.min(level, RANKS.length - 1);
    return { level, price, maxed, requiredRank, available: !maxed && this.career.index >= requiredRank && this.money >= price };
  }

  buyUpgrade(id: UpgradeId) {
    if (!Object.hasOwn(UPGRADES, id) || !this.upgradeOffer(id).available) return false;
    this.money -= this.upgradeOffer(id).price; this.upgrades[id]++; this.save(); return true;
  }

  cancelMission() { if (!this.mission) return false; this.mission = null; this.save(); return true; }

  refuel() {
    const amount = Math.min(100 - this.vehicle.fuel, this.money / 1.8), cost = Math.ceil(amount * 1.8);
    if (amount < 0.1) return 0;
    const paid = Math.min(this.money, cost); this.money -= paid; this.vehicle.fuel = Math.min(100, this.vehicle.fuel + amount); this.save(); return paid;
  }

  repair() {
    const amount = Math.min(100 - this.vehicle.health, this.money / 3.2), cost = Math.ceil(amount * 3.2);
    if (amount < 0.1) return 0;
    const paid = Math.min(this.money, cost); this.money -= paid; this.vehicle.health = Math.min(100, this.vehicle.health + amount); this.save(); return paid;
  }

  rescue() {
    // Dispatch guarantees enough fuel and a roadworthy car; a player can never be permanently stranded.
    const cost = Math.min(this.money, 75); this.money -= cost;
    this.vehicle.reset(); this.vehicle.fuel = Math.max(25, this.vehicle.fuel); this.vehicle.health = Math.max(45, this.vehicle.health);
    if (this.mission) this.mission.elapsed += 40;
    this.save(); return cost;
  }

  newGame() {
    this.money = 350; this.completed = this.earnings = this.xp = this.drivingTime = 0; this.worldHour = 16.8;
    this.mission = null; this.awards = []; this.visits.fill(0); this.bestTimes.fill(null);
    this.vehicle.upgrades = { ...DEFAULT_UPGRADES }; this.vehicle.reset(); this.vehicle.fuel = this.vehicle.health = 100; this.vehicle.totalDistance = 0; this.save();
  }

  exportSave() { return JSON.stringify(this.snapshot(), null, 2); }

  importSave(raw: string) {
    const data = this.decodeSave(raw);
    if (!data) return false;
    this.applySave(data); this.save(false); return true;
  }

  private snapshot(): SaveData {
    const v = this.vehicle;
    return { version: 2, started: this.hasSave, money: this.money, completed: this.completed, earnings: this.earnings, distance: v.totalDistance, mission: this.mission, vehicle: { x: v.x, z: v.z, heading: v.heading, fuel: v.fuel, health: v.health }, settings: this.settings, xp: this.xp, upgrades: this.upgrades, awards: this.awards, visits: this.visits, bestTimes: this.bestTimes, worldHour: this.worldHour, drivingTime: this.drivingTime };
  }

  save(markStarted = true) {
    const v = this.vehicle;
    this.hasSave ||= markStarted;
    const data = this.snapshot();
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      if (this.unreadableSave) { this.storage.setItem(RECOVERY_KEY, this.unreadableSave); this.unreadableSave = null; }
      this.storage.setItem(KEY, JSON.stringify(data)); this.saveAvailable = true; this.lastSavedAt = Date.now(); return true;
    } catch { this.saveAvailable = false; return false; }
  }
}
