import {drawHero,drawMonster} from './actors.js';
import {distance,walkable} from './world.js';
import {ENEMY_TIERS,MODIFIERS} from './monsters.js';
import {combatStats,regionIndex,skillRange} from './engine.js';
import {matchesLootFilter} from './loot-filter.js';
export {drawHero} from './actors.js';

const CELL=26;
const PALETTES=[
  {floor:'#777f53',wall:'#16392e',tree:'#2e5946',tip:'#5e8060',stone:'#66765d'},
  {floor:'#9aadb0',wall:'#243d49',tree:'#4a727c',tip:'#b0c5c4',stone:'#748f98'},
  {floor:'#987856',wall:'#392e25',tree:'#654b36',tip:'#9b8051',stone:'#88725d'},
  {floor:'#77718a',wall:'#282e3e',tree:'#3d4a63',tip:'#7c83a3',stone:'#6e7086'}
];
const noise=(x,y,seed)=>{let n=Math.imul(x+71,374761393)^Math.imul(y+91,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
function polygon(c,points,color){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();}

export function drawMinimap(canvas,s,large=false){
  if(!canvas)return;
  const c=canvas.getContext('2d'),map=s.map,w=canvas.width,h=canvas.height;
  const tile=Math.min((w-16)/map.width,(h-16)/map.height),left=(w-map.width*tile)/2,top=(h-map.height*tile)/2;
  c.clearRect(0,0,w,h);c.fillStyle='#0d1c19';c.fillRect(0,0,w,h);
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=y*map.width+x;if(!map.tiles[i])continue;
    c.fillStyle=map.seen[i]?'#66856d':'#293c32';c.fillRect(left+x*tile,top+y*tile,tile+.2,tile+.2);
  }
  const dot=(p,color,r=2)=>circle(c,left+p.x*tile,top+p.y*tile,r,color);
  for(const e of s.enemies){if(e.hp>0&&(map.seen[Math.floor(e.y)*map.width+Math.floor(e.x)]||e.boss))dot(e,e.boss&&!map.bossUnlocked?'#6d6250':ENEMY_TIERS[e.tier].color,e.boss?(large?6:3):large?3:1.3);}
  dot(map.entrance,'#a9c7a5',large?4:2);
  if(!map.shrine.used)dot(map.shrine,'#82dcb4',large?4:2);
  if(!map.chest.opened)dot(map.chest,'#d8c189',large?4:2);
  dot(s.player,'#fff2bd',large?6:3);
  c.strokeStyle='#fff2bdbb';c.lineWidth=1;c.beginPath();c.arc(left+s.player.x*tile,top+s.player.y*tile,large?10:6,0,Math.PI*2);c.stroke();
}

export class Battlefield{
  constructor(canvas,getState,onMove,onLoot){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.getState=getState;this.onMove=onMove;
    this.time=0;this.last=0;this.floats=[];this.effects=[];this.swing=0;this.hitTimes=new Map();this.camera={x:0,y:0};this.lootHitboxes=[];
    this.texture=new Image();this.texture.onload=()=>{this.terrainSeed=null;};this.texture.src='/assets/mistwood.png';
    canvas.addEventListener('pointerdown',event=>{
      const r=canvas.getBoundingClientRect(),s=getState();
      const screenX=event.clientX-r.left,screenY=event.clientY-r.top;
      const loot=this.lootHitboxes.find(b=>screenX>=b.x&&screenX<=b.x+b.w&&screenY>=b.y&&screenY<=b.y+b.h);
      if(loot){onLoot?.(loot.id);return;}
      const x=(event.clientX-r.left+this.camera.x)/CELL,y=(event.clientY-r.top+this.camera.y)/CELL;
      const clicked=s.enemies.filter(e=>e.hp>0&&(!e.boss||s.map.bossUnlocked)).find(e=>distance(e,{x,y:y+.8})<1.5);
      const destination=clicked||{x:Math.floor(x)+.5,y:Math.floor(y)+.5};
      onMove?.(destination.x,destination.y,clicked?.id||null);
    });
    canvas.tabIndex=0;
    canvas.addEventListener('keydown',event=>{
      const directions={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
      if(directions[event.key]){event.preventDefault();const p=getState().player,[dx,dy]=directions[event.key];onMove?.(Math.floor(p.x)+dx+.5,Math.floor(p.y)+dy+.5);}
    });
    this.resize=new ResizeObserver(()=>this.size());this.resize.observe(canvas);this.size();
    this.frame=requestAnimationFrame(t=>this.draw(t));
  }
  size(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=r.width*dpr;this.canvas.height=r.height*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);}

  buildTerrain(s){
    const map=s.map,p=PALETTES[regionIndex(s)];
    const terrain=document.createElement('canvas');terrain.width=map.width*CELL;terrain.height=map.height*CELL;
    const c=terrain.getContext('2d');c.fillStyle=p.wall;c.fillRect(0,0,terrain.width,terrain.height);
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      const n=noise(x,y,map.seed),px=x*CELL,py=y*CELL;
      if(walkable(map,x,y)){
        c.fillStyle=p.floor;c.fillRect(px,py,CELL+1,CELL+1);
        if(this.texture.complete&&this.texture.naturalWidth){c.globalAlpha=.45;c.drawImage(this.texture,450+n*380,390+noise(y,x,map.seed)*220,54,54,px,py,CELL+1,CELL+1);c.globalAlpha=1;}
        c.fillStyle=n>.5?'#e2dca210':'#0a231513';c.fillRect(px,py,CELL+1,CELL+1);
        if(n>.72){c.fillStyle='#b9b18b44';c.beginPath();c.ellipse(px+8,py+13,5,3,n,0,Math.PI*2);c.fill();}
        if(n<.18){c.strokeStyle=p.tip;c.lineWidth=1;c.beginPath();c.moveTo(px+4,py+20);c.lineTo(px+3,py+15);c.moveTo(px+6,py+20);c.lineTo(px+8,py+16);c.stroke();}
        if(!walkable(map,x,y-1)){c.fillStyle='#0c271b2b';c.fillRect(px,py,CELL,5);}
      }else{
        c.fillStyle=n>.6?'#051a171d':'#95b09706';c.fillRect(px,py,CELL,CELL);
      }
    }
    // Tile-bound scenery marks impassable terrain in the generated collision map.
    for(let y=1;y<map.height-1;y++)for(let x=1;x<map.width-1;x++){
      if(walkable(map,x,y))continue;
      const n=noise(x,y,map.seed),px=(x+.5)*CELL,py=(y+.6)*CELL;
      if(n>.88){polygon(c,[[px-11,py],[px-12,py-9],[px-3,py-16],[px+10,py-11],[px+12,py-2],[px+4,py+3]],p.stone);polygon(c,[[px-11,py-9],[px-3,py-16],[px+10,py-11],[px+1,py-7]],'#cad1b733');}
      else if(n>.28){
        const size=.65+n*.4;
        c.save();c.translate(px,py);c.scale(size,size);c.fillStyle='#0b211966';c.beginPath();c.ellipse(3,4,17,7,0,0,Math.PI*2);c.fill();c.fillStyle='#544f35';c.fillRect(-2,-11,4,18);
        polygon(c,[[-18,0],[0,-36],[19,0],[11,2],[-7,2]],p.tree);
        polygon(c,[[-15,-11],[0,-43],[15,-11],[5,-8]],p.tip);
        polygon(c,[[0,-43],[15,-11],[5,-8],[0,-14]],p.tree);
        polygon(c,[[-10,-25],[0,-49],[10,-25],[0,-23]],p.tip);
        c.restore();
      }
    }
    this.terrain=terrain;this.terrainSeed=map.seed;
  }

  event(e){
    const p=this.getState().player,x=e.x??p.x,y=e.y??p.y;
    if(e.type==='hit'){this.floats.push({text:`${e.critical?'✦ ':''}${e.value}`,x,y:y-1.9,life:1,color:e.critical?'#fff0a1':'#f2e6bf'});this.swing=.65;this.hitTimes.set(`${x.toFixed(1)},${y.toFixed(1)}`,this.time);}
    if(e.type==='hurt')this.floats.push({text:`${e.critical?'CRIT ':''}−${e.value}`,x,y:y-2,life:.9,color:e.critical?'#ffd2a3':'#efaa94'});
    if(e.type==='kill')this.floats.push({text:`+${e.gold} gold`,x,y:y-1,life:1.4,color:'#eacb81'});
    if(e.type==='heal')this.floats.push({text:'Restored',x,y:y-2,life:1.5,color:'#a1e0b2'});
    if(['skill','explosion','enemyAttack'].includes(e.type))this.effects.push({...e,life:e.type==='enemyAttack'?.25:.6,total:.6});
  }

  draw(timestamp){
    const dt=Math.min(.05,(timestamp-(this.last||timestamp))/1000);this.last=timestamp;this.time+=dt;
    const s=this.getState(),c=this.ctx,w=this.w,h=this.h,map=s.map;
    if(w<1||h<1){this.frame=requestAnimationFrame(t=>this.draw(t));return;}
    if(!this.terrain||this.terrainSeed!==map.seed){this.buildTerrain(s);this.camera.x=s.player.x*CELL-w/2;this.camera.y=s.player.y*CELL-h*.56;this.floats=[];}
    const desired={x:Math.max(0,Math.min(map.width*CELL-w,s.player.x*CELL-w/2)),y:Math.max(0,Math.min(map.height*CELL-h,s.player.y*CELL-h*.58))};
    this.camera.x+=(desired.x-this.camera.x)*Math.min(1,dt*8);this.camera.y+=(desired.y-this.camera.y)*Math.min(1,dt*8);
    const motion=s.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.clearRect(0,0,w,h);c.fillStyle='#10251d';c.fillRect(0,0,w,h);
    c.save();c.translate(-this.camera.x,-this.camera.y);c.drawImage(this.terrain,0,0);
    const reach=combatStats(s).attackRange*CELL;
    c.beginPath();c.arc(s.player.x*CELL,s.player.y*CELL,reach,0,Math.PI*2);c.strokeStyle='#f0d49732';c.lineWidth=1;c.setLineDash([3,7]);c.stroke();c.setLineDash([]);
    this.landmark(c,map.entrance,'camp',false);
    this.landmark(c,map.shrine,'shrine',map.shrine.used);
    this.landmark(c,map.chest,'chest',map.chest.opened);
    const boss=s.enemies.find(e=>e.boss);this.landmark(c,boss,'portal',!map.bossUnlocked);
    if(s.player.path.length){c.strokeStyle=s.player.manual?'#f3d89199':'#cbd2a84d';c.setLineDash([3,6]);c.lineWidth=2;c.beginPath();c.moveTo(s.player.x*CELL,s.player.y*CELL);s.player.path.slice(0,20).forEach(p=>c.lineTo(p.x*CELL,p.y*CELL));c.stroke();c.setLineDash([]);}
    for(const e of s.enemies){
      if(e.hp<=0||e.boss&&!map.bossUnlocked||distance(e,s.player)>12)continue;
      for(const mod of e.modifiers){const a=MODIFIERS[mod];if(a.kind!=='aura')continue;
        const radius=(a.radius||4)*CELL;c.beginPath();c.arc(e.x*CELL,e.y*CELL,radius,0,Math.PI*2);c.fillStyle=a.color+'14';c.fill();c.strokeStyle=a.color+'88';c.lineWidth=1.4;c.setLineDash([7,8]);c.lineDashOffset=motion?-this.time*8:0;c.stroke();c.setLineDash([]);
      }
    }
    for(const hazard of s.hazards){
      const x=hazard.x*CELL,y=hazard.y*CELL,r=hazard.radius*CELL;
      circle(c,x,y,r,'#d86a4733');circle(c,x,y,r*(1-hazard.remaining/hazard.total),'#f6a66d42');
      c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle='#f5a275';c.lineWidth=2;c.stroke();
      c.font='bold 12px system-ui';c.textAlign='center';c.fillStyle='#ffdec2';c.fillText(hazard.kind==='slam'?'MOVE!':'VOLATILE',x,y-4);
    }
    const actors=s.enemies.filter(e=>e.hp>0&&(!e.boss||map.bossUnlocked)&&distance(e,s.player)<12).map(e=>({...e,actor:'enemy'}));
    actors.push({...s.player,actor:'hero'});actors.sort((a,b)=>a.y-b.y);
    for(const actor of actors){
      if(actor.actor==='hero'){
        const px=actor.x*CELL,py=actor.y*CELL;
        c.strokeStyle='#edce87';c.lineWidth=1.3;c.beginPath();c.ellipse(px,py+3,16,8,0,0,Math.PI*2);c.stroke();
        drawHero(c,px,py,.73,motion?this.time:0,this.swing);
        c.font='500 11px system-ui';c.textAlign='center';c.fillStyle='#fcf1d2';c.shadowColor='#11271b';c.shadowBlur=4;c.fillText(s.name,px,py-58);c.shadowBlur=0;
      }else{
        const color=ENEMY_TIERS[actor.tier].color,px=actor.x*CELL,py=actor.y*CELL,selected=actor.id===s.enemy?.id;
        if(selected){c.strokeStyle=color;c.lineWidth=1.2;c.beginPath();c.ellipse(px,py+2,18,8,0,0,Math.PI*2);c.stroke();}
        c.save();c.translate(px,py);c.scale(.68,.68);drawMonster(c,0,0,actor.kind,motion?this.time:0,0,actor.boss);c.restore();
        c.fillStyle='#13271ddd';c.beginPath();c.roundRect(px-18,py+10,36,4,2);c.fill();c.fillStyle=color;c.fillRect(px-18,py+10,36*actor.hp/actor.maxHp,4);
        if(actor.tier!=='normal'||selected){c.font='600 10px system-ui';c.textAlign='center';c.fillStyle=color;c.shadowBlur=4;c.shadowColor='#0a2017';c.fillText(actor.boss?'UNIQUE GUARDIAN':actor.tier.toUpperCase(),px,py-(actor.boss?84:45));c.shadowBlur=0;}
      }
    }
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      if(!map.seen[y*map.width+x]){c.fillStyle='#071a15e6';c.fillRect(x*CELL,y*CELL,CELL+1,CELL+1);}
      else if(distance({x:x+.5,y:y+.5},s.player)>9){c.fillStyle='#10221a38';c.fillRect(x*CELL,y*CELL,CELL+1,CELL+1);}
    }
    this.effects=this.effects.filter(e=>e.life>0);
    for(const e of this.effects){e.life-=dt;c.globalAlpha=Math.max(0,e.life/e.total);
      if(e.type==='enemyAttack'){c.strokeStyle='#d9b68c';c.lineWidth=2;c.beginPath();c.moveTo(e.x*CELL,e.y*CELL-15);c.lineTo(e.targetX*CELL,e.targetY*CELL-20);c.stroke();}
      else{c.strokeStyle=e.id==='mend'?'#a9e2aa':e.id==='storm'?'#b6d9f5':e.type==='explosion'?'#f49c71':'#ffe0a2';c.lineWidth=3;c.beginPath();c.arc(e.x*CELL,e.y*CELL,(1-e.life/e.total)*CELL*(e.id==='cleave'||e.id==='storm'?skillRange(s,e.id):3),0,Math.PI*2);c.stroke();}
      c.globalAlpha=1;
    }
    this.floats=this.floats.filter(f=>f.life>0).slice(-25);
    for(const f of this.floats){f.life-=dt;f.y-=dt*.65;c.globalAlpha=Math.min(1,Math.max(0,f.life*2));c.font='bold 15px Georgia';c.textAlign='center';c.fillStyle=f.color;c.shadowColor='#13291e';c.shadowBlur=4;c.fillText(f.text,f.x*CELL,f.y*CELL);c.shadowBlur=0;c.globalAlpha=1;}
    this.drawGroundLoot(c,s);
    c.restore();this.swing=Math.max(0,this.swing-dt*3);
    this.frame=requestAnimationFrame(t=>this.draw(t));
  }

  drawGroundLoot(c,s){
    this.lootHitboxes=[];
    const colors=['#c1c9b6','#7fb9ed','#e4c570','#e4a16b'];
    const shown=(s.groundLoot||[]).filter(d=>matchesLootFilter(d.item,s.lootFilter)&&s.map.seen[Math.floor(d.y)*s.map.width+Math.floor(d.x)]);
    const labels=[];
    for(const drop of shown){
      const px=drop.x*CELL,py=drop.y*CELL,color=colors[drop.item.rarity];
      if(px<this.camera.x-100||px>this.camera.x+this.w+100||py<this.camera.y-60||py>this.camera.y+this.h+60)continue;
      c.save();c.globalAlpha=.8;
      if(drop.item.rarity>=2){const beam=c.createLinearGradient(px,py-60,px,py);beam.addColorStop(0,color+'00');beam.addColorStop(1,color+'75');c.fillStyle=beam;c.fillRect(px-5,py-60,10,60);}
      polygon(c,[[px,py-8],[px+6,py-2],[px,py+4],[px-6,py-2]],color);c.restore();
      c.font='600 12px system-ui';c.textAlign='center';
      const name=drop.item.name.length>27?drop.item.name.slice(0,26)+'…':drop.item.name;
      const w=Math.min(215,c.measureText(name).width+20),h=30;
      let x=px-w/2,y=py+9;
      x=Math.max(this.camera.x+6,Math.min(this.camera.x+this.w-w-6,x));
      while(labels.some(b=>x<b.x+b.w&&x+w>b.x&&y<b.y+b.h&&y+h>b.y))y+=h+3;
      labels.push({x,y,w,h});
      c.fillStyle='#0b201cf2';c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.roundRect(x,y,w,h,4);c.fill();c.stroke();
      c.fillStyle=color;c.fillText(name,x+w/2,y+19);
      this.lootHitboxes.push({id:drop.id,x:x-this.camera.x,y:y-this.camera.y,w,h});
    }
  }

  landmark(c,p,kind,used){
    if(!p)return;const x=p.x*CELL,y=p.y*CELL;
    c.save();c.globalAlpha=used?.4:1;
    if(kind==='portal'){
      c.strokeStyle=used?'#b2aa7355':'#e4a76faa';c.lineWidth=2;c.beginPath();c.ellipse(x,y,36,19,0,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(x,y,29,14,0,0,Math.PI*2);c.stroke();
      if(used){c.font='11px system-ui';c.textAlign='center';c.fillStyle='#c4ba94';c.fillText('SEALED SANCTUM',x,y-12);}
    }else if(kind==='shrine'){
      circle(c,x,y-10,25,'#7ecaa117');polygon(c,[[x-11,y+1],[x-8,y-25],[x,y-35],[x+8,y-25],[x+11,y+1]],'#849683');
      c.strokeStyle='#bee5bc';c.lineWidth=2;c.beginPath();c.moveTo(x,y-26);c.lineTo(x,y-10);c.moveTo(x-5,y-19);c.lineTo(x+5,y-19);c.stroke();
    }else if(kind==='chest'){
      c.fillStyle='#514532';c.fillRect(x-10,y-12,20,15);c.strokeStyle='#c8ac6f';c.lineWidth=2;c.strokeRect(x-10,y-12,20,15);c.fillStyle='#dec384';c.fillRect(x-2,y-9,4,8);
    }else{
      circle(c,x,y,24,'#d3a56418');polygon(c,[[x-13,y+3],[x+10,y-5],[x+13,y-1],[x-9,y+7]],'#6d4e32');polygon(c,[[x-10,y-4],[x+12,y+2],[x+9,y+7],[x-13,y+1]],'#83613c');polygon(c,[[x-8,y],[x-4,y-13],[x+1,y-21],[x+3,y-9],[x+8,y-3],[x+4,y+2]],'#d99652');polygon(c,[[x-4,y],[x,y-13],[x+3,y]],'#f4d494');
    }
    c.restore();
  }
}
