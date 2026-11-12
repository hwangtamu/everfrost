// Active skills. A skill unlocks automatically at its hero level; skill points
// raise its rank (each rank adds RANK_BONUS to its effect) and rank 4 opens a
// choice between two runes that reshape the skill. Four skills can be slotted
// at once, and every slotted skill can be cast automatically.

import {setBonuses} from './sets.js';

export const SKILL_SLOTS = 4;
export const MAX_SKILL_RANK = 10;
export const RUNE_RANK = 4;
export const RANK_BONUS = .12;

export const SKILLS = [
  {id:'cleave', name:'Runic Cleave', icon:'swords', key:'1', level:1, cooldown:3, mana:6, kind:'attack', color:'#ffe0a2',
    mult:2.2, description:'Sweep your blade through every enemy around you.',
    detail:p=>`${pct(p.mult)} attack damage to all enemies within ${p.radius.toFixed(1)} tiles.`,
    runes:[
      {id:'rending', name:'Rending', description:'+40% damage.', mods:{mult:1.4}},
      {id:'sweeping', name:'Sweeping', description:'+1.2 tiles radius and chills enemies hit.', mods:{radiusAdd:1.2, chill:true}}
    ]},
  {id:'mend', name:'Forest Blessing', icon:'leaf', key:'2', level:3, cooldown:14, mana:14, kind:'heal', color:'#a9e2aa',
    heal:.35, description:'Call on the wild to restore your health and cleanse chill.',
    detail:p=>`Restores ${Math.round(p.heal*100)}% of maximum health.${p.renew?' Then regenerates 4% per second for 5 seconds.':''}`,
    runes:[
      {id:'renewal', name:'Renewal', description:'Also regenerate 4% of maximum health per second for 5 seconds.', mods:{renew:true}},
      {id:'quickening', name:'Quickening', description:'35% shorter cooldown.', mods:{cooldown:.65}}
    ]},
  {id:'storm', name:'Thunderstrike', icon:'zap', key:'3', level:5, cooldown:9, mana:20, kind:'spell', color:'#b6d9f5',
    mult:3.5, radius:6, description:'Lightning arcs to every visible enemy nearby.',
    detail:p=>`${pct(p.mult)} attack as lightning to all enemies within ${p.radius.toFixed(1)} tiles.${p.shock?' Shocked enemies take 20% more damage for 4 seconds.':''}`,
    runes:[
      {id:'overcharge', name:'Overcharge', description:'+50% damage, but costs 50% more mana.', mods:{mult:1.5, mana:1.5}},
      {id:'static', name:'Static Field', description:'Enemies hit are shocked: they take 20% more damage for 4 seconds.', mods:{shock:true}}
    ]},
  {id:'leap', name:'Frost Leap', icon:'up', key:'4', level:8, cooldown:7, mana:12, kind:'attack', color:'#a8e0ee',
    mult:2.6, radius:2.6, range:8, description:'Leap onto your target, landing in a burst of frost that chills.',
    detail:p=>`Leap up to ${p.range} tiles and deal ${pct(p.mult)} attack as cold within ${p.radius.toFixed(1)} tiles, chilling enemies.${p.stun?' Enemies hit are stunned for 1.5 seconds.':''}`,
    runes:[
      {id:'avalanche', name:'Avalanche', description:'+1 tile radius and +20% damage.', mods:{radiusAdd:1, mult:1.2}},
      {id:'aftershock', name:'Aftershock', description:'Enemies hit are stunned for 1.5 seconds.', mods:{stun:true}}
    ]},
  {id:'whirl', name:'Whirlwind', icon:'compass', key:'5', level:12, cooldown:10, mana:18, kind:'attack', color:'#f1e2b8',
    mult:.7, radius:2.4, duration:3, description:'Spin in a storm of steel, striking everything around you while you move.',
    detail:p=>`For ${p.duration.toFixed(1)} seconds, hit all enemies within ${p.radius.toFixed(1)} tiles four times per second for ${pct(p.mult)} attack damage.${p.leech?' Whirlwind hits leech 6% of damage as life.':''}`,
    runes:[
      {id:'bloodstorm', name:'Bloodstorm', description:'Whirlwind hits leech 6% of damage as life.', mods:{leech:6}},
      {id:'cyclone', name:'Cyclone', description:'Lasts 1.5 seconds longer.', mods:{durationAdd:1.5}}
    ]},
  {id:'warcry', name:'Battle Cry', icon:'sound', key:'6', level:16, cooldown:22, mana:16, kind:'buff', color:'#f0b86f',
    power:.30, duration:8, description:'A roar that fills you with fury.',
    detail:p=>`For ${p.duration} seconds, deal ${Math.round(p.power*100)}% more damage and attack 20% faster.${p.rally?' Also restores 15% of maximum health.':''}${p.intimidate?' Enemies deal 20% less damage while it lasts.':''}`,
    runes:[
      {id:'rallying', name:'Rallying', description:'Also restores 15% of maximum health.', mods:{rally:true}},
      {id:'intimidate', name:'Intimidate', description:'Enemies deal 20% less damage while the cry lasts.', mods:{intimidate:true}}
    ]},
  {id:'meteor', name:'Emberfall', icon:'sparkles', key:'7', level:20, cooldown:11, mana:28, kind:'spell', color:'#f49c71',
    mult:7, radius:3, range:8, description:'Call a falling star onto your target.',
    detail:p=>`After a short delay, ${pct(p.mult)} attack as fire to all enemies within ${p.radius.toFixed(1)} tiles of the target.${p.burn?' The ground burns for 4 seconds.':''}`,
    runes:[
      {id:'cataclysm', name:'Cataclysm', description:'+60% damage, but 3 seconds longer cooldown.', mods:{mult:1.6, cooldownAdd:3}},
      {id:'scorched', name:'Scorched Earth', description:'Leaves burning ground for 4 seconds.', mods:{burn:true}}
    ]},
  {id:'ward', name:'Stone Ward', icon:'shield', key:'8', level:24, cooldown:18, mana:14, kind:'buff', color:'#b9c4d6',
    shield:.30, duration:6, description:'Raise a barrier of living stone that absorbs damage.',
    detail:p=>`Absorb damage equal to ${Math.round(p.shield*100)}% of maximum health for ${p.duration} seconds.${p.thorns?' Attackers are struck for 100% of your attack.':''}`,
    runes:[
      {id:'bulwark', name:'Bulwark', description:'The barrier is 50% stronger.', mods:{shield:1.5}},
      {id:'thorns', name:'Thorns', description:'While the ward holds, attackers are struck for 100% of your attack.', mods:{thorns:true}}
    ]}
];
const pct = n => Math.round(n*100)+'%';
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
export const zeroCooldowns = () => Object.fromEntries(SKILLS.map(s => [s.id, 0]));
export const defaultSkills = () => ({ranks:{}, runes:{}, slots:['cleave','mend','storm','leap'], auto:Object.fromEntries(SKILLS.map(s => [s.id, true]))});

// Rank 0 = locked. Rank 1 arrives with the unlock level; points add up to 9 more.
export function baseRank(s, id) {
  const def = SKILL_BY_ID[id];
  if (!def || s.level < def.level) return 0;
  return 1 + Math.max(0, Math.min(MAX_SKILL_RANK-1, s.skills?.ranks?.[id] || 0));
}
// "+N to all skill ranks" on gear raises unlocked skills past their trained rank.
export const gearRanks = s => Object.values(s.equipment || {}).reduce((n, item) => n + (item?.affixes || []).reduce((m, a) => m + (a.id === 'mastery' ? a.value : 0), 0), 0) + (setBonuses(Object.values(s.equipment || {})).allSkills || 0);
export function skillRank(s, id) {
  const rank = baseRank(s, id);
  return rank ? rank + gearRanks(s) : 0;
}
export function activeRune(s, id) {
  const def = SKILL_BY_ID[id], runeId = s.skills?.runes?.[id];
  return skillRank(s,id) >= RUNE_RANK ? def.runes.find(r => r.id === runeId) || null : null;
}

// Effective numbers for a skill after rank scaling and its chosen rune.
export function skillParams(s, id, attackRange = 1.9) {
  const def = SKILL_BY_ID[id], rank = Math.max(1, skillRank(s,id)), scale = 1 + (rank-1)*RANK_BONUS;
  const m = activeRune(s,id)?.mods || {};
  const p = {rank, cooldown:(def.cooldown + (m.cooldownAdd||0)) * (m.cooldown||1), mana:Math.round(def.mana * (m.mana||1))};
  if (def.mult) p.mult = def.mult * scale * (m.mult||1);
  if (id === 'cleave') p.radius = attackRange + 1.1 + (m.radiusAdd||0);
  else if (def.radius) p.radius = def.radius + (m.radiusAdd||0);
  if (def.range) p.range = def.range;
  if (def.heal) p.heal = Math.min(.8, def.heal + (rank-1)*.025);
  if (def.duration) p.duration = def.duration + (m.durationAdd||0);
  if (def.power) p.power = def.power + (rank-1)*.025;
  if (def.shield) p.shield = def.shield * scale * (m.shield||1);
  for (const flag of ['chill','renew','shock','stun','leech','rally','intimidate','burn','thorns']) if (m[flag]) p[flag] = m[flag];
  return p;
}
export const skillDetail = (s, id, attackRange) => SKILL_BY_ID[id].detail(skillParams(s, id, attackRange));

export function investSkill(s, id) {
  const def = SKILL_BY_ID[id];
  if (!def || s.skillPoints <= 0 || s.level < def.level || baseRank(s,id) >= MAX_SKILL_RANK) return false;
  s.skills.ranks[id] = (s.skills.ranks[id] || 0) + 1; s.skillPoints--;
  return true;
}
export function chooseRune(s, id, runeId) {
  const def = SKILL_BY_ID[id];
  if (!def || skillRank(s,id) < RUNE_RANK || !def.runes.some(r => r.id === runeId)) return false;
  s.skills.runes[id] = runeId; return true;
}
export function slotSkill(s, slot, id) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS) return false;
  if (id !== null && (!SKILL_BY_ID[id] || s.level < SKILL_BY_ID[id].level)) return false;
  const from = s.skills.slots.indexOf(id);
  if (id !== null && from >= 0) s.skills.slots[from] = s.skills.slots[slot]; // swap
  s.skills.slots[slot] = id; return true;
}
export function resetSkills(s) {
  const spent = Object.values(s.skills.ranks).reduce((a,b) => a+b, 0);
  s.skills.ranks = {}; s.skills.runes = {}; s.skillPoints += spent; return spent;
}
export function normalizeSkills(raw, level) {
  const out = defaultSkills();
  if (!raw || typeof raw !== 'object') return out;
  for (const def of SKILLS) {
    const r = raw.ranks?.[def.id];
    if (Number.isInteger(r) && r > 0) out.ranks[def.id] = Math.min(MAX_SKILL_RANK-1, r);
    if (def.runes.some(x => x.id === raw.runes?.[def.id])) out.runes[def.id] = raw.runes[def.id];
    if (raw.auto?.[def.id] === false) out.auto[def.id] = false;
  }
  if (Array.isArray(raw.slots) && raw.slots.length === SKILL_SLOTS) {
    const seen = new Set();
    out.slots = raw.slots.map(id => { if (!SKILL_BY_ID[id] || seen.has(id)) return null; seen.add(id); return id; });
  }
  return out;
}
