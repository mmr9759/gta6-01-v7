// VELMARA missions: 12 jobs in 3 acts, branching choice at mission 7.
// Objectives are data; the engine in main.js drives them.
var V = window.V || (window.V = {});
(function () {
  function M(id, act, title, giver, brief, reward, objectives, extra) {
    var m = { id: id, act: act, title: title, giver: giver, brief: brief, reward: reward, objectives: objectives };
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  }
  function O(type, label, data) {
    var o = { type: type, label: label };
    if (data) for (var k in data) o[k] = data[k];
    return o;
  }

  var MISSIONS = [
    M(1, 'ACT I — SMALL TIME', 'First Wheels', 'Riko',
      'Welcome back to Velmara, Riko. No car, no cash, no crew. Steal the Comet parked by Gold Row and bring it to the marker — your new life starts with someone else\'s keys.',
      400, [O('goto', 'Steal the Comet and drive to the Gold Row marker', { x: 1970, y: 520, r: 70 })]),
    M(2, 'ACT I — SMALL TIME', 'The Pickup', 'Marisol',
      'Marisol runs the harbor. A package is waiting at the Docks — pick it up and deliver it to her place in Palm Heights. Cops patrol the docks, so keep it smooth.',
      600, [O('goto', 'Pick up the package at the Docks', { x: 570, y: 2020, r: 70 }),
            O('goto', 'Deliver the package to Marisol in Palm Heights', { x: 3020, y: 820, r: 70 })]),
    M(3, 'ACT I — SMALL TIME', 'Taxi Nights', 'Riko',
      'Rent is due and the Comet drinks gas. Run taxi fares around the city — earn $300 in fares and the night is yours. Press T near a waiting passenger.',
      300, [O('fare', 'Earn $300 in taxi fares (press T near passengers)', { amount: 300 })]),
    M(4, 'ACT II — GOLD RUSH', 'Coin Run', 'The Broker',
      'The Broker hid 24 gold coins across Velmara years ago. He\'ll pay for the first six — they\'re marked on your map. Finders keepers, if the PD doesn\'t find you first.',
      900, [O('collect', 'Collect 6 gold coins', { count: 6 })]),
    M(5, 'ACT II — GOLD RUSH', 'Street King', 'Riko',
      'The Neon Mile GP is tonight. Win the Harbor Sprint — hit every checkpoint before the clock runs out and take the crown off the reigning street king.',
      1200, [O('race', 'Win the Harbor Sprint race', { race: 0, checkpoints: 4, timeLimit: 75 })]),
    M(6, 'ACT II — GOLD RUSH', 'Heat', 'Marisol',
      'You\'re hot — 3 stars and the whole Velmara PD on your tail. Lose them. Stay out of sight until the heat dies down, or pay for a respray.',
      800, [O('evade', 'Lose the 3-star wanted level', { stars: 3, holdTime: 12 })]),
    M(7, 'ACT II — GOLD RUSH', 'Crossroads', 'Marisol / The Broker',
      'Two offers, one night. Marisol needs medicine delivered clean across town. The Broker wants a vault hit — loud, rich, and very wanted. Choose your side.',
      0, [O('choice', 'Choose: Marisol or the Broker', {})]),
    M(8, 'ACT III — STREETS OF GOLD', 'The Clean Run', 'Marisol',
      'Medicine for the Little Velmara clinic. No sirens, no shortcuts through the PD — deliver to all three drop points and keep the car in one piece.',
      1200, [O('goto', 'Drop 1: clinic in Little Velmara', { x: 2670, y: 1720, r: 70 }),
              O('goto', 'Drop 2: Harbor shelter', { x: 570, y: 1120, r: 70 }),
              O('goto', 'Drop 3: Gold Row pharmacy', { x: 1970, y: 820, r: 70 })],
      { branch: 'marisol' }),
    M(8, 'ACT III — STREETS OF GOLD', 'The Vault Hit', 'The Broker',
      'The Gold Row vault. Smash in, grab the gold, and get out before the 3-star heat buries you. The Broker pays big for loud work.',
      3500, [O('goto', 'Break into the Gold Row vault', { x: 1970, y: 520, r: 70 }),
              O('goto', 'Escape to the Docks safe point', { x: 570, y: 2320, r: 80 })],
      { branch: 'broker', startWanted: 3 }),
    M(9, 'ACT III — STREETS OF GOLD', 'Hot Pursuit', 'Riko',
      'Four stars. A police helicopter is on you and roadblocks are up across the Strip. Lose the heat — survive the pursuit and the city is yours.',
      1500, [O('evade', 'Lose the 4-star wanted level', { stars: 4, holdTime: 15 })],
      { startWanted: 4 }),
    M(10, 'ACT III — STREETS OF GOLD', 'Gold Row Heist', 'The Broker',
      'Eight more coins, one night, one timer. The Broker\'s crew stashed a fortune along Gold Row — sweep them all up before the clock hits zero.',
      2000, [O('collect', 'Collect 8 gold coins before time runs out', { count: 8, timeLimit: 120 })]),
    M(11, 'ACT III — STREETS OF GOLD', 'King of Velmara', 'Riko',
      'The final race. Beat the Strip Showdown — five checkpoints, the fastest crews in Velmara, and a rival who never loses. Tonight he does.',
      2500, [O('race', 'Win the Strip Showdown race', { race: 2, checkpoints: 5, timeLimit: 90 })]),
    M(12, 'ACT III — STREETS OF GOLD', 'Streets of Gold', 'Marisol',
      'One last run. Light up all three beacons — Harbor, Neon Mile, the Strip — and Velmara bows to its new king. This is the finale, Riko.',
      5000, [O('goto', 'Light the Harbor beacon', { x: 220, y: 1120, r: 80 }),
              O('goto', 'Light the Neon Mile beacon', { x: 1620, y: 2020, r: 80 }),
              O('goto', 'Light the Strip beacon', { x: 3370, y: 2320, r: 80 })])
  ];

  // Coins for collect missions are drawn from the world coin list in order.
  function missionByIndex(idx) { return MISSIONS[idx] || null; }
  function missionCount() { return MISSIONS.length; }

  V.missions = { list: MISSIONS, byIndex: missionByIndex, count: missionCount };
})();
