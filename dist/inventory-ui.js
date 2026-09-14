import {GEAR,GEAR_SLOTS,RING_SLOTS,STAT_LABELS,implicitStats,primaryStat,primaryPower} from './gear.js';
import {ITEM_RARITIES} from './loot.js';
import {salvageGold} from './engine.js';
import {itemAffixSummary} from './expedition-ui.js';
import {icon} from './icons.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups=[['Armor',['head','shoulder','chest','belt','leg','foot']],['Hands',['wrist','hand']],['Jewelry',['neck',...RING_SLOTS]]];
export function inventoryItems(s,filter='all',sort='recent'){
 const items=s.inventory.filter(i=>filter==='all'||(filter==='rings'?RING_SLOTS.includes(i.slot):i.slot===filter));
 if(sort==='rarity')items.sort((a,b)=>b.rarity-a.rarity||b.itemLevel-a.itemLevel);
 if(sort==='level')items.sort((a,b)=>b.itemLevel-a.itemLevel||b.rarity-a.rarity);
 if(sort==='slot')items.sort((a,b)=>GEAR_SLOTS.indexOf(a.slot)-GEAR_SLOTS.indexOf(b.slot)||b.rarity-a.rarity||b.itemLevel-a.itemLevel);
 return items;
}
export const salvageCandidates=(s,filter='all')=>inventoryItems(s,filter).filter(i=>i.rarity<2&&!i.unique&&!i.upgrade);
export function equipButtons(item){
 return (RING_SLOTS.includes(item.slot)?RING_SLOTS:[item.slot]).map(slot=>`<button class="button" data-equip="${esc(item.id)}" data-equip-slot="${slot}" aria-label="Equip ${esc(item.name)} to ${GEAR[slot].label}">${icon('check')} ${RING_SLOTS.includes(slot)?GEAR[slot].label:'Equip'}</button>`).join('');
}
export function equippedPanel(s){
 const count=Object.values(s.equipment).filter(Boolean).length;
 return `<section class="panel secondary-panel loadout-panel"><div class="view-section-title"><div><h2>Equipped gear</h2><p>Inspect a slot to compare its gear. Rings fit either finger.</p></div><span class="capacity">${count} / ${GEAR_SLOTS.length} equipped</span></div><div class="loadout-groups">${groups.map(([name,slots])=>`<section class="loadout-group"><h3>${name}</h3><div class="loadout-slots">${slots.map(slot=>{
 const item=s.equipment[slot],label=GEAR[slot].label;
 return `<button class="loadout-slot rarity-${item?.rarity??0} ${item?'':'is-empty'}" data-action="equipment" data-slot="${slot}" aria-label="${esc(label+': '+(item?item.name:'empty, find gear'))}"><span class="loadout-icon">${icon(GEAR[slot].icon)}</span><span class="loadout-copy"><small>${label}${item?` · ${ITEM_RARITIES[item.rarity]} · i${item.itemLevel}`:''}</small><strong>${item?esc(item.name):'Empty slot'}</strong><span>${item?Object.entries(implicitStats(item)).map(([key,value])=>`${value} ${STAT_LABELS[key]}`).join(' · '):'Browse matching loot'}${item?.upgrade?` · Forge +${item.upgrade}`:''}</span></span>${icon(item?'chevron':'plus')}</button>`;
 }).join('')}</div></section>`).join('')}</div></section>`;
}
export function inventoryCard(item,s){
 const current=s.equipment[item.slot],delta=Number((primaryPower(item)-(current?primaryPower(current):0)).toFixed(1));
 return `<article class="satchel-card rarity-${item.rarity}"><button class="satchel-inspect" data-item="${esc(item.id)}" aria-label="Inspect ${esc(item.name)}"><span class="satchel-icon">${icon(GEAR[item.slot].icon)}</span><span class="item-rarity">${ITEM_RARITIES[item.rarity]} · ${RING_SLOTS.includes(item.slot)?'Ring':GEAR[item.slot].label} · i${item.itemLevel}${item.upgrade?` · +${item.upgrade}`:''}</span><strong>${esc(item.name)}</strong><span class="satchel-power">${primaryPower(item)} ${STAT_LABELS[primaryStat(item)]}${delta?` <b class="${delta>0?'positive':'negative'}">${delta>0?'+':''}${delta} vs ${GEAR[item.slot].label.toLowerCase()}</b>`:''}</span>${itemAffixSummary(item)}</button><div class="satchel-actions">${equipButtons(item)}<button class="button salvage-button" data-salvage="${esc(item.id)}" aria-label="Salvage ${esc(item.name)} for ${salvageGold(item)} gold">${icon('hammer')} Salvage · ${salvageGold(item)} ${icon('coin')}</button></div></article>`;
}
export function inventoryPanel(s,filter='all',sort='recent'){
 const items=inventoryItems(s,filter,sort),junk=salvageCandidates(s,filter),gold=junk.reduce((n,i)=>n+salvageGold(i),0);
 const filters=[['all','All gear'],['rings','Rings'],...GEAR_SLOTS.map(slot=>[slot,GEAR[slot].label])];
 return `<section class="panel secondary-panel inventory-panel"><div class="view-section-title"><div><h2>Your satchel <span class="capacity">${s.inventory.length} / 48</span></h2><p>${48-s.inventory.length} spaces free · Inspect, equip or salvage directly.</p></div><button class="button" data-action="loot-filter">${icon('bag')} Loot filter</button></div><div class="satchel-toolbar"><label>Sort by <select id="inventory-sort">${[['recent','Newest first'],['rarity','Rarity'],['level','Item level'],['slot','Slot']].map(([id,label])=>`<option value="${id}" ${sort===id?'selected':''}>${label}</option>`).join('')}</select></label><button class="button salvage-button" data-action="salvage-junk" ${junk.length?'':'disabled'}>${icon('hammer')} Salvage normal/magic (${junk.length}) · ${gold} ${icon('coin')}</button></div><div class="filter-row satchel-filters" role="group" aria-label="Filter inventory">${filters.map(([id,name])=>`<button class="filter-button ${filter===id?'selected':''}" data-filter="${id}" aria-pressed="${filter===id}">${name} <span>${inventoryItems(s,id).length}</span></button>`).join('')}</div><div class="satchel-grid">${items.length?items.map(i=>inventoryCard(i,s)).join(''):`<div class="empty-state">${icon('bag')}<h3>${s.inventory.length?'No matching gear.':'Your satchel is empty.'}</h3><p>${s.inventory.length?'Choose another slot to see your other items.':'Explore to discover equipment and rings.'}</p><button class="button" ${s.inventory.length?'data-filter="all"':'data-view="adventure"'}>${s.inventory.length?'Show all gear':'Back to adventure'}</button></div>`}</div><p class="inventory-note">${icon('info')} Bulk salvage uses the current slot filter and keeps rare, unique and upgraded items. You confirm before cleanup. Stat differences compare base values only; inspect for all modifiers.</p></section>`;
}
