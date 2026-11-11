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

const RARITY_COLORS=['#c1c9b6','#7fb9ed','#e4c570','#e4a16b'];
const compact=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e4?Math.round(n/1e3)+'k':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);

export class Battlefield{
  constructor(canvas,getState,onMove,onLoot){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.getState=getState;this.onMove=onMove;
    this.time=0;this.last=0;this.floats=[];this.effects=[];this.particles=[];this.swing=0;this.facing=1;this.shake=0;this.hitTimes=new Map();this.camera={x:0,y:0};this.lootHitboxes=[];
    this.insets={top:0,right:0,bottom:0,left:0};this.zoom=1;this.dpr=1;
    this.reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
    canvas.addEventListener('pointerdown',event=>{
      const r=canvas.getBoundingClientRect(),s=getState();
      const screenX=event.clientX-r.left,screenY=event.clientY-r.top;
      const loot=this.lootHitboxes.find(b=>screenX>=b.x&&screenX<=b.x+b.w&&screenY>=b.y&&screenY<=b.y+b.h);
      if(loot){onLoot?.(loot.id);return;}
      const x=(screenX/this.zoom+this.camera.x)/CELL,y=(screenY/this.zoom+this.camera.y)/CELL;
      const clicked=s.enemies.filter(e=>e.hp>0&&(!e.boss||s.map.bossUnlocked)).sort((a,b)=>distance(a,{x,y:y+.6})-distance(b,{x,y:y+.6})).find(e=>distance(e,{x,y:y+.6})<1.4);
      const destination=clicked||{x:Math.floor(x)+.5,y:Math.floor(y)+.5};
      this.effects.push({type:'ring',x:destination.x,y:destination.y,radius:.8,color:clicked?'#ff9d85':'#f3d891',life:.35,total:.35});
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
  size(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);
    // Phones get a closer view; short landscape screens stay readable.
    this.zoom=Math.min(r.width,r.height)<500?1.25:Math.min(r.width,r.height)<800?1.4:1.6;}

  buildTerrain(s){
    const map=s.map,p=PALETTES[s.location==='rift'?3:regionIndex(s)];
    const terrain=document.createElement('canvas');terrain.width=map.width*CELL;terrain.height=map.height*CELL;
    const c=terrain.getContext('2d');c.fillStyle=p.wall;c.fillRect(0,0,terrain.width,terrain.height);
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      const n=noise(x,y,map.seed),px=x*CELL,py=y*CELL;
      if(walkable(map,x,y)){
        // Soft, low-frequency shading instead of per-tile contrast keeps the ground calm behind the action.
        let smooth=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)smooth+=noise((x+dx)>>1,(y+dy)>>1,map.seed);smooth/=9;
        c.fillStyle=p.floor;c.fillRect(px,py,CELL+1,CELL+1);
        c.fillStyle=smooth>.5?`rgba(255,250,220,${(smooth-.5)*.22})`:`rgba(5,20,14,${(.5-smooth)*.3})`;c.fillRect(px,py,CELL+1,CELL+1);
        if(n>.8){c.fillStyle='#b9b18b33';c.beginPath();c.ellipse(px+8+n*6,py+13,4,2.5,n,0,Math.PI*2);c.fill();}
        if(n<.16){c.strokeStyle=p.tip+'aa';c.lineWidth=1;c.beginPath();c.moveTo(px+4,py+20);c.lineTo(px+3,py+15);c.moveTo(px+6,py+20);c.lineTo(px+8,py+16);c.stroke();}
        c.fillStyle='#07180f40';
        if(!walkable(map,x,y-1))c.fillRect(px,py,CELL,6);
        if(!walkable(map,x-1,y))c.fillRect(px,py,3,CELL);
        if(!walkable(map,x+1,y))c.fillRect(px+CELL-3,py,3,CELL);
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
    this.terrain=terrain;this.terrainSeed=map.seed+map.topology;this.bg=p.wall;
  }

  event(e){
    const s=this.getState(),p=s.player,x=e.x??p.x,y=e.y??p.y;
    const float=(text,fx,fy,color,life=1,size=15)=>this.floats.push({text,x:fx+(Math.random()-.5)*.7,y:fy,life,color,size});
    if(e.type==='hit'){
      float(`${e.critical?'✦':''}${compact(e.value)}`,x,y-1.7,e.critical?'#fff0a1':e.skill?'#ffd9a8':'#f2e6bf',e.critical?1.1:.8,e.critical?17:e.splash?11:13);
      this.hitTimes.set(e.x.toFixed(1)+','+e.y.toFixed(1),this.time);
      if(e.critical)this.shake=Math.max(this.shake,.12);
    }
    if(e.type==='swing'){this.swing=.65;this.facing=e.targetX<e.x?-1:1;this.effects.push({type:'arc',x:e.x,y:e.y,angle:Math.atan2(e.targetY-e.y,e.targetX-e.x),life:.18,total:.18});}
    if(e.type==='hurt')float(`−${compact(e.value)}`,x,y-2,e.critical?'#ffb49a':'#ef8f7c',.9,e.critical?16:13);
    if(e.type==='absorb')float(`(${compact(e.value)})`,x,y-2.2,'#b9c4d6',.8,12);
    if(e.type==='kill'){
      float(`+${compact(e.gold)}`,x,y-.8,'#eacb81',1.1,12);
      const color=ENEMY_TIERS[e.tier]?.color||'#c1c9b6',count=e.boss?26:e.tier==='normal'?6:12;
      for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=1.5+Math.random()*(e.boss?6:3.5);this.particles.push({x,y:y-.6,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1.5,life:.5+Math.random()*.4,color:i%3?color:'#fff3cf',size:e.boss?4:3});}
      if(e.boss)this.shake=.45;
    }
    if(e.type==='heal'||e.type==='potion'){float(e.type==='potion'?'Potion':'Healed',x,y-2.3,'#a1e0b2',1.2,13);this.effects.push({type:'ring',x,y,radius:1.6,color:e.type==='potion'?'#ef8f7c':'#a9e2aa',life:.5,total:.5});}
    if(e.type==='level'){this.effects.push({type:'ring',x:p.x,y:p.y,radius:4,color:'#ffe9a8',life:.9,total:.9});}
    if(e.type==='skill'){
      this.effects.push({...e,type:'skill',life:.55,total:.55});
      if(e.id==='leap'&&e.fromX!=null)this.effects.push({type:'trail',x:e.fromX,y:e.fromY,toX:e.x,toY:e.y,color:e.color,life:.3,total:.3});
      if(e.id==='leap'||e.id==='meteor')this.shake=Math.max(this.shake,.15);
      this.swing=.65;
    }
    if(e.type==='whirl')this.effects.push({type:'spin',x,y,radius:e.radius,life:.25,total:.25});
    if(e.type==='explosion'){this.effects.push({type:'blast',x,y,radius:e.radius||2.6,friendly:e.friendly,life:.5,total:.5});this.shake=Math.max(this.shake,.3);}
    if(e.type==='enemyAttack')this.effects.push({...e,life:.2,total:.2});
    if(e.type==='drop'&&e.item.rarity>=2)this.effects.push({type:'ring',x,y,radius:1.2,color:RARITY_COLORS[e.item.rarity],life:.7,total:.7});
  }

  draw(timestamp){
    const dt=Math.min(.05,(timestamp-(this.last||timestamp))/1000);this.last=timestamp;this.time+=dt;
    const s=this.getState(),c=this.ctx,z=this.zoom,w=this.w/z,h=this.h/z,map=s.map;
    this.frame=requestAnimationFrame(t=>this.draw(t));
    if(this.w<1||this.h<1||!map)return;
    const fresh=!this.terrain||this.terrainSeed!==map.seed+map.topology;
    if(fresh){this.buildTerrain(s);this.floats=[];this.effects=[];this.particles=[];}
    // Keep the hero centered in the part of the screen not covered by HUD or an open panel.
    const i=this.insets,vx0=i.left/z,vx1=w-i.right/z,vy0=i.top/z,vy1=h-i.bottom/z,mw=map.width*CELL,mh=map.height*CELL;
    const desired={
      x:mw<vx1-vx0?(mw-(vx0+vx1))/2:s.player.x*CELL-(vx0+vx1)/2,
      y:mh<vy1-vy0?(mh-(vy0+vy1))/2:s.player.y*CELL-(vy0+(vy1-vy0)*.54)
    };
    const ease=fresh?1:Math.min(1,dt*7);
    this.camera.x+=(desired.x-this.camera.x)*ease;this.camera.y+=(desired.y-this.camera.y)*ease;
    const motion=s.settings.motion&&!this.reduced.matches;
    this.shake=Math.max(0,this.shake-dt);
    const sx=motion&&this.shake>0?(Math.random()-.5)*this.shake*22:0,sy=motion&&this.shake>0?(Math.random()-.5)*this.shake*22:0;
    c.setTransform(this.dpr*z,0,0,this.dpr*z,0,0);
    c.fillStyle=this.bg||'#0a1512';c.fillRect(0,0,w,h);
    c.save();c.translate(-this.camera.x+sx,-this.camera.y+sy);c.drawImage(this.terrain,0,0);
    const ps=combatStats(s),px0=s.player.x*CELL,py0=s.player.y*CELL;
    if(s.location!=='rift'){this.landmark(c,map.entrance,'camp',false);this.landmark(c,map.shrine,'shrine',map.shrine.used);this.landmark(c,map.chest,'chest',map.chest.opened);}
    const boss=s.enemies.find(e=>e.boss);this.landmark(c,boss,'portal',!map.bossUnlocked);
    if(s.player.path.length&&s.player.manual){c.strokeStyle='#f3d89199';c.setLineDash([3,6]);c.lineWidth=2;c.beginPath();c.moveTo(px0,py0);s.player.path.slice(0,20).forEach(p=>c.lineTo(p.x*CELL,p.y*CELL));c.stroke();c.setLineDash([]);}
    for(const e of s.enemies){
      if(e.hp<=0||e.boss&&!map.bossUnlocked||distance(e,s.player)>14)continue;
      for(const mod of e.modifiers){const a=MODIFIERS[mod];if(a.kind!=='aura')continue;
        const radius=(a.radius||4)*CELL;c.beginPath();c.arc(e.x*CELL,e.y*CELL,radius,0,Math.PI*2);c.fillStyle=a.color+'14';c.fill();c.strokeStyle=a.color+'88';c.lineWidth=1.4;c.setLineDash([7,8]);c.lineDashOffset=motion?-this.time*8:0;c.stroke();c.setLineDash([]);
      }
    }
    for(const hazard of s.hazards){
      const x=hazard.x*CELL,y=hazard.y*CELL,r=hazard.radius*CELL,k=1-hazard.remaining/hazard.total;
      if(hazard.kind==='burn'){circle(c,x,y,r,'#f0803a2e');c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle='#f49c7188';c.lineWidth=1.5;c.setLineDash([4,6]);c.stroke();c.setLineDash([]);continue;}
      if(hazard.friendly){
        circle(c,x,y,r,'#f49c7122');c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle='#f6b98a99';c.lineWidth=1.5;c.stroke();
        const fall=(1-k)*240;c.strokeStyle='#ffd9a8';c.lineWidth=5;c.beginPath();c.moveTo(x+fall*.45,y-fall);c.lineTo(x+fall*.45+14,y-fall-34);c.stroke();circle(c,x+fall*.45,y-fall,7,'#ffb36b');
        continue;
      }
      circle(c,x,y,r,'#d8473333');circle(c,x,y,r*k,'#f66d5a55');
      c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle='#ff8a70';c.lineWidth=2;c.stroke();
      c.font='800 11px system-ui';c.textAlign='center';c.fillStyle='#ffdec2';c.fillText(hazard.kind==='slam'?'SLAM':'VOLATILE',x,y-4);
    }
    const fx=s.effects||{};
    if(fx.whirl>0){c.save();c.translate(px0,py0-10);c.rotate(this.time*14);c.strokeStyle='#f1e2b8cc';c.lineWidth=3;for(let k=0;k<3;k++){c.beginPath();c.arc(0,0,2.2*CELL,k*2.09,k*2.09+1.1);c.stroke();}c.restore();}
    if(fx.warcry>0){c.beginPath();c.ellipse(px0,py0+3,24+Math.sin(this.time*8)*3,11,0,0,Math.PI*2);c.strokeStyle='#f0b86f';c.lineWidth=2;c.stroke();}
    const actors=s.enemies.filter(e=>e.hp>0&&(!e.boss||map.bossUnlocked)&&Math.abs(e.x-s.player.x)*CELL<w&&Math.abs(e.y-s.player.y)*CELL<h).map(e=>({e,y:e.y}));
    actors.push({hero:true,y:s.player.y});actors.sort((a,b)=>a.y-b.y);
    for(const actor of actors){
      if(actor.hero){
        c.strokeStyle='#edce87';c.lineWidth=1.3;c.beginPath();c.ellipse(px0,py0+3,16,8,0,0,Math.PI*2);c.stroke();
        c.save();c.translate(px0,py0);c.scale(this.facing,1);drawHero(c,0,0,.73,motion?this.time:0,this.swing);c.restore();
        if(fx.ward>0){c.beginPath();c.ellipse(px0,py0-20,24,32,0,0,Math.PI*2);c.fillStyle='#b9c4d622';c.fill();c.strokeStyle='#d5deeeaa';c.lineWidth=1.5;c.stroke();}
        if(fx.chill>0){c.beginPath();c.ellipse(px0,py0+3,19,9,0,0,Math.PI*2);c.strokeStyle='#9fd8ef';c.lineWidth=2;c.stroke();}
      }else{
        const e=actor.e,color=ENEMY_TIERS[e.tier].color,px=e.x*CELL,py=e.y*CELL,selected=e.id===s.enemy?.id;
        if(!map.seen[Math.floor(e.y)*map.width+Math.floor(e.x)])continue;
        if(selected){c.strokeStyle='#ff9d85';c.lineWidth=1.6;c.beginPath();c.ellipse(px,py+2,18,8,0,0,Math.PI*2);c.stroke();}
        else if(e.tier!=='normal'){c.strokeStyle=color+'aa';c.lineWidth=1.2;c.beginPath();c.ellipse(px,py+2,17,7,0,0,Math.PI*2);c.stroke();}
        const hit=this.time-(this.hitTimes.get(e.x.toFixed(1)+','+e.y.toFixed(1))??-9);
        const size=e.boss?.68:e.tier==='rare'?.8:e.tier==='magic'?.68:.6;
        c.save();c.translate(px,py);c.scale(size*(e.x>s.player.x?1:-1),size);if(e.stunned>0)c.globalAlpha=.6;drawMonster(c,0,0,e.kind,motion?this.time+e.x:0,hit<.15?.15-hit:0,e.boss);c.restore();
        if(e.chilled>0||e.shocked>0||e.stunned>0){c.beginPath();c.arc(px,py-(e.boss?70:38),3.5,0,Math.PI*2);c.fillStyle=e.stunned>0?'#ffe9a8':e.shocked>0?'#b6d9f5':'#9fd8ef';c.fill();}
        if(e.hp<e.maxHp||selected||e.tier!=='normal'){const bw=e.boss?54:e.tier==='normal'?26:34;c.fillStyle='#0b1512dd';c.fillRect(px-bw/2-1,py+9,bw+2,5);c.fillStyle=e.tier==='normal'?'#d9584a':color;c.fillRect(px-bw/2,py+10,bw*e.hp/e.maxHp,3);}
      }
    }
    // Fog of war
    const tx0=Math.max(0,Math.floor(this.camera.x/CELL)-1),tx1=Math.min(map.width,Math.ceil((this.camera.x+w)/CELL)+1),ty0=Math.max(0,Math.floor(this.camera.y/CELL)-1),ty1=Math.min(map.height,Math.ceil((this.camera.y+h)/CELL)+1);
    c.fillStyle='#06120fee';
    for(let y=ty0;y<ty1;y++)for(let x=tx0;x<tx1;x++)if(!map.seen[y*map.width+x])c.fillRect(x*CELL,y*CELL,CELL+1,CELL+1);
    this.effects=this.effects.filter(e=>e.life>0);
    for(const e of this.effects){
      e.life-=dt;const k=1-Math.max(0,e.life)/e.total,x=e.x*CELL,y=e.y*CELL;c.globalAlpha=Math.max(0,1-k);
      if(e.type==='enemyAttack'){c.strokeStyle='#e58b78';c.lineWidth=2;c.beginPath();c.moveTo(x,y-15);c.lineTo(e.targetX*CELL,e.targetY*CELL-20);c.stroke();}
      else if(e.type==='arc'){c.strokeStyle='#fff3cf';c.lineWidth=4;c.beginPath();c.arc(x,y-12,ps.attackRange*CELL*.8,e.angle-1+k*.6,e.angle+.2+k*.9);c.stroke();}
      else if(e.type==='ring'){c.strokeStyle=e.color;c.lineWidth=2.5;c.beginPath();c.arc(x,y,k*e.radius*CELL,0,Math.PI*2);c.stroke();}
      else if(e.type==='spin'){c.strokeStyle='#f1e2b8';c.lineWidth=2;c.beginPath();c.arc(x,y,e.radius*CELL*(.7+k*.3),0,Math.PI*2);c.stroke();}
      else if(e.type==='trail'){c.strokeStyle=e.color;c.lineWidth=8*(1-k);c.beginPath();c.moveTo(x,y-14);c.quadraticCurveTo((x+e.toX*CELL)/2,Math.min(y,e.toY*CELL)-70,e.toX*CELL,e.toY*CELL-14);c.stroke();}
      else if(e.type==='blast'){circle(c,x,y,e.radius*CELL*(.4+k*.6),e.friendly?'#ffb36b77':'#f4735a77');c.strokeStyle=e.friendly?'#ffe0a2':'#ff9d85';c.lineWidth=3;c.beginPath();c.arc(x,y,e.radius*CELL*(.4+k*.6),0,Math.PI*2);c.stroke();}
      else if(e.type==='skill'){
        const r=(e.radius||3)*CELL;c.strokeStyle=e.color||'#ffe0a2';c.fillStyle=(e.color||'#ffe0a2')+'22';
        if(e.id==='storm'){c.lineWidth=2;for(const t of s.enemies){if(distance(t,e)>e.radius)continue;c.beginPath();c.moveTo(x,y-22);const mx=(x+t.x*CELL)/2+Math.sin(t.x*9+this.time*40)*10,my=(y+t.y*CELL)/2-22+Math.cos(t.y*7+this.time*40)*10;c.lineTo(mx,my);c.lineTo(t.x*CELL,t.y*CELL-12);c.stroke();}c.lineWidth=1.5;c.beginPath();c.arc(x,y,r*k,0,Math.PI*2);c.stroke();}
        else if(e.id==='cleave'||e.id==='leap'){c.beginPath();c.arc(x,y,r*(.35+k*.65),0,Math.PI*2);c.fill();c.lineWidth=4;c.stroke();}
        else if(e.id==='meteor'){c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();c.setLineDash([]);}
        else{c.lineWidth=3;c.beginPath();c.arc(x,y,k*3*CELL,0,Math.PI*2);c.stroke();}
      }
      c.globalAlpha=1;
    }
    this.particles=this.particles.filter(p=>p.life>0).slice(-140);
    for(const p of this.particles){p.life-=dt;p.vy+=9*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;c.globalAlpha=Math.min(1,p.life*2.5);c.fillStyle=p.color;c.fillRect(p.x*CELL,p.y*CELL,p.size,p.size);}
    c.globalAlpha=1;
    this.drawGroundLoot(c,s,w);
    this.floats=this.floats.filter(f=>f.life>0).slice(-44);
    c.textAlign='center';c.lineJoin='round';
    for(const f of this.floats){f.life-=dt;f.y-=dt*1.1;c.globalAlpha=Math.min(1,Math.max(0,f.life*2.5));c.font=`800 ${f.size}px system-ui,sans-serif`;c.lineWidth=3;c.strokeStyle='#0b1512';c.strokeText(f.text,f.x*CELL,f.y*CELL);c.fillStyle=f.color;c.fillText(f.text,f.x*CELL,f.y*CELL);}
    c.globalAlpha=1;c.restore();this.swing=Math.max(0,this.swing-dt*3.4);
    if(this.hitTimes.size>200)this.hitTimes.clear();
  }

  drawGroundLoot(c,s,w){
    this.lootHitboxes=[];
    const shown=(s.groundLoot||[]).filter(d=>matchesLootFilter(d.item,s.lootFilter)&&s.map.seen[Math.floor(d.y)*s.map.width+Math.floor(d.x)]);
    const labels=[],z=this.zoom;
    for(const drop of shown){
      const px=drop.x*CELL,py=drop.y*CELL,color=RARITY_COLORS[drop.item.rarity];
      if(px<this.camera.x-100||px>this.camera.x+w+100||py<this.camera.y-60||py>this.camera.y+this.h/z+60)continue;
      c.save();c.globalAlpha=.85;
      if(drop.item.rarity>=2){const beam=c.createLinearGradient(px,py-70,px,py);beam.addColorStop(0,color+'00');beam.addColorStop(1,color+'88');c.fillStyle=beam;c.fillRect(px-4,py-70,8,70);}
      polygon(c,[[px,py-8],[px+6,py-2],[px,py+4],[px-6,py-2]],color);c.restore();
      if(drop.item.rarity<1&&drop.item.kind!=='keystone')continue; // normal items stay as unlabeled pips
      c.font='700 10.5px system-ui,sans-serif';c.textAlign='center';
      const name=drop.item.name.length>24?drop.item.name.slice(0,23)+'…':drop.item.name;
      const lw=Math.min(170,c.measureText(name).width+14),lh=20;
      let x=px-lw/2,y=py+7;
      x=Math.max(this.camera.x+4,Math.min(this.camera.x+w-lw-4,x));
      let guard=0;while(guard++<8&&labels.some(b=>x<b.x+b.w&&x+lw>b.x&&y<b.y+b.h&&y+lh>b.y))y+=lh+2;
      labels.push({x,y,w:lw,h:lh});
      c.fillStyle='#0a1512e6';c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.roundRect(x,y,lw,lh,4);c.fill();c.stroke();
      c.fillStyle=color;c.fillText(name,x+lw/2,y+14);
      this.lootHitboxes.push({id:drop.id,x:(x-this.camera.x)*z-4,y:(y-this.camera.y)*z-6,w:lw*z+8,h:lh*z+12});
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
