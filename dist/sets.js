// Item sets: named pieces that drop in place of some rare items. Wearing two,
// three or four pieces of a set unlocks its bonuses. Each piece is an ordinary
// rare item (with its own modifiers) on a fixed base.
export const SETS = {
  wolfpack: {name:'Wolfpack', color:'#8fd08a', pieces:{hand:['Fang','claws'], foot:['Stride','treads'], belt:['Sinew','belt'], ring:['Howl','bloodstone']},
    bonuses:[[2,{haste:12},'+12% attack speed'],[3,{movement:15,leech:2},'+15% movement speed · 2% life leech'],[4,{splash:60},'+60% splash damage']]},
  frostwarden: {name:'Frostwarden', color:'#7fb1e8', pieces:{head:['Visage','helm'], chest:['Bulwark','cuirass'], shoulder:['Spaulders','mantle'], leg:['Greaves','tassets']},
    bonuses:[[2,{lifePct:15},'+15% maximum health'],[3,{defensePct:25,resist:15},'+25% armor · +15% elemental resistance'],[4,{takenLess:10},'Take 10% less damage']]},
  stormcaller: {name:'Stormcaller', color:'#b79be6', pieces:{head:['Diadem','circlet'], neck:['Eye','pendant'], wrist:['Coils','cuffs'], ring:['Loop','band']},
    bonuses:[[2,{skillDamage:20},'+20% skill damage'],[3,{cooldown:15,manaRegen:30},'+15% cooldown recovery · +30% mana regeneration'],[4,{allSkills:2},'+2 to all skill ranks']]},
  executioner: {name:'Ashen Executioner', color:'#e0825f', pieces:{hand:['Verdict','fists'], wrist:['Grip','wraps'], neck:['Brand','talisman'], belt:['Girdle','girdle']},
    bonuses:[[2,{critical:6},'+6% critical chance'],[3,{criticalMultiplier:40},'+40% critical multiplier'],[4,{damageMore:20},'Deal 20% more damage']]},
  seeker: {name:'Treasure Seeker', color:'#e6cf6a', pieces:{foot:['Trail','boots'], ring:['Signet','gilded'], belt:['Purse','sash'], shoulder:['Cloak','cloak']},
    bonuses:[[2,{goldFind:30},'+30% gold found'],[3,{magicFind:30},'+30% item rarity'],[4,{potionCharges:1,movement:15},'+1 potion charge · +15% movement speed']]}
};
export const SET_CHANCE = .1; // of rare drops
const pieceKey = slot => (slot === 'leftRing' || slot === 'rightRing' ? 'ring' : slot);
export const setPiece = (setId, slot) => SETS[setId]?.pieces[pieceKey(slot)] || null;
export const setsForSlot = slot => Object.keys(SETS).filter(id => SETS[id].pieces[pieceKey(slot)]);
export const setItemName = (setId, slot) => `${SETS[setId].name} ${setPiece(setId, slot)[0]}`;
// Distinct pieces worn per set; two rings of one set count once.
export function setCounts(items) {
  const worn = {};
  for (const item of items.filter(Boolean)) if (item.set && setPiece(item.set, item.slot)) (worn[item.set] ??= new Set()).add(pieceKey(item.slot));
  return Object.fromEntries(Object.entries(worn).map(([id, pieces]) => [id, pieces.size]));
}
export function setBonuses(items) {
  const out = {};
  for (const [id, count] of Object.entries(setCounts(items))) for (const [need, stats] of SETS[id].bonuses) if (count >= need) for (const k in stats) out[k] = (out[k] || 0) + stats[k];
  return out;
}
export function randomSetPiece(rng = Math.random, slot) {
  const ids = slot ? setsForSlot(slot) : Object.keys(SETS);
  if (!ids.length) return null;
  const setId = ids[Math.floor(rng() * ids.length)];
  if (slot) return {setId, slot};
  const slots = Object.keys(SETS[setId].pieces), pick = slots[Math.floor(rng() * slots.length)];
  return {setId, slot:pick === 'ring' ? 'leftRing' : pick};
}
