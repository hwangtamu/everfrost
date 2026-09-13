import {AFFIXES,ITEM_RARITIES} from './loot.js';
import {normalizeLootFilter,matchesLootFilter} from './loot-filter.js';

const checked=value=>value?'checked':'';
export function filterFromForm(form) {
  const data=new FormData(form);
  return normalizeLootFilter({minRarity:Number(data.get('minRarity')),minItemLevel:Number(data.get('minItemLevel')),
    slots:data.getAll('slots'),affixes:data.getAll('affixes'),alwaysShowUnique:data.has('alwaysShowUnique'),salvageHidden:data.get('hiddenAction')==='salvage'});
}

export function lootFilterPanel(s,filter=s.lootFilter) {
  const f=normalizeLootFilter(filter);
  return `<form id="loot-filter-form" class="loot-filter-form"><p class="dialog-description">Drops appear on the ground for a moment, then collect automatically. Choose which labels you see and what happens to hidden drops.</p><div class="filter-presets"><button type="button" class="button" data-loot-preset="all">Show all</button><button type="button" class="button" data-loot-preset="rare">Rare & unique</button></div><div class="filter-fields"><label>Minimum rarity<select name="minRarity">${ITEM_RARITIES.map((r,i)=>`<option value="${i}" ${f.minRarity===i?'selected':''}>${r}${i<3?' and above':''}</option>`).join('')}</select></label><label>Minimum item level<input name="minItemLevel" type="number" min="1" step="1" value="${f.minItemLevel}" required></label></div><fieldset><legend>Equipment types</legend><div class="filter-checks">${[['weapon','Weapons'],['armor','Armor'],['charm','Charms']].map(([id,label])=>`<label><input type="checkbox" name="slots" value="${id}" ${checked(f.slots.includes(id))}>${label}</label>`).join('')}</div></fieldset><details ${f.affixes.length?'open':''}><summary>Desired modifiers · match any selected</summary><p class="small-description">Leave all unselected to accept any modifiers.</p><div class="filter-affixes">${Object.entries(AFFIXES).map(([id,a])=>`<label><input type="checkbox" name="affixes" value="${id}" ${checked(f.affixes.includes(id))}><span>${a.name}<small>${a.label.replace(/^% /,'')}</small></span></label>`).join('')}</div></details><label class="filter-unique"><input type="checkbox" name="alwaysShowUnique" ${checked(f.alwaysShowUnique)}>Always show unique items (bypass filter rules)</label><label class="hidden-loot-label">Hidden drops<select name="hiddenAction"><option value="keep" ${!f.salvageHidden?'selected':''}>Collect into inventory</option><option value="salvage" ${f.salvageHidden?'selected':''}>Automatically salvage into essence</option></select></label><p class="filter-preview" id="filter-preview" role="status">${previewText(s,f)}</p><p class="small-description">Rules apply to new drops. Equipment already in your inventory is kept. Filter preferences save with your hero. A full inventory salvages incoming equipment into essence.</p><div class="filter-footer"><button class="button" type="button" data-action="close">Cancel</button><button class="button gold-button" type="submit">Apply loot filter</button></div></form>`;
}

function previewText(s,f) {
  const sample=[...s.inventory,...Object.values(s.equipment),...(s.groundLoot||[]).map(d=>d.item)].filter(Boolean);
  const count=sample.filter(item=>matchesLootFilter(item,f)).length;
  return `Preview: ${count} of ${sample.length} current items match. ${f.salvageHidden?'Hidden future drops become essence.':'Hidden future drops still enter your inventory.'}`;
}
export function updateFilterPreview(s,form) {
  const preview=document.getElementById('filter-preview');
  if(preview)preview.textContent=previewText(s,filterFromForm(form));
}
