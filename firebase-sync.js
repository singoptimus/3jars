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
