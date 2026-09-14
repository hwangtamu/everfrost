import {GEAR,GEAR_SLOTS,WEAPON_TYPE_IDS,canonicalSlot,weaponType} from './gear.js';
import {AFFIXES,ITEM_GRADES,itemGrade} from './loot.js';

export function normalizeLootFilter(value={}) {
  if(!value||typeof value!=='object')value={};
  return {
    minGrade:Number.isInteger(value.minGrade)?Math.max(0,Math.min(8,value.minGrade)):([0,0,2,4][value.minRarity]||0),
    minEssenceGrade:Number.isInteger(value.minEssenceGrade)?Math.max(0,Math.min(9,value.minEssenceGrade)):0,
    slots:Array.isArray(value.slots)?[...new Set(value.slots.flatMap(s=>s==='armor'?['head','shoulder','chest','belt','leg','foot']:s==='weapon'?['hand','wrist']:s==='charm'?['neck']:[s]).filter(s=>GEAR_SLOTS.includes(s)))]:GEAR_SLOTS,
    weaponTypes:Array.isArray(value.weaponTypes)?[...new Set(value.weaponTypes.filter(id=>WEAPON_TYPE_IDS.includes(id)))]:WEAPON_TYPE_IDS,
    minItemLevel:Number.isSafeInteger(value.minItemLevel)?Math.max(1,value.minItemLevel):1,
    affixes:Array.isArray(value.affixes)?[...new Set(value.affixes.filter(id=>AFFIXES[id]))]:[],
    alwaysShowUnique:value.alwaysShowUnique!==false
  };
}

export function matchesLootFilter(item,filter) {
  if(item.kind==='keystone')return true;
  const f=filter||normalizeLootFilter();
  if(item.unique&&f.alwaysShowUnique)return true;
  return itemGrade(item)>=f.minGrade && f.slots.includes(item.slot) && (item.slot!=='hand'||f.weaponTypes.includes(weaponType(item))) && (item.itemLevel||1)>=f.minItemLevel &&
    (!f.affixes.length||(item.affixes||[]).some(a=>f.affixes.includes(a.id)));
}

export function lootFilterSummary(filter) {
  const f=filter||normalizeLootFilter();
  const custom=f.slots.length!==GEAR_SLOTS.length||f.weaponTypes.length!==WEAPON_TYPE_IDS.length||f.minItemLevel>1||f.affixes.length>0;
  const restricted=f.minGrade>0||custom||!f.alwaysShowUnique;
  return `${f.minGrade===0?'All grades':ITEM_GRADES[f.minGrade]+'+'}${custom?' · custom rules':''}${restricted?' · non-matches → salvage':''} · Essences: ${f.minEssenceGrade===9?'ignored':ITEM_GRADES[f.minEssenceGrade]+'+'}`;
}
