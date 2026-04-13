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
  let _readyResolve;
  const firebaseReadyPromise = new Promise(function(resolve) { _readyResolve = resolve; });

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
      _readyResolve(true);
    } catch (e) {
      console.warn('[3Jars] Firebase init failed, using localStorage only:', e);
      _readyResolve(false);
    }
  }

  // Helper: wait for Firebase to be ready (with timeout)
  function whenReady(fn) {
    if (firebaseReady && db) { fn(); return; }
    // Wait up to 5 seconds for init
    var timer = setTimeout(function() { console.warn('[3Jars] Firebase ready timeout'); }, 5000);
    firebaseReadyPromise.then(function(ok) {
      clearTimeout(timer);
      if (ok && db) fn();
    });
  }

  // Sanitize email for use as Firebase key (Firebase doesn't allow . $ # [ ] /)
  function sanitizeKey(email) {
    return (email || 'default').replace(/[.#$\[\]\/]/g, '_');
  }

  // ---- Sync functions exposed globally ----

  // Merge two score maps shaped like { player: { game: number, ... } }
  // Keeps the higher per-game value across local + remote so a stale
  // local cache can never overwrite a higher cloud score.
  function mergeScoreMaps(a, b) {
    var out = {};
    var players = {};
    for (var k in (a || {})) players[k] = true;
    for (var k in (b || {})) players[k] = true;
    for (var p in players) {
      var ap = (a && a[p]) || {};
      var bp = (b && b[p]) || {};
      var games = {};
      for (var g in ap) games[g] = true;
      for (var g in bp) games[g] = true;
      out[p] = {};
      for (var g in games) {
        var av = typeof ap[g] === "number" ? ap[g] : 0;
        var bv = typeof bp[g] === "number" ? bp[g] : 0;
        out[p][g] = Math.max(av, bv);
      }
    }
    return out;
  }

  // Write scores to Firebase using read-merge-write so a stale local cache
  // can never clobber a higher cloud value.
  window.firebaseSaveScores = function(accountId, scores) {
    whenReady(function() {
      var key = sanitizeKey(accountId);
      var ref = db.ref("accounts/" + key + "/scores");
      ref.once("value").then(function(snap) {
        var remote = snap.val() || {};
        var merged = mergeScoreMaps(remote, scores || {});
        ref.set(merged).catch(function(e) {
          console.warn("[3Jars] Firebase save scores failed:", e);
        });
      }).catch(function(e) {
        console.warn("[3Jars] Firebase save scores read failed:", e);
      });
    });
  };

  // Fetch scores from Firebase and merge per-game (max wins on both sides).
  window.firebaseSyncScores = function(accountId, localScores, callback) {
    whenReady(function() {
      var key = sanitizeKey(accountId);
      db.ref("accounts/" + key + "/scores").once("value").then(function(snapshot) {
        var remote = snapshot.val() || {};
        var merged = mergeScoreMaps(localScores || {}, remote);
        db.ref("accounts/" + key + "/scores").set(merged);
        if (callback) callback(merged);
      }).catch(function(e) {
        console.warn("[3Jars] Firebase sync scores failed:", e);
        if (callback) callback(localScores);
      });
    });
  };

  // Fetch account data from Firebase and merge with local
  window.firebaseSyncAccountData = function(accountId, localData, callback) {
    whenReady(function() {
    var key = sanitizeKey(accountId);
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
        // Merge player lists — dedup by player name (players are objects with .name)
        const localPlayers = (localData && localData.players) || [];
        const remotePlayers = remote.players || [];
        const seen = {};
        const allPlayers = [];
        for (var i = 0; i < localPlayers.length; i++) {
          var p = localPlayers[i];
          var n = (typeof p === 'string') ? p : (p && p.name);
          if (n && !seen[n]) { seen[n] = true; allPlayers.push(p); }
        }
        for (var j = 0; j < remotePlayers.length; j++) {
          var rp = remotePlayers[j];
          var rn = (typeof rp === 'string') ? rp : (rp && rp.name);
          if (rn && !seen[rn]) { seen[rn] = true; allPlayers.push(rp); }
        }
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
    }); // end whenReady
  };

  // Sync config from Firebase
  window.firebaseSyncConfig = function(accountId, localConfig, callback) {
    whenReady(function() {
    var key = sanitizeKey(accountId);
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
    }); // end whenReady
  };

  // Initialize on load
  initFirebase();
})();
