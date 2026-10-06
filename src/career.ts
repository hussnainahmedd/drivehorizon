import { clamp } from './math';

export const RANKS = [
  { name: 'New Courier', xp: 0, bonus: 0 },
  { name: 'Local Regular', xp: 150, bonus: 125 },
  { name: 'Trusted Driver', xp: 500, bonus: 250 },
  { name: 'Harbor Specialist', xp: 1100, bonus: 400 },
  { name: 'Coastal Professional', xp: 2100, bonus: 650 },
] as const;

export const MILESTONES = [
  { id: 'first', name: 'First good arrival', description: 'Complete your first delivery.', reward: 75 },
  { id: 'fragile', name: 'Safe pair of hands', description: 'Deliver fragile cargo with at least 95% condition.', reward: 100 },
  { id: 'city', name: 'Every corner of the coast', description: 'Deliver to all six customers.', reward: 350 },
  { id: 'ten', name: 'A familiar face', description: 'Complete ten deliveries.', reward: 250 },
  { id: 'distance', name: 'The long way home', description: 'Drive ten kilometers and complete a delivery.', reward: 150 },
] as const;
export type MilestoneId = typeof MILESTONES[number]['id'];

export const UPGRADES = {
  tires: { name: 'Touring tires', description: '+6% road grip per level. More confidence in corners.', prices: [275, 525, 850] },
  engine: { name: 'Engine tuning', description: '+7% engine power per level. Damage still limits power.', prices: [400, 750, 1200] },
  efficiency: { name: 'Economy tune', description: '10% lower fuel consumption per level.', prices: [250, 475, 725] },
  protection: { name: 'Cargo restraints', description: '16% less impact damage to packages per level.', prices: [300, 600, 950] },
} as const;
export type UpgradeId = keyof typeof UPGRADES;
export type VehicleUpgrades = Record<UpgradeId, number>;
export const DEFAULT_UPGRADES: VehicleUpgrades = { tires: 0, engine: 0, efficiency: 0, protection: 0 };

export function rankIndex(xp: number) {
  let index = 0;
  for (let i = 1; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  return index;
}

export function rankProgress(xp: number) {
  const index = rankIndex(xp), rank = RANKS[index], next = RANKS[index + 1];
  return { index, rank, next, fraction: next ? clamp((xp - rank.xp) / (next.xp - rank.xp), 0, 1) : 1 };
}

export function deliveryXP(cargo: number, onTime: boolean) {
  return 55 + Math.round(clamp(cargo, 0, 100) * 0.35) + (onTime ? 20 : 0);
}
