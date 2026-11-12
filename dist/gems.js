// Sockets and gems. Armor and hand pieces can carry sockets; a gem grants one
// stat in a weapon-type slot (hand, wrist) and another in armor. Three gems of
// a kind combine into the next grade. Gems come back when an item is salvaged
// or a gem is pulled, so experimenting is never a loss.
export const GEM_GRADES = ['Chipped', 'Flawed', 'Polished', 'Flawless', 'Perfect'];
export const GEMS = {
  ruby:     {name:'Ruby',     color:'#e0564a', weapon:['fire', [4,9,18,34,60]],                armor:['maxHp', [14,30,58,110,200]]},
  sapphire: {name:'Sapphire', color:'#5b9be8', weapon:['cold', [4,9,18,34,60]],                armor:['mana', [8,14,22,32,45]]},
  topaz:    {name:'Topaz',    color:'#e6c84f', weapon:['lightning', [4,9,18,34,60]],           armor:['magicFind', [5,8,12,17,24]]},
  emerald:  {name:'Emerald',  color:'#5fcf7c', weapon:['criticalMultiplier', [8,13,19,26,35]], armor:['resist', [4,6,9,12,16]]},
  diamond:  {name:'Diamond',  color:'#e8eef2', weapon:['attack', [3,7,14,26,46]],              armor:['defense', [3,7,13,24,42]]},
  amethyst: {name:'Amethyst', color:'#b07be0', weapon:['haste', [3,5,7,10,13]],                armor:['regen', [1.5,3,6,11,20]]}
};
export const GEM_TYPES = Object.keys(GEMS);
const WEAPON_SLOTS = ['hand', 'wrist'];
const MAX_SOCKETS = {hand:3, chest:3, head:2, leg:2, shoulder:1, wrist:1, belt:1, foot:1};
const STAT_NAMES = {fire:'fire damage', cold:'cold damage', lightning:'lightning damage', criticalMultiplier:'% critical multiplier', attack:'attack', haste:'% attack speed',
  maxHp:'maximum health', mana:'maximum mana', magicFind:'% item rarity', resist:'% elemental resistance', defense:'armor', regen:'life regenerated / sec'};

export const gemKey = (type, grade) => type + grade;
export function parseGem(key) {
  const type = String(key).slice(0, -1), grade = Number(String(key).slice(-1));
  return GEMS[type] && Number.isInteger(grade) && grade >= 0 && grade < GEM_GRADES.length ? {type, grade, def:GEMS[type]} : null;
}
export const gemName = key => { const g = parseGem(key); return g ? `${GEM_GRADES[g.grade]} ${g.def.name}` : ''; };
export const maxSockets = slot => MAX_SOCKETS[slot] || 0;
export function gemStat(key, slot) {
  const g = parseGem(key); if (!g) return null;
  const [stat, values] = WEAPON_SLOTS.includes(slot) ? g.def.weapon : g.def.armor;
  return {stat, value:values[g.grade]};
}
export function gemText(key, slot) {
  const e = gemStat(key, slot); if (!e) return '';
  const label = STAT_NAMES[e.stat];
  return `+${e.value}${label.startsWith('%') ? '' : ' '}${label}`;
}
export const gemSummary = key => { const g = parseGem(key); return g ? `${gemText(key, 'hand')} in hand or wrist · ${gemText(key, 'chest')} in armor` : ''; };

// Normal items are the likeliest to be socketed, as a reason to keep plain bases.
export function rollSockets(slot, rarity, rng = Math.random) {
  const max = maxSockets(slot);
  if (!max || rng() >= [.35, .2, .15, .25][rarity]) return [];
  return Array(1 + Math.floor(rng() * max)).fill(null);
}
export function gemBonuses(items) {
  const out = {};
  for (const item of items.filter(Boolean)) for (const key of item.sockets || []) {
    const e = key && gemStat(key, item.slot);
    if (e) out[e.stat] = Math.round(((out[e.stat] || 0) + e.value) * 10) / 10;
  }
  return out;
}
// Better gems appear as stages rise; most drops are a grade below the best available.
export function rollGem(tier, stage, rng = Math.random) {
  if (rng() >= {normal:.02, magic:.07, rare:.3, unique:1}[tier]) return null;
  const top = stage < 8 ? 0 : stage < 18 ? 1 : stage < 32 ? 2 : stage < 50 ? 3 : 4;
  return gemKey(GEM_TYPES[Math.floor(rng() * GEM_TYPES.length)], Math.max(0, top - (rng() < .6 ? 1 : 0)));
}
const give = (s, key, n = 1) => { s.gems[key] = (s.gems[key] || 0) + n; };
export function combineGems(s, key) {
  const g = parseGem(key);
  if (!g || g.grade >= GEM_GRADES.length - 1 || (s.gems[key] || 0) < 3) return false;
  s.gems[key] -= 3; if (!s.gems[key]) delete s.gems[key];
  give(s, gemKey(g.type, g.grade + 1)); return true;
}
export function socketGem(s, item, key) {
  const at = item?.sockets?.indexOf(null) ?? -1;
  if (at < 0 || !parseGem(key) || (s.gems[key] || 0) < 1) return false;
  s.gems[key]--; if (!s.gems[key]) delete s.gems[key];
  item.sockets[at] = key; return true;
}
export const unsocketCost = item => Math.round(20 + (item.itemLevel || 1) * 6);
export function unsocketGem(s, item, index) {
  const key = item?.sockets?.[index]; if (!key) return false;
  const cost = unsocketCost(item); if (s.gold < cost) return false;
  s.gold -= cost; item.sockets[index] = null; give(s, key); return true;
}
export const socketCost = item => Math.round(250 * ((item.sockets?.length || 0) + 1) ** 2 * (1 + (item.itemLevel || 1) * .15));
export function addSocket(s, item) {
  if (!item || (item.sockets?.length || 0) >= maxSockets(item.slot)) return false;
  const cost = socketCost(item); if (s.gold < cost) return false;
  s.gold -= cost; item.sockets = [...(item.sockets || []), null]; return true;
}
// Gems in a destroyed item are returned to the pouch.
export function reclaimGems(s, item) { for (const key of item.sockets || []) if (key) give(s, key); }
export function normalizeSockets(item) {
  const max = maxSockets(item.slot);
  if (!Array.isArray(item.sockets) || !max) { delete item.sockets; return item; }
  item.sockets = item.sockets.slice(0, max).map(key => (parseGem(key) ? key : null));
  if (!item.sockets.length) delete item.sockets;
  return item;
}
export function normalizeGems(raw) {
  const out = {};
  if (raw && typeof raw === 'object') for (const [key, n] of Object.entries(raw)) if (parseGem(key) && Number.isSafeInteger(n) && n > 0) out[key] = Math.min(9999, n);
  return out;
}
