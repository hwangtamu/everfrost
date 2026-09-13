// Small, animated canvas actors rendered independently from the painted environment.
function poly(c,points,fill,stroke='#1c292b'){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
function ellipse(c,x,y,rx,ry,fill){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();}
export function drawHero(c,x,y,scale=1,time=0,swing=0){
 c.save();c.translate(x,y);c.scale(scale,scale);ellipse(c,0,4,20,7,'#10232155');
 const bob=Math.sin(time*3)*1.4;c.translate(0,bob);
 poly(c,[[-9,-42],[-19,-7],[4,-11],[12,-43]],'#364e49');
 poly(c,[[-10,-12],[-12,3],[-3,4],[-1,-12]],'#332f2b');poly(c,[[2,-12],[3,3],[12,4],[10,-12]],'#423b31');
 poly(c,[[-13,-38],[-12,-13],[12,-13],[13,-38],[5,-44],[-5,-44]],'#637b78');
 poly(c,[[-9,-37],[-7,-18],[8,-18],[10,-37]],'#a8b0a0');
 poly(c,[[-15,-40],[-19,-29],[-7,-30],[-5,-40]],'#bcc1aa');poly(c,[[8,-40],[7,-29],[19,-29],[15,-39]],'#949e8e');
 poly(c,[[-12,-21],[12,-21],[12,-16],[-12,-16]],'#574538');poly(c,[[-2,-21],[3,-21],[3,-16],[-2,-16]],'#d9ba73');
 ellipse(c,0,-49,10,11,'#d9b690');
 poly(c,[[-11,-48],[-10,-58],[0,-63],[10,-57],[11,-48],[5,-52],[-7,-51]],'#a5b3ad');
 poly(c,[[-3,-62],[1,-64],[3,-48],[-1,-48]],'#dee2cc');
 c.fillStyle='#343a38';c.fillRect(4,-48,2.5,2);
 poly(c,[[-7,-42],[-3,-36],[7,-38],[8,-43]],'#c8a977');
 // Shield and sword have visible movement during attacks.
 poly(c,[[-23,-31],[-13,-35],[-4,-30],[-7,-14],[-15,-9],[-23,-16]],'#566e67');
 poly(c,[[-21,-29],[-13,-32],[-7,-28],[-9,-17],[-15,-13],[-20,-18]],'#91a09a');
 c.strokeStyle='#d2b775';c.lineWidth=2;c.beginPath();c.moveTo(-14,-29);c.lineTo(-14,-16);c.moveTo(-20,-24);c.lineTo(-8,-24);c.stroke();
 c.save();c.translate(16,-26);c.rotate(-.3+swing*1.8);poly(c,[[-2,-5],[0,-37],[4,-43],[5,-7]],'#e6ead5');poly(c,[[0,-35],[4,-40],[3,-7],[1,-7]],'#98ada7',null);c.fillStyle='#d5b573';c.fillRect(-6,-8,15,4);c.fillStyle='#664735';c.fillRect(0,-4,4,12);c.restore();c.restore();
}
function drawMonster(c,x,y,kind,t,hit,boss){
 c.save();c.translate(x,y);let scale=boss?1.35:1;c.scale(scale,scale);ellipse(c,0,5,27,8,'#10232155');c.translate(Math.sin(t*2)*2,Math.sin(t*3)*1.5);if(hit>0)c.translate(Math.sin(hit*30)*4,0);
 if(kind==='guardian'){
  poly(c,[[-18,3],[-15,-33],[-28,-48],[-16,-57],[-7,-40],[8,-42],[20,-59],[29,-49],[18,-30],[22,3],[9,4],[3,-19],[-3,-18],[-7,4]],'#596c53');
  poly(c,[[-18,-40],[-13,-65],[0,-72],[15,-61],[18,-39],[4,-27],[-6,-28]],'#819379');
  poly(c,[[-13,-62],[-21,-80],[-19,-90],[-15,-74],[-4,-66]],'#5d5142');poly(c,[[8,-67],[19,-84],[23,-89],[21,-74],[16,-62]],'#5d5142');
  c.shadowColor='#d9d582';c.shadowBlur=12;c.fillStyle='#f7dd87';c.fillRect(-9,-55,6,3);c.fillRect(5,-55,6,3);poly(c,[[0,-47],[-5,-39],[0,-34],[5,-40]],'#d8c686',null);
 } else if(kind==='sprite') {
  c.shadowColor='#b6ce93';c.shadowBlur=13;ellipse(c,-15,-30,10,18,'#c9d2a650');ellipse(c,15,-30,10,18,'#c9d2a650');
  poly(c,[[-12,-36],[0,-54],[13,-36],[7,-14],[0,-4],[-6,-16]],'#769469');poly(c,[[-12,-36],[-20,-47],[-4,-43],[0,-57],[6,-45],[19,-44],[13,-33]],'#a4b993');
  ellipse(c,-4,-32,2,3,'#fcdd9a');ellipse(c,5,-32,2,3,'#fcdd9a');
 } else {
  const boar=kind==='boar';const fur=boar?'#74604b':'#89938a';
  poly(c,[[8,-32],[29,-38],[34,-27],[25,-24]],fur);
  poly(c,[[-15,-22],[-13,2],[-6,3],[-3,-22]],'#4d584f');poly(c,[[12,-20],[14,2],[21,3],[21,-22]],'#566057');
  ellipse(c,4,-25,25,15,fur);poly(c,[[-20,-25],[-29,-36],[-21,-53],[-13,-44],[-5,-46],[0,-54],[6,-38],[0,-21],[-12,-17]],fur);
  poly(c,[[-21,-49],[-21,-37],[-15,-39]],'#4c5c51');poly(c,[[-1,-48],[-5,-37],[1,-38]],'#536354');
  poly(c,[[-23,-33],[-33,-26],[-29,-21],[-13,-23],[-9,-29]],'#bac0aa');ellipse(c,-30,-26,3,3,'#293a34');
  ellipse(c,-16,-34,2.2,2,'#f7d97c');if(boar)poly(c,[[-23,-23],[-28,-14],[-18,-21]],'#e7ddbb');
 }
 c.restore();
}
export class Battlefield {
 constructor(canvas,getState,onMove){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.getState=getState;this.time=0;this.floats=[];this.flash=0;this.swing=0;this.hero={x:.41,y:.62};this.target=null;this.last=0;
  canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();this.target={x:Math.max(.15,Math.min(.78,(e.clientX-r.left)/r.width)),y:Math.max(.3,Math.min(.82,(e.clientY-r.top)/r.height))};onMove?.();});
  this.resize=new ResizeObserver(()=>this.size());this.resize.observe(canvas);this.size();this.frame=requestAnimationFrame(t=>this.draw(t));
 }
 size(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=r.width*dpr;this.canvas.height=r.height*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);}
 event(e){if(e.type==='hit'){this.floats.push({text:`−${e.value}`,x:.6,y:.48,life:1,color:'#fff0b7'});this.swing=.55;this.flash=.22;}if(e.type==='hurt')this.floats.push({text:`−${e.value}`,x:this.hero.x,y:this.hero.y-.15,life:1,color:'#f9b5a5'});if(e.type==='kill')this.floats.push({text:`+${e.gold} gold`,x:.58,y:.55,life:1.6,color:'#f3d388'});if(e.type==='heal')this.floats.push({text:'Restored',x:this.hero.x,y:this.hero.y-.2,life:1.4,color:'#a6e4a6'});if(e.type==='skill')this.skill={id:e.id,life:.7};}
 draw(timestamp){
  const dt=Math.min(.05,(timestamp-(this.last||timestamp))/1000);this.last=timestamp;this.time+=dt;const s=this.getState(),c=this.ctx,w=this.w,h=this.h; c.clearRect(0,0,w,h);
  const motion=s.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target=this.target||{x:.41,y:.62};this.hero.x+=(target.x-this.hero.x)*Math.min(1,dt*3);this.hero.y+=(target.y-this.hero.y)*Math.min(1,dt*3);
  if(this.target&&Math.hypot(target.x-this.hero.x,target.y-this.hero.y)<.015){this.target=null;}
  // Ambient fireflies stay subtle and disappear with reduced motion.
  if(motion)for(let i=0;i<15;i++){const x=(Math.sin(i*17.3)+1)/2*w+Math.sin(this.time*.3+i)*8,y=(Math.cos(i*5.2)+1)/2*h+Math.cos(this.time*.4+i)*9;ellipse(c,x,y,1.3,1.3,`rgba(246,222,147,${.2+(Math.sin(this.time+i)+1)*.2})`);}
  const size=Math.min(1.25,Math.max(.8,w/650));
  if(s.enemy?.hp>0){drawMonster(c,w*.61,h*.59,s.enemy.kind,motion?this.time:0,this.flash,s.enemy.boss);c.fillStyle='#172922c9';c.beginPath();c.roundRect(w*.61-26,h*.59+15,52,4,2);c.fill();c.fillStyle='#cba482';c.fillRect(w*.61-26,h*.59+15,52*s.enemy.hp/s.enemy.maxHp,4);}
  c.strokeStyle='#e9cd86aa';c.lineWidth=1.3;c.beginPath();c.ellipse(w*this.hero.x,h*this.hero.y+5,25*size,10*size,0,0,Math.PI*2);c.stroke();
  drawHero(c,w*this.hero.x,h*this.hero.y,size,motion?this.time:0,this.swing);
  c.font='500 11px system-ui';c.textAlign='center';c.fillStyle='#f1efd9';c.shadowColor='#102421';c.shadowBlur=4;c.fillText(s.name,w*this.hero.x,h*this.hero.y-80*size);c.shadowBlur=0;
  if(this.skill?.life>0){this.skill.life-=dt;c.strokeStyle=this.skill.id==='mend'?'#b9e8b4':'#ffe7a9';c.globalAlpha=Math.max(0,this.skill.life);c.lineWidth=4;c.beginPath();c.ellipse(w*.52,h*.6,(.8-this.skill.life)*130,35,0,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
  this.floats=this.floats.filter(f=>f.life>0);for(const f of this.floats){f.life-=dt;f.y-=dt*.05;c.globalAlpha=Math.min(1,f.life*2);c.font='bold 19px Georgia';c.fillStyle=f.color;c.shadowColor='#1b2a23';c.shadowBlur=5;c.fillText(f.text,f.x*w,f.y*h);c.shadowBlur=0;c.globalAlpha=1;}
  this.swing=Math.max(0,this.swing-dt*3);this.flash=Math.max(0,this.flash-dt);this.frame=requestAnimationFrame(t=>this.draw(t));
 }
}
