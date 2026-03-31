// Firebase Realtime Database sync for 3 Jars Academy
// Included by all game pages to keep scores in sync across devices

(function() {
  // Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyCm8kUoUg-rSeZoHPgzH1GFIia83DfxtZs",
    authDomain: "jars-academy.firebaseapp.com",
    projectId: "jars-academy",
    storageBucket: "jars-academy.firebasestorage.app",
    messagingSenderId: "829512604965",
    appId: "1:829512604965:web:130bffdfafa3fa8668cecc",
    databaseURL: "https://jars-academy-default-rtdb.firebaseio.com"
  };

  // Load Firebase SDK from CDN (compat version for simple usage)
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  let db = null;
  let firebaseReady = false;

  async function initFirebase() {
    try {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js');
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.database();
      firebaseReady = true;
      console.log('[3Jars] Firebase connected');
    } catch (e) {
      console.warn('[3Jars] Firebase init failed, using localStorage only:', e);
    }
  }

  // Sanitize email for use as Firebase key (Firebase doesn't allow . $ # [ ] /)
  function sanitizeKey(email) {
    return (email || 'default').replace(/[.#$\[\]\/]/g, '_');
  }

  // ---- Sync functions exposed globally ----

  // Write scores to Firebase
  window.firebaseSaveScores = function(accountId, scores) {
    if (!firebaseReady || !db) return;
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/scores').set(scores).catch(function(e) {
      console.warn('[3Jars] Firebase save scores failed:', e);
    });
  };

  // Write stats to Firebase
  window.firebaseSaveStats = function(accountId, stats) {
    if (!firebaseReady || !db) return;
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/stats').set(stats).catch(function(e) {
      console.warn('[3Jars] Firebase save stats failed:', e);
    });
  };

  // Write config (jar amounts) to Firebase
  window.firebaseSaveConfig = function(accountId, config) {
    if (!firebaseReady || !db) return;
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/config').set(config).catch(function(e) {
      console.warn('[3Jars] Firebase save config failed:', e);
    });
  };

  // Write account data (players, jars, etc.) to Firebase
  window.firebaseSaveAccountData = function(accountId, data) {
    if (!firebaseReady || !db) return;
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/accountData').set(data).catch(function(e) {
      console.warn('[3Jars] Firebase save account data failed:', e);
    });
  };

  // Fetch scores from Firebase and merge with local (take higher value per player)
  window.firebaseSyncScores = function(accountId, localScores, callback) {
    if (!firebaseReady || !db) { if (callback) callback(localScores); return; }
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/scores').once('value').then(function(snapshot) {
      const remote = snapshot.val() || {};
      const merged = { ...localScores };
      // Merge: take the higher score for each player
      for (const player in remote) {
        if (!merged[player] || remote[player] > merged[player]) {
          merged[player] = remote[player];
        }
      }
      // Also push any local-only players back to remote
      let needsUpdate = false;
      for (const player in merged) {
        if (!remote[player] || merged[player] > remote[player]) {
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        db.ref('accounts/' + key + '/scores').set(merged);
      }
      if (callback) callback(merged);
    }).catch(function(e) {
      console.warn('[3Jars] Firebase sync scores failed:', e);
      if (callback) callback(localScores);
    });
  };

  // Fetch account data from Firebase and merge with local
  window.firebaseSyncAccountData = function(accountId, localData, callback) {
    if (!firebaseReady || !db) { if (callback) callback(localData); return; }
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/accountData').once('value').then(function(snapshot) {
      const remote = snapshot.val();
      if (!remote) {
        // No remote data yet — push local to Firebase
        if (localData && Object.keys(localData).length > 0) {
          db.ref('accounts/' + key + '/accountData').set(localData);
        }
        if (callback) callback(localData);
      } else {
        // Merge: combine player lists, take newer jar values
        const merged = { ...localData, ...remote };
        // Merge player lists
        const localPlayers = (localData && localData.players) || [];
        const remotePlayers = remote.players || [];
        const allPlayers = [...new Set([...localPlayers, ...remotePlayers])];
        merged.players = allPlayers;
        // Merge jars — take higher values
        if (remote.jars || (localData && localData.jars)) {
          const localJars = (localData && localData.jars) || {};
          const remoteJars = remote.jars || {};
          merged.jars = {};
          const allJarPlayers = new Set([...Object.keys(localJars), ...Object.keys(remoteJars)]);
          for (const p of allJarPlayers) {
            const lj = localJars[p] || {};
            const rj = remoteJars[p] || {};
            merged.jars[p] = {
              experience: Math.max(lj.experience || 0, rj.experience || 0),
              investing: Math.max(lj.investing || 0, rj.investing || 0),
              giveback: Math.max(lj.giveback || 0, rj.giveback || 0)
            };
          }
        }
        db.ref('accounts/' + key + '/accountData').set(merged);
        if (callback) callback(merged);
      }
    }).catch(function(e) {
      console.warn('[3Jars] Firebase sync account data failed:', e);
      if (callback) callback(localData);
    });
  };

  // Sync config from Firebase
  window.firebaseSyncConfig = function(accountId, localConfig, callback) {
    if (!firebaseReady || !db) { if (callback) callback(localConfig); return; }
    const key = sanitizeKey(accountId);
    db.ref('accounts/' + key + '/config').once('value').then(function(snapshot) {
      const remote = snapshot.val();
      if (!remote) {
        // No remote config — push local
        if (localConfig) db.ref('accounts/' + key + '/config').set(localConfig);
        if (callback) callback(localConfig);
      } else {
        if (callback) callback(remote);
      }
    }).catch(function(e) {
      console.warn('[3Jars] Firebase sync config failed:', e);
      if (callback) callback(localConfig);
    });
  };

  // Initialize on load
  initFirebase();
})();
