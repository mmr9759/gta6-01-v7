// VELMARA world: deterministic city generation, road graph, collision, districts.
var V = window.V || (window.V = {});
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var WORLD_W = 3600, WORLD_H = 2600, ROAD_W = 96;
  var ROADS_V = [220, 570, 920, 1270, 1620, 1970, 2320, 2670, 3020, 3370];
  var ROADS_H = [220, 520, 820, 1120, 1420, 1720, 2020, 2320];

  var DISTRICTS = [
    { name: 'OLD HARBOR', x0: 0, y0: 0, x1: 1150, y1: 1250, grass: '#4a6b4f', roof: ['#7a5a44', '#5d6b7a', '#8a6d4b'] },
    { name: 'GOLD ROW', x0: 1150, y0: 0, x1: 2450, y1: 1250, grass: '#55703f', roof: ['#c9a227', '#b08d2e', '#d4af37'] },
    { name: 'PALM HEIGHTS', x0: 2450, y0: 0, x1: 3600, y1: 1250, grass: '#4d7a52', roof: ['#e8e0d0', '#c97b4a', '#7a9ab0'] },
    { name: 'THE DOCKS', x0: 0, y0: 1250, x1: 1150, y1: 2600, grass: '#5a5a48', roof: ['#6b5a4a', '#4a5a6b', '#7a7a6b'] },
    { name: 'NEON MILE', x0: 1150, y0: 1250, x1: 2450, y1: 2600, grass: '#3f4a3f', roof: ['#8a2be2', '#ff2e88', '#22d3ee'] },
    { name: 'LITTLE VELMARA', x0: 2450, y0: 1250, x1: 3600, y1: 1950, grass: '#6b7a45', roof: ['#d96b4a', '#e8b64a', '#a34a6b'] },
    { name: 'THE STRIP', x0: 2450, y0: 1950, x1: 3600, y1: 2600, grass: '#4a5a3f', roof: ['#ffd24a', '#ff7a3c', '#3ca2ff'] }
  ];

  var CAR_MODELS = [
    { name: 'Velmara Comet', color: '#d94a3c', top: 150, accel: 420, price: 0 },
    { name: 'Harbor Taxi', color: '#f5c542', top: 140, accel: 380, price: 0 },
    { name: 'Neon Phantom', color: '#22d3ee', top: 175, accel: 480, price: 4500 },
    { name: 'Gold Sovereign', color: '#e8c832', top: 165, accel: 450, price: 8000 },
    { name: 'Strip Stallion', color: '#ff7a3c', top: 190, accel: 520, price: 14000 },
    { name: 'Marisol Cruiser', color: '#c94a8a', top: 160, accel: 440, price: 6000 },
    { name: 'Dock Hauler', color: '#7a8a9a', top: 120, accel: 330, price: 2500 },
    { name: 'Velvet Falcon', color: '#2b2f3a', top: 210, accel: 580, price: 25000 }
  ];

  function districtAt(x, y) {
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
    }
    return DISTRICTS[1];
  }

  function genWorld(seed) {
    var rnd = mulberry32(seed);
    var W = { seed: seed, buildings: [], trees: [], coins: [], nodes: [], adj: {}, shops: [], races: [], taxis: [], parks: [] };
    // Road graph nodes at every intersection.
    var id = 0;
    for (var vi = 0; vi < ROADS_V.length; vi++) {
      for (var hi = 0; hi < ROADS_H.length; hi++) {
        W.nodes.push({ id: id, x: ROADS_V[vi], y: ROADS_H[hi], vi: vi, hi: hi });
        W.adj[id] = [];
        id++;
      }
    }
    function nodeAt(vi, hi) { return W.nodes[vi * ROADS_H.length + hi]; }
    for (var v2 = 0; v2 < ROADS_V.length; v2++) {
      for (var h2 = 0; h2 < ROADS_H.length; h2++) {
        var n = nodeAt(v2, h2);
        if (v2 > 0) W.adj[n.id].push(nodeAt(v2 - 1, h2).id);
        if (v2 < ROADS_V.length - 1) W.adj[n.id].push(nodeAt(v2 + 1, h2).id);
        if (h2 > 0) W.adj[n.id].push(nodeAt(v2, h2 - 1).id);
        if (h2 < ROADS_H.length - 1) W.adj[n.id].push(nodeAt(v2, h2 + 1).id);
      }
    }
    // Buildings fill each block between roads.
    for (var bi = 0; bi < ROADS_V.length - 1; bi++) {
      for (var bj = 0; bj < ROADS_H.length - 1; bj++) {
        var x0 = ROADS_V[bi] + ROAD_W / 2 + 14, x1 = ROADS_V[bi + 1] - ROAD_W / 2 - 14;
        var y0 = ROADS_H[bj] + ROAD_W / 2 + 14, y1 = ROADS_H[bj + 1] - ROAD_W / 2 - 14;
        var d = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
        var nB = 1 + Math.floor(rnd() * 3);
        if (rnd() < 0.12) { W.parks.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }); continue; }
        for (var k = 0; k < nB; k++) {
          var bw = 60 + rnd() * 130, bh = 50 + rnd() * 110;
          var bx = x0 + rnd() * Math.max(1, (x1 - x0) - bw);
          var by = y0 + rnd() * Math.max(1, (y1 - y0) - bh);
          var roof = d.roof[Math.floor(rnd() * d.roof.length)];
          W.buildings.push({ x: bx, y: by, w: bw, h: bh, roof: roof, neon: d.name === 'NEON MILE' && rnd() < 0.5, hgt: 8 + rnd() * 22 });
        }
        // Palm / street trees around the block.
        var nT = 2 + Math.floor(rnd() * 4);
        for (var t = 0; t < nT; t++) {
          W.trees.push({ x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0), r: 9 + rnd() * 7, palm: d.name === 'PALM HEIGHTS' || d.name === 'THE STRIP' });
        }
      }
    }
    // 24 gold coins spread across districts, always on roads or plazas.
    var coinSpots = [];
    for (var c = 0; c < 24; c++) {
      var cx = ROADS_V[Math.floor(rnd() * ROADS_V.length)] + (rnd() - 0.5) * 60;
      var cy = ROADS_H[Math.floor(rnd() * ROADS_H.length)] + (rnd() - 0.5) * 60;
      coinSpots.push({ x: cx, y: cy });
    }
    W.coins = coinSpots;
    // Shops: gun shop, garage, Pay N Spray, safehouse, plus race starts and taxi stands.
    W.shops = [
      { kind: 'gun', name: 'IRON & LEAD GUN SHOP', x: 1270, y: 520, color: '#c94a4a' },
      { kind: 'garage', name: 'GOLDEN WRENCH GARAGE', x: 1970, y: 1720, color: '#f5c542' },
      { kind: 'spray', name: "PAY N' SPRAY", x: 920, y: 2020, color: '#4ac9a2' },
      { kind: 'safehouse', name: 'RIKO SAFEHOUSE', x: 3020, y: 820, color: '#8a6fd6' },
      { kind: 'gun', name: 'DOCKS ARMORY', x: 570, y: 1720, color: '#c94a4a' },
      { kind: 'spray', name: "PAY N' SPRAY EAST", x: 2670, y: 1120, color: '#4ac9a2' }
    ];
    W.races = [
      { name: 'Harbor Sprint', x: 570, y: 220 },
      { name: 'Neon Mile GP', x: 1620, y: 1720 },
      { name: 'Strip Showdown', x: 3020, y: 2320 }
    ];
    W.taxis = [
      { x: 920, y: 820 }, { x: 2320, y: 520 }, { x: 1270, y: 2020 }, { x: 3020, y: 1420 }
    ];
    return W;
  }

  function rectCollideCircle(r, x, y, rad) {
    var cx = Math.max(r.x, Math.min(x, r.x + r.w));
    var cy = Math.max(r.y, Math.min(y, r.y + r.h));
    var dx = x - cx, dy = y - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return null;
    var d = Math.sqrt(d2) || 0.001;
    return { nx: dx / d, ny: dy / d, push: rad - d };
  }

  function collideBuildings(W, x, y, rad) {
    var out = null;
    for (var i = 0; i < W.buildings.length; i++) {
      var hit = rectCollideCircle(W.buildings[i], x, y, rad);
      if (hit) {
        x += hit.nx * hit.push; y += hit.ny * hit.push;
        out = hit;
      }
    }
    return { x: x, y: y, hit: out };
  }

  function inWater(x, y) {
    // Harbor water along the west edge, crossed only by the bridge road.
    if (x < 130 && !(y > 1080 && y < 1180)) return true;
    return false;
  }

  function nearestNode(W, x, y) {
    var best = null, bd = 1e18;
    for (var i = 0; i < W.nodes.length; i++) {
      var n = W.nodes[i];
      var d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // Breadth-first path over the road graph, returns array of nodes.
  function findPath(W, fromId, toId) {
    if (fromId === toId) return [W.nodes[fromId]];
    var prev = {}, seen = {}, q = [fromId];
    seen[fromId] = true;
    while (q.length) {
      var cur = q.shift();
      var nb = W.adj[cur] || [];
      for (var i = 0; i < nb.length; i++) {
        if (seen[nb[i]]) continue;
        seen[nb[i]] = true; prev[nb[i]] = cur;
        if (nb[i] === toId) {
          var path = [W.nodes[toId]], c = toId;
          while (c !== fromId) { c = prev[c]; path.unshift(W.nodes[c]); }
          return path;
        }
        q.push(nb[i]);
      }
    }
    return [W.nodes[toId]];
  }

  V.world = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, ROAD_W: ROAD_W,
    ROADS_V: ROADS_V, ROADS_H: ROADS_H, DISTRICTS: DISTRICTS,
    CAR_MODELS: CAR_MODELS, genWorld: genWorld, districtAt: districtAt,
    collideBuildings: collideBuildings, inWater: inWater,
    nearestNode: nearestNode, findPath: findPath
  };
})();
