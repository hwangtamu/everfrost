import {AFFIXES,ITEM_RARITIES} from './loot.js';

export function normalizeLootFilter(value={}) {
  if(!value||typeof value!=='object')value={};
  return {
    minRarity:Number.isInteger(value.minRarity)?Math.max(0,Math.min(3,value.minRarity)):0,
    slots:Array.isArray(value.slots)?[...new Set(value.slots.filter(s=>['weapon','armor','charm'].includes(s)))]:['weapon','armor','charm'],
    minItemLevel:Number.isSafeInteger(value.minItemLevel)?Math.max(1,value.minItemLevel):1,
    affixes:Array.isArray(value.affixes)?[...new Set(value.affixes.filter(id=>AFFIXES[id]))]:[],
    alwaysShowUnique:value.alwaysShowUnique!==false,
    salvageHidden:value.salvageHidden===true
  };
}

export function matchesLootFilter(item,filter) {
  const f=filter||normalizeLootFilter();
  if(item.rarity===3&&f.alwaysShowUnique)return true;
  return item.rarity>=f.minRarity && f.slots.includes(item.slot) && (item.itemLevel||1)>=f.minItemLevel &&
    (!f.affixes.length||(item.affixes||[]).some(a=>f.affixes.includes(a.id)));
}

export function lootFilterSummary(filter) {
  const f=filter||normalizeLootFilter();
  const custom=f.slots.length!==3||f.minItemLevel>1||f.affixes.length>0;
  return `${f.minRarity===0?'All rarities':ITEM_RARITIES[f.minRarity]+'+'}${custom?' · custom rules':''}${f.salvageHidden?' · auto-salvage':''}`;
}
