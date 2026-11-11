export const ENEMY_TIERS = {
  normal: {label: 'Normal', color: '#c1c9b6', life: 1, damage: 1, points: 1, reward: 1},
  magic: {label: 'Magic', color: '#7fb9ed', life: 2.4, damage: 1.2, points: 2, reward: 1.8},
  rare: {label: 'Rare', color: '#e4c570', life: 7, damage: 1.5, points: 5, reward: 3.5},
  unique: {label: 'Unique', color: '#e4a16b', life: 26, damage: 2, points: 0, reward: 8}
};
export const MODIFIERS = {
  empowered: {name: 'Empowered', description: 'Deals 40% increased damage.', kind: 'enhancement', icon: 'swords'},
  hasted: {name: 'Hasted', description: 'Attacks 30% faster and moves 25% faster.', kind: 'enhancement', icon: 'zap'},
  deadly: {name: 'Deadly', description: 'Gains 20 percentage points of critical strike chance and +50% critical strike multiplier.', kind: 'enhancement', icon: 'star'},
  armored: {name: 'Armored', description: 'Takes 30% less physical damage. Elemental damage bypasses this armor.', kind: 'defense', icon: 'shield'},
  resistant: {name: 'Elemental Ward', description: 'Takes 45% less fire, cold, and lightning damage.', kind: 'defense', icon: 'gem'},
  vampiric: {name: 'Vampiric', description: 'Heals for 20% of the damage it deals.', kind: 'enhancement', icon: 'heart'},
  regenerating: {name: 'Regenerating', description: 'Recovers 1% of its maximum health per second while fighting.', kind: 'enhancement', icon: 'leaf'},
  guardAura: {name: 'Guardian Aura', description: 'Allies within 4 tiles take 25% less damage. Defeat the aura bearer to remove it.', kind: 'aura', radius: 4, color: '#8dbce5', icon: 'shield'},
  hasteAura: {name: 'Frenzy Aura', description: 'Allies within 4 tiles attack 25% faster and deal 25% more damage.', kind: 'aura', radius: 4, color: '#dfb475', icon: 'zap'},
  burningAura: {name: 'Burning Aura', description: 'Burns the hero within 3 tiles. Elemental resistance reduces the damage.', kind: 'aura', radius: 3, color: '#e89166', icon: 'sparkles'},
  chilling: {name: 'Chilling Touch', description: 'Hits reduce the hero’s movement and attack speed by 25% for 3 seconds.', kind: 'elemental', icon: 'gem'},
  volatile: {name: 'Volatile', description: 'Explodes 1.4 seconds after death. Move outside the marked area.', kind: 'on death', icon: 'sparkles'},
  earthshatter: {name: 'Earthshatter', description: 'Marks the ground, then slams it after 1.5 seconds. Move out of the circle.', kind: 'boss skill', icon: 'hammer'}
};
export function rollModifiers(tier, rng = Math.random) {
  if (tier === 'normal') return [];
  if (tier === 'unique') return ['earthshatter', 'empowered'];
  const pool = Object.keys(MODIFIERS).filter(id => id !== 'earthshatter');
  const result = [];
  for (let n = 0; n < (tier === 'magic' ? 1 : 2); n++) result.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return result;
}
