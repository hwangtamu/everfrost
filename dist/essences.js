import {AFFIXES,ITEM_GRADES,affixGrade,tierOf,canAddAffix,renameItem} from './loot.js';
// D → S. Each salvaged explicit modifier has an independent recovery roll.
export const ESSENCE_RECOVERY=[.40,.32,.25,.18,.12,.08,.05,.025,.01];
export const ESSENCE_SUCCESS=[.95,.90,.85,.78,.68,.55,.40,.28,.15];
export const MAX_ESSENCE_STACKS=512;
export const essenceKey=a=>`${a.id}:${a.tier}:${a.value}`;
export const essenceCount=s=>(s.essences||[]).reduce((n,e)=>n+e.count,0);
export function validEssence(e){
 const a=e?.affix,def=AFFIXES[a?.id];
 if(!def||!Number.isInteger(a.tier)||a.tier<1||a.tier>9||!Number.isFinite(a.value)||!Number.isSafeInteger(e.count)||e.count<1)return false;
 const t=tierOf(def,a.tier);return e.id===essenceKey(a)&&a.value>=t.minVal&&a.value<=t.maxVal;
}
export function normalizeEssences(entries){
 const stacks=new Map();
 for(const e of Array.isArray(entries)?entries:[]){
  if(!validEssence(e))continue;
  const found=stacks.get(e.id);
  if(found)found.count=Math.min(1e9,found.count+e.count);
  else if(stacks.size<MAX_ESSENCE_STACKS){const t=tierOf(AFFIXES[e.affix.id],e.affix.tier);stacks.set(e.id,{id:e.id,affix:{id:e.affix.id,tier:e.affix.tier,value:e.affix.value,min:t.minVal,max:t.maxVal},count:Math.min(1e9,e.count)});}
 }
 return [...stacks.values()];
}
export function recoverEssences(s,item,rng=Math.random){
 s.essences??=[];const recovered=[];let ignored=0;
 for(const a of item.affixes||[]){
  if(!AFFIXES[a.id])continue;
  const grade=affixGrade(a);if(rng()>=ESSENCE_RECOVERY[grade])continue;
  if(grade<(s.lootFilter?.minEssenceGrade||0)){ignored++;continue;}
  const id=essenceKey(a),found=s.essences.find(e=>e.id===id);
  if(found){found.count=Math.min(1e9,found.count+1);recovered.push(found);}
  else if(s.essences.length<MAX_ESSENCE_STACKS){const essence={id,affix:{...a},count:1};s.essences.push(essence);recovered.push(essence);}
  else ignored++;
 }
 return {recovered,ignored};
}
export function essenceEligibility(item,essence){
 if(!item||!validEssence(essence))return 'Choose an item and an essence.';
 const a=essence.affix,def=AFFIXES[a.id];
 if(!def.slots.includes(item.slot))return 'This modifier does not fit this gear slot.';
 const existing=(item.affixes||[]).find(x=>x.id===a.id);
 if(existing&&existing.tier<=a.tier)return 'The existing modifier is the same grade or stronger.';
 if(!existing&&!canAddAffix(item,def.kind))return `All three ${def.kind} slots are occupied.`;
 return '';
}
export function applyEssence(s,item,essenceId,rng=Math.random){
 if(!item||![...s.inventory,...Object.values(s.equipment)].includes(item))return {ok:false,reason:'Choose an owned item.'};
 const essence=s.essences?.find(e=>e.id===essenceId),reason=essenceEligibility(item,essence);
 if(reason)return {ok:false,reason};
 const chance=ESSENCE_SUCCESS[affixGrade(essence.affix)],success=rng()<chance,affix={...essence.affix};
 essence.count--;if(!essence.count)s.essences=s.essences.filter(e=>e!==essence);
 if(success){const index=item.affixes.findIndex(a=>a.id===affix.id);if(index<0)item.affixes.push(affix);else item.affixes[index]=affix;renameItem(item);s.crafted=(s.crafted||0)+1;}
 return {ok:true,success,chance,affix,item,reason:success?`${ITEM_GRADES[affixGrade(affix)]} essence applied.`:'The essence faded. Your item is unchanged.'};
}

export function discardEssence(s,id,count){
 s.essences??=[];const index=s.essences.findIndex(e=>e.id===id);
 if(index<0)return 0;
 const stack=s.essences[index];
 const amount=count===undefined?stack.count:(Number.isSafeInteger(count)&&count>0?Math.min(count,stack.count):0);
 if(amount<=0)return 0;
 stack.count-=amount;
 if(stack.count<=0)s.essences.splice(index,1);
 return amount;
}
