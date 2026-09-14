import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,SAVE_KEY} from '../dist/engine.js';
import {CloudSaves,SaveConflict,validatePayload,restorePayload,accountKey} from '../dist/cloud-saves.js';

const payload=(gold=120)=>{const s=createGame(1000,42);s.auto=false;s.gold=gold;return JSON.stringify(s);};
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
function backend(){
 const saves=new Map();return {saves,async read(uid){return saves.get(uid)??null;},async write(uid,revision,body){const current=saves.get(uid)??null;if((current?.revision??0)!==revision)throw new SaveConflict(current);const next={version:1,revision:revision+1,payload:body};saves.set(uid,next);return next.revision;}};
}
const record=(body,revision=1,dirty=false)=>({version:1,revision,payload:body,dirty});

test('guest progress is never silently attached to an account',async()=>{
 const storage=memory(),remote=backend(),c=new CloudSaves({storage,remote});
 c.save(payload(500));assert.equal(storage.getItem(SAVE_KEY),payloadValue(storage.getItem(SAVE_KEY),500));
 await c.connect('alice');assert.equal(c.status,'choice');assert.equal(remote.saves.size,0);
 c.start(payload(500));await c.flush();assert.equal(remote.saves.get('alice').revision,1);
 await c.connect('bob');assert.equal(c.status,'choice');assert.equal(c.record,null);
 assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).gold,500);
 await c.connect(null);assert.equal(c.status,'guest');assert.equal(c.uid,null);
});
function payloadValue(body,gold){assert.equal(JSON.parse(body).gold,gold);return body;}

test('a returning account loads cloud progress instead of this browser guest',async()=>{
 const storage=memory(),remote=backend(),body=payload(900);storage.setItem(SAVE_KEY,payload(500));remote.saves.set('alice',record(body,3));
 const c=new CloudSaves({storage,remote});await c.connect('alice');assert.equal(c.record.payload,body);assert.equal(c.status,'synced');
 assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).gold,500);
});

test('local pending progress resumes offline and synchronizes on reconnect',async()=>{
 const storage=memory(),remote=backend(),c=new CloudSaves({storage,remote});await c.connect('alice');c.start(payload(200));await c.flush();
 const read=remote.read,write=remote.write;remote.read=remote.write=async()=>{throw Error('offline');};
 c.save(payload(400));await c.flush();assert.equal(c.status,'offline');assert(c.record.dirty);
 const copy=new CloudSaves({storage,remote});await copy.connect('alice');assert.equal(copy.status,'offline');assert.equal(JSON.parse(copy.record.payload).gold,400);
 remote.read=read;remote.write=write;await copy.flush();assert.equal(copy.status,'synced');assert.equal(JSON.parse(remote.saves.get('alice').payload).gold,400);
});

test('new accounts cannot overwrite an unknown cloud save while offline',async()=>{
 const storage=memory(),remote={read:async()=>{throw Error('offline');}},c=new CloudSaves({storage,remote});
 await c.connect('alice');assert.equal(c.status,'unavailable');assert.equal(c.record,null);assert.throws(()=>c.start(payload()));assert.equal(c.save(payload()),false);
});

test('two devices cannot silently overwrite each other and resolution checks the revision again',async()=>{
 const remote=backend(),a=new CloudSaves({storage:memory(),remote}),b=new CloudSaves({storage:memory(),remote});
 await a.connect('alice');a.start(payload(200));await a.flush();await b.connect('alice');
 a.save(payload(300));await a.flush();b.save(payload(400));await b.flush();assert.equal(b.status,'conflict');assert.equal(JSON.parse(remote.saves.get('alice').payload).gold,300);
 a.save(payload(500));await a.flush();await b.resolve('local');assert.equal(b.status,'conflict');assert.equal(JSON.parse(remote.saves.get('alice').payload).gold,500);
 await b.resolve('cloud');assert.equal(JSON.parse(b.record.payload).gold,500);assert(!b.record.dirty);
 b.save(payload(600));await b.flush();assert.equal(JSON.parse(remote.saves.get('alice').payload).gold,600);
});

test('dirty cached progress detects conflicts on reload',async()=>{
 const storage=memory(),remote=backend();storage.setItem(accountKey('alice'),JSON.stringify(record(payload(400),1,true)));remote.saves.set('alice',record(payload(500),2));
 const c=new CloudSaves({storage,remote});await c.connect('alice');assert.equal(c.status,'conflict');assert.equal(JSON.parse(c.record.payload).gold,400);
 await c.resolve('local');assert.equal(JSON.parse(remote.saves.get('alice').payload).gold,400);assert.equal(c.record.revision,3);
});

test('changes made during an upload remain dirty and uploads are serialized',async()=>{
 const remote=backend(),c=new CloudSaves({storage:memory(),remote});await c.connect('alice');c.start(payload(200));
 const write=remote.write;let release,calls=0;remote.write=async(...args)=>{calls++;await new Promise(r=>release=r);return write(...args);};
 const first=c.flush();c.save(payload(300));const second=c.flush();assert.equal(calls,1);release();await Promise.all([first,second]);assert(c.record.dirty);assert.equal(c.record.revision,1);
 remote.write=write;await c.flush();assert.equal(c.status,'synced');assert.equal(JSON.parse(remote.saves.get('alice').payload).gold,300);
});

test('late network results cannot load or save into a different account',async()=>{
 const remote=backend();let release;const read=remote.read;remote.read=uid=>uid==='alice'?new Promise(r=>release=r):read(uid);
 const c=new CloudSaves({storage:memory(),remote}),first=c.connect('alice');await c.connect('bob');release(record(payload(999)));await first;
 assert.equal(c.uid,'bob');assert.equal(c.status,'choice');assert.equal(c.record,null);
 remote.read=read;await c.connect('alice');c.start(payload(200));const write=remote.write;remote.write=async(...args)=>{await new Promise(r=>release=r);return write(...args);};
 const saving=c.flush();await c.connect('bob');release();await saving;assert.equal(c.uid,'bob');assert.equal(c.record,null);assert(!remote.saves.has('bob'));
});

test('corrupt or oversized saves cannot replace a working hero',async()=>{
 assert.throws(()=>validatePayload('{bad'));assert.throws(()=>validatePayload('{}'));assert.throws(()=>validatePayload('x'.repeat(500001)));
 const good=payload(333);assert.equal(restorePayload(good,1000).state.gold,333);
 const remote=backend();remote.saves.set('alice',record('{}'));const c=new CloudSaves({storage:memory(),remote});await c.connect('alice');assert.equal(c.status,'unavailable');assert.equal(c.record,null);
});

test('local storage failure never masquerades as a successful local save',async()=>{
 const storage={getItem:()=>null,setItem(){throw Error('quota');}},remote=backend(),c=new CloudSaves({storage,remote});
 assert.equal(c.save(payload()),false);assert.equal(c.localSaved,false);
 await c.connect('alice');c.start(payload(200));assert.equal(c.localSaved,false);await c.flush();assert.equal(c.status,'synced');assert.equal(c.localSaved,false);
});
