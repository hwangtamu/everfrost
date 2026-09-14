// Implicits belong to the base item: grade and explicit crafting never reroll them.
export const WEAPON_TYPES = {
  sword:{label:'One-hand sword',name:'Iron Longsword',icon:'sword',rates:{attack:5.6,defense:.4,maxHp:2},attackInterval:1.1,attackRange:1.9,description:'Balanced speed, reach, and protection.'},
  greatsword:{label:'Two-hand melee',name:'Frostforged Greatsword',icon:'swords',rates:{attack:8.2,maxHp:3},attackInterval:1.42,attackRange:2.5,description:'Heavy damage and reach at a slower attack speed.'},
  bow:{label:'Bow',name:'Yew Longbow',icon:'bow',rates:{attack:4.8},attackInterval:.9,attackRange:5.2,critBonus:.04,description:'Fast ranged attacks with additional critical chance.'},
  staff:{label:'Staff',name:'Runed Battlestaff',icon:'staff',rates:{attack:5.2,maxHp:2},attackInterval:1.2,attackRange:4.6,elementalMultiplier:1.2,description:'Ranged spell strikes with stronger elemental damage.'}
};
export const WEAPON_TYPE_IDS=Object.keys(WEAPON_TYPES);
export const GEAR = {
  head:{label:'Head',name:'Warden Helm',icon:'shield',rates:{defense:.8,maxHp:3}},
  neck:{label:'Neck',name:'Runestone Pendant',icon:'gem',rates:{maxHp:9,attack:.8}},
  shoulder:{label:'Shoulder',name:'Sentinel Mantle',icon:'shield',rates:{defense:.8,maxHp:2}},
  chest:{label:'Chest',name:'Runebound Cuirass',icon:'shield',rates:{defense:3.6,maxHp:5}},
  wrist:{label:'Wrist',name:'Iron Bracers',icon:'swords',rates:{attack:1.4,defense:.3,maxHp:2}},
  hand:{label:'Weapon',name:WEAPON_TYPES.sword.name,icon:'sword',rates:WEAPON_TYPES.sword.rates},
  belt:{label:'Belt',name:'Trailkeeper Belt',icon:'shield',rates:{maxHp:6,defense:.4}},
  leg:{label:'Leg',name:'Sentinel Greaves',icon:'shield',rates:{defense:1.2,maxHp:4}},
  foot:{label:'Foot',name:'Pathfinder Boots',icon:'compass',rates:{defense:.5,maxHp:2}},
  leftRing:{label:'Left ring',name:'Runic Band',icon:'ring',rates:{attack:.8,maxHp:4}},
  rightRing:{label:'Right ring',name:'Runic Band',icon:'ring',rates:{attack:.8,maxHp:4}}
};
export const GEAR_SLOTS=Object.keys(GEAR);
export const RING_SLOTS=['leftRing','rightRing'];
export const LEGACY_SLOTS={weapon:'hand',armor:'chest',charm:'neck'};
export const STAT_LABELS={attack:'Damage',defense:'Armor',maxHp:'Life'};
export const canonicalSlot=slot=>LEGACY_SLOTS[slot]||slot;
export const weaponType=item=>item?.slot==='hand'&&WEAPON_TYPES[item.weaponType]?item.weaponType:'sword';
export const gearDefinition=item=>item?.slot==='hand'?WEAPON_TYPES[weaponType(item)]:GEAR[item?.slot||item];
export const gearName=item=>gearDefinition(item)?.name||'Unknown gear';
export const gearIcon=item=>gearDefinition(item)?.icon||'sparkles';
const round=n=>Math.round(n*10)/10;
export function rollImplicits(slot,itemLevel,rng=Math.random,type='sword'){
  const rates=slot==='hand'?(WEAPON_TYPES[type]||WEAPON_TYPES.sword).rates:GEAR[slot].rates;
  return Object.fromEntries(Object.entries(rates).map(([stat,rate])=>[stat,round(rate*itemLevel*(.95+rng()*.1))]));
}
export function implicitStats(item){
  if(!item)return {};
  return Object.fromEntries(Object.entries(item.implicits||{}).map(([stat,value])=>[stat,round(value*(1+(item.upgrade||0)*.1))]));
}
export const primaryStat=item=>Object.keys(gearDefinition(item).rates)[0];
export const primaryPower=item=>implicitStats(item)[primaryStat(item)]||0;
export function migrateGear(item){
  const legacy=!!LEGACY_SLOTS[item.slot];
  const oldHandName=item.slot==='hand'&&typeof item.name==='string'&&item.name.includes('Vanguard Gauntlets');
  if(Object.hasOwn(item,'locked'))item.locked=item.locked===true;
  item.slot=canonicalSlot(item.slot);
  item.itemLevel=Number.isSafeInteger(item.itemLevel)&&item.itemLevel>0?item.itemLevel:1;
  if(item.slot==='hand')item.weaponType=WEAPON_TYPES[item.weaponType]?item.weaponType:'sword';
  else delete item.weaponType;
  const definition=gearDefinition(item);
  if(legacy)item.name=definition.name;
  if(oldHandName)item.name=item.name.replace('Vanguard Gauntlets',WEAPON_TYPES.sword.name);
  const base=item.implicits;
  if(!base||!Object.entries(definition.rates).every(([key,rate])=>Number.isFinite(base[key])&&base[key]>=round(rate*item.itemLevel*.95)&&base[key]<=round(rate*item.itemLevel*1.05))||Object.keys(base).length!==Object.keys(definition.rates).length){
    // A stable middle roll avoids rerolling legacy gear on every load.
    item.implicits=rollImplicits(item.slot,item.itemLevel,()=>.5,item.weaponType);
  }
  delete item.power;
  return item;
}
export function implicitMarkup(item){
  const effective=implicitStats(item);
  const profile=item.slot==='hand'?`<div><span>Weapon profile</span><b>${WEAPON_TYPES[weaponType(item)].label}</b></div>`:'';
  return `<section class="implicit-stats"><strong>Implicit base stats · item level ${item.itemLevel}</strong>${profile}${Object.entries(item.implicits).map(([stat,value])=>`<div><span>${STAT_LABELS[stat]}</span><b>${effective[stat]}${item.upgrade?` <small>(${value} base + ${item.upgrade*10}%)</small>`:''}</b></div>`).join('')}<p>Item level × base value, with ±5% variance. Only a Divine Orb rerolls these base values.</p></section>`;
}
