/**
 * Jar Strip — fixed-bottom live view of the current player's three jars,
 * progress toward the next 10,000-point milestone, and per-answer + per-
 * milestone coin animations. Included on every game page so kids see the
 * reward loop in real time while answering questions instead of only when
 * they return to the home screen.
 *
 * Integration: just drop <script src="jar-strip.js"></script> into a game
 * page. The strip auto-wires via localStorage.setItem interception, so
 * individual games don't need to call anything.
 *
 * Milestone crediting (awardJars) is mirrored from index.html so that jar
 * balances update the moment the player crosses a 10k boundary during play,
 * not only on return-to-home.
 */
(function () {
  const accountId = sessionStorage.getItem('km_currentAccount');
  const isGuest = sessionStorage.getItem('km_guest') === 'true';
  if (!accountId || isGuest) return; // no account / guest → skip (no jars to fill)

  // Resolve active player: ?player=... in URL wins; otherwise stored selection.
  const urlPlayer = new URLSearchParams(window.location.search).get('player') || '';
  const player = urlPlayer ||
    localStorage.getItem('km_' + accountId + '_player') || '';
  if (!player) return;

  const lsKey = (suffix) => 'km_' + accountId + '_' + suffix;

  // --- Storage helpers (unauth'd cloud sync is left to the per-page
  // firebase-sync.js that's already loaded; we only touch localStorage here.)
  function readJSON(key, fallback) {
    try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch (e) {}
    return fallback;
  }
  function writeJSON(key, val) {
    // Use the *original* setter so we don't retrigger our own interceptor.
    origSetItem.call(localStorage, key, JSON.stringify(val));
  }
  function getScore() {
    const scores = readJSON(lsKey('scores'), {});
    return scores[player] || 0;
  }
  function getPlayerJars() {
    const all = readJSON(lsKey('jars'), {});
    return all[player] || {
      present:   { balance: 0, history: [] },
      investing: { balance: 0, history: [] },
      giveback:  { balance: 0, history: [] }
    };
  }
  function getConfig() {
    return readJSON(lsKey('config'),
      { experienceAmount: 50, investingAmount: 10, givebackAmount: 10 });
  }

  // Mirror of awardJars() from index.html — credits one reward per 10k bucket
  // crossed. Returns {exp,inv,give} if a milestone was awarded, else null.
  function awardJarsIfMilestone(oldScore, newScore) {
    const oldBucket = Math.floor(oldScore / 10000);
    const newBucket = Math.floor(newScore / 10000);
    if (newBucket <= oldBucket) return null;
    const all = readJSON(lsKey('jars'), {});
    if (!all[player]) all[player] = {
      present:   { balance: 0, history: [] },
      investing: { balance: 0, history: [] },
      giveback:  { balance: 0, history: [] }
    };
    const pj = all[player];
    const cfg = getConfig();
    const mults = newBucket - oldBucket;
    const exp  = (cfg.experienceAmount ?? 50) * mults;
    const inv  = (cfg.investingAmount  ?? 10) * mults;
    const give = (cfg.givebackAmount   ?? 10) * mults;
    const now = Date.now();
    pj.present.balance   += exp;  pj.present.history.push({ date: now, amount: exp });
    pj.investing.balance += inv;  pj.investing.history.push({ date: now, amount: inv });
    pj.giveback.balance  += give; pj.giveback.history.push({ date: now, amount: give });
    writeJSON(lsKey('jars'), all);
    if (window.firebaseSaveJars) window.firebaseSaveJars(accountId, all);
    return { exp, inv, give };
  }

  // ── UI ──────────────────────────────────────────────────────────────
  const strip = document.createElement('div');
  strip.id = 'jar-strip';
  strip.innerHTML = [
    '<div class="jar present" id="js-present"><span class="emoji">🎉</span><span class="amt">$0</span></div>',
    '<div class="jar invest"  id="js-invest"><span class="emoji">💰</span><span class="amt">$0</span></div>',
    '<div class="jar give"    id="js-give"><span class="emoji">💝</span><span class="amt">$0</span></div>',
    '<div class="progress">',
      '<div class="progress-track"><div class="progress-fill" id="js-fill"></div></div>',
      '<span class="progress-label" id="js-label">0 / 10,000 to next reward</span>',
    '</div>'
  ].join('');

  const style = document.createElement('style');
  style.textContent = [
    'body { padding-bottom: 64px !important; }',
    '#jar-strip {',
    '  position: fixed; bottom: 0; left: 0; right: 0;',
    '  display: flex; align-items: center; justify-content: center; gap: 18px;',
    '  padding: 10px 18px; z-index: 998;',
    '  background: rgba(255,255,255,0.97); backdrop-filter: blur(12px);',
    '  border-top: 1px solid rgba(0,0,0,0.08);',
    '  box-shadow: 0 -6px 24px rgba(17,24,39,0.06);',
    '  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;',
    '  color: #1f2937; font-size: 14px;',
    '}',
    '#jar-strip .jar {',
    '  display: flex; align-items: center; gap: 6px;',
    '  padding: 6px 12px; border-radius: 999px;',
    '  font-weight: 700; transition: transform 0.25s;',
    '  background: rgba(251,191,36,0.14);',
    '  border: 1px solid rgba(251,191,36,0.25);',
    '}',
    '#jar-strip .jar.invest { background: rgba(52,211,153,0.12); border-color: rgba(52,211,153,0.28); }',
    '#jar-strip .jar.give   { background: rgba(244,114,182,0.12); border-color: rgba(244,114,182,0.28); }',
    '#jar-strip .emoji { font-size: 1.05em; }',
    '#jar-strip .progress {',
    '  flex: 1; max-width: 440px;',
    '  display: flex; align-items: center; gap: 10px;',
    '}',
    '#jar-strip .progress-track {',
    '  flex: 1; height: 10px; border-radius: 999px;',
    '  background: rgba(17,24,39,0.06); overflow: hidden;',
    '}',
    '#jar-strip .progress-fill {',
    '  height: 100%; width: 0%; border-radius: 999px;',
    '  background: linear-gradient(90deg, #fbbf24, #f59e0b);',
    '  transition: width 0.6s cubic-bezier(0.34,1.56,0.64,1);',
    '}',
    '#jar-strip .progress-label {',
    '  font-size: 12px; color: #475569; font-weight: 600; white-space: nowrap;',
    '}',
    '.js-coin {',
    '  position: fixed; pointer-events: none; z-index: 1001;',
    '  font-size: 1.5em; will-change: transform, opacity;',
    '  animation: jsCoinFly 0.9s cubic-bezier(0.55,0.1,0.4,1.2) forwards;',
    '}',
    '@keyframes jsCoinFly {',
    '  0%   { opacity: 1; transform: translate(0,0) scale(1) rotate(0); }',
    '  85%  { opacity: 1; }',
    '  100% { opacity: 0; transform: var(--js-to) scale(0.55) rotate(360deg); }',
    '}',
    '#jar-strip .jar.pulse { animation: jsJarPulse 0.55s cubic-bezier(0.34,1.56,0.64,1); }',
    '@keyframes jsJarPulse {',
    '  0%,100% { transform: scale(1); }',
    '  50%     { transform: scale(1.18); }',
    '}',
    '@media (max-width: 640px) {',
    '  #jar-strip { gap: 8px; padding: 8px 10px; font-size: 13px; }',
    '  #jar-strip .progress-label { display: none; }',
    '  body { padding-bottom: 58px !important; }',
    '}'
  ].join('\n');

  document.head.appendChild(style);
  // Defer append to body until DOM ready (script may load in <head>).
  function mount() {
    if (document.body) document.body.appendChild(strip);
    else document.addEventListener('DOMContentLoaded', mount);
  }
  mount();

  function render() {
    const pj = getPlayerJars();
    const score = getScore();
    const prog = score % 10000;
    const pct = Math.round((prog / 10000) * 100);
    // Guard: element may not exist yet if mount is pending.
    const p = document.querySelector('#js-present .amt');
    const i = document.querySelector('#js-invest .amt');
    const g = document.querySelector('#js-give .amt');
    const f = document.getElementById('js-fill');
    const l = document.getElementById('js-label');
    if (!p) { setTimeout(render, 50); return; }
    p.textContent = '$' + pj.present.balance;
    i.textContent = '$' + pj.investing.balance;
    g.textContent = '$' + pj.giveback.balance;
    f.style.width = pct + '%';
    l.textContent = prog.toLocaleString() + ' / 10,000 to next reward';
  }

  function flyCoin(fromX, fromY, targetSel) {
    const target = document.querySelector(targetSel);
    if (!target) return;
    const tr = target.getBoundingClientRect();
    const toX = tr.left + tr.width / 2;
    const toY = tr.top + tr.height / 2;
    const coin = document.createElement('div');
    coin.className = 'js-coin';
    coin.textContent = '🪙';
    coin.style.left = fromX + 'px';
    coin.style.top  = fromY + 'px';
    coin.style.setProperty('--js-to', 'translate(' + (toX - fromX) + 'px, ' + (toY - fromY) + 'px)');
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 950);
    // Pulse the target jar as the coin arrives.
    setTimeout(() => {
      target.classList.add('pulse');
      setTimeout(() => target.classList.remove('pulse'), 550);
    }, 720);
  }

  function animateAnswer() {
    // One coin flies from the center of the viewport (approx where question card is)
    // into the "present" jar — conveys "every question fills a jar".
    flyCoin(window.innerWidth / 2, window.innerHeight / 2 - 60, '#js-present');
  }

  function animateMilestone() {
    // Burst: multiple coins into all three jars.
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const jitter = () => (Math.random() - 0.5) * 40;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => flyCoin(cx + jitter(), cy + jitter(), '#js-present'),  i * 80);
      setTimeout(() => flyCoin(cx + jitter(), cy + jitter(), '#js-invest'),   i * 80 + 50);
      setTimeout(() => flyCoin(cx + jitter(), cy + jitter(), '#js-give'),     i * 80 + 100);
    }
  }

  // Intercept localStorage.setItem so we pick up score changes from ANY game
  // page without each game needing to call us.
  let lastScore = getScore();
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (key === lsKey('scores')) {
      const newScore = getScore();
      if (newScore !== lastScore) {
        const delta = newScore - lastScore;
        const milestone = awardJarsIfMilestone(lastScore, newScore);
        lastScore = newScore;
        if (delta > 0) animateAnswer();
        if (milestone) setTimeout(animateMilestone, 700);
        // Let the DOM settle before re-reading values.
        setTimeout(render, 60);
      }
    } else if (key === lsKey('jars')) {
      setTimeout(render, 60);
    }
  };

  render();
})();
