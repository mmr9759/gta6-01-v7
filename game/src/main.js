// VELMARA main: loop, input, physics, police AI, missions engine, render, HUD, save.
var V = window.V || (window.V = {});
(function () {
  'use strict';
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var mm = document.getElementById('minimap');
  var mmc = mm.getContext('2d');
  var W = V.world;
  var WW = W.WORLD_W, WH = W.WORLD_H;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function $(id) { return document.getElementById(id); }
  function el(id, v) { var n = $(id); if (n && n._v !== v) { n._v = v; n.textContent = v; } }

  // ---------- params / shot modes ----------
  var qs = new URLSearchParams(location.search);
  var SEED = parseInt(qs.get('seed') || '20261118', 10) || 20261118;
  var SHOT = qs.get('shot') || '';
  var rng = mulberry32(SEED);

  // ---------- state ----------
  var G = {
    mode: 'title', // title | play | pause | shop | choice | dead | finale | brief
    time: 0, clockMin: 480, cash: 250, wanted: 0, health: 100,
    missionIdx: -1, objIdx: 0, objState: null, branch: null,
    coinsGot: {}, coinsMission: 0, fareMission: 0,
    weapons: [], ownedCars: [0], carModel: 0,
    player: { x: 1970, y: 600, angle: 0, speed: 0, inCar: false, car: null },
    cars: [], traffic: [], peds: [], police: [], heli: null,
    cam: { x: 1970, y: 600, zoom: 1 },
    keys: {}, mouse: { x: 0, y: 0, down: false },
    autopilot: null, autopilotPath: [], race: null, raceTimer: 0,
    taxi: null, taxiPassenger: null, evadeTimer: 0, sightTimer: 0,
    particles: [], toasts: [], fireworks: [], stats: { missions: 0, coins: 0, fares: 0, races: 0, distance: 0 },
    shopKind: null, shopNear: null, nearCar: null, deadReason: '', finaleShown: false,
    sirenOn: false, flash: 0, shotApplied: false, pending: false
  };
  var world = W.genWorld(SEED);

  // ---------- cars ----------
  function makeCar(x, y, angle, model, kind) {
    var m = W.CAR_MODELS[model];
    return { x: x, y: y, angle: angle, speed: 0, model: model, color: m.color, top: m.top, accel: m.accel,
      kind: kind || 'parked', hp: 100, node: null, target: null, stuck: 0, brake: false, dead: false };
  }
  function spawnParkedCars() {
    var spots = [[1970, 600, 0], [920, 600, 1], [1270, 900, 2], [2320, 900, 3], [570, 900, 4], [3020, 600, 5], [1620, 1200, 6], [2320, 1500, 7], [1270, 1500, 0], [3370, 1500, 3], [920, 1500, 5], [2670, 600, 2]];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      G.cars.push(makeCar(s[0] + 30, s[1] + 30, (rng() - 0.5) * 0.4, s[2], 'parked'));
    }
  }
  function spawnTraffic() {
    for (var i = 0; i < 14; i++) {
      var n = world.nodes[Math.floor(rng() * world.nodes.length)];
      var c = makeCar(n.x, n.y, rng() * Math.PI * 2, Math.floor(rng() * 5), 'traffic');
      c.speed = 70 + rng() * 50;
      c.node = n.id;
      var nb = world.adj[n.id];
      c.target = nb[Math.floor(rng() * nb.length)];
      G.traffic.push(c);
    }
  }
  function spawnPeds() {
    for (var i = 0; i < 26; i++) {
      var n = world.nodes[Math.floor(rng() * world.nodes.length)];
      G.peds.push({ x: n.x + (rng() - 0.5) * 160, y: n.y + (rng() - 0.5) * 160, angle: rng() * Math.PI * 2,
        speed: 28 + rng() * 22, tx: n.x, ty: n.y, wait: 0, down: 0, flee: 0, color: ['#e8b64a', '#4a9ad6', '#d96b4a', '#7ac94a', '#c94a8a'][i % 5] });
    }
  }

  // ---------- input ----------
  var KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake' };
  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { G.keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === 'Enter') onEnter();
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'Escape') onEscape();
    else if (e.code === 'KeyE') onInteract();
    else if (e.code === 'KeyG') toggleAutopilot();
    else if (e.code === 'KeyR') { V.audio.cycleStation(); toast('Radio: ' + V.audio.stationName() + ' — ' + V.audio.stationSub()); }
    else if (e.code === 'KeyT') startTaxi();
    else if (e.code === 'KeyF') punch();
    else if (e.code === 'Digit1' && G.mode === 'choice') chooseBranch('marisol');
    else if (e.code === 'Digit2' && G.mode === 'choice') chooseBranch('broker');
    else if (e.code === 'KeyH') V.audio.sfx('horn');
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) G.keys[KEYMAP[e.code]] = false; });
  cv.addEventListener('mousemove', function (e) { var r = cv.getBoundingClientRect(); G.mouse.x = (e.clientX - r.left) * (1280 / r.width); G.mouse.y = (e.clientY - r.top) * (720 / r.height); });
  cv.addEventListener('mousedown', function () { G.mouse.down = true; shoot(); });
  window.addEventListener('mouseup', function () { G.mouse.down = false; });
  $('btn-start').addEventListener('click', function () { V.audio.init(); startNewGame(); });
  $('btn-continue').addEventListener('click', function () { V.audio.init(); loadGame() ? resumePlay() : startNewGame(); });
  $('btn-brief').addEventListener('click', function () { V.audio.sfx('click'); beginMissionObjectives(); });
  $('btn-resume').addEventListener('click', function () { togglePause(); });
  $('btn-restart').addEventListener('click', function () { localStorage.removeItem('velmara-v7-save'); startNewGame(); });
  $('btn-revive').addEventListener('click', function () { revive(); });
  $('btn-finale').addEventListener('click', function () { $('finale-screen').classList.add('hidden'); G.mode = 'play'; });
  $('btn-shop-close').addEventListener('click', function () { closeShop(); });
  $('choice-a').addEventListener('click', function () { chooseBranch('marisol'); });
  $('choice-b').addEventListener('click', function () { chooseBranch('broker'); });

  function onEnter() {
    if (G.mode === 'title') { V.audio.init(); startNewGame(); }
    else if (G.mode === 'brief') { V.audio.sfx('click'); beginMissionObjectives(); }
    else if (G.mode === 'dead') revive();
  }
  function onEscape() {
    if (G.mode === 'shop') closeShop();
    else if (G.mode === 'play') togglePause();
    else if (G.mode === 'pause') togglePause();
  }
  function togglePause() {
    if (G.mode === 'play') {
      G.mode = 'pause';
      $('pause-stats').textContent = 'Cash $' + G.cash + ' · Missions done ' + G.stats.missions + ' · Coins ' + G.stats.coins + ' / 24 · Cars owned ' + G.ownedCars.length + ' · Weapons ' + (G.weapons.join(', ') || 'none');
      $('pause-screen').classList.remove('hidden');
    } else if (G.mode === 'pause') { G.mode = 'play'; $('pause-screen').classList.add('hidden'); }
  }

  // ---------- toast ----------
  function toast(msg, dur) {
    var t = $('toast'); t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.style.opacity = '0'; }, (dur || 2600));
  }

  // ---------- missions engine ----------
  function currentMission() {
    if (G.missionIdx < 0) return null;
    return V.missions.byIndex(G.missionIdx);
  }
  function missionTarget() {
    var m = currentMission();
    if (!m || G.objIdx >= m.objectives.length) return null;
    return m.objectives[G.objIdx];
  }
  function startMission(idx, showBrief) {
    G.missionIdx = idx; G.objIdx = 0; G.objState = null; G.coinsMission = 0; G.fareMission = 0; G.race = null;
    G.pending = false;
    var m = currentMission();
    if (!m) return;
    if (m.startWanted) setWanted(m.startWanted);
    if (m.objectives[0].type === 'choice') { showChoice(); return; }
    if (showBrief === false) { beginMissionObjectives(); return; }
    G.mode = 'brief';
    $('brief-title').textContent = m.act + ' — ' + m.title;
    $('brief-text').textContent = m.brief;
    $('brief-reward').textContent = m.reward ? ('REWARD: $' + m.reward) : '';
    $('brief-screen').classList.remove('hidden');
    V.audio.sfx('mission');
  }
  function beginMissionObjectives() {
    $('brief-screen').classList.add('hidden');
    G.mode = 'play';
    var m = currentMission();
    if (!m) return;
    var o = m.objectives[0];
    if (o.type === 'collect') ensureCoins(o.count);
    if (o.type === 'race') setupRace(o);
    if (o.type === 'evade') setWanted(o.stars);
    updateMissionHUD();
    toast(m.title + ' — ' + o.label);
  }
  function showChoice() {
    G.mode = 'choice';
    $('choice-screen').classList.remove('hidden');
  }
  function chooseBranch(b) {
    if (G.mode !== 'choice') return;
    $('choice-screen').classList.add('hidden');
    G.branch = b;
    V.audio.sfx('cash');
    startMission(b === 'marisol' ? 7 : 8, true);
  }
  function ensureCoins(n) {
    var left = 0;
    for (var i = 0; i < world.coins.length; i++) if (!G.coinsGot[i]) left++;
    var need = n - left;
    if (need <= 0) return;
    // Un-collect the farthest coins so the objective is always completable.
    var got = [];
    for (var j = 0; j < world.coins.length; j++) if (G.coinsGot[j]) got.push(j);
    got.sort(function (a, b) { return dist(world.coins[b].x, world.coins[b].y, G.player.x, G.player.y) - dist(world.coins[a].x, world.coins[a].y, G.player.x, G.player.y); });
    for (var k = 0; k < Math.min(need, got.length); k++) delete G.coinsGot[got[k]];
  }
  function setupRace(o) {
    var start = world.races[o.race];
    var cps = [];
    var base = W.nearestNode(world, start.x, start.y);
    var node = base, prev = -1;
    for (var i = 0; i < o.checkpoints; i++) {
      var nb = world.adj[node.id].filter(function (id) { return id !== prev; });
      var next = nb[Math.floor(rng() * nb.length)];
      prev = node.id; node = world.nodes[next];
      cps.push({ x: node.x, y: node.y });
    }
    G.race = { start: start, cps: cps, idx: 0 };
    G.raceTimer = o.timeLimit;
    toast('Race! Hit the checkpoints in order — ' + o.timeLimit + 's');
  }
  function completeObjective() {
    var m = currentMission();
    if (!m) return;
    V.audio.sfx('mission');
    G.objIdx++;
    if (G.objIdx >= m.objectives.length) { completeMission(); return; }
    var o = m.objectives[G.objIdx];
    if (o.type === 'collect') ensureCoins(o.count);
    if (o.type === 'race') setupRace(o);
    if (o.type === 'evade') setWanted(o.stars);
    updateMissionHUD();
    toast(m.title + ' — ' + o.label);
  }
  function completeMission() {
    var m = currentMission();
    G.cash += m.reward; G.stats.missions++;
    V.audio.sfx('cash');
    toast(m.title + ' COMPLETE — +$' + m.reward, 3400);
    saveGame();
    var next;
    if (G.missionIdx === 6) { startMission(6, false); return; } // mission 7 hands to choice via startMission
    if (G.missionIdx === 7 || G.missionIdx === 8) next = 9;
    else if (G.missionIdx === 12) { showFinale(); return; }
    else next = G.missionIdx + 1;
    if (next >= V.missions.count()) { showFinale(); return; }
    setTimeout(function () { if (G.mode === 'play') startMission(next, true); }, 1200);
    G.missionIdx = next; G.objIdx = 0; G.pending = true; // hold state until brief shows
    updateMissionHUD();
  }
  function showFinale() {
    G.mode = 'finale'; G.finaleShown = true; G.finaleHud = true;
    $('finale-stats').textContent = 'Cash $' + G.cash + ' · ' + G.stats.missions + ' missions · ' + G.stats.coins + ' gold coins · ' + G.stats.fares + ' fares';
    $('finale-screen').classList.remove('hidden');
    for (var i = 0; i < 80; i++) spawnFirework();
    saveGame();
  }
  function updateMissionHUD() {
    if (G.finaleHud) {
      el('m-title', 'STREETS OF GOLD');
      el('m-obj', 'Riko Vale owns Velmara — 12 missions, 24 coins, one crown.');
      el('m-sub', 'Finale · free roam unlocked');
      return;
    }
    var m = currentMission();
    if (!m) { el('m-title', 'FREE ROAM'); el('m-obj', 'Explore Velmara — missions, fares, races and coins'); el('m-sub', 'Press T for a taxi fare · E near shops'); return; }
    el('m-title', m.act + ' · ' + m.title);
    var o = m.objectives[Math.min(G.objIdx, m.objectives.length - 1)];
    var label = o ? o.label : 'Done';
    if (o && o.type === 'collect') label += '  (' + G.coinsMission + '/' + o.count + ')';
    if (o && o.type === 'fare') label += '  ($' + G.fareMission + '/$' + o.amount + ')';
    if (o && o.type === 'race' && G.race) label += '  (' + G.race.idx + '/' + G.race.cps.length + ')  ' + Math.ceil(G.raceTimer) + 's';
    if (o && o.type === 'evade') label += '  (wanted ' + G.wanted + '★)';
    el('m-obj', label);
    el('m-sub', m.giver + ' · reward $' + m.reward + (G.branch ? ' · side: ' + G.branch : ''));
  }

  function setWanted(n) {
    G.wanted = clamp(n, 0, 5);
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
    $('stars').innerHTML = stars.split('').map(function (s, i) { return '<span class="' + (i < G.wanted ? '' : 'off') + '">' + s + '</span>'; }).join('');
  }

  // ---------- game flow ----------
  function resetWorld() {
    G.cars = []; G.traffic = []; G.peds = []; G.police = []; G.heli = null;
    G.particles = []; G.fireworks = []; G.race = null; G.taxi = null;
    spawnParkedCars(); spawnTraffic(); spawnPeds();
    G.player = { x: 1970, y: 600, angle: 0, speed: 0, inCar: false, car: null };
  }
  function startNewGame() {
    $('title-screen').classList.add('hidden');
    resetWorld();
    G.cash = 250; G.wanted = 0; G.health = 100; G.coinsGot = {}; G.weapons = [];
    G.ownedCars = [0]; G.stats = { missions: 0, coins: 0, fares: 0, races: 0, distance: 0 };
    G.clockMin = 480; G.branch = null; G.missionIdx = -1;
    setWanted(0);
    G.mode = 'play';
    saveGame();
    startMission(0, true);
  }
  function resumePlay() {
    $('title-screen').classList.add('hidden');
    G.mode = 'play';
    if (G.missionIdx >= 0) startMission(G.missionIdx, false);
    else updateMissionHUD();
  }
  function revive() {
    $('dead-screen').classList.add('hidden');
    G.health = 100; G.cash = Math.max(0, G.cash - 250);
    setWanted(0); G.police = []; G.heli = null;
    G.player.x = 3020; G.player.y = 820; G.player.inCar = false; G.player.car = null; G.player.speed = 0;
    G.mode = 'play';
    toast('Back on the streets. The gold is still out there.');
    if (G.missionIdx >= 0) startMission(G.missionIdx, false);
  }
  function die(reason) {
    if (G.mode === 'dead') return;
    G.mode = 'dead'; G.deadReason = reason;
    $('dead-reason').textContent = reason;
    $('dead-screen').classList.remove('hidden');
    V.audio.sfx('denied');
  }

  // ---------- save / load ----------
  function saveGame() {
    try {
      localStorage.setItem('velmara-v7-save', JSON.stringify({
        cash: G.cash, missionIdx: G.missionIdx, coinsGot: G.coinsGot, weapons: G.weapons,
        ownedCars: G.ownedCars, health: G.health, px: G.player.x, py: G.player.y,
        stats: G.stats, branch: G.branch, clockMin: G.clockMin
      }));
    } catch (e) { /* storage unavailable */ }
  }
  function loadGame() {
    try {
      var s = JSON.parse(localStorage.getItem('velmara-v7-save') || 'null');
      if (!s) return false;
      resetWorld();
      G.cash = s.cash; G.missionIdx = s.missionIdx; G.coinsGot = s.coinsGot || {};
      G.weapons = s.weapons || []; G.ownedCars = s.ownedCars || [0];
      G.health = s.health || 100; G.stats = s.stats || G.stats; G.branch = s.branch || null;
      G.clockMin = s.clockMin || 480;
      G.player.x = s.px || 1970; G.player.y = s.py || 600;
      setWanted(0);
      return true;
    } catch (e) { return false; }
  }

  // ---------- interaction ----------
  function nearestCar(maxD) {
    var best = null, bd = maxD;
    var all = G.cars.concat(G.traffic);
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (c.dead) continue;
      var d = dist(c.x, c.y, G.player.x, G.player.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function nearShop() {
    for (var i = 0; i < world.shops.length; i++) {
      var s = world.shops[i];
      if (dist(s.x, s.y, G.player.x, G.player.y) < 90) return s;
    }
    return null;
  }
  function onInteract() {
    if (G.mode !== 'play') return;
    V.audio.init();
    var p = G.player;
    if (!p.inCar) {
      var sh = nearShop();
      if (sh) { openShop(sh); return; }
      var c = nearestCar(75);
      if (c) {
        var occupied = c.kind === 'traffic';
        if (occupied) { setWanted(G.wanted + 1); toast('Carjacked! The PD noticed.'); }
        // remove driver ped effect: traffic car leaves the traffic list
        if (c.kind === 'traffic') G.traffic = G.traffic.filter(function (t) { return t !== c; });
        else G.cars = G.cars.filter(function (t) { return t !== c; });
        c.kind = 'player'; p.car = c; p.inCar = true; p.angle = c.angle;
        V.audio.sfx('click');
        toast(W.CAR_MODELS[c.model].name + ' — yours now. G for GPS autopilot.');
        return;
      }
      // taxi pickup handled by T; nothing else nearby
      return;
    }
    // In car: Pay N Spray works from the driver's seat.
    var sh2 = nearShop();
    if (sh2 && sh2.kind === 'spray') { doSpray(); return; }
    // Exit car.
    var c2 = p.car;
    p.inCar = false; p.car = null;
    p.x = c2.x + Math.cos(c2.angle + Math.PI / 2) * 34;
    p.y = c2.y + Math.sin(c2.angle + Math.PI / 2) * 34;
    c2.kind = 'parked'; c2.speed = 0;
    if (G.cars.indexOf(c2) < 0) G.cars.push(c2);
    G.autopilot = null; G.autopilotPath = [];
  }
  function doSpray() {
    if (G.cash < 200) { V.audio.sfx('denied'); toast('Respray costs $200 — not enough cash.'); return; }
    G.cash -= 200; setWanted(0); G.police = []; G.heli = null;
    if (G.player.car) G.player.car.color = ['#d94a3c', '#22d3ee', '#e8c832', '#ff7a3c', '#c94a8a'][Math.floor(rng() * 5)];
    V.audio.sfx('cash');
    toast("Pay N' Spray — clean plates, fresh paint, 0 stars.");
    var o = missionTarget();
    if (o && o.type === 'evade') completeObjective();
  }
  function punch() {
    if (G.mode !== 'play' || G.player.inCar) return;
    for (var i = 0; i < G.peds.length; i++) {
      var pd = G.peds[i];
      if (pd.down > 0) continue;
      if (dist(pd.x, pd.y, G.player.x, G.player.y) < 46) {
        pd.down = 6; pd.flee = 0;
        V.audio.sfx('crash');
        if (G.police.length) setWanted(G.wanted + 1);
        toast('Ouch. That one felt it.');
        return;
      }
    }
  }
  function shoot() {
    if (G.mode !== 'play' || G.player.inCar || !G.weapons.length) return;
    V.audio.sfx('shoot');
    var wx = G.cam.x + (G.mouse.x - 640) / G.cam.zoom;
    var wy = G.cam.y + (G.mouse.y - 360) / G.cam.zoom;
    var ang = Math.atan2(wy - G.player.y, wx - G.player.x);
    G.particles.push({ kind: 'shot', x: G.player.x, y: G.player.y, x2: G.player.x + Math.cos(ang) * 260, y2: G.player.y + Math.sin(ang) * 260, t: 0.12 });
    var best = null, bd = 1e9;
    for (var i = 0; i < G.peds.length; i++) {
      var pd = G.peds[i];
      if (pd.down > 0) continue;
      var d = dist(pd.x, pd.y, G.player.x, G.player.y);
      if (d < 280 && Math.abs(angDiff(ang, Math.atan2(pd.y - G.player.y, pd.x - G.player.x))) < 0.25 && d < bd) { bd = d; best = pd; }
    }
    if (best) { best.down = 10; setWanted(G.wanted + 1); }
    for (var j = 0; j < G.police.length; j++) {
      var pc = G.police[j];
      var d2 = dist(pc.x, pc.y, G.player.x, G.player.y);
      if (d2 < 280 && Math.abs(angDiff(ang, Math.atan2(pc.y - G.player.y, pc.x - G.player.x))) < 0.25) {
        pc.hp -= G.weapons.indexOf('smg') >= 0 ? 34 : 20;
        if (pc.hp <= 0 && !pc.dead) { pc.dead = true; setWanted(Math.min(5, G.wanted + 2)); explode(pc.x, pc.y); }
      }
    }
  }
  function startTaxi() {
    if (G.mode !== 'play' || G.player.inCar) return;
    if (G.taxi) { toast('Finish the current fare first.'); return; }
    for (var i = 0; i < world.taxis.length; i++) {
      var t = world.taxis[i];
      if (dist(t.x, t.y, G.player.x, G.player.y) < 110) {
        var dest = world.nodes[Math.floor(rng() * world.nodes.length)];
        G.taxi = { from: t, dest: dest, fare: 60 + Math.floor(rng() * 120) };
        toast('Fare picked up — drive them to the marker. Pays $' + G.taxi.fare + '.');
        V.audio.sfx('pickup');
        return;
      }
    }
    toast('No passengers here. Taxi stands are marked T on the map.');
  }

  // ---------- shops ----------
  function openShop(sh) {
    G.mode = 'shop'; G.shopKind = sh.kind;
    $('shop-title').textContent = sh.name;
    var list = $('shop-list'); list.innerHTML = '';
    function item(label, price, fn, owned) {
      var d = document.createElement('div');
      d.className = 'shop-item';
      d.innerHTML = '<span>' + label + '</span><span class="price">' + (owned ? 'OWNED' : '$' + price) + '</span>';
      d.addEventListener('click', function () { fn(); });
      list.appendChild(d);
    }
    if (sh.kind === 'gun') {
      $('shop-sub').textContent = 'Cash $' + G.cash + ' — click to buy. F / click shoots on foot.';
      item('Pistol — 20 dmg, for street work', 500, function () { buy('pistol', 500); }, G.weapons.indexOf('pistol') >= 0);
      item('SMG — 34 dmg, for loud work', 1500, function () { buy('smg', 1500); }, G.weapons.indexOf('smg') >= 0);
      item('Body Armor — +50 max health, heals full', 300, function () { buyArmor(); });
    } else if (sh.kind === 'garage') {
      $('shop-sub').textContent = 'Cash $' + G.cash + ' — buy a car, it parks right outside the garage.';
      W.CAR_MODELS.forEach(function (m, i) {
        if (m.price === 0) return;
        item(m.name + ' — top ' + m.top + ' mph', m.price, function () { buyCar(i); }, G.ownedCars.indexOf(i) >= 0);
      });
    } else if (sh.kind === 'spray') {
      $('shop-sub').textContent = "Cash $" + G.cash + " — wanted level " + G.wanted + "★. Fresh paint, clean plates.";
      item("Full respray + lose all heat", 200, function () { doSpray(); closeShop(); });
    } else if (sh.kind === 'safehouse') {
      $('shop-sub').textContent = 'Home. Heal up, save the game, plan the next job.';
      item('Sleep — heal to full + save game', 0, function () { G.health = 100; saveGame(); V.audio.sfx('mission'); toast('Rested. Game saved.'); closeShop(); });
    }
    $('shop-screen').classList.remove('hidden');
  }
  function buy(w, price) {
    if (G.weapons.indexOf(w) >= 0) { toast('Already owned.'); return; }
    if (G.cash < price) { V.audio.sfx('denied'); toast('Not enough cash.'); return; }
    G.cash -= price; G.weapons.push(w); V.audio.sfx('cash'); toast(w.toUpperCase() + ' bought. Stay safe out there.');
    closeShop();
  }
  function buyArmor() {
    if (G.cash < 300) { V.audio.sfx('denied'); toast('Not enough cash.'); return; }
    G.cash -= 300; G.health = 100; V.audio.sfx('cash'); toast('Armor on. Health full.');
    closeShop();
  }
  function buyCar(i) {
    var m = W.CAR_MODELS[i];
    if (G.ownedCars.indexOf(i) >= 0) { toast('Already in your garage.'); return; }
    if (G.cash < m.price) { V.audio.sfx('denied'); toast('Not enough cash — ' + m.name + ' is $' + m.price + '.'); return; }
    G.cash -= m.price; G.ownedCars.push(i);
    var c = makeCar(1970, 1800, 0, i, 'parked');
    G.cars.push(c);
    V.audio.sfx('cash'); toast(m.name + ' is yours — parked outside the Golden Wrench.');
    closeShop();
  }
  function closeShop() {
    if (G.mode === 'shop') G.mode = 'play';
    $('shop-screen').classList.add('hidden');
  }

  // ---------- autopilot ----------
  function toggleAutopilot() {
    if (G.mode !== 'play' || !G.player.inCar) { if (G.mode === 'play') toast('Get in a car first — then G drives you to the mission.'); return; }
    if (G.autopilot) { G.autopilot = null; G.autopilotPath = []; toast('Autopilot off.'); return; }
    // Pick a destination from the current objective (or the active fare).
    var tgt = null;
    var o = missionTarget();
    if (o && o.type === 'goto') tgt = o;
    else if (o && o.type === 'race' && G.race && G.race.cps[G.race.idx]) tgt = G.race.cps[G.race.idx];
    else if (o && o.type === 'collect') {
      var best = null, bd = 1e18;
      for (var ci = 0; ci < world.coins.length; ci++) {
        if (G.coinsGot[ci]) continue;
        var dd = dist(world.coins[ci].x, world.coins[ci].y, G.player.x, G.player.y);
        if (dd < bd) { bd = dd; best = world.coins[ci]; }
      }
      tgt = best;
    } else if (o && o.type === 'fare') {
      var bs = null, bd2 = 1e18;
      for (var ti = 0; ti < world.taxis.length; ti++) {
        var d2 = dist(world.taxis[ti].x, world.taxis[ti].y, G.player.x, G.player.y);
        if (d2 < bd2) { bd2 = d2; bs = world.taxis[ti]; }
      }
      tgt = bs;
    } else if (G.taxi) tgt = G.taxi.pickedUp ? G.taxi.dest : G.taxi.from;
    if (!tgt || tgt.x === undefined) { toast('No destination — start a mission or a fare first.'); return; }
    var from = W.nearestNode(world, G.player.x, G.player.y);
    var to = W.nearestNode(world, tgt.x, tgt.y);
    var path = W.findPath(world, from.id, to.id);
    G.autopilotPath = path.map(function (n) { return { x: n.x, y: n.y }; });
    G.autopilotPath.push({ x: tgt.x, y: tgt.y });
    G.autopilot = { idx: 0 };
    V.audio.sfx('click');
    toast('GPS autopilot engaged — sit back.');
  }

  // ---------- physics ----------
  function stepCar(c, dt, input) {
    // input: {throttle:-1..1, steer:-1..1, brake:bool}
    var accel = input.throttle * c.accel;
    c.speed += accel * dt;
    if (input.brake) c.speed *= Math.pow(0.12, dt);
    c.speed *= Math.pow(0.55, dt); // drag / rolling resistance
    if (input.throttle === 0) c.speed *= Math.pow(0.4, dt);
    c.speed = clamp(c.speed, -c.top * 0.55, c.top);
    var steerAmt = input.steer * clamp(Math.abs(c.speed) / 60, 0, 1) * (c.speed >= 0 ? 1 : -1);
    c.angle += steerAmt * 2.1 * dt * (input.brake ? 1.35 : 1);
    var nx = c.x + Math.cos(c.angle) * c.speed * dt;
    var ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (W.inWater(nx, ny)) { c.speed *= 0.4; nx = c.x; ny = c.y; }
    nx = clamp(nx, 60, WW - 60); ny = clamp(ny, 60, WH - 60);
    var hit = W.collideBuildings(world, nx, ny, 20);
    if (hit.hit) {
      if (Math.abs(c.speed) > 160 && G.time - (G._lastCrash || 0) > 0.6) {
        G._lastCrash = G.time;
        damagePlayer(Math.min(6, Math.abs(c.speed) * 0.015));
        V.audio.sfx('crash'); spawnSparks(c.x, c.y);
      }
      c.speed *= 0.55;
      nx = hit.x; ny = hit.y;
    }
    c.x = nx; c.y = ny;
    return Math.abs(c.speed);
  }
  function stepPlayer(dt) {
    var p = G.player;
    if (p.inCar && p.car) {
      var input = { throttle: 0, steer: 0, brake: false };
      if (G.autopilot) input = autopilotInput(p.car);
      else {
        if (G.keys.up) input.throttle = 1;
        if (G.keys.down) input.throttle = -0.7;
        if (G.keys.left) input.steer = -1;
        if (G.keys.right) input.steer = 1;
        if (G.keys.brake) input.brake = true;
      }
      var moved = stepCar(p.car, dt, input);
      p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle; p.speed = p.car.speed;
      G.stats.distance += moved * dt;
      if (G.autopilot && G.autopilotPath.length) {
        var wp = G.autopilotPath[G.autopilot.idx];
        if (wp && dist(p.x, p.y, wp.x, wp.y) < 40) {
          G.autopilot.idx++;
          if (G.autopilot.idx >= G.autopilotPath.length) { G.autopilot = null; G.autopilotPath = []; toast('GPS: you have arrived.'); V.audio.sfx('pickup'); }
        }
      }
      return;
    }
    // On foot.
    var dx = 0, dy = 0;
    if (G.keys.up) dy -= 1;
    if (G.keys.down) dy += 1;
    if (G.keys.left) dx -= 1;
    if (G.keys.right) dx += 1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var sp = 230;
    var nx = p.x + (dx / len) * sp * dt * (dx || dy ? 1 : 0);
    var ny = p.y + (dy / len) * sp * dt * (dx || dy ? 1 : 0);
    if (dx || dy) p.angle = Math.atan2(dy, dx);
    if (W.inWater(nx, ny)) { nx = p.x; ny = p.y; }
    nx = clamp(nx, 40, WW - 40); ny = clamp(ny, 40, WH - 40);
    var hit = W.collideBuildings(world, nx, ny, 14);
    p.x = hit.x; p.y = hit.y;
    p.speed = (dx || dy) ? sp : 0;
  }
  function autopilotInput(car) {
    var wp = G.autopilotPath[G.autopilot.idx];
    if (!wp) return { throttle: 0, steer: 0, brake: false };
    var want = Math.atan2(wp.y - car.y, wp.x - car.x);
    var d = angDiff(car.angle, want);
    // Stuck recovery: if barely moving for ~1.2s, back up and re-aim.
    if (Math.abs(car.speed) < 20) car._apStuck = (car._apStuck || 0) + 1; else car._apStuck = 0;
    if (car._apStuck > 70) {
      car._apReverse = 50; car._apStuck = 0;
    }
    if (car._apReverse > 0) {
      car._apReverse--;
      return { throttle: -0.8, steer: d > 0 ? -1 : 1, brake: false };
    }
    var dd = dist(car.x, car.y, wp.x, wp.y);
    // Slow down for turns and when closing on the waypoint.
    var input = { throttle: clamp(dd / 300, 0.3, 1), steer: clamp(d * 2.2, -1, 1), brake: false };
    if (Math.abs(d) > 0.5) { input.throttle = Math.min(input.throttle, 0.45); input.brake = Math.abs(car.speed) > 70; }
    if (dd < 130) input.throttle = Math.min(input.throttle, 0.5);
    // Sharp turn ahead at this waypoint? Nearly stop at the intersection first.
    var nxt = G.autopilotPath[G.autopilot.idx + 1];
    if (nxt) {
      var turnA = Math.abs(angDiff(Math.atan2(wp.y - car.y, wp.x - car.x), Math.atan2(nxt.y - wp.y, nxt.x - wp.x)));
      if (turnA > 0.6 && dd < 220) {
        input.throttle = Math.min(input.throttle, 0.22);
        input.brake = Math.abs(car.speed) > 45;
      }
    }
    return input;
  }
  function damagePlayer(n) {
    if (G.mode !== 'play') return;
    G.health -= n; G._lastDamage = G.time;
    if (G.health <= 0) { G.health = 0; die('Riko got wasted. The streets keep the gold — this time.'); }
  }

  // ---------- traffic / peds / police ----------
  function stepTraffic(dt) {
    for (var i = 0; i < G.traffic.length; i++) {
      var c = G.traffic[i];
      var t = world.nodes[c.target];
      var want = Math.atan2(t.y - c.y, t.x - c.x);
      var d = angDiff(c.angle, want);
      c.angle += clamp(d, -1.8 * dt, 1.8 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      var hit = W.collideBuildings(world, c.x, c.y, 18);
      c.x = hit.x; c.y = hit.y;
      if (dist(c.x, c.y, t.x, t.y) < 24) {
        c.node = c.target;
        var nb = world.adj[c.node];
        c.target = nb[Math.floor(rng() * nb.length)];
      }
      // Gentle separation from the player car.
      var p = G.player;
      if (p.inCar && p.car) {
        var dd = dist(c.x, c.y, p.car.x, p.car.y);
        if (dd < 44 && dd > 0.01) {
          var push = (44 - dd) / 2;
          c.x += (c.x - p.car.x) / dd * push; c.y += (c.y - p.car.y) / dd * push;
          if (Math.abs(p.car.speed) > 90 && G.time - (G._lastCrash || 0) > 0.6) { G._lastCrash = G.time; V.audio.sfx('crash'); damagePlayer(3); c.speed *= 0.6; }
        }
      }
    }
  }
  function stepPeds(dt) {
    for (var i = 0; i < G.peds.length; i++) {
      var pd = G.peds[i];
      if (pd.down > 0) { pd.down -= dt; continue; }
      var px = G.player.x, py = G.player.y;
      var dPlayer = dist(pd.x, pd.y, px, py);
      if (dPlayer < 130 && G.player.inCar && Math.abs(G.player.speed) > 40) pd.flee = 1.5;
      if (pd.flee > 0) {
        pd.flee -= dt;
        var fa = Math.atan2(pd.y - py, pd.x - px);
        pd.x += Math.cos(fa) * 150 * dt; pd.y += Math.sin(fa) * 150 * dt;
        pd.angle = fa;
      } else {
        if (pd.wait > 0) { pd.wait -= dt; continue; }
        var want = Math.atan2(pd.ty - pd.y, pd.tx - pd.x);
        pd.angle += clamp(angDiff(pd.angle, want), -3 * dt, 3 * dt);
        pd.x += Math.cos(pd.angle) * pd.speed * dt;
        pd.y += Math.sin(pd.angle) * pd.speed * dt;
        var hit = W.collideBuildings(world, pd.x, pd.y, 10);
        pd.x = hit.x; pd.y = hit.y;
        if (dist(pd.x, pd.y, pd.tx, pd.ty) < 18) {
          pd.wait = 1 + rng() * 4;
          var n = world.nodes[Math.floor(rng() * world.nodes.length)];
          pd.tx = n.x + (rng() - 0.5) * 200; pd.ty = n.y + (rng() - 0.5) * 200;
        }
      }
      // Player car hitting a ped.
      if (G.player.inCar && dPlayer < 26 && Math.abs(G.player.speed) > 70 && pd.down <= 0) {
        pd.down = 8; setWanted(G.wanted + 1); V.audio.sfx('crash');
        toast('Hit and run! The PD saw that.');
      }
    }
  }
  function stepPolice(dt) {
    var want = G.wanted;
    var target = want === 0 ? 0 : want === 1 ? 1 : want === 2 ? 2 : want === 3 ? 3 : 4;
    while (G.police.length < target) {
      var a = rng() * Math.PI * 2;
      var pc = makeCar(G.player.x + Math.cos(a) * 600, G.player.y + Math.sin(a) * 600, a, 0, 'police');
      pc.color = '#e8e8e8'; pc.top = 190 + want * 12; pc.accel = 520; pc.speed = 120;
      var hit = W.collideBuildings(world, pc.x, pc.y, 20);
      pc.x = hit.x; pc.y = hit.y;
      G.police.push(pc);
    }
    while (G.police.length > target) G.police.pop();
    var p = G.player;
    for (var i = 0; i < G.police.length; i++) {
      var c = G.police[i];
      if (c.dead) continue;
      var wantA = Math.atan2(p.y - c.y, p.x - c.x);
      var d = angDiff(c.angle, wantA);
      var input = { throttle: 1, steer: clamp(d * 1.8, -1, 1), brake: Math.abs(d) > 2.2 };
      stepCar(c, dt, input);
      var dd = dist(c.x, c.y, p.x, p.y);
      if (dd < 46) {
        if (p.inCar && p.car) { p.car.speed *= 0.85; damagePlayer(2 * dt * 10); }
        else damagePlayer(6 * dt);
        if (dd < 40 && !p.inCar) { die('Busted by the Velmara PD.'); return; }
      }
      c.stuck += dt;
    }
    // Helicopter at 4+ stars.
    if (want >= 4) {
      if (!G.heli) G.heli = { x: p.x, y: p.y - 200 };
      G.heli.x = lerp(G.heli.x, p.x, 1 - Math.pow(0.05, dt));
      G.heli.y = lerp(G.heli.y, p.y, 1 - Math.pow(0.05, dt));
    } else G.heli = null;
    // Wanted decay: out of sight of all police.
    var nearest = 1e9;
    for (var j = 0; j < G.police.length; j++) nearest = Math.min(nearest, dist(G.police[j].x, G.police[j].y, p.x, p.y));
    if (G.police.length === 0) nearest = 1e9;
    if (nearest > 650 && want > 0) {
      G.sightTimer += dt;
      if (G.sightTimer > 5) { setWanted(want - 1); G.sightTimer = 0; toast('Heat dropping… ' + G.wanted + '★ left.'); }
    } else G.sightTimer = 0;
    G.sirenOn = want > 0;
  }

  // ---------- coins / taxi / race / evade ----------
  function stepCollect() {
    var p = G.player;
    for (var i = 0; i < world.coins.length; i++) {
      if (G.coinsGot[i]) continue;
      var c = world.coins[i];
      if (dist(c.x, c.y, p.x, p.y) < 42) {
        G.coinsGot[i] = true; G.stats.coins++; G.cash += 150;
        V.audio.sfx('coin'); spawnSparks(c.x, c.y);
        toast('Gold coin! +$150  (' + G.stats.coins + '/24)');
        var o = missionTarget();
        if (o && o.type === 'collect' && !G.pending) {
          G.coinsMission++;
          if (G.coinsMission >= o.count) completeObjective();
        }
        saveGame();
      }
    }
  }
  function stepTaxi(dt) {
    if (!G.taxi) return;
    var t = G.taxi;
    if (!t.pickedUp) {
      // Passenger waits at the stand; player must be in a car near them.
      if (G.player.inCar && dist(t.from.x, t.from.y, G.player.x, G.player.y) < 90) { t.pickedUp = true; toast('Passenger aboard — take them to the marker.'); }
      return;
    }
    if (dist(t.dest.x, t.dest.y, G.player.x, G.player.y) < 80) {
      G.cash += t.fare; G.stats.fares++;
      V.audio.sfx('cash');
      toast('Fare complete — +$' + t.fare);
      var o = missionTarget();
      if (o && o.type === 'fare' && !G.pending) {
        G.fareMission += t.fare;
        if (G.fareMission >= o.amount) completeObjective();
      }
      G.taxi = null;
      saveGame();
    }
  }
  function stepRace(dt) {
    var o = missionTarget();
    if (!o || o.type !== 'race' || !G.race) return;
    G.raceTimer -= dt;
    var cp = G.race.cps[G.race.idx];
    if (cp && dist(cp.x, cp.y, G.player.x, G.player.y) < 75) {
      G.race.idx++; V.audio.sfx('pickup');
      if (G.race.idx >= G.race.cps.length) {
        G.stats.races++;
        toast('Race won!', 3000);
        completeObjective();
        return;
      }
    }
    if (G.raceTimer <= 0) {
      V.audio.sfx('denied');
      toast('Race lost — the clock beat you. Try again!');
      startMission(G.missionIdx, false);
    }
  }
  function stepEvade(dt) {
    var o = missionTarget();
    if (!o || o.type !== 'evade') return;
    if (G.wanted === 0) { completeObjective(); }
  }
  function stepMission(dt) {
    if (G.pending) return;
    var o = missionTarget();
    if (!o) return;
    var p = G.player;
    if (o.type === 'goto') {
      if (dist(o.x, o.y, p.x, p.y) < o.r) {
        if (o.x === 1970 && o.y === 520 && G.missionIdx === 8) setWanted(3);
        completeObjective();
      }
    } else if (o.type === 'evade') stepEvade(dt);
    else if (o.type === 'race') stepRace(dt);
  }

  // ---------- particles ----------
  function spawnSparks(x, y) {
    for (var i = 0; i < 10; i++) G.particles.push({ kind: 'spark', x: x, y: y, vx: (rng() - 0.5) * 260, vy: (rng() - 0.5) * 260, t: 0.5, max: 0.5 });
  }
  function explode(x, y) {
    for (var i = 0; i < 26; i++) G.particles.push({ kind: 'fire', x: x, y: y, vx: (rng() - 0.5) * 420, vy: (rng() - 0.5) * 420, t: 0.9, max: 0.9 });
    V.audio.sfx('crash');
  }
  function spawnFirework() {
    var fx = G.player.x + (rng() - 0.5) * 900, fy = G.player.y + (rng() - 0.5) * 460;
    var col = ['#f5c542', '#ff2e88', '#22d3ee', '#a5e34a'][Math.floor(rng() * 4)];
    for (var i = 0; i < 22; i++) {
      var a = (i / 22) * Math.PI * 2;
      G.fireworks.push({ x: fx, y: fy, vx: Math.cos(a) * (60 + rng() * 160), vy: Math.sin(a) * (60 + rng() * 160), t: 1.2, max: 1.2, color: col });
    }
  }

  // ---------- update ----------
  var lastT = 0;
  function update(dt) {
    G.time += dt;
    G.clockMin = (G.clockMin + dt * 1.35) % 1440;
    G.flash += dt;
    stepPlayer(dt);
    stepTraffic(dt);
    stepPeds(dt);
    stepPolice(dt);
    stepCollect();
    stepTaxi(dt);
    stepMission(dt);
    // Slow health regen when out of trouble for a while.
    if (G.health > 0 && G.health < 100 && G.time - (G._lastDamage || 0) > 6) G.health = Math.min(100, G.health + 2 * dt);
    // Camera follows the player, slight zoom-out at speed.
    var p = G.player;
    var zoom = 1 - Math.min(0.16, Math.abs(p.speed || 0) / 1400);
    G.cam.zoom = lerp(G.cam.zoom, zoom, 1 - Math.pow(0.02, dt));
    G.cam.x = lerp(G.cam.x, clamp(p.x, 640 / zoom, WW - 640 / zoom), 1 - Math.pow(0.001, dt));
    G.cam.y = lerp(G.cam.y, clamp(p.y, 360 / zoom, WH - 360 / zoom), 1 - Math.pow(0.001, dt));
    // Particles.
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var pt = G.particles[i];
      pt.t -= dt;
      if (pt.t <= 0) { G.particles.splice(i, 1); continue; }
      if (pt.vx !== undefined) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; }
    }
    for (var j = G.fireworks.length - 1; j >= 0; j--) {
      var fw = G.fireworks[j];
      fw.t -= dt; fw.x += fw.vx * dt; fw.y += fw.vy * dt; fw.vy += 60 * dt;
      if (fw.t <= 0) G.fireworks.splice(j, 1);
    }
    // Audio follows the game.
    var inCar = p.inCar && p.car;
    V.audio.engine(inCar ? Math.abs(p.speed) / (p.car ? p.car.top : 150) : 0, !!inCar);
    V.audio.siren(G.sirenOn, dt);
    // Finale shot keeps fireworks going for the camera.
    if (SHOT === 'end' && rng() < dt * 2.5) spawnFirework();
    // HUD.
    el('cash-v', String(G.cash));
    el('clock', fmtClock());
    el('district', W.districtAt(p.x, p.y).name);
    el('radio', 'RADIO: ' + V.audio.stationName() + ' · R for station');
    el('speed', String(Math.round(Math.abs(p.speed || 0) * 0.45)));
    var cn = p.inCar && p.car ? W.CAR_MODELS[p.car.model].name.toUpperCase() : 'ON FOOT';
    el('carname', cn);
    $('healthfill').style.width = Math.max(0, G.health) + '%';
    updateMissionHUD();
  }
  function fmtClock() {
    var h = Math.floor(G.clockMin / 60), m = Math.floor(G.clockMin % 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // ---------- render ----------
  function nightAlpha() {
    var h = G.clockMin / 60;
    if (h >= 20 || h < 5.5) return 0.42;
    if (h >= 5.5 && h < 7) return 0.42 * (1 - (h - 5.5) / 1.5);
    if (h >= 18.5 && h < 20) return 0.42 * ((h - 18.5) / 1.5);
    return 0;
  }
  function goldenAlpha() {
    var h = G.clockMin / 60;
    if (h >= 16.5 && h < 18.5) return 0.10 * (1 - Math.abs(h - 17.5) / 1);
    return 0;
  }
  function render() {
    var cam = G.cam;
    var vw = 1280 / cam.zoom, vh = 720 / cam.zoom;
    var ox = cam.x - vw / 2, oy = cam.y - vh / 2;
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-ox, -oy);
    var night = nightAlpha();
    // Ground: district grass.
    for (var d = 0; d < W.DISTRICTS.length; d++) {
      var D = W.DISTRICTS[d];
      ctx.fillStyle = D.grass;
      ctx.fillRect(D.x0, D.y0, D.x1 - D.x0, D.y1 - D.y0);
    }
    // Water: west harbor strip.
    var wg = ctx.createLinearGradient(0, 0, 140, 0);
    wg.addColorStop(0, '#123a5c'); wg.addColorStop(1, '#1d5a7a');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, 130, WH);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2;
    for (var wy = 60; wy < WH; wy += 120) {
      ctx.beginPath(); ctx.moveTo(18, wy); ctx.lineTo(112, wy + 18); ctx.stroke();
    }
    // Parks.
    for (var pi = 0; pi < world.parks.length; pi++) {
      var pk = world.parks[pi];
      ctx.fillStyle = '#3c6b3f'; ctx.fillRect(pk.x - pk.w / 2, pk.y - pk.h / 2, pk.w, pk.h);
      ctx.fillStyle = '#2f5a33';
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Math.min(pk.w, pk.h) / 4, 0, Math.PI * 2); ctx.fill();
    }
    // Roads.
    ctx.fillStyle = '#2b2f36';
    for (var vi = 0; vi < W.ROADS_V.length; vi++) ctx.fillRect(W.ROADS_V[vi] - W.ROAD_W / 2, 0, W.ROAD_W, WH);
    for (var hi = 0; hi < W.ROADS_H.length; hi++) ctx.fillRect(0, W.ROADS_H[hi] - W.ROAD_W / 2, WW, W.ROAD_W);
    // Sidewalk edges.
    ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 5;
    for (var vj = 0; vj < W.ROADS_V.length; vj++) {
      ctx.beginPath(); ctx.moveTo(W.ROADS_V[vj] - W.ROAD_W / 2, 0); ctx.lineTo(W.ROADS_V[vj] - W.ROAD_W / 2, WH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W.ROADS_V[vj] + W.ROAD_W / 2, 0); ctx.lineTo(W.ROADS_V[vj] + W.ROAD_W / 2, WH); ctx.stroke();
    }
    // Lane dashes.
    ctx.strokeStyle = 'rgba(245,197,66,.75)'; ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    for (var vk = 0; vk < W.ROADS_V.length; vk++) { ctx.beginPath(); ctx.moveTo(W.ROADS_V[vk], 0); ctx.lineTo(W.ROADS_V[vk], WH); ctx.stroke(); }
    for (var hk = 0; hk < W.ROADS_H.length; hk++) { ctx.beginPath(); ctx.moveTo(0, W.ROADS_H[hk]); ctx.lineTo(WW, W.ROADS_H[hk]); ctx.stroke(); }
    ctx.setLineDash([]);
    // Buildings with sun shadows.
    var sunA = (G.clockMin / 1440) * Math.PI * 2;
    var shx = Math.cos(sunA) * 10, shy = Math.sin(sunA) * 8 + 6;
    for (var bi = 0; bi < world.buildings.length; bi++) {
      var b = world.buildings[bi];
      if (b.x + b.w < ox - 60 || b.x > ox + vw + 60 || b.y + b.h < oy - 60 || b.y > oy + vh + 60) continue;
      ctx.fillStyle = 'rgba(0,0,0,.30)';
      ctx.fillRect(b.x + shx, b.y + shy, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, Math.min(14, b.h - 12));
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 6, 16, 12);
      if (b.neon && night > 0.1) {
        ctx.fillStyle = (Math.floor(G.time * 2) % 2 === 0) ? '#ff2e88' : '#22d3ee';
        ctx.fillRect(b.x + 4, b.y + b.h - 10, b.w - 8, 5);
      }
      if (night > 0.2) {
        ctx.fillStyle = 'rgba(255,214,120,.85)';
        for (var wn = 0; wn < 3; wn++) ctx.fillRect(b.x + 10 + wn * ((b.w - 20) / 3), b.y + 10, 8, 10);
      }
    }
    // Trees.
    for (var ti = 0; ti < world.trees.length; ti++) {
      var tr = world.trees[ti];
      if (tr.x < ox - 40 || tr.x > ox + vw + 40 || tr.y < oy - 40 || tr.y > oy + vh + 40) continue;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.arc(tr.x + 5, tr.y + 6, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tr.palm ? '#3f8a4f' : '#2f6b3a';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.arc(tr.x - tr.r / 3, tr.y - tr.r / 3, tr.r / 2, 0, Math.PI * 2); ctx.fill();
    }
    // Shops, races, taxi stands.
    for (var si = 0; si < world.shops.length; si++) drawMarker(world.shops[si], '◆');
    for (var ri = 0; ri < world.races.length; ri++) drawMarker({ x: world.races[ri].x, y: world.races[ri].y, color: '#ff2e88', name: world.races[ri].name }, '🏁');
    for (var xi = 0; xi < world.taxis.length; xi++) drawMarker({ x: world.taxis[xi].x, y: world.taxis[xi].y, color: '#f5c542', name: 'TAXI' }, 'T');
    // Coins.
    for (var ci = 0; ci < world.coins.length; ci++) {
      if (G.coinsGot[ci]) continue;
      var cn = world.coins[ci];
      var bob = Math.sin(G.time * 3 + ci) * 3;
      ctx.fillStyle = 'rgba(245,197,66,.25)';
      ctx.beginPath(); ctx.arc(cn.x, cn.y + bob, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5c542'; ctx.strokeStyle = '#8a6d1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cn.x, cn.y + bob, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8a6d1a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', cn.x, cn.y + bob + 1);
    }
    // Mission marker + race checkpoints + taxi destination.
    var o = missionTarget();
    if (o && o.type === 'goto') drawBeacon(o.x, o.y, '#f5c542');
    if (o && o.type === 'race' && G.race) {
      var cp = G.race.cps[G.race.idx];
      if (cp) drawBeacon(cp.x, cp.y, '#ff2e88');
    }
    if (G.taxi && G.taxi.pickedUp) drawBeacon(G.taxi.dest.x, G.taxi.dest.y, '#4ac9a2');
    if (G.taxi && !G.taxi.pickedUp) drawBeacon(G.taxi.from.x, G.taxi.from.y, '#f5c542');
    // Parked cars.
    for (var pc = 0; pc < G.cars.length; pc++) drawCar(G.cars[pc]);
    // Traffic.
    for (var tc = 0; tc < G.traffic.length; tc++) drawCar(G.traffic[tc]);
    // Police.
    for (var po = 0; po < G.police.length; po++) if (!G.police[po].dead) drawCar(G.police[po], true);
    // Peds.
    for (var pd = 0; pd < G.peds.length; pd++) {
      var pdd = G.peds[pd];
      if (pdd.down > 0) {
        ctx.fillStyle = pdd.color; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.ellipse(pdd.x, pdd.y, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.arc(pdd.x + 2, pdd.y + 3, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pdd.color;
      ctx.beginPath(); ctx.arc(pdd.x, pdd.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath(); ctx.arc(pdd.x + Math.cos(pdd.angle) * 3, pdd.y + Math.sin(pdd.angle) * 3, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Player.
    var pl = G.player;
    if (pl.inCar && pl.car) drawCar(pl.car, false, true);
    else {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.arc(pl.x + 2, pl.y + 3, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d5a7a';
      ctx.beginPath(); ctx.arc(pl.x, pl.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5c542';
      ctx.beginPath(); ctx.arc(pl.x + Math.cos(pl.angle) * 5, pl.y + Math.sin(pl.angle) * 5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, 15, 0, Math.PI * 2); ctx.stroke();
    }
    // Helicopter + searchlight.
    if (G.heli) {
      var hx = G.heli.x, hy = G.heli.y;
      ctx.fillStyle = 'rgba(255,255,220,.10)';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(pl.x - 40, pl.y); ctx.lineTo(pl.x + 40, pl.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(hx + 6, hy + 8, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a4a5a';
      ctx.beginPath(); ctx.ellipse(hx, hy, 30, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9d6e2'; ctx.lineWidth = 3;
      var ra = G.time * 22;
      ctx.beginPath(); ctx.moveTo(hx - Math.cos(ra) * 42, hy - Math.sin(ra) * 42); ctx.lineTo(hx + Math.cos(ra) * 42, hy + Math.sin(ra) * 42); ctx.stroke();
    }
    // Particles.
    for (var pt = 0; pt < G.particles.length; pt++) {
      var ptt = G.particles[pt];
      if (ptt.kind === 'shot') {
        ctx.strokeStyle = 'rgba(255,220,120,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ptt.x, ptt.y); ctx.lineTo(ptt.x2, ptt.y2); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.max(0, ptt.t / ptt.max);
        ctx.fillStyle = ptt.kind === 'fire' ? '#ff7a3c' : '#ffd94d';
        ctx.beginPath(); ctx.arc(ptt.x, ptt.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // Fireworks (screen space, drawn in world coords near player).
    for (var fw = 0; fw < G.fireworks.length; fw++) {
      var f = G.fireworks[fw];
      ctx.globalAlpha = Math.max(0, f.t / f.max);
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Night + golden hour overlays (screen space).
    if (night > 0.01) { ctx.fillStyle = 'rgba(8,12,42,' + night + ')'; ctx.fillRect(0, 0, 1280, 720); }
    var ga = goldenAlpha();
    if (ga > 0.005) { ctx.fillStyle = 'rgba(255,150,60,' + ga + ')'; ctx.fillRect(0, 0, 1280, 720); }
    // Headlight glow at night around the player car.
    if (night > 0.15 && pl.inCar && pl.car) {
      var sx = (pl.x - ox) * cam.zoom, sy = (pl.y - oy) * cam.zoom;
      var hg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220);
      hg.addColorStop(0, 'rgba(255,240,180,.20)'); hg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = hg; ctx.fillRect(sx - 220, sy - 220, 440, 440);
    }
    drawMinimap();
  }
  function drawMarker(s, glyph) {
    var pulse = 1 + Math.sin(G.time * 3) * 0.08;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 13 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d0f14'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, s.x, s.y + 0.5);
  }
  function drawBeacon(x, y, color) {
    var pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 42 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color; ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(x, y, 42 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    var d = Math.round(dist(x, y, G.player.x, G.player.y));
    ctx.fillText(d + 'm', x, y - 56);
  }
  function drawCar(c, isPolice, isPlayer) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.fillRect(-19, -11 + 4, 44, 26);
    // Body.
    ctx.fillStyle = c.color;
    roundRect(-20, -12, 44, 24, 7); ctx.fill();
    if (isPolice) {
      ctx.fillStyle = '#111'; roundRect(-20, -12, 18, 24, 7); ctx.fill();
      ctx.fillStyle = '#e8e8e8'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PD', 2, 3);
      var fl = Math.floor(G.flash * 4) % 2 === 0;
      ctx.fillStyle = fl ? '#ff2e2e' : '#2e7dff';
      ctx.fillRect(-4, -15, 8, 5);
    }
    // Windshield + roof.
    ctx.fillStyle = 'rgba(20,30,45,.85)';
    roundRect(-6, -9, 10, 18, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRect(8, -9, 9, 18, 3); ctx.fill();
    // Wheels.
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-15, -15, 9, 5); ctx.fillRect(-15, 10, 9, 5);
    ctx.fillRect(8, -15, 9, 5); ctx.fillRect(8, 10, 9, 5);
    // Headlights at night.
    if (nightAlpha() > 0.15) {
      ctx.fillStyle = 'rgba(255,244,190,.95)';
      ctx.fillRect(23, -9, 3, 4); ctx.fillRect(23, 5, 3, 4);
    }
    if (c.brake) {
      ctx.fillStyle = '#ff2e2e';
      ctx.fillRect(-23, -9, 3, 4); ctx.fillRect(-23, 5, 3, 4);
    }
    if (isPlayer) {
      ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(2, 0, 30, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawMinimap() {
    var s = 220 / WW, sy = 160 / WH;
    mmc.fillStyle = '#0a0d12'; mmc.fillRect(0, 0, 220, 160);
    mmc.fillStyle = '#1c2733'; mmc.fillRect(0, 0, 8 * s * 10, 160);
    for (var d = 0; d < W.DISTRICTS.length; d++) {
      var D = W.DISTRICTS[d];
      mmc.fillStyle = '#22303a';
      mmc.fillRect(D.x0 * s, D.y0 * sy, (D.x1 - D.x0) * s, (D.y1 - D.y0) * sy);
    }
    mmc.strokeStyle = '#5a6a7a'; mmc.lineWidth = 1;
    for (var vi = 0; vi < W.ROADS_V.length; vi++) { mmc.beginPath(); mmc.moveTo(W.ROADS_V[vi] * s, 0); mmc.lineTo(W.ROADS_V[vi] * s, 160); mmc.stroke(); }
    for (var hi = 0; hi < W.ROADS_H.length; hi++) { mmc.beginPath(); mmc.moveTo(0, W.ROADS_H[hi] * sy); mmc.lineTo(220, W.ROADS_H[hi] * sy); mmc.stroke(); }
    for (var ci = 0; ci < world.coins.length; ci++) {
      if (G.coinsGot[ci]) continue;
      mmc.fillStyle = '#f5c542';
      mmc.fillRect(world.coins[ci].x * s - 1, world.coins[ci].y * sy - 1, 2, 2);
    }
    for (var si = 0; si < world.shops.length; si++) {
      mmc.fillStyle = world.shops[si].color;
      mmc.fillRect(world.shops[si].x * s - 2, world.shops[si].y * sy - 2, 4, 4);
    }
    var o = missionTarget();
    if (o && (o.type === 'goto' || o.type === 'race')) {
      var tx = o.type === 'goto' ? o.x : (G.race ? G.race.cps[G.race.idx].x : o.x);
      var ty = o.type === 'goto' ? o.y : (G.race ? G.race.cps[G.race.idx].y : o.y);
      var pr = 4 + Math.sin(G.time * 5) * 1.5;
      mmc.fillStyle = '#ff2e88';
      mmc.beginPath(); mmc.arc(tx * s, ty * sy, pr, 0, Math.PI * 2); mmc.fill();
    }
    for (var po = 0; po < G.police.length; po++) {
      mmc.fillStyle = '#ff4040';
      mmc.beginPath(); mmc.arc(G.police[po].x * s, G.police[po].y * sy, 3, 0, Math.PI * 2); mmc.fill();
    }
    // Player arrow.
    var px = G.player.x * s, py = G.player.y * sy;
    mmc.save();
    mmc.translate(px, py); mmc.rotate(G.player.angle);
    mmc.fillStyle = '#f5c542';
    mmc.beginPath(); mmc.moveTo(7, 0); mmc.lineTo(-5, -5); mmc.lineTo(-5, 5); mmc.closePath(); mmc.fill();
    mmc.restore();
    mmc.strokeStyle = 'rgba(245,197,66,.5)'; mmc.strokeRect(0.5, 0.5, 219, 159);
  }

  // ---------- shot modes ----------
  function applyShot() {
    if (G.shotApplied) return;
    G.shotApplied = true;
    resetWorld();
    if (SHOT === 'play') {
      G.mode = 'play';
      $('title-screen').classList.add('hidden');
      G.clockMin = 17 * 60 + 30;
      var c = makeCar(1620, 1120, 0, 0, 'player');
      G.player.car = c; G.player.inCar = true; G.player.x = c.x; G.player.y = c.y; G.player.angle = 0;
      G.cam.x = c.x; G.cam.y = c.y;
      G.missionIdx = 1; G.objIdx = 0;
      G.cash = 1250;
      G.keys.up = true; // rolling shot: car cruises down Gold Row
      updateMissionHUD();
    } else if (SHOT === 'chase') {
      G.mode = 'play';
      $('title-screen').classList.add('hidden');
      G.clockMin = 21 * 60 + 30;
      var c2 = makeCar(1620, 2020, Math.PI / 2, 4, 'player');
      G.player.car = c2; G.player.inCar = true; G.player.x = c2.x; G.player.y = c2.y; G.player.angle = Math.PI / 2; c2.speed = 180;
      G.cam.x = c2.x; G.cam.y = c2.y;
      G.missionIdx = 9; G.objIdx = 0;
      setWanted(4);
      G.cash = 4200;
      G.keys.up = true; // rolling shot: fleeing down the Neon Mile
      updateMissionHUD();
    } else if (SHOT === 'end') {
      G.mode = 'play';
      $('title-screen').classList.add('hidden');
      G.clockMin = 20 * 60;
      var c3 = makeCar(3370, 2320, -Math.PI / 2, 7, 'player');
      G.player.car = c3; G.player.inCar = true; G.player.x = c3.x; G.player.y = c3.y; G.player.angle = -Math.PI / 2;
      G.cam.x = c3.x; G.cam.y = c3.y;
      G.cash = 25000; G.stats.coins = 24; G.stats.missions = 12;
      for (var i = 0; i < 60; i++) spawnFirework();
      setWanted(0);
      G.finaleHud = true;
      updateMissionHUD();
    }
  }

  // ---------- loop ----------
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (G.mode === 'play') update(dt);
    render();
    if (!window.__velmaraReady) window.__velmaraReady = true;
  }

  // ---------- boot ----------
  resetWorld();
  setWanted(0);
  el('cash-v', String(G.cash));
  if (SHOT) applyShot();
  else {
    try {
      var hasSave = !!localStorage.getItem('velmara-v7-save');
      $('btn-continue').style.display = hasSave ? '' : 'none';
    } catch (e) { $('btn-continue').style.display = 'none'; }
  }
  updateMissionHUD();
  requestAnimationFrame(loop);

  // Debug / test hook for headless verification.
  window.__V = {
    G: G, world: world,
    state: function () {
      return { mode: G.mode, cash: G.cash, wanted: G.wanted, health: G.health,
        missionIdx: G.missionIdx, objIdx: G.objIdx, px: Math.round(G.player.x), py: Math.round(G.player.y),
        inCar: G.player.inCar, speed: Math.round(G.player.speed || 0),
        coins: G.stats.coins, missions: G.stats.missions, clock: fmtClock(),
        ap: !!G.autopilot, objLabel: (function () { var o = missionTarget(); return o ? o.label : ''; })() };
    },
    start: function () { V.audio.init(); startNewGame(); },
    begin: function () { beginMissionObjectives(); },
    autopilot: function () { toggleAutopilot(); },
    teleport: function (x, y) { G.player.x = x; G.player.y = y; if (G.player.car) { G.player.car.x = x; G.player.car.y = y; } G.cam.x = x; G.cam.y = y; },
    pressKey: function (code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code })); window.dispatchEvent(new KeyboardEvent('keyup', { code: code })); }
  };
})();
