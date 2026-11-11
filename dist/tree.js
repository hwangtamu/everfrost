// The passive tree: six paths radiating from the hero's origin, joined by a ring
// of hybrid clusters. Each level grants one point. A node can be taken only when
// it touches a node you already own; every path ends in a keystone that trades
// one strength for another.

const PATHS = [
  {id:'war', name:'Warrior', color:'#e0825f',
    small:[['Brawn',{attackPct:5}],['Brawn',{attackPct:5}],['Wide Arc',{splash:10}],['Brawn',{attackPct:6}],['Wide Arc',{splash:10}]],
    notable:['Butcher',{attackPct:14, splash:20},'+14% attack · +20% splash damage'],
    keystone:['Berserker',{damageMore:35, takenMore:15},'Deal 35% more damage. Take 15% more damage.']},
  {id:'sin', name:'Assassin', color:'#e6cf6a',
    small:[['Keen Eye',{critical:2}],['Keen Eye',{critical:2}],['Cruelty',{criticalMultiplier:12}],['Keen Eye',{critical:2.5}],['Cruelty',{criticalMultiplier:14}]],
    notable:['Deadeye',{critical:4, criticalMultiplier:25},'+4% critical chance · +25% critical multiplier'],
    keystone:['Perfect Strike',{criticalMultiplier:70, nonCritLess:20},'+70% critical multiplier. Non-critical hits deal 20% less damage.']},
  {id:'swift', name:'Stalker', color:'#8fd08a',
    small:[['Quick Hands',{haste:4}],['Fleet Foot',{movement:5}],['Quick Hands',{haste:4}],['Bloodthirst',{leech:.8}],['Quick Hands',{haste:5}]],
    notable:['Predator',{haste:8, leech:1.5, movement:6},'+8% attack speed · +6% movement · 1.5% life leech'],
    keystone:['Momentum',{haste:30, lifeLess:15},'+30% attack speed. 15% less maximum health.']},
  {id:'guard', name:'Guardian', color:'#7fb1e8',
    small:[['Vigor',{lifePct:5}],['Vigor',{lifePct:5}],['Plating',{defensePct:10}],['Vigor',{lifePct:6}],['Plating',{defensePct:10}]],
    notable:['Juggernaut',{lifePct:12, defensePct:20},'+12% maximum health · +20% armor'],
    keystone:['Unbreakable',{takenLess:22, damageLess:12},'Take 22% less damage. Deal 12% less damage.']},
  {id:'ward', name:'Warden', color:'#72cdbf',
    small:[['Warding',{resist:4}],['Mending',{regenPct:.3}],['Warding',{resist:4}],['Mending',{regenPct:.3}],['Brewing',{potionPower:8}]],
    notable:['Oathkeeper',{resist:10, regenPct:.6},'+10% elemental resistance · regenerate 0.6% health per second'],
    keystone:['Alchemist',{potionCharges:2, potionPower:20},'+2 potion charges. Potions restore 20% more health.']},
  {id:'myst', name:'Mystic', color:'#b79be6',
    small:[['Insight',{manaMax:12}],['Runecraft',{skillDamage:6}],['Insight',{manaRegen:15}],['Runecraft',{skillDamage:6}],['Tempo',{cooldown:5}]],
    notable:['Runecaller',{skillDamage:16, manaRegen:25},'+16% skill damage · +25% mana regeneration'],
    keystone:['Blood Rite',{bloodMagic:1, skillDamage:30},'Skills cost health instead of mana. +30% skill damage.']}
];
// Hybrid clusters between neighboring paths (path i and i+1).
const BRIDGES = [
  [['Ferocity',{attackPct:4, critical:1}],['Ferocity',{attackPct:4, critical:1}],['Slaughter',{attackPct:8, criticalMultiplier:20},'+8% attack · +20% critical multiplier']],
  [['Ambush',{critical:1.5, haste:3}],['Ambush',{critical:1.5, haste:3}],['Flurry',{haste:8, critical:3},'+8% attack speed · +3% critical chance']],
  [['Endurance',{movement:4, lifePct:3}],['Endurance',{movement:4, lifePct:3}],['Survivor',{lifePct:8, leech:1, movement:5},'+8% maximum health · 1% life leech · +5% movement']],
  [['Bastion',{defensePct:8, resist:3}],['Bastion',{defensePct:8, resist:3}],['Stalwart',{lifePct:8, resist:8},'+8% maximum health · +8% elemental resistance']],
  [['Focus',{manaMax:8, regenPct:.2}],['Focus',{manaMax:8, regenPct:.2}],['Wellspring',{manaRegen:30, potionCharges:1},'+30% mana regeneration · +1 potion charge']],
  [['Spellblade',{skillDamage:4, attackPct:3}],['Spellblade',{skillDamage:4, attackPct:3}],['Battlemage',{skillDamage:12, cooldown:8, attackPct:6},'+12% skill damage · +8% cooldown recovery · +6% attack']]
];

export const STAT_TEXT = {
  attackPct:v=>`+${v}% attack`, splash:v=>`+${v}% splash damage`, critical:v=>`+${v}% critical chance`,
  criticalMultiplier:v=>`+${v}% critical multiplier`, haste:v=>`+${v}% attack speed`, movement:v=>`+${v}% movement speed`,
  leech:v=>`${v}% life leech`, lifePct:v=>`+${v}% maximum health`, defensePct:v=>`+${v}% armor`, resist:v=>`+${v}% elemental resistance`,
  regenPct:v=>`regenerate ${v}% health / sec`, potionPower:v=>`potions restore ${v}% more`, potionCharges:v=>`+${v} potion charge${v>1?'s':''}`,
  manaMax:v=>`+${v} maximum mana`, manaRegen:v=>`+${v}% mana regeneration`, skillDamage:v=>`+${v}% skill damage`, cooldown:v=>`+${v}% cooldown recovery`
};
export const describeStats = stats => Object.entries(stats).filter(([k]) => STAT_TEXT[k]).map(([k,v]) => STAT_TEXT[k](v)).join(' · ');

function build() {
  const nodes = [{id:'start', type:'start', name:'Origin', x:0, y:0, stats:{}, links:[], color:'#dbb977', description:'Where every path begins.'}];
  const add = n => { nodes.push({links:[], ...n}); return n.id; };
  const link = (a,b) => { const A = nodes.find(n=>n.id===a), B = nodes.find(n=>n.id===b); A.links.push(b); B.links.push(a); };
  const at = (angle, r) => ({x:Math.round(Math.cos(angle)*r), y:Math.round(Math.sin(angle)*r)});
  PATHS.forEach((path, i) => {
    const angle = -Math.PI/2 + i*Math.PI/3;
    let prev = 'start';
    // radii: s0 s1 s2 NOTABLE s3 s4 KEYSTONE
    const order = [0,1,2,'n',3,4,'k'];
    order.forEach((slot, step) => {
      const r = 78 + step*64, id = `${path.id}-${slot}`;
      if (slot === 'n') add({id, type:'notable', name:path.notable[0], stats:path.notable[1], description:path.notable[2], color:path.color, path:path.id, ...at(angle, r)});
      else if (slot === 'k') add({id, type:'keystone', name:path.keystone[0], stats:path.keystone[1], description:path.keystone[2], color:path.color, path:path.id, ...at(angle, r+14)});
      else { const [name, stats] = path.small[slot]; add({id, type:'small', name, stats, description:describeStats(stats), color:path.color, path:path.id, ...at(angle, r)}); }
      link(prev, id); prev = id;
    });
  });
  BRIDGES.forEach((bridge, i) => {
    const a = PATHS[i], b = PATHS[(i+1)%6], a0 = -Math.PI/2 + i*Math.PI/3, r = 78 + 2*64;
    const ids = bridge.map(([name, stats, description], k) => add({id:`br${i}-${k}`, type:k===2?'notable':'small', name, stats, description:description||describeStats(stats), color:'#c9c2a0',
      ...(k===2 ? at(a0 + Math.PI/6, r+58) : at(a0 + (k===0 ? Math.PI/9 : 2*Math.PI/9), r+6))}));
    link(`${a.id}-2`, ids[0]); link(ids[0], ids[1]); link(ids[1], `${b.id}-2`);
    link(ids[0], ids[2]); link(ids[1], ids[2]);
  });
  return nodes;
}
export const TREE_PATHS = PATHS.map(({id,name,color}) => ({id,name,color}));
export const TREE_NODES = build();
export const TREE_BY_ID = Object.fromEntries(TREE_NODES.map(n => [n.id, n]));
export const TREE_EXTENT = 78 + 6*64 + 14 + 40;

export const hasNode = (s, id) => id === 'start' || !!s.tree?.includes(id);
export const canAllocate = (s, id) => !!TREE_BY_ID[id] && id !== 'start' && !hasNode(s,id) && s.points > 0 && TREE_BY_ID[id].links.some(l => hasNode(s,l));
export function allocate(s, id) {
  if (!canAllocate(s, id)) return false;
  s.tree.push(id); s.points--; return true;
}
export const respecCost = s => s.tree.length ? 40 + s.tree.length * 12 * Math.max(1, Math.floor(s.level/5)) : 0;
export function respec(s) {
  const cost = respecCost(s);
  if (!s.tree.length || s.gold < cost) return false;
  s.gold -= cost; s.points += s.tree.length; s.tree = []; return true;
}
export function treeBonuses(s) {
  const out = {};
  for (const id of s.tree || []) { const n = TREE_BY_ID[id]; if (n) for (const k in n.stats) out[k] = (out[k]||0) + n.stats[k]; }
  return out;
}
// Keep only nodes that exist and stay connected to the origin.
export function normalizeTree(raw) {
  const wanted = new Set((Array.isArray(raw) ? raw : []).filter(id => TREE_BY_ID[id] && id !== 'start'));
  const kept = [], reached = new Set(['start']);
  let grew = true;
  while (grew) { grew = false; for (const id of wanted) if (!reached.has(id) && TREE_BY_ID[id].links.some(l => reached.has(l))) { reached.add(id); kept.push(id); grew = true; } }
  return kept;
}
