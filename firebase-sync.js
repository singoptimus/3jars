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
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js');
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.database();
      window.firebaseAuth = firebase.auth();
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

  // Merge two score maps. Scores are a FLAT map: { playerName: number }.
  // Defensively coerce any non-number (e.g. accidental object from a past bug)
  // back to a number by summing numeric descendants, so corrupted cloud data
  // cannot keep breaking the UI.
  function coerceToNumber(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (v && typeof v === "object") {
      var total = 0;
      for (var k in v) {
        var n = v[k];
        if (typeof n === "number" && isFinite(n)) total += n;
      }
      return total;
    }
    return 0;
  }

  function mergeScoreMaps(a, b) {
    var out = {};
    var players = {};
    for (var k in (a || {})) players[k] = true;
    for (var k in (b || {})) players[k] = true;
    for (var p in players) {
      var av = coerceToNumber(a && a[p]);
      var bv = coerceToNumber(b && b[p]);
      out[p] = Math.max(av, bv);
    }
    return out;
  }

  window.firebaseSaveScores = function(accountId, scores) {
    whenReady(function() {
      var key = sanitizeKey(accountId);
      var ref = db.ref("accounts/" + key + "/scores");
      ref.once("value").then(function(snap) {
        var remote = snap.val() || {};
        var merged = mergeScoreMaps(remote, scores || {});
        ref.set(merged).catch(function(e) { console.warn("[3Jars] Firebase save scores failed:", e); });
      }).catch(function(e) { console.warn("[3Jars] Firebase save scores read failed:", e); });
    });
  };

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

// ---- Jars sync (cloud-backed jar balances) ----
  function jarTotal(pj) {
    if (!pj || typeof pj !== "object") return 0;
    return (pj.present && pj.present.balance || 0) +
           (pj.investing && pj.investing.balance || 0) +
           (pj.giveback && pj.giveback.balance || 0);
  }

  function mergeJars(a, b) {
    var out = {};
    var players = {};
    for (var k in (a || {})) players[k] = true;
    for (var k in (b || {})) players[k] = true;
    for (var p in players) {
      var aj = (a && a[p]) || null;
      var bj = (b && b[p]) || null;
      if (!aj) { out[p] = bj; }
      else if (!bj) { out[p] = aj; }
      else { out[p] = jarTotal(aj) >= jarTotal(bj) ? aj : bj; }
    }
    return out;
  }

  window.firebaseSaveJars = function(accountId, jars) {
    if (!accountId) return;
    var path = "accounts/" + sanitizeKey(accountId) + "/jars";
    firebaseReadyPromise.then(function() {
      if (!db) { return; }
      db.ref(path).once("value").then(function(snap) {
        var remote = snap.val() || {};
        var merged = mergeJars(remote, jars || {});
        db.ref(path).set(merged);
      }).catch(function(e) { console.warn("[firebase-sync] jars save error", e); });
    });
  };

  window.firebaseSyncJars = function(accountId, localJars, callback) {
    if (!accountId) { if (callback) callback(localJars); return; }
    var path = "accounts/" + sanitizeKey(accountId) + "/jars";
    firebaseReadyPromise.then(function() {
      if (!db) { if (callback) callback(localJars); return; }
      db.ref(path).once("value").then(function(snap) {
        var remote = snap.val() || {};
        var merged = mergeJars(remote, localJars || {});
        db.ref(path).set(merged);
        if (callback) callback(merged);
      }).catch(function(e) {
        console.warn("[firebase-sync] jars sync error", e);
        if (callback) callback(localJars);
      });
    });
  };

  // ---- Plays sync (share-of-play tracking) ----
  // Tracks how many questions a player has answered in each category per day.
  // Schema:
  //   Firebase: accounts/{key}/plays/{playerKey}/{YYYY-MM-DD}/{category} = count
  //   localStorage: km_{accountId}_plays = { [playerName]: { [YYYY-MM-DD]: {math,language,challenges} } }
  // Categories: 'math' | 'language' | 'challenges'
  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function pruneOldDays(playerBucket, keepDays) {
    if (!playerBucket || typeof playerBucket !== 'object') return playerBucket;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (keepDays || 14));
    var cutoffKey = cutoff.getFullYear() + '-' +
      String(cutoff.getMonth() + 1).padStart(2, '0') + '-' +
      String(cutoff.getDate()).padStart(2, '0');
    for (var day in playerBucket) {
      if (day < cutoffKey) delete playerBucket[day];
    }
    return playerBucket;
  }

  function loadLocalPlays(accountId) {
    try {
      var raw = localStorage.getItem('km_' + accountId + '_plays');
      if (raw) return JSON.parse(raw) || {};
    } catch (e) {}
    return {};
  }
  function saveLocalPlays(accountId, data) {
    try { localStorage.setItem('km_' + accountId + '_plays', JSON.stringify(data)); } catch (e) {}
  }

  // Record one question answered by playerName in category.
  // category: 'math' | 'language' | 'challenges'
  window.recordPlay = function(accountId, playerName, category) {
    if (!accountId || !playerName || !category) return;
    var cat = String(category).toLowerCase();
    if (cat !== 'math' && cat !== 'language' && cat !== 'challenges') return;
    var day = todayKey();

    // Local update
    var data = loadLocalPlays(accountId);
    if (!data[playerName]) data[playerName] = {};
    if (!data[playerName][day]) data[playerName][day] = { math: 0, language: 0, challenges: 0 };
    data[playerName][day][cat] = (data[playerName][day][cat] || 0) + 1;
    pruneOldDays(data[playerName], 14);
    saveLocalPlays(accountId, data);

    // Firebase increment
    whenReady(function() {
      var path = 'accounts/' + sanitizeKey(accountId) +
                 '/plays/' + sanitizeKey(playerName) +
                 '/' + day + '/' + cat;
      db.ref(path).transaction(function(v) { return (Number(v) || 0) + 1; })
        .catch(function(e) { console.warn('[3Jars] recordPlay firebase error', e); });
    });
  };

  // Sum categories over the last N days for a player.
  // Returns {math, language, challenges, total}.
  window.getPlayMix = function(accountId, playerName, days) {
    var out = { math: 0, language: 0, challenges: 0, total: 0 };
    if (!accountId || !playerName) return out;
    var data = loadLocalPlays(accountId);
    var bucket = data[playerName] || {};
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ((days || 7) - 1));
    var cutoffKey = cutoff.getFullYear() + '-' +
      String(cutoff.getMonth() + 1).padStart(2, '0') + '-' +
      String(cutoff.getDate()).padStart(2, '0');
    for (var d in bucket) {
      if (d < cutoffKey) continue;
      var b = bucket[d] || {};
      out.math += Number(b.math) || 0;
      out.language += Number(b.language) || 0;
      out.challenges += Number(b.challenges) || 0;
    }
    out.total = out.math + out.language + out.challenges;
    return out;
  };

  // Merge remote + local plays (pick max per category per day — counts only grow).
  function mergePlays(local, remote) {
    var out = {};
    var players = {};
    for (var p in (local || {})) players[p] = true;
    // remote is keyed by sanitized player; we merge into original playerName keys that already exist locally.
    // If a remote key doesn't match any local name, we still keep it under the sanitized key.
    for (var p in (local || {})) {
      out[p] = {};
      var lb = local[p] || {};
      var sanitized = sanitizeKey(p);
      var rb = (remote && remote[sanitized]) || {};
      var days = {};
      for (var d in lb) days[d] = true;
      for (var d in rb) days[d] = true;
      for (var d in days) {
        var ld = lb[d] || {};
        var rd = rb[d] || {};
        out[p][d] = {
          math: Math.max(Number(ld.math) || 0, Number(rd.math) || 0),
          language: Math.max(Number(ld.language) || 0, Number(rd.language) || 0),
          challenges: Math.max(Number(ld.challenges) || 0, Number(rd.challenges) || 0)
        };
      }
      pruneOldDays(out[p], 14);
    }
    // Any remote players not already local — include them too under the sanitized key
    for (var sp in (remote || {})) {
      var found = false;
      for (var p2 in (local || {})) {
        if (sanitizeKey(p2) === sp) { found = true; break; }
      }
      if (!found) {
        out[sp] = {};
        for (var d2 in remote[sp]) {
          var rd2 = remote[sp][d2] || {};
          out[sp][d2] = {
            math: Number(rd2.math) || 0,
            language: Number(rd2.language) || 0,
            challenges: Number(rd2.challenges) || 0
          };
        }
        pruneOldDays(out[sp], 14);
      }
    }
    return out;
  }

  window.firebaseSyncPlays = function(accountId, callback) {
    if (!accountId) { if (callback) callback(loadLocalPlays(accountId)); return; }
    whenReady(function() {
      var path = 'accounts/' + sanitizeKey(accountId) + '/plays';
      db.ref(path).once('value').then(function(snap) {
        var remote = snap.val() || {};
        var local = loadLocalPlays(accountId);
        var merged = mergePlays(local, remote);
        saveLocalPlays(accountId, merged);
        if (callback) callback(merged);
      }).catch(function(e) {
        console.warn('[3Jars] firebaseSyncPlays failed:', e);
        if (callback) callback(loadLocalPlays(accountId));
      });
    });
  };

  // ---- Account data sync (player roster, displayName) ----
  // Stores the player list at accounts/{key}/profile so it follows the user
  // across devices. Without this, the player roster lives only in localStorage
  // on whichever device created it — so migrated players never appear on a
  // different browser/phone/desktop.

  function asArray(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      return Object.keys(x).map(function(k) { return x[k]; }).filter(Boolean);
    }
    return [];
  }

  function mergePlayers(a, b) {
    var aArr = asArray(a);
    var bArr = asArray(b);
    var byName = {};
    aArr.forEach(function(p) { if (p && p.name) byName[p.name] = { name: p.name, emoji: p.emoji || '', color: p.color || '' }; });
    bArr.forEach(function(p) {
      if (!p || !p.name) return;
      if (!byName[p.name]) {
        byName[p.name] = { name: p.name, emoji: p.emoji || '', color: p.color || '' };
      } else {
        byName[p.name] = {
          name: p.name,
          emoji: byName[p.name].emoji || p.emoji || '',
          color: byName[p.name].color || p.color || ''
        };
      }
    });
    return Object.keys(byName).map(function(n) { return byName[n]; });
  }

  function mergeProfile(local, remote) {
    var out = {};
    var lp = (local && local.players) || [];
    var rp = (remote && remote.players) || [];
    out.players = mergePlayers(lp, rp);
    out.displayName = (local && local.displayName) || (remote && remote.displayName) || '';
    out.email = (local && local.email) || (remote && remote.email) || '';
    return out;
  }

  window.firebaseSaveAccountData = function(accountId, data) {
    if (!accountId || !data) return;
    var path = "accounts/" + sanitizeKey(accountId) + "/profile";
    firebaseReadyPromise.then(function() {
      if (!db) return;
      var localProfile = {
        players: data.players || [],
        displayName: data.displayName || '',
        email: data.email || accountId
      };
      db.ref(path).once("value").then(function(snap) {
        var remote = snap.val() || {};
        var merged = mergeProfile(localProfile, remote);
        db.ref(path).set(merged).catch(function(e) { console.warn("[firebase-sync] account save error", e); });
      }).catch(function(e) {
        console.warn("[firebase-sync] account save read error", e);
      });
    });
  };

  window.firebaseSyncAccountData = function(accountId, localData, callback) {
    if (!accountId) { if (callback) callback(null); return; }
    var path = "accounts/" + sanitizeKey(accountId) + "/profile";
    firebaseReadyPromise.then(function() {
      if (!db) { if (callback) callback(null); return; }
      db.ref(path).once("value").then(function(snap) {
        var remote = snap.val() || {};
        var merged = mergeProfile(localData || {}, remote);
        db.ref(path).set(merged);
        if (callback) callback(merged);
      }).catch(function(e) {
        console.warn("[firebase-sync] account sync error", e);
        if (callback) callback(null);
      });
    });
  };

  // Heal corrupted localStorage score entries on load
  function healLocalScores() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf("km_") === 0 && key.indexOf("_scores") > 0) {
          var raw = localStorage.getItem(key);
          var obj;
          try { obj = JSON.parse(raw); } catch(e) { obj = null; }
          if (obj && typeof obj === "object") {
            var changed = false;
            for (var p in obj) {
              var v = obj[p];
              if (typeof v !== "number" || !isFinite(v)) {
                obj[p] = coerceToNumber(v);
                changed = true;
              }
            }
            if (changed) {
              localStorage.setItem(key, JSON.stringify(obj));
              console.log("[firebase-sync] healed corrupted scores in " + key);
            }
          }
        }
      }
    } catch(e) { console.warn("[firebase-sync] healLocalScores error", e); }
  }

  // Expose ready promise globally for login.html social auth
  window.firebaseReadyPromise = firebaseReadyPromise;

  // Initialize on load
  healLocalScores();
  initFirebase();
})();
