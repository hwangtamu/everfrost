export const MAP_WIDTH = 46;
export const MAP_HEIGHT = 34;

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function walkable(map, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  return x >= 0 && y >= 0 && x < map.width && y < map.height && map.tiles[y * map.width + x] === 1;
}

// Sample the complete segment, including both endpoints, to keep ranged strikes
// and monster awareness from reaching across the walls between trail sections.
export function hasLineOfSight(map, from, to) {
  const steps = Math.max(1, Math.ceil(distance(from, to) * 5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkable(map, from.x + (to.x-from.x)*t, from.y + (to.y-from.y)*t)) return false;
  }
  return true;
}

export function findPath(map, from, to) {
  const start = Math.floor(from.y) * map.width + Math.floor(from.x);
  const end = Math.floor(to.y) * map.width + Math.floor(to.x);
  if (!walkable(map, from.x, from.y) || !walkable(map, to.x, to.y)) return [];
  if (start === end) return [];
  const previous = new Int32Array(map.tiles.length).fill(-1);
  const queue = [start]; previous[start] = start;
  for (let i = 0; i < queue.length && previous[end] < 0; i++) {
    const at = queue[i], x = at % map.width, y = Math.floor(at / map.width);
    for (const [nx, ny] of [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]) {
      const next = ny * map.width + nx;
      if (walkable(map, nx, ny) && previous[next] < 0) {
        previous[next] = at; queue.push(next);
      }
    }
  }
  if (previous[end] < 0) return [];
  const path = [];
  for (let at = end; at !== start; at = previous[at]) path.push({x: at % map.width + .5, y: Math.floor(at / map.width) + .5});
  return path.reverse();
}

export function moveAlong(actor, dt, speed) {
  let budget = dt * speed;
  while (actor.path?.length && budget > 0) {
    const next = actor.path[0], d = distance(actor, next);
    if (d <= budget) { actor.x = next.x; actor.y = next.y; actor.path.shift(); budget -= d; }
    else { actor.x += (next.x - actor.x) / d * budget; actor.y += (next.y - actor.y) / d * budget; break; }
  }
}

export function reveal(map, position, radius = 7) {
  for (let y = Math.max(0, Math.floor(position.y - radius)); y < Math.min(map.height, position.y + radius); y++) {
    for (let x = Math.max(0, Math.floor(position.x - radius)); x < Math.min(map.width, position.x + radius); x++) {
      if (Math.hypot(x + .5 - position.x, y + .5 - position.y) <= radius) map.seen[y * map.width + x] = 1;
    }
  }
}

// All Hamiltonian walks on the 3×3 clearing grid; every chosen graph is a path.
const LINEAR_ROUTES=[];
function routeWalk(path){
 if(path.length===9){LINEAR_ROUTES.push(path);return;}
 const last=path.at(-1),x=last%3,y=Math.floor(last/3);
 for(const next of [last-1,last+1,last-3,last+3])if(next>=0&&next<9&&!path.includes(next)&&Math.abs(next%3-x)+Math.abs(Math.floor(next/3)-y)===1)routeWalk([...path,next]);
}
for(let start=0;start<9;start++)routeWalk([start]);
export const MAP_THEMES={grove:{name:'Ancient Grove',floor:'#75845b'},ruins:{name:'Broken Causeway',floor:'#8b8a7b'},marsh:{name:'Reedwater Trail',floor:'#657c67'},ridge:{name:'Windworn Ridge',floor:'#9a886d'}};

export function generateMap(seed, stage = 1) {
  seed = seed >>> 0;
  const rng = seededRandom(seed), int = n => Math.floor(rng() * n);
  const width = MAP_WIDTH, height = MAP_HEIGHT, tiles = Array(width * height).fill(0);
  const rooms = [], edges = [];
  const theme=Object.keys(MAP_THEMES)[int(4)],trailWidth=int(2);
  function carve(x, y, radius = 0) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (x + dx > 0 && x + dx < width - 1 && y + dy > 0 && y + dy < height - 1) tiles[(y + dy) * width + x + dx] = 1;
    }
  }
  // Separated clearings keep neighboring stretches of the trail from touching.
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = 7 + col * 15 + int(3), y = 5 + row * 11 + int(3);
    const rx = 3 + int(2), ry = 2 + int(2);
    const shape=['oval','cross','terrace','diamond'][int(4)];
    const room = {id: rooms.length, x: x + .5, y: y + .5, rx, ry, shape, role: 'encounter'};
    rooms.push(room);
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const core=Math.abs(dx)<=1&&Math.abs(dy)<=2;
      const inShape=shape==='oval'?(dx*dx/(rx*rx)+dy*dy/(ry*ry)<=1.15):shape==='cross'?(Math.abs(dx)<=1||Math.abs(dy)<=1):shape==='diamond'?(Math.abs(dx)/rx+Math.abs(dy)/ry<=1.25):!(Math.abs(dx)===rx&&Math.abs(dy)===ry);
      if(core||inShape)carve(x+dx,y+dy);
    }
  }
  function connect(a, b) {
    edges.push([a.id, b.id]);
    let x = Math.floor(a.x), y = Math.floor(a.y);
    const endX = Math.floor(b.x), endY = Math.floor(b.y);
    const horizontal = target => { while (x !== target) { carve(x, y, trailWidth); x += Math.sign(target - x); } carve(x, y, trailWidth); };
    const vertical = target => { while (y !== target) { carve(x, y, trailWidth); y += Math.sign(target - y); } carve(x, y, trailWidth); };
    // Put bends between rooms, so corridors cannot join around a clearing's edge.
    if (Math.abs(endX-x) > Math.abs(endY-y)) {
      horizontal(Math.floor((x+endX)/2)+int(3)-1); vertical(endY); horizontal(endX);
    } else {
      vertical(Math.floor((y+endY)/2)); horizontal(endX); vertical(endY);
    }
  }
  const route=[...LINEAR_ROUTES[int(LINEAR_ROUTES.length)]];
  route.forEach((id, order) => { rooms[id].order = order; });
  for (let i = 1; i < route.length; i++) connect(rooms[route[i-1]], rooms[route[i]]);
  const map = {seed, stage, theme, trailWidth, topology:'linear', route, width, height, tiles, rooms, edges, seen: Array(width * height).fill(0), progress: 0, goal: 0, completed: false, bossUnlocked: false};
  const entrance = rooms[route[0]], boss = rooms[route.at(-1)];
  entrance.role = 'entrance'; map.entrance = {x:entrance.x, y:entrance.y};
  boss.role = 'boss'; map.bossRoomId = boss.id;
  rooms[route[3 + int(3)]].role = 'shrine';
  const shrineRoom = rooms.find(r => r.role === 'shrine');
  map.shrine = {x: shrineRoom.x, y: shrineRoom.y, used: false};
  map.chest = {x: shrineRoom.x + 2, y: shrineRoom.y, opened: false};
  const adjectives = ['Whispering', 'Forgotten', 'Twisting', 'Shrouded', 'Wandering', 'Ancient'];
  map.name = `${adjectives[int(adjectives.length)]} ${MAP_THEMES[theme].name}`;
  reveal(map, map.entrance);
  return map;
}
