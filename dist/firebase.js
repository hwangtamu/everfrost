import {SaveConflict,validatePayload} from './cloud-saves.js';

// Firebase web configuration. The API key is a browser identifier, not a
// secret — access is enforced by Firestore security rules.
const CONFIG = {
  apiKey: 'AIzaSyCmJgbdumdXsC4bdDRDyyuTntioPjA95K8',
  authDomain: 'everfrost-830cb.firebaseapp.com',
  projectId: 'everfrost-830cb',
  appId: '1:113490996547:web:9091650e78c4aea5afd3f6'
};
const SDK = '12.6.0';
const sdk = name => import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-${name}.js`);

// Loads the Firebase SDK on demand and returns account services. Rejects when
// the SDK or project is unreachable; callers stay in guest mode.
export async function connectAccount() {
  const [appModule, authModule, storeModule] = await Promise.all([sdk('app'), sdk('auth'), sdk('firestore')]);
  const app = appModule.initializeApp(CONFIG);
  const auth = authModule.getAuth(app);
  const db = storeModule.getFirestore(app);
  const saveRef = uid => storeModule.doc(db, 'players', uid);

  const remote = {
    async read(uid) {
      const snap = await storeModule.getDoc(saveRef(uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      if (!d || d.version !== 1 || typeof d.payload !== 'string') return null;
      return {version: 1, revision: d.revision, payload: d.payload};
    },
    async write(uid, revision, payload) {
      validatePayload(payload);
      return storeModule.runTransaction(db, async tx => {
        const ref = saveRef(uid), snap = await tx.get(ref);
        const current = snap.exists() ? snap.data() : null;
        const currentRevision = Number.isSafeInteger(current?.revision) ? current.revision : 0;
        if (currentRevision !== revision) throw new SaveConflict(current && {version: 1, revision: currentRevision, payload: current.payload});
        const next = revision + 1;
        tx.set(ref, {version: 1, revision: next, payload, updatedAt: storeModule.serverTimestamp()});
        return next;
      });
    }
  };

  const provider = new authModule.GoogleAuthProvider();
  return {
    remote,
    user: () => auth.currentUser,
    onUser: callback => authModule.onAuthStateChanged(auth, callback),
    async signIn() {
      try { await authModule.signInWithPopup(auth, provider); }
      catch (error) {
        if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
          await authModule.signInWithRedirect(auth, provider);
        } else if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') throw error;
      }
    },
    signOut: () => authModule.signOut(auth)
  };
}
