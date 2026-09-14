import {loadGame,SAVE_KEY} from './engine.js';

// Account save protocol. Each account has one document: {version, revision,
// payload}. `revision` is a monotonically increasing server-side counter that
// makes cross-device writes detectable instead of silently lost.
export const ACCOUNT_PREFIX = 'everfrost.cloud.';
export const accountKey = uid => ACCOUNT_PREFIX + uid;
export const MAX_PAYLOAD = 500000;

export class SaveConflict extends Error {
  constructor(remote) { super('Save conflict'); this.remote = remote; }
}

export function validatePayload(payload) {
  if (typeof payload !== 'string' || payload.length < 10 || payload.length > MAX_PAYLOAD) throw Error('Bad payload size');
  const d = JSON.parse(payload);
  if (!d || ![1,2,3,4,5,6].includes(d.version) || !Number.isInteger(d.level) || d.level < 1 || !Number.isInteger(d.stage) || d.stage < 1
    || !Array.isArray(d.inventory) || !d.equipment || typeof d.equipment !== 'object' || !d.talents) throw Error('Bad payload');
  return payload;
}

export function restorePayload(payload, now = Date.now()) {
  return loadGame({getItem: () => validatePayload(payload), setItem: () => {}}, now);
}

const readRecord = value => {
  try {
    const r = JSON.parse(value);
    if (!r || r.version !== 1 || !Number.isSafeInteger(r.revision) || r.revision < 0 || typeof r.payload !== 'string') return null;
    return {version: 1, revision: r.revision, payload: r.payload, dirty: r.dirty === true};
  } catch { return null; }
};

export class CloudSaves {
  constructor({storage = globalThis.localStorage, remote, onChange} = {}) {
    this.storage = storage; this.remote = remote; this.onChange = onChange || (() => {});
    this.uid = null; this.record = null; this.status = 'guest';
    this.localSaved = false; this.session = 0; this.queue = Promise.resolve();
  }

  setStatus(status) { this.status = status; this.onChange(this); }

  cache(uid = this.uid) {
    if (!uid) return null;
    try { return readRecord(this.storage.getItem(accountKey(uid))); } catch { return null; }
  }

  // Writes only the account-scoped cache; the guest SAVE_KEY is left alone so
  // it remains a genuine guest backup after sign-out.
  cacheWrite(record) {
    try { this.storage.setItem(accountKey(this.uid), JSON.stringify(record)); } catch {}
  }

  // Local write. Guests write the shared guest key; connected accounts update
  // their own cached record instead, so account progress never leaks into the
  // guest save. Returns whether a durable local copy exists.
  save(payload) {
    if (this.uid) {
      if (!this.record || this.status === 'unavailable' || this.status === 'conflict') return false;
      this.record = {...this.record, payload, dirty: true};
      try { this.storage.setItem(accountKey(this.uid), JSON.stringify(this.record)); this.localSaved = true; }
      catch { this.localSaved = false; }
      return this.localSaved;
    }
    try { this.storage.setItem(SAVE_KEY, payload); this.localSaved = true; }
    catch { this.localSaved = false; }
    return this.localSaved;
  }

  async connect(uid) {
    const session = ++this.session;
    this.uid = uid; this.record = null;
    if (!uid) { this.setStatus('guest'); return; }
    let remote = null, failed = false;
    try { remote = await this.remote.read(uid); } catch { failed = true; }
    if (session !== this.session || this.uid !== uid) return;
    const cached = this.cache(uid);
    if (failed) {
      if (cached) { this.record = cached; this.setStatus('offline'); }
      else this.setStatus('unavailable');
      return;
    }
    if (remote) {
      if (!Number.isSafeInteger(remote.revision) || remote.revision < 0) { this.setStatus('unavailable'); return; }
      try { validatePayload(remote.payload); } catch { this.setStatus('unavailable'); return; }
      // Unflushed local work always conflicts, regardless of revision order.
      const dirty = cached?.dirty && cached.payload !== remote.payload;
      this.record = dirty ? cached : {version: 1, revision: remote.revision, payload: remote.payload, dirty: false};
      this.remoteConflict = dirty ? remote : null;
      this.setStatus(dirty ? 'conflict' : 'synced');
    } else if (cached) {
      this.record = cached;
      this.setStatus(cached.dirty ? 'offline' : 'synced');
    } else this.setStatus('choice');
  }

  // Attach a save payload to the connected account. Refused when the account
  // state is unknown (unavailable) or awaiting a player decision.
  start(payload) {
    if (!this.uid) throw Error('No account');
    if (this.status === 'unavailable' || this.status === 'conflict') throw Error('Account save is blocked');
    if (this.record && this.status === 'synced') return false;
    this.record = {version: 1, revision: this.record?.revision ?? 0, payload: validatePayload(payload), dirty: true};
    this.cacheWrite(this.record);
    this.setStatus('syncing');
    return true;
  }

  flush() {
    // While an upload is in flight, newer saves stay dirty; the next flush
    // (periodic, or on visibility change) uploads them.
    if (this.busy) return this.queue;
    this.busy = true;
    this.queue = this.upload().finally(() => { this.busy = false; });
    return this.queue;
  }

  async upload() {
    if (!this.uid || !this.record?.dirty) return;
    const {uid, record} = this, session = this.session;
    try {
      const revision = await this.remote.write(uid, record.revision, record.payload);
      if (session !== this.session || this.uid !== uid) return;
      if (this.record === record) this.record = {...record, revision, dirty: false};
      else { this.record = {...this.record, revision: Math.max(this.record.revision, revision)}; }
      this.cacheWrite(this.record);
      this.setStatus(this.record.dirty ? 'syncing' : 'synced');
    } catch (error) {
      if (session !== this.session || this.uid !== uid) return;
      if (error instanceof SaveConflict) { this.remoteConflict = error.remote; this.setStatus('conflict'); }
      else this.setStatus('offline');
    }
  }

  async resolve(choice) {
    if (this.status !== 'conflict' || !this.uid) return false;
    if (choice === 'cloud') {
      let remote = this.remoteConflict;
      try { remote = await this.remote.read(this.uid) || remote; } catch { this.setStatus('offline'); return false; }
      if (!remote) { this.record = null; this.setStatus('choice'); return true; }
      this.record = {version: 1, revision: remote.revision, payload: remote.payload, dirty: false};
      this.cacheWrite(this.record); this.remoteConflict = null; this.setStatus('synced'); return true;
    }
    // 'local': re-check the remote revision before overwriting it.
    let remote = this.remoteConflict;
    try { remote = await this.remote.read(this.uid); } catch { this.setStatus('offline'); return false; }
    if (remote && this.remoteConflict && remote.revision !== this.remoteConflict.revision) {
      this.remoteConflict = remote; this.setStatus('conflict'); return false;
    }
    try {
      const revision = await this.remote.write(this.uid, remote?.revision ?? this.record.revision, this.record.payload);
      this.record = {...this.record, revision, dirty: false};
      this.cacheWrite(this.record); this.remoteConflict = null; this.setStatus('synced'); return true;
    } catch (error) {
      if (error instanceof SaveConflict) { this.remoteConflict = error.remote; this.setStatus('conflict'); return false; }
      this.setStatus('offline'); return false;
    }
  }
}
