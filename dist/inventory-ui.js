import {GEAR,GEAR_SLOTS,RING_SLOTS,WEAPON_TYPES,STAT_LABELS,implicitStats,primaryStat,primaryPower,gearIcon,weaponType} from './gear.js';
import {HERO_CLASSES} from './classes.js';
import {ITEM_GRADES,itemGrade,itemLabel} from './loot.js';
import {salvageGold} from './engine.js';
import {icon} from './icons.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inventoryItems(s,filter='all',sort='recent'){
 const items=s.inventory.filter(i=>filter==='all'||(filter==='rings'?RING_SLOTS.includes(i.slot):i.slot===filter));
 if(sort==='grade')items.sort((a,b)=>itemGrade(b)-itemGrade(a)||b.itemLevel-a.itemLevel);
 if(sort==='level')items.sort((a,b)=>b.itemLevel-a.itemLevel||itemGrade(b)-itemGrade(a));
 if(sort==='slot')items.sort((a,b)=>GEAR_SLOTS.indexOf(a.slot)-GEAR_SLOTS.indexOf(b.slot)||itemGrade(b)-itemGrade(a)||b.itemLevel-a.itemLevel);
 return items;
}
export const salvageCandidates=(s,filter='all')=>inventoryItems(s,filter).filter(i=>itemGrade(i)<2&&!i.unique&&!i.upgrade&&!i.locked);
export function equipButtons(item){
 return (RING_SLOTS.includes(item.slot)?RING_SLOTS:[item.slot]).map(slot=>`<button class="button" data-equip="${esc(item.id)}" data-equip-slot="${slot}" aria-label="Equip ${esc(item.name)} to ${GEAR[slot].label}">${icon('check')} ${RING_SLOTS.includes(slot)?GEAR[slot].label:'Equip'}</button>`).join('');
}
function gearSlot(s,slot){
 const item=s.equipment[slot],label=GEAR[slot].label;
 return '<button class="paper-slot grade-'+itemGrade(item)+(item?'':' is-empty')+'" data-action="equipment" data-slot="'+slot+'" title="'+esc(label+': '+(item?item.name+' · item level '+item.itemLevel:'Empty'))+'" aria-label="'+esc(label+': '+(item?item.name:'Empty slot'))+'"><span class="paper-icon">'+icon(item?gearIcon(item):GEAR[slot].icon)+(item?.locked?'<b class="equipped-lock">'+icon('lock')+'</b>':'')+'</span><span class="paper-copy"><small>'+(item?.slot==='hand'?WEAPON_TYPES[weaponType(item)].label:label)+'</small><strong>'+esc(item?.name||'Empty slot')+'</strong><em>'+(item?'i'+item.itemLevel+(item.upgrade?' · +'+item.upgrade:''):'—')+'</em></span></button>';
}
export function equippedPanel(s){
 const equipped=Object.values(s.equipment).filter(Boolean),average=equipped.length?Math.round(equipped.reduce((n,i)=>n+i.itemLevel,0)/equipped.length):0;
 const archetype=HERO_CLASSES[s.heroClass]||HERO_CLASSES.vanguard;
 return '<section class="panel secondary-panel paperdoll-panel class-'+s.heroClass+'"><div class="view-section-title"><div><span class="eyebrow">CHARACTER</span><h2>Equipped gear</h2></div><span class="capacity">'+equipped.length+' / '+GEAR_SLOTS.length+'</span></div><div class="paperdoll"><div class="paper-column">'+['head','neck','shoulder','chest','wrist'].map(slot=>gearSlot(s,slot)).join('')+'</div><div class="paper-portrait"><div class="paper-sigil">✧</div><canvas id="loadout-portrait" width="240" height="320" aria-label="Your equipped '+archetype.name+'"></canvas><strong>'+esc(s.name)+'</strong><small>LEVEL '+s.level+' · '+archetype.name.toUpperCase()+'</small><span>Average item level <b>'+average+'</b></span></div><div class="paper-column paper-right">'+['hand','belt','leg','foot'].map(slot=>gearSlot(s,slot)).join('')+'</div><div class="paper-rings">'+RING_SLOTS.map(slot=>gearSlot(s,slot)).join('')+'</div></div><p class="inventory-note">Select a slot to inspect gear. Weapons can be swords, greatswords, bows, or staves. Rings fit either finger.</p></section>';
}
export function inventoryCard(item,s){
 return '<article class="bag-cell grade-'+itemGrade(item)+(item.locked?' item-locked':'')+'"><button class="bag-inspect" data-item="'+esc(item.id)+'" title="'+esc(item.name+' · '+itemLabel(item)+' · item level '+item.itemLevel)+'" aria-label="Inspect '+esc(item.name)+'"><span class="bag-item-icon">'+icon(gearIcon(item))+'</span><small class="bag-level">'+item.itemLevel+'</small>'+(item.upgrade?'<b class="bag-upgrade">+'+item.upgrade+'</b>':'')+'<span class="bag-grade">'+ITEM_GRADES[itemGrade(item)]+(item.unique?' ✦':'')+'</span><span class="bag-item-name">'+esc(item.name)+'</span></button><button class="bag-lock" data-lock-item="'+esc(item.id)+'" title="'+(item.locked?'Unlock':'Lock')+' item" aria-label="'+(item.locked?'Unlock ':'Lock ')+esc(item.name)+'" aria-pressed="'+!!item.locked+'">'+icon('lock')+'</button></article>';
}
export function inventoryPanel(s,filter='all',sort='recent'){
 const items=inventoryItems(s,filter,sort),junk=salvageCandidates(s,filter),gold=junk.reduce((n,i)=>n+salvageGold(i),0);
 const filters=[['all','All gear'],['rings','Both rings'],...GEAR_SLOTS.map(slot=>[slot,GEAR[slot].label])];
 const empty=filter==='all'?Math.max(0,48-s.inventory.length):0;
 return '<section class="panel secondary-panel bag-panel"><div class="view-section-title"><div><span class="eyebrow">BACKPACK</span><h2>Your satchel</h2></div><span class="capacity">'+s.inventory.length+' / 48</span></div><div class="bag-capacity" role="meter" aria-label="Satchel capacity" aria-valuenow="'+s.inventory.length+'" aria-valuemin="0" aria-valuemax="48"><i style="width:'+Math.min(100,s.inventory.length/48*100)+'%"></i></div><div class="bag-toolbar"><label>Show<select id="inventory-filter">'+filters.map(([id,label])=>'<option value="'+id+'" '+(filter===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Sort<select id="inventory-sort">'+[['recent','Newest first'],['grade','Grade'],['level','Item level'],['slot','Slot']].map(([id,label])=>'<option value="'+id+'" '+(sort===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div>'+(!items.length?'<p class="bag-empty">'+(s.inventory.length?'No matching gear.':'Your satchel is empty.')+'</p>':'')+'<div class="bag-grid">'+items.map(i=>inventoryCard(i,s)).join('')+Array.from({length:empty},()=>'<div class="bag-cell bag-empty-cell" aria-hidden="true"><span>·</span></div>').join('')+'</div><div class="bag-footer"><button class="button salvage-button" data-action="salvage-junk" '+(junk.length?'':'disabled')+'>'+icon('hammer')+' Salvage D/C ('+junk.length+') · '+gold+' '+icon('coin')+'</button><button class="button" data-action="loot-filter">'+icon('bag')+' Loot filter</button></div><p class="inventory-note">'+icon('lock')+' Lock items to keep them. Locked gear cannot be salvaged. Cleanup keeps B–S, unique and upgraded items. Inspect a slot to equip or salvage instantly.</p></section>';
}
