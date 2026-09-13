import {REGIONS,journey} from './engine.js';
import {icon} from './icons.js';

export function worldMapPanel(s,cycle=journey(s)-1){
  cycle=Math.max(0,Math.min(Math.floor((s.maxStage-1)/20),Math.floor(cycle)||0));
  const first=cycle*20+1,last=first+19;
  return `<p class="dialog-description">The journey has no final stage. Every 20 stages returns you to the four regions at a higher level. Each guardian unlocks the next stage; your hero and gear carry forward.</p><div class="journey-navigation"><button class="button" data-map-cycle="${cycle-1}" ${cycle===0?'disabled':''} aria-label="Previous journey">Previous</button><div><strong>Journey ${cycle+1}</strong><span>Stages ${first}–${last}</span></div><button class="button" data-map-cycle="${cycle+1}" ${s.maxStage<=last?'disabled':''} aria-label="Next journey">Next</button></div><div class="world-map">${REGIONS.map((r,index)=>{
    const start=cycle*20+r.start,unlocked=s.maxStage>=start;
    return `<section class="region-card ${unlocked?'':'region-locked'}" style="--region-color:${r.color}"><div class="region-art region-art-${index}"><span>${icon(unlocked?'compass':'lock')}</span><div><small>JOURNEY ${cycle+1} · REGION ${index+1}</small><h3>${r.name}</h3><p>${r.subtitle}</p></div></div><div class="stage-buttons">${Array.from({length:5},(_,i)=>start+i).map(stage=>`<button data-travel="${stage}" class="${s.stage===stage?'current-stage':''}" ${stage>s.maxStage?'disabled':''} aria-label="Travel to stage ${stage}">${stage>s.maxStage?icon('lock'):stage}${s.stage===stage?'<i></i>':''}</button>`).join('')}</div>${unlocked?'':`<p class="region-requirement">Unlocks at stage ${start}</p>`}</section>`;
  }).join('')}</div><form id="stage-travel-form" class="stage-travel-form"><label for="travel-stage">Travel to an unlocked stage <small>Highest stage: ${s.maxStage}</small></label><div><input id="travel-stage" name="stage" type="number" min="1" max="${s.maxStage}" step="1" value="${s.stage}" required><button class="button gold-button" type="submit">Travel</button></div></form>`;
}
