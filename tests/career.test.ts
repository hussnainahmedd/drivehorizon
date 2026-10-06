import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Progression, quoteDelivery, sanitizeSettings, type SaveStorage } from '../src/progression';
import { VehiclePhysics } from '../src/physics';
import { RANKS, UPGRADES, type UpgradeId } from '../src/career';
import { DEFAULT_SETTINGS, DESTINATIONS } from '../src/config';
import { SpatialHash } from '../src/math';

const KEY = 'harborline-save-v1';
function storage() {
  const data = new Map<string, string>();
  const api: SaveStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  return { data, api };
}
function career() { const store = storage(); return { ...store, p: new Progression(new VehiclePhysics(), store.api) }; }

test('all six contracts award XP, customer history and one-time milestones', () => {
  const { p } = career(); let paid = 0;
  for (let index = 0; index < DESTINATIONS.length; index++) {
    assert.ok(p.startMission(index)); p.update(30);
    const result = p.finish()!;
    assert.equal(result.total, result.base + result.bonus + result.condition + result.rankBonus + result.milestoneBonus);
    assert.equal(result.xp, 110); paid += result.total;
  }
  assert.equal(p.money, 350 + paid); assert.equal(p.earnings, paid); assert.equal(p.xp, 660);
  assert.equal(p.career.rank.name, 'Trusted Driver'); assert.deepEqual(p.visits, [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(new Set(p.awards), new Set(['first', 'fragile', 'city']));
  p.startMission(0); p.update(45); const repeated = p.finish()!;
  assert.equal(repeated.milestoneBonus, 0); assert.equal(repeated.rankBonus, 0); assert.equal(p.bestTimes[0], 30);
  assert.equal(p.finish(), null);
});

test('the complete career reaches maximum rank without repeating promotion rewards', () => {
  const { p } = career(); let promotions = 0;
  p.vehicle.totalDistance = 10001;
  for (let i = 0; i < 24; i++) { p.startMission(i % 6); p.update(20); promotions += p.finish()!.rankBonus; }
  assert.equal(p.career.index, RANKS.length - 1); assert.equal(p.career.fraction, 1);
  assert.equal(promotions, RANKS.reduce((sum, rank) => sum + rank.bonus, 0));
  assert.equal(p.awards.length, 5);
});

test('upgrade purchases enforce balance, rank, maximum levels, and save persistence', () => {
  const { p, api } = career(); p.money = 10000;
  assert.ok(p.buyUpgrade('tires')); assert.equal(p.money, 9725); assert.equal(p.upgrades.tires, 1);
  assert.equal(p.buyUpgrade('tires'), false); assert.equal(p.money, 9725);
  p.xp = 500;
  assert.ok(p.buyUpgrade('tires')); assert.ok(p.buyUpgrade('tires')); assert.equal(p.upgrades.tires, 3);
  assert.equal(p.buyUpgrade('tires'), false);
  assert.equal(p.buyUpgrade('invalid' as UpgradeId), false);
  p.money = 0; assert.equal(p.buyUpgrade('engine'), false); p.save();
  const restored = new Progression(new VehiclePhysics(), api); assert.equal(restored.upgrades.tires, 3); assert.equal(restored.xp, 500);
  assert.equal(p.upgradeOffer('tires').maxed, true); assert.equal(UPGRADES.tires.prices.length, 3);
});

test('engine, efficiency and cargo upgrades change real simulation outcomes', () => {
  const standard = new VehiclePhysics(), tuned = new VehiclePhysics(), efficient = new VehiclePhysics();
  tuned.upgrades.engine = 3; efficient.upgrades.efficiency = 3;
  const world = new SpatialHash(), input = { throttle: 1, brake: 0, steer: 0, handbrake: false };
  for (let i = 0; i < 600; i++) { standard.step(1 / 120, input, world); tuned.step(1 / 120, input, world); efficient.step(1 / 120, input, world); }
  assert.ok(tuned.speed > standard.speed * 1.1);
  assert.ok(efficient.fuel > standard.fuel); assert.ok(Math.abs(efficient.speed - standard.speed) < 1e-9);
  const a = new Progression(standard, storage().api), b = new Progression(tuned, storage().api);
  a.startMission(1); b.startMission(1); tuned.upgrades.protection = 3; a.impact(15); b.impact(15);
  assert.ok(b.mission!.cargo > a.mission!.cargo + 10);
});

test('career backups round-trip active progress and reject malformed imports without overwriting it', () => {
  const source = career(); source.p.startMission(4); source.p.update(37); source.p.money = 1840; source.p.vehicle.reset(120, 88, 1.2); source.p.vehicle.fuel = 63; source.p.vehicle.health = 81; source.p.upgrades.engine = 2; source.p.save();
  const backup = source.p.exportSave(); assert.match(backup, /"version": 2/);
  const target = career(); target.p.money = 12; assert.equal(target.p.importSave(backup), true);
  assert.equal(target.p.money, 1840); assert.equal(target.p.mission!.index, 4); assert.equal(target.p.mission!.elapsed, 37); assert.equal(target.p.vehicle.x, 120); assert.equal(target.p.vehicle.fuel, 63); assert.equal(target.p.vehicle.health, 81); assert.equal(target.p.upgrades.engine, 2);
  assert.equal(target.p.importSave('{broken backup'), false); assert.equal(target.p.money, 1840); assert.equal(target.p.mission!.index, 4);
});

test('late and destroyed cargo still pays, while malformed quote inputs cannot poison the economy', () => {
  const quote = quoteDelivery(1, 10000, 0);
  assert.equal(quote.bonus, 0); assert.equal(quote.condition, 0); assert.ok(quote.total > 0);
  assert.deepEqual(quoteDelivery(0, -10, 500), quoteDelivery(0, 0, 100));
  assert.ok(Number.isFinite(quoteDelivery(0, NaN, NaN).total)); assert.throws(() => quoteDelivery(99, 0, 100), RangeError);
});

test('affordable partial services charge once and never create debt', () => {
  const { p } = career(); p.money = 9; p.vehicle.fuel = 50;
  assert.equal(p.refuel(), 9); assert.equal(p.vehicle.fuel, 55); assert.equal(p.money, 0); assert.equal(p.refuel(), 0);
  p.money = 16; p.vehicle.health = 30; assert.equal(p.repair(), 16); assert.equal(p.vehicle.health, 35); assert.equal(p.money, 0);
  p.startMission(2); p.update(12); assert.equal(p.rescue(), 0); assert.equal(p.mission!.elapsed, 52);
  assert.ok(p.cancelMission()); assert.equal(p.mission, null); assert.equal(p.cancelMission(), false);
});

test('version-one saves migrate in place without losing money, cargo, position or settings', () => {
  const { data, api } = storage();
  data.set(KEY, JSON.stringify({ version: 1, money: 980, completed: 5, earnings: 2100, distance: 7654, vehicle: { x: 120, z: 40, heading: 1, fuel: 42, health: 70 }, mission: { index: 4, elapsed: 55, cargo: 82, initialHealth: 90 }, settings: { ...DEFAULT_SETTINGS, units: 'mph' } }));
  const p = new Progression(new VehiclePhysics(), api);
  assert.equal(p.loadWarning, null); assert.equal(p.hasSave, true); assert.equal(p.xp, 450); assert.equal(p.money, 980);
  assert.equal(p.mission!.cargo, 82); assert.equal(p.vehicle.x, 120); assert.equal(p.vehicle.totalDistance, 7654); assert.equal(p.settings.units, 'mph');
  p.save(); assert.equal(JSON.parse(data.get(KEY)!).version, 2);
  assert.equal(new Progression(new VehiclePhysics(), api).mission!.elapsed, 55);
});

test('world time, upgrades and customer history survive reload and reset cleanly for a new career', () => {
  const { p, api } = career(); p.startMission(0); p.update(60); p.finish(); p.upgrades.engine = 2; p.save();
  const restored = new Progression(new VehiclePhysics(), api);
  assert.ok(Math.abs(restored.worldHour - 17.6) < 1e-9); assert.equal(restored.drivingTime, 60); assert.equal(restored.bestTimes[0], 60);
  restored.settings.timeMode = 'night'; restored.update(60); assert.equal(restored.worldHour, p.worldHour);
  restored.newGame(); assert.equal(restored.xp, 0); assert.equal(restored.worldHour, 16.8); assert.equal(restored.upgrades.engine, 0); assert.equal(restored.vehicle.totalDistance, 0); assert.equal(restored.money, 350);
  assert.equal(restored.settings.timeMode, 'night'); assert.equal(restored.visits.reduce((a, b) => a + b), 0);
});

test('invalid fields are sanitized and a corrupt save is retained in a recovery key', () => {
  const { data, api } = storage(); const raw = '{interrupted save'; data.set(KEY, raw);
  const p = new Progression(new VehiclePhysics(), api); assert.equal(p.loadWarning, 'corrupt'); assert.equal(p.money, 350);
  assert.equal(data.get(KEY), raw); p.save(); assert.equal(data.get('harborline-save-recovery'), raw);
  const valid = JSON.parse(data.get(KEY)!); valid.vehicle.fuel = 'full'; valid.vehicle.health = -99; valid.vehicle.x = 9999; valid.upgrades.tires = 99; valid.mission = { index: 100, cargo: 100, elapsed: 0 };
  data.set(KEY, JSON.stringify(valid)); const restored = new Progression(new VehiclePhysics(), api);
  assert.equal(restored.vehicle.fuel, 100); assert.equal(restored.vehicle.health, 0); assert.equal(restored.vehicle.x, 280); assert.equal(restored.upgrades.tires, 3); assert.equal(restored.mission, null);
  assert.deepEqual(sanitizeSettings({ volume: 'loud', camera: 'bad', sensitivity: 99, frameLimit: 15 }), { ...DEFAULT_SETTINGS, sensitivity: 2 });
});

test('unavailable storage and write failures are reported; settings do not silently start a career', () => {
  const { p, data } = career(); p.settings.volume = 0; assert.ok(p.save(false)); assert.equal(p.hasSave, false); assert.equal(JSON.parse(data.get(KEY)!).started, false);
  const blocked = new Progression(new VehiclePhysics(), { getItem: () => { throw new Error('Denied'); }, setItem: () => {} });
  assert.equal(blocked.loadWarning, 'unavailable'); assert.equal(blocked.saveAvailable, false);
  const full = new Progression(new VehiclePhysics(), { getItem: () => null, setItem: () => { throw new Error('Quota'); } });
  assert.equal(full.save(), false); assert.equal(full.saveAvailable, false); assert.equal(full.lastSavedAt, 0);
});
