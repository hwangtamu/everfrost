import {GEAR,GEAR_SLOTS,WEAPON_TYPES,canonicalSlot} from './gear.js';
import {AFFIXES,ITEM_GRADES} from './loot.js';
import {normalizeLootFilter,matchesLootFilter} from './loot-filter.js';

const checked=value=>value?'checked':'';
export function filterFromForm(form) {
  const data=new FormData(form);
  return normalizeLootFilter({minGrade:Number(data.get('minGrade')),minEssenceGrade:Number(data.get('minEssenceGrade')),minItemLevel:Number(data.get('minItemLevel')),
    slots:data.getAll('slots'),weaponTypes:data.getAll('weaponTypes'),affixes:data.getAll('affixes'),alwaysShowUnique:data.has('alwaysShowUnique')});
}

export function lootFilterPanel(s,filter=s.lootFilter) {
  const f=normalizeLootFilter(filter);
  return `<form id="loot-filter-form" class="loot-filter-form"><p class="dialog-description">Drops appear on the ground for a moment, then collect automatically. Equipment is graded by its strongest explicit modifier, from D to S. Non-matching drops are salvaged for gold and a chance at essences.</p><div class="filter-presets"><button type="button" class="button" data-loot-preset="all">Show all</button><button type="button" class="button" data-loot-preset="high">B+ & unique</button></div><div class="filter-fields"><label>Minimum equipment grade<select name="minGrade">${ITEM_GRADES.map((r,i)=>`<option value="${i}" ${f.minGrade===i?'selected':''}>${r}${i<8?' and above':''}</option>`).join('')}</select></label><label>Minimum item level<input name="minItemLevel" type="number" min="1" step="1" value="${f.minItemLevel}" required></label></div><label class="essence-filter-label">Minimum essence grade<select name="minEssenceGrade">${[...ITEM_GRADES,'Ignore all'].map((g,i)=>`<option value="${i}" ${f.minEssenceGrade===i?'selected':''}>${g}${i<8?' and above':''}</option>`).join('')}</select><small>Lower essences are ignored when recovered from salvage. Existing essences are kept.</small></label><fieldset><legend>Equipment types</legend><div class="filter-checks">${GEAR_SLOTS.map(slot=>[slot,GEAR[slot].label]).map(([id,label])=>`<label><input type="checkbox" name="slots" value="${id}" ${checked(f.slots.includes(id))}>${label}</label>`).join('')}</div></fieldset><fieldset><legend>Weapon types</legend><div class="filter-checks">${Object.entries(WEAPON_TYPES).map(([id,w])=>`<label><input type="checkbox" name="weaponTypes" value="${id}" ${checked(f.weaponTypes.includes(id))}>${w.label}</label>`).join('')}</div></fieldset><details ${f.affixes.length?'open':''}><summary>Desired modifiers · match any selected</summary><p class="small-description">Leave all unselected to accept any modifiers.</p><div class="filter-affixes">${Object.entries(AFFIXES).map(([id,a])=>`<label><input type="checkbox" name="affixes" value="${id}" ${checked(f.affixes.includes(id))}><span>${a.name}<small>${a.label.replace(/^% /,'')}</small></span></label>`).join('')}</div></details><label class="filter-unique"><input type="checkbox" name="alwaysShowUnique" ${checked(f.alwaysShowUnique)}>Always show unique items (bypass filter rules)</label><p class="filter-preview" id="filter-preview" role="status">${previewText(s,f)}</p><p class="small-description">Keystones always appear and go into their separate pouch. Rules apply to new equipment drops; equipment already in your inventory is kept. A full satchel also salvages incoming equipment for gold and essence chances.</p><div class="filter-footer"><button class="button" type="button" data-action="close">Cancel</button><button class="button gold-button" type="submit">Apply loot filter</button></div></form>`;
}

function previewText(s,f) {
  const sample=[...s.inventory,...Object.values(s.equipment),...(s.groundLoot||[]).map(d=>d.item)].filter(Boolean);
  const count=sample.filter(item=>matchesLootFilter(item,f)).length;
  return `Preview: ${count} of ${sample.length} current items match. Non-matching drops are salvaged for gold and essence chances.`;
}
export function updateFilterPreview(s,form) {
  const preview=document.getElementById('filter-preview');
  if(preview)preview.textContent=previewText(s,filterFromForm(form));
}
