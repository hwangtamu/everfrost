import {implicitMarkup} from './gear.js';
import {icon} from './icons.js';
import {AFFIXES,ITEM_GRADES,affixText,affixGrade,affixSlots,itemLabel,uniqueDescription} from './loot.js';
import {CRAFT_OPERATIONS,craftCost,craftEligibility} from './crafting.js';
import {ESSENCE_RECOVERY,ESSENCE_SUCCESS,MAX_ESSENCE_STACKS,essenceCount,essenceEligibility} from './essences.js';
let craftSelected='',essenceSelected='';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const selectCraftItem=id=>{craftSelected=id;};
export const selectEssence=id=>{essenceSelected=id;};
export const craftTargets=s=>[...Object.values(s.equipment).filter(Boolean),...s.inventory];
export function essencePouch(s){
 const count=essenceCount(s);
 return `<section class="panel secondary-panel essence-pouch"><div class="view-section-title"><div><span class="eyebrow">RECOVERED MODIFIERS</span><h2>Essence pouch <span class="capacity">${count}</span></h2><p>${(s.essences||[]).length} / ${MAX_ESSENCE_STACKS} stacks · identical modifiers stack together</p></div><button class="button" data-view="forge">${icon('hammer')} Craft with essences</button></div><div class="essence-grade-counts">${ITEM_GRADES.map((g,i)=>`<span class="grade-${i}"><b>${g}</b><small>${(s.essences||[]).filter(e=>affixGrade(e.affix)===i).reduce((n,e)=>n+e.count,0)}</small></span>`).join('')}</div><p class="inventory-note">Each essence holds one explicit modifier with its exact grade and value. Salvage spare equipment to find more; the loot filter can ignore lower grades.</p></section>`;
}
export function craftingPanel(s){
 const items=craftTargets(s),item=items.find(i=>i.id===craftSelected)||items[0]||null;
 if(item)craftSelected=item.id;
 const essences=[...(s.essences||[])].sort((a,b)=>affixGrade(b.affix)-affixGrade(a.affix)||a.affix.id.localeCompare(b.affix.id));
 const selected=essences.find(e=>e.id===essenceSelected)||essences.find(e=>!essenceEligibility(item,e))||essences[0];
 if(selected)essenceSelected=selected.id;
 const reason=essenceEligibility(item,selected),grade=selected?affixGrade(selected.affix):0;
 return `<section class="panel secondary-panel craft-panel"><div class="view-section-title"><div><h2>The crafting bench</h2><p>Grade follows the strongest modifier. Up to three prefixes and three suffixes.</p></div><button class="text-button" data-action="mod-dictionary">${icon('book')} Modifier dictionary</button></div>
 <div class="craft-target"><label for="craft-item">Target equipment</label><select id="craft-item">${items.map(i=>`<option value="${esc(i.id)}" ${i.id===item?.id?'selected':''}>${itemLabel(i)} · ${esc(i.name)} · i${i.itemLevel}</option>`).join('')}</select><span class="craft-summary">${item?`${affixSlots(item).prefix} / 3 prefixes · ${affixSlots(item).suffix} / 3 suffixes`: 'No equipment available'}</span></div>
 ${item?`<div class="craft-preview">${implicitMarkup(item)}${item.unique?`<div class="unique-power"><strong>${icon('star')} Permanent unique implicit</strong><p>${esc(uniqueDescription(item))}</p></div>`:''}<ul>${item.affixes.length?item.affixes.map(a=>`<li><span>${affixText(a)} <small>${AFFIXES[a.id].kind}</small></span><small class="grade-${affixGrade(a)}">${ITEM_GRADES[affixGrade(a)]} · ${a.min}–${a.max}</small></li>`).join(''):'<li class="empty">No explicit modifiers · grade D</li>'}</ul></div>`:''}
 <h3 class="craft-section-heading">Orb crafting</h3><p class="craft-guidance">Consume one orb and the shown gold cost. Only Divine Orbs can change implicit rolls; unique powers cannot be removed.</p><div class="craft-orbs">${Object.entries(CRAFT_OPERATIONS).map(([id,op])=>{
  const cost=item?craftCost(op,item):null,stock=s.orbs?.[id]||0,blocked=craftEligibility(id,item)||(!stock?'No orbs available':s.gold<cost.gold?'Not enough gold':'');
  return `<button class="craft-orb ${id}" data-craft="${id}" ${blocked?'disabled':''} title="${esc(blocked||op.flavor)}">${icon(op.icon)}<span><strong>${op.name}<b>×${stock}</b></strong><small class="orb-rule">${op.flavor}</small><small>${cost?cost.gold+' gold':'Choose an item'}${blocked?' · '+esc(blocked):''}</small></span></button>`;
 }).join('')}</div>
 <section class="essence-bench"><div class="view-section-title"><div><h3>Essence crafting</h3><p>${essenceCount(s)} essences · choose one modifier to transfer</p></div><button class="text-button" data-action="loot-filter">Essence filter ${icon('chevron')}</button></div><label for="craft-essence">Essence</label><select id="craft-essence">${essences.length?essences.map(e=>`<option value="${esc(e.id)}" ${selected?.id===e.id?'selected':''}>${ITEM_GRADES[affixGrade(e.affix)]} · ${AFFIXES[e.affix.id].kind} · ${affixText(e.affix)} · ×${e.count}${essenceEligibility(item,e)?' · incompatible':''}</option>`).join(''):'<option value="">Salvage gear to recover essences</option>'}</select>
 ${selected?`<div class="essence-preview grade-${grade}"><span>${ITEM_GRADES[grade]} ${AFFIXES[selected.affix.id].kind} essence</span><strong>${affixText(selected.affix)}</strong><p>${Math.round(ESSENCE_SUCCESS[grade]*100)}% crafting success · ${ESSENCE_RECOVERY[grade]*100}% salvage recovery</p><small>${reason||((item.affixes||[]).some(a=>a.id===selected.affix.id)?'Replaces the weaker modifier of this family.':'Fills one open '+AFFIXES[selected.affix.id].kind+' slot.')}</small></div>`:''}
 <p class="craft-guidance">A valid attempt consumes one essence, including on failure. Failure leaves the item unchanged. Replace a weaker modifier of the same family, or use an open slot. The essence carries its exact grade and value; no item-level requirement applies.</p><button class="button gold-button" data-apply-essence="${esc(selected?.id||'')}" ${reason?'disabled':''}>${icon('hammer')} Apply essence${selected?' · '+Math.round(ESSENCE_SUCCESS[grade]*100)+'% success':''}</button></section></section>`;
}
