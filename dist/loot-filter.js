import {GEAR,GEAR_SLOTS,canonicalSlot} from './gear.js';
import {AFFIXES,ITEM_RARITIES} from './loot.js';

export function normalizeLootFilter(value={}) {
  if(!value||typeof value!=='object')value={};
  return {
    minRarity:Number.isInteger(value.minRarity)?Math.max(0,Math.min(3,value.minRarity)):0,
    slots:Array.isArray(value.slots)?[...new Set(value.slots.flatMap(s=>s==='armor'?['head','shoulder','chest','belt','leg','foot']:s==='weapon'?['hand','wrist']:s==='charm'?['neck']:[s]).filter(s=>GEAR_SLOTS.includes(s)))]:GEAR_SLOTS,
    minItemLevel:Number.isSafeInteger(value.minItemLevel)?Math.max(1,value.minItemLevel):1,
    affixes:Array.isArray(value.affixes)?[...new Set(value.affixes.filter(id=>AFFIXES[id]))]:[],
    alwaysShowUnique:value.alwaysShowUnique!==false,
    keepUpgrades:value.keepUpgrades!==false
  };
}

export function matchesLootFilter(item,filter) {
  if(item.kind==='keystone')return true;
  const f=filter||normalizeLootFilter();
  if(item.rarity===3&&f.alwaysShowUnique)return true;
  return item.rarity>=f.minRarity && f.slots.includes(item.slot) && (item.itemLevel||1)>=f.minItemLevel &&
    (!f.affixes.length||(item.affixes||[]).some(a=>f.affixes.includes(a.id)));
}

export function lootFilterSummary(filter) {
  const f=filter||normalizeLootFilter();
  const custom=f.slots.length!==GEAR_SLOTS.length||f.minItemLevel>1||f.affixes.length>0;
  const restricted=f.minRarity>0||custom||!f.alwaysShowUnique;
  return `Keeping ${f.minRarity===0?'all rarities':ITEM_RARITIES[f.minRarity].toLowerCase()+' or better'}${custom?' · custom rules':''}${restricted?(f.keepUpgrades?' · plus upgrades':'')+' · the rest becomes gold':''}`;
}
