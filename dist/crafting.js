import {AFFIXES,affixSlots,randomSideAffix,rollModifierCount,rerollValues,renameItem,UNIQUE_EFFECTS} from './loot.js';
import {rollImplicits} from './gear.js';
export const CRAFT_OPERATIONS={
 transmute:{name:'Orb of Transmutation',flavor:'Reroll all explicit modifiers into 1–2 modifiers.',icon:'sparkles',gold:20},
 augment:{name:'Orb of Augmentation',flavor:'With fewer than 2 explicit modifiers, add one.',icon:'sparkles',gold:35},
 regal:{name:'Regal Orb',flavor:'With fewer than 4 explicit modifiers, add one.',icon:'star',gold:90},
 alchemy:{name:'Orb of Alchemy',flavor:'With fewer than 3 explicit modifiers, reroll into 3–6.',icon:'zap',gold:110},
 chaos:{name:'Chaos Orb',flavor:'With more than 3 explicit modifiers, reroll into exactly 6.',icon:'zap',gold:150},
 exalt:{name:'Exalted Orb',flavor:'With fewer than 6 explicit modifiers, add an available prefix or suffix.',icon:'star',gold:240},
 scour:{name:'Orb of Scouring',flavor:'Remove every explicit modifier. All implicit powers remain.',icon:'download',gold:30},
 divine:{name:'Divine Orb',flavor:'Reroll explicit values, base implicit values and variable unique implicit values. Keep all modifier types and tiers.',icon:'sparkles',gold:70}
};
export const craftCost=(op,item)=>({gold:Math.round(op.gold*(1+(item?.itemLevel||1)*.18))});
export const craftTarget=(s,id)=>(id?s.inventory.find(i=>i.id===id):null)||Object.values(s.equipment).find(i=>i?.id===id)||null;
export function craftEligibility(opId,item){
 if(!item||!CRAFT_OPERATIONS[opId])return 'Choose an item and an orb.';
 const count=(item.affixes||[]).length;
 if(opId==='augment'&&count>=2)return 'Requires fewer than 2 explicit modifiers.';
 if(opId==='regal'&&count>=4)return 'Requires fewer than 4 explicit modifiers.';
 if(opId==='alchemy'&&count>=3)return 'Requires fewer than 3 explicit modifiers.';
 if(opId==='chaos'&&count<=3)return 'Requires more than 3 explicit modifiers.';
 if(opId==='exalt'&&count>=6)return 'All six explicit modifier slots are full.';
 if(opId==='scour'&&!count)return 'There are no explicit modifiers to remove.';
 return '';
}
export function craft(s,item,opId,rng=Math.random){
 const reason=craftEligibility(opId,item);if(reason)return {ok:false,reason};
 if(craftTarget(s,item.id)!==item)return {ok:false,reason:'Choose an owned item.'};
 const op=CRAFT_OPERATIONS[opId],cost=craftCost(op,item);
 if((s.orbs?.[opId]||0)<1)return {ok:false,reason:`No ${op.name} available.`};
 if(s.gold<cost.gold)return {ok:false,reason:`Requires ${cost.gold} gold.`};
 const next=structuredClone(item);
 switch(opId){
  case 'transmute':rollModifierCount(next,1+Math.floor(rng()*2),rng);break;
  case 'alchemy':rollModifierCount(next,3+Math.floor(rng()*4),rng);break;
  case 'chaos':rollModifierCount(next,6,rng);break;
  case 'augment':case 'regal':case 'exalt':if(!randomSideAffix(next,rng))return {ok:false,reason:'No legal modifier slot is available.'};break;
  case 'scour':next.affixes=[];break;
  case 'divine':rerollValues(next,rng);next.implicits=rollImplicits(next.slot,next.itemLevel,rng,next.weaponType);if(UNIQUE_EFFECTS[next.unique]?.stats)next.uniqueRoll=Math.round((.9+rng()*.2)*1000)/1000;break;
 }
 const slots=affixSlots(next);if(slots.prefix>3||slots.suffix>3||next.affixes.length>6||next.affixes.some(a=>!AFFIXES[a.id]))return {ok:false,reason:'Invalid modifier arrangement.'};
 renameItem(next);Object.assign(item,next);s.gold-=cost.gold;s.orbs[opId]--;s.crafted=(s.crafted||0)+1;
 return {ok:true,item,opId,cost};
}
