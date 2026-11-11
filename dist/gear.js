// Implicits belong to the base item: rarity and explicit crafting never reroll them.
export const GEAR = {
  head:{label:'Head',name:'Warden Helm',icon:'shield',rates:{defense:.8,maxHp:3}},
  neck:{label:'Neck',name:'Runestone Pendant',icon:'gem',rates:{maxHp:9,attack:.8}},
  shoulder:{label:'Shoulder',name:'Sentinel Mantle',icon:'shield',rates:{defense:.8,maxHp:2}},
  chest:{label:'Chest',name:'Runebound Cuirass',icon:'shield',rates:{defense:3.6,maxHp:5}},
  wrist:{label:'Wrist',name:'Iron Bracers',icon:'swords',rates:{attack:1.4,defense:.3,maxHp:2}},
  hand:{label:'Hand',name:'Vanguard Gauntlets',icon:'sword',rates:{attack:5.6,defense:.4,maxHp:2}},
  belt:{label:'Belt',name:'Trailkeeper Belt',icon:'shield',rates:{maxHp:6,defense:.4}},
  leg:{label:'Leg',name:'Sentinel Greaves',icon:'shield',rates:{defense:1.2,maxHp:4}},
  foot:{label:'Foot',name:'Pathfinder Boots',icon:'compass',rates:{defense:.5,maxHp:2}},
  leftRing:{label:'Left ring',name:'Runic Band',icon:'ring',rates:{attack:.8,maxHp:4}},
  rightRing:{label:'Right ring',name:'Runic Band',icon:'ring',rates:{attack:.8,maxHp:4}}
};
export const GEAR_SLOTS=Object.keys(GEAR);
// Every slot drops as one of three bases. The first matches the slot's classic
// profile; the others trade raw implicits for a fixed bonus that shapes a build.
const ring=[
  {id:'band',name:'Runic Band',rates:{attack:.8,maxHp:4}},
  {id:'gilded',name:'Gilded Band',rates:{maxHp:3},bonus:{goldFind:12,magicFind:8}},
  {id:'bloodstone',name:'Bloodstone Ring',rates:{attack:.6,maxHp:3},bonus:{leech:.8}}
];
export const BASES={
  head:[{id:'helm',name:'Warden Helm',rates:{defense:.8,maxHp:3}},{id:'hood',name:'Hunter\u2019s Hood',rates:{defense:.5,maxHp:2.5},bonus:{critical:4}},{id:'circlet',name:'Seer\u2019s Circlet',rates:{defense:.3,maxHp:2},bonus:{cooldown:6,manaRegen:15}}],
  neck:[{id:'pendant',name:'Runestone Pendant',rates:{maxHp:9,attack:.8}},{id:'talisman',name:'Fang Talisman',rates:{attack:1.4,maxHp:4},bonus:{criticalMultiplier:12}},{id:'charm',name:'Lucky Charm',rates:{maxHp:6},bonus:{magicFind:10,goldFind:10}}],
  shoulder:[{id:'mantle',name:'Sentinel Mantle',rates:{defense:.8,maxHp:2}},{id:'pauldrons',name:'Spiked Pauldrons',rates:{defense:.6,maxHp:1.5,attack:.5}},{id:'cloak',name:'Wind Cloak',rates:{defense:.4,maxHp:2},bonus:{movement:6}}],
  chest:[{id:'cuirass',name:'Runebound Cuirass',rates:{defense:3.6,maxHp:5}},{id:'jerkin',name:'Stalker\u2019s Jerkin',rates:{defense:2.2,maxHp:5},bonus:{haste:6,movement:6}},{id:'vestment',name:'Sage\u2019s Vestment',rates:{defense:1.6,maxHp:4.5},bonus:{skillDamage:10,manaRegen:15}}],
  wrist:[{id:'bracers',name:'Iron Bracers',rates:{attack:1.4,defense:.3,maxHp:2}},{id:'wraps',name:'Duelist Wraps',rates:{attack:1.2,maxHp:1.5},bonus:{haste:6}},{id:'cuffs',name:'Warding Cuffs',rates:{defense:.7,maxHp:3},bonus:{resist:5}}],
  hand:[{id:'gauntlets',name:'Vanguard Gauntlets',rates:{attack:5.6,defense:.4,maxHp:2}},{id:'claws',name:'Reaver Claws',rates:{attack:4.7,maxHp:2},bonus:{critical:5,haste:8}},{id:'fists',name:'Siege Fists',rates:{attack:6.3,defense:.6},bonus:{splash:20,haste:-6}}],
  belt:[{id:'belt',name:'Trailkeeper Belt',rates:{maxHp:6,defense:.4}},{id:'girdle',name:'Heavy Girdle',rates:{maxHp:4.5,defense:1}},{id:'sash',name:'Alchemist\u2019s Sash',rates:{maxHp:4},bonus:{potion:15}}],
  leg:[{id:'greaves',name:'Sentinel Greaves',rates:{defense:1.2,maxHp:4}},{id:'leggings',name:'Runner\u2019s Leggings',rates:{defense:.8,maxHp:3},bonus:{movement:8}},{id:'tassets',name:'Bulwark Tassets',rates:{defense:1.8,maxHp:2.5}}],
  foot:[{id:'boots',name:'Pathfinder Boots',rates:{defense:.5,maxHp:2}},{id:'treads',name:'Swift Treads',rates:{defense:.3,maxHp:1.5},bonus:{movement:10}},{id:'sabatons',name:'Stoneguard Sabatons',rates:{defense:.9,maxHp:3}}],
  leftRing:ring,rightRing:ring
};
export const baseOf=item=>BASES[canonicalSlot(item.slot)]?.find(b=>b.id===item.base)||BASES[canonicalSlot(item.slot)][0];
const BONUS_TEXT={critical:v=>`${v}% critical chance`,criticalMultiplier:v=>`${v}% critical multiplier`,haste:v=>`${v}% attack speed`,movement:v=>`${v}% movement speed`,splash:v=>`${v}% splash damage`,
  resist:v=>`${v}% elemental resistance`,leech:v=>`${v}% life leech`,cooldown:v=>`${v}% cooldown recovery`,manaRegen:v=>`${v}% mana regeneration`,skillDamage:v=>`${v}% skill damage`,
  goldFind:v=>`${v}% gold found`,magicFind:v=>`${v}% item rarity`,potion:v=>`${v}% potion strength`};
export const bonusLines=base=>Object.entries(base.bonus||{}).map(([stat,v])=>(v>0?'+':'−')+BONUS_TEXT[stat](Math.abs(v)));
// Sum of the fixed bonuses on equipped bases.
export function baseBonuses(items){
  const out={};
  for(const item of items.filter(Boolean))for(const [stat,v] of Object.entries(baseOf(item).bonus||{}))out[stat]=(out[stat]||0)+v;
  return out;
}
export const RING_SLOTS=['leftRing','rightRing'];
export const LEGACY_SLOTS={weapon:'hand',armor:'chest',charm:'neck'};
export const STAT_LABELS={attack:'Damage',defense:'Armor',maxHp:'Life'};
export const canonicalSlot=slot=>LEGACY_SLOTS[slot]||slot;
const round=n=>Math.round(n*10)/10;
export function rollImplicits(slot,itemLevel,rng=Math.random,base=BASES[slot][0]){
  return Object.fromEntries(Object.entries(base.rates).map(([stat,rate])=>[stat,round(rate*itemLevel*(.95+rng()*.1))]));
}
export function implicitStats(item){
  if(!item)return {};
  return Object.fromEntries(Object.entries(item.implicits||{}).map(([stat,value])=>[stat,round(value*(1+(item.upgrade||0)*.1))]));
}
export const primaryStat=item=>Object.keys(baseOf(item).rates)[0];
export const primaryPower=item=>implicitStats(item)[primaryStat(item)]||0;
export function migrateGear(item){
  const legacy=!!LEGACY_SLOTS[item.slot];
  item.slot=canonicalSlot(item.slot);
  item.itemLevel=Number.isSafeInteger(item.itemLevel)&&item.itemLevel>0?item.itemLevel:1;
  if(legacy)item.name=GEAR[item.slot].name;
  if(item.base!==undefined&&!BASES[item.slot].some(b=>b.id===item.base))delete item.base;
  const base=item.implicits,rates=baseOf(item).rates;
  if(!base||!Object.entries(rates).every(([key,rate])=>Number.isFinite(base[key])&&base[key]>=round(rate*item.itemLevel*.95)&&base[key]<=round(rate*item.itemLevel*1.05))||Object.keys(base).length!==Object.keys(rates).length){
    // A stable middle roll avoids rerolling legacy gear on every load.
    item.implicits=rollImplicits(item.slot,item.itemLevel,()=>.5,baseOf(item));
  }
  delete item.power;
  return item;
}
export function implicitMarkup(item){
  const effective=implicitStats(item);
  return `<section class="implicit-stats"><strong>Implicit base stats · item level ${item.itemLevel}</strong>${Object.entries(item.implicits).map(([stat,value])=>`<div><span>${STAT_LABELS[stat]}</span><b>${effective[stat]}${item.upgrade?` <small>(${value} base + ${item.upgrade*10}%)</small>`:''}</b></div>`).join('')}<p>Item level × slot base value, with ±5% variance. Explicit crafting preserves this roll.</p></section>`;
}
