const TILE = 32;
const COLS = 20;
const ROWS = 14;

const mapLegend = {
  '.': { type: 'floor', color: '#18264d' },
  '#': { type: 'wall', color: '#2a355b' },
  'M': { type: 'mission', color: '#5f7ac5' },
  'G': { type: 'gate', color: '#6a4b8f' },
  'S': { type: 'seal', color: '#a67c2f' },
  'C': { type: 'curse', color: '#7a2e4a' },
};

const mapRows = [
  '####################',
  '#....M.....##......#',
  '#.######...##..C...#',
  '#......#...##......#',
  '#......#...........#',
  '#......#.######.####',
  '#..C...#....G......#',
  '#......######......#',
  '#......#....#......#',
  '#......#.SS.#..C...#',
  '#......#....#......#',
  '#......######......#',
  '#...........S......#',
  '####################',
];

const state = {
  player: { x: 1, y: 1 },
  missionAccepted: false,
  sealsCollected: 0,
  inDungeon: false,
  rank: 'F',
  battle: null,
};

const party = [
  createSorcerer('Yuji-type Striker', { hp: 120, ce: 70, off: 24, def: 10, spd: 19, focus: 10 }, [
    tech('Divergent Fist', 14, 1.2, 'impact', 95),
    tech('Cursed Rush', 18, 1.5, 'impact', 85),
  ]),
  createSorcerer('Megumi-type Summoner', { hp: 95, ce: 110, off: 18, def: 12, spd: 15, focus: 18 }, [
    tech('Divine Hound Pair', 16, 1.25, 'spirit', 90),
    tech('Shadow Bind', 12, 0.9, 'barrier', 100, { status: { type: 'slow', turns: 2 } }),
  ]),
  createSorcerer('Hex Support', { hp: 100, ce: 120, off: 14, def: 13, spd: 13, focus: 20 }, [
    tech('Veil Stitch', 15, 0.0, 'barrier', 100, { heal: 25, allAllies: true }),
    tech('CE Pulse', 10, 0.7, 'spirit', 100, { restoreCE: 12 }),
  ]),
];

const bossTemplate = createEnemy('Bell-Mouth Curse', { hp: 280, ce: 999, off: 24, def: 13, spd: 14, focus: 0 }, [
  tech('Resonance Shriek', 0, 1.15, 'spirit', 95),
  tech('Bell Sigil Pulse', 0, 1.35, 'impact', 85),
], { boss: true });

const world = document.getElementById('world');
const ctx = world.getContext('2d');
const objective = document.getElementById('objective');
const rankEl = document.getElementById('rank');
const partyStats = document.getElementById('partyStats');
const logEl = document.getElementById('log');

const battleOverlay = document.getElementById('battleOverlay');
const battleTitle = document.getElementById('battleTitle');
const alliesEl = document.getElementById('allies');
const enemiesEl = document.getElementById('enemies');
const turnOrderEl = document.getElementById('turnOrder');
const actorSelect = document.getElementById('actorSelect');
const techniqueSelect = document.getElementById('techniqueSelect');
const targetSelect = document.getElementById('targetSelect');
const useTechniqueBtn = document.getElementById('useTechnique');
const endTurnBtn = document.getElementById('endTurn');
const battleLog = document.getElementById('battleLog');

function createSorcerer(name, stats, techniques) {
  return {
    id: name,
    name,
    role: 'ally',
    maxHp: stats.hp,
    hp: stats.hp,
    maxCe: stats.ce,
    ce: stats.ce,
    off: stats.off,
    def: stats.def,
    spd: stats.spd,
    focus: stats.focus,
    techniques,
    statuses: [],
    domainReady: false,
  };
}

function createEnemy(name, stats, techniques, extras = {}) {
  return {
    id: name,
    name,
    role: 'enemy',
    maxHp: stats.hp,
    hp: stats.hp,
    maxCe: stats.ce,
    ce: stats.ce,
    off: stats.off,
    def: stats.def,
    spd: stats.spd,
    focus: stats.focus,
    techniques,
    statuses: [],
    ...extras,
  };
}

function tech(name, ceCost, mult, affinity, accuracy, extra = {}) {
  return { name, ceCost, mult, affinity, accuracy, ...extra };
}

function log(message) {
  const row = document.createElement('div');
  row.textContent = `• ${message}`;
  logEl.prepend(row);
}

function battleLogLine(message) {
  const row = document.createElement('div');
  row.textContent = `• ${message}`;
  battleLog.prepend(row);
}

function tileAt(x, y) {
  const row = mapRows[y];
  return row ? row[x] : '#';
}

function drawWorld() {
  ctx.clearRect(0, 0, world.width, world.height);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const symbol = tileAt(x, y);
      const tile = mapLegend[symbol] || mapLegend['.'];
      ctx.fillStyle = tile.color;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

      if (symbol === 'S' && !state.inDungeon) {
        ctx.fillStyle = '#88651f';
        ctx.fillRect(x * TILE + 8, y * TILE + 8, 16, 16);
      }
      if (symbol === 'C') {
        ctx.fillStyle = '#d65585';
        ctx.beginPath();
        ctx.arc(x * TILE + 16, y * TILE + 16, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = '#7de2ff';
  ctx.fillRect(state.player.x * TILE + 6, state.player.y * TILE + 6, 20, 20);
}

function isWalkable(x, y) {
  const symbol = tileAt(x, y);
  return symbol !== '#';
}

function updatePartyPanel() {
  partyStats.innerHTML = '';
  party.forEach(member => {
    const div = document.createElement('div');
    div.className = 'combatant';
    div.innerHTML = `<b>${member.name}</b><br><span class="hp">HP ${member.hp}/${member.maxHp}</span> · <span class="ce">CE ${member.ce}/${member.maxCe}</span>`;
    partyStats.appendChild(div);
  });
}

function updateObjective(text) {
  objective.textContent = `Objective: ${text}`;
}

function interact() {
  const symbol = tileAt(state.player.x, state.player.y);
  if (symbol === 'M') {
    state.missionAccepted = true;
    updateObjective('Reach the shrine gate and collect Bell Seals A/B/C.');
    log('Mission accepted: Purge the Hollow Bell Shrine.');
    return;
  }

  if (symbol === 'G' && state.missionAccepted) {
    state.inDungeon = true;
    updateObjective('Collect all 3 Bell Seals then challenge the Bell-Mouth Curse.');
    log('Barrier gate opened. You entered the shrine core.');
    return;
  }

  if (symbol === 'S' && state.inDungeon) {
    if (state.sealsCollected < 3) {
      state.sealsCollected += 1;
      updateObjective(`Bell Seals collected: ${state.sealsCollected}/3.`);
      log(`Recovered Bell Seal ${state.sealsCollected}/3.`);
      if (state.sealsCollected === 3) {
        party[0].techniques.push(tech('Domain: Infinite Corridor', 40, 1.55, 'barrier', 100, { domain: true }));
        log('Domain Expansion unlocked for this run! Challenge the boss at any curse node.');
        updateObjective('All seals recovered. Defeat the Bell-Mouth Curse.');
      }
    }
    return;
  }

  log('Nothing to interact with here.');
}

function move(dx, dy) {
  if (state.battle) return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!isWalkable(nx, ny)) return;

  state.player.x = nx;
  state.player.y = ny;
  const symbol = tileAt(nx, ny);

  if (symbol === 'C' && state.missionAccepted) {
    if (state.sealsCollected === 3) {
      startBossBattle();
    } else {
      startRandomBattle();
    }
  }
}

function cloneFighter(f) {
  return JSON.parse(JSON.stringify(f));
}

function startRandomBattle() {
  const enemies = [
    createEnemy('Resonant Wraith', { hp: 110, ce: 0, off: 18, def: 9, spd: 12, focus: 0 }, [
      tech('Howl Swipe', 0, 1.1, 'spirit', 92),
      tech('Curse Spasm', 0, 1.3, 'impact', 85),
    ]),
    createEnemy('Lesser Curse', { hp: 80, ce: 0, off: 14, def: 8, spd: 11, focus: 0 }, [
      tech('Gnaw', 0, 1.0, 'impact', 95),
    ]),
  ];
  openBattle('Encounter: Shrine Curses', enemies);
}

function startBossBattle() {
  openBattle('Boss: Bell-Mouth Curse', [cloneFighter(bossTemplate)]);
}

function openBattle(title, enemies) {
  state.battle = {
    allies: party.map(cloneFighter),
    enemies,
    turn: 1,
    activeSide: 'ally',
  };
  battleTitle.textContent = title;
  battleLog.innerHTML = '';
  battleOverlay.classList.remove('hidden');
  battleLogLine('Battle start. Use CE wisely and exploit affinity advantage.');
  renderBattle();
}

function affinityMod(att, target) {
  const adv = { impact: 'barrier', barrier: 'spirit', spirit: 'impact' };
  const dis = { impact: 'spirit', barrier: 'impact', spirit: 'barrier' };
  const targetAffinity = target.boss ? 'spirit' : 'impact';
  if (adv[att] === targetAffinity) return 1.25;
  if (dis[att] === targetAffinity) return 0.8;
  return 1;
}

function applyTechnique(user, target, technique, everyone = null) {
  if (user.ce < technique.ceCost) {
    battleLogLine(`${user.name} lacks CE for ${technique.name}.`);
    return;
  }

  user.ce -= technique.ceCost;

  if (technique.heal && technique.allAllies && everyone) {
    everyone.forEach(a => {
      if (a.hp <= 0) return;
      a.hp = Math.min(a.maxHp, a.hp + technique.heal);
    });
    battleLogLine(`${user.name} used ${technique.name}, healing the team for ${technique.heal}.`);
    return;
  }

  const hitRoll = Math.random() * 100;
  if (hitRoll > technique.accuracy) {
    battleLogLine(`${user.name}'s ${technique.name} missed ${target.name}.`);
    return;
  }

  const raw = user.off * technique.mult + 8 - target.def;
  const variance = 0.9 + Math.random() * 0.2;
  const final = Math.max(1, Math.floor(raw * affinityMod(technique.affinity, target) * variance));
  target.hp = Math.max(0, target.hp - final);

  if (technique.restoreCE) {
    user.ce = Math.min(user.maxCe, user.ce + technique.restoreCE);
  }
  if (technique.status && target.hp > 0) {
    target.statuses.push({ ...technique.status });
  }

  battleLogLine(`${user.name} used ${technique.name} on ${target.name} for ${final} dmg.`);

  if (technique.domain) {
    battleLogLine('Domain Expansion: Infinite Corridor distorts the field! Enemy speed reduced.');
    state.battle.enemies.forEach(e => e.spd = Math.max(5, e.spd - 4));
  }

  if (target.hp === 0) battleLogLine(`${target.name} was exorcised.`);
}

function cleanTurnQueue() {
  return [
    ...state.battle.allies.filter(a => a.hp > 0),
    ...state.battle.enemies.filter(e => e.hp > 0),
  ].sort((a, b) => b.spd - a.spd);
}

function enemyTurn() {
  const enemiesAlive = state.battle.enemies.filter(e => e.hp > 0);
  const alliesAlive = state.battle.allies.filter(a => a.hp > 0);
  enemiesAlive.forEach(enemy => {
    const t = enemy.techniques[Math.floor(Math.random() * enemy.techniques.length)];
    const target = alliesAlive[Math.floor(Math.random() * alliesAlive.length)];
    if (target) applyTechnique(enemy, target, t);
  });
  endRound();
}

function endRound() {
  state.battle.turn += 1;
  state.battle.allies.forEach(a => {
    if (a.hp > 0) a.ce = Math.min(a.maxCe, a.ce + (4 + Math.floor(a.focus * 0.05)));
  });
  resolveBattleState();
  renderBattle();
}

function resolveBattleState() {
  const enemiesAlive = state.battle.enemies.some(e => e.hp > 0);
  const alliesAlive = state.battle.allies.some(a => a.hp > 0);

  if (!enemiesAlive) {
    battleLogLine('Victory!');
    if (battleTitle.textContent.includes('Bell-Mouth')) {
      state.rank = 'E';
      rankEl.textContent = `Exorcism Rank: ${state.rank}`;
      updateObjective('Mission complete. Report to the board and prepare for Chapter 2.');
      log('Bell-Mouth Curse exorcised. Rank promoted to E. Demo clear!');
    }
    closeBattle(true);
    return;
  }

  if (!alliesAlive) {
    battleLogLine('Your squad was defeated.');
    closeBattle(false);
  }
}

function closeBattle(won) {
  if (won && state.battle) {
    state.battle.allies.forEach((bAlly, i) => {
      party[i].hp = Math.max(1, bAlly.hp);
      party[i].ce = Math.max(10, bAlly.ce);
    });
  }
  if (!won) {
    party.forEach(a => {
      a.hp = a.maxHp;
      a.ce = a.maxCe;
    });
    state.player.x = 1;
    state.player.y = 1;
    log('Team reset after defeat.');
  }
  state.battle = null;
  battleOverlay.classList.add('hidden');
  updatePartyPanel();
}

function renderBattle() {
  if (!state.battle) return;

  const queue = cleanTurnQueue();
  turnOrderEl.textContent = `Turn ${state.battle.turn} · Queue: ${queue.map(c => c.name).join(' → ')}`;

  alliesEl.innerHTML = '';
  state.battle.allies.forEach(a => alliesEl.appendChild(renderCombatant(a)));
  enemiesEl.innerHTML = '';
  state.battle.enemies.forEach(e => enemiesEl.appendChild(renderCombatant(e)));

  const aliveAllies = state.battle.allies.filter(a => a.hp > 0);
  const aliveEnemies = state.battle.enemies.filter(e => e.hp > 0);

  actorSelect.innerHTML = aliveAllies.map((a, i) => `<option value="${i}">${a.name}</option>`).join('');
  const current = aliveAllies[0];
  if (current) {
    techniqueSelect.innerHTML = current.techniques
      .map((t, i) => `<option value="${i}">${t.name} (CE ${t.ceCost})</option>`)
      .join('');
  }
  targetSelect.innerHTML = aliveEnemies.map((e, i) => `<option value="${i}">${e.name}</option>`).join('');

  techniqueSelect.onchange = () => {
    const actor = aliveAllies[Number(actorSelect.value)] || aliveAllies[0];
    if (!actor) return;
    const options = actor.techniques
      .map((t, i) => `<option value="${i}">${t.name} (CE ${t.ceCost})</option>`)
      .join('');
    techniqueSelect.innerHTML = options;
  };
}

function renderCombatant(c) {
  const div = document.createElement('div');
  div.className = 'combatant';
  div.innerHTML = `<b>${c.name}</b><br><span class="hp">HP ${c.hp}/${c.maxHp}</span> · <span class="ce">CE ${c.ce}/${c.maxCe}</span>${c.hp <= 0 ? ' <span class="ko">KO</span>' : ''}`;
  return div;
}

useTechniqueBtn.onclick = () => {
  if (!state.battle) return;
  const alliesAlive = state.battle.allies.filter(a => a.hp > 0);
  const enemiesAlive = state.battle.enemies.filter(e => e.hp > 0);
  const actor = alliesAlive[Number(actorSelect.value)] || alliesAlive[0];
  const target = enemiesAlive[Number(targetSelect.value)] || enemiesAlive[0];

  if (!actor || !target) return;
  const chosen = actor.techniques[Number(techniqueSelect.value)] || actor.techniques[0];
  applyTechnique(actor, target, chosen, alliesAlive);
  resolveBattleState();
  renderBattle();
};

endTurnBtn.onclick = () => {
  if (!state.battle) return;
  enemyTurn();
};

function restart() {
  state.player = { x: 1, y: 1 };
  state.missionAccepted = false;
  state.sealsCollected = 0;
  state.inDungeon = false;
  state.rank = 'F';
  rankEl.textContent = 'Exorcism Rank: F';
  updateObjective('Accept the mission at the board (M).');
  party.splice(0, party.length,
    createSorcerer('Yuji-type Striker', { hp: 120, ce: 70, off: 24, def: 10, spd: 19, focus: 10 }, [
      tech('Divergent Fist', 14, 1.2, 'impact', 95),
      tech('Cursed Rush', 18, 1.5, 'impact', 85),
    ]),
    createSorcerer('Megumi-type Summoner', { hp: 95, ce: 110, off: 18, def: 12, spd: 15, focus: 18 }, [
      tech('Divine Hound Pair', 16, 1.25, 'spirit', 90),
      tech('Shadow Bind', 12, 0.9, 'barrier', 100, { status: { type: 'slow', turns: 2 } }),
    ]),
    createSorcerer('Hex Support', { hp: 100, ce: 120, off: 14, def: 13, spd: 13, focus: 20 }, [
      tech('Veil Stitch', 15, 0.0, 'barrier', 100, { heal: 25, allAllies: true }),
      tech('CE Pulse', 10, 0.7, 'spirit', 100, { restoreCE: 12 }),
    ]),
  );
  log('Demo reset.');
  updatePartyPanel();
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'w' || event.key === 'ArrowUp') move(0, -1);
  if (event.key === 's' || event.key === 'ArrowDown') move(0, 1);
  if (event.key === 'a' || event.key === 'ArrowLeft') move(-1, 0);
  if (event.key === 'd' || event.key === 'ArrowRight') move(1, 0);
  if (event.key.toLowerCase() === 'm') interact();
  if (event.key.toLowerCase() === 'b' && !state.battle) startRandomBattle();
  if (event.key.toLowerCase() === 'r') restart();
  drawWorld();
});

updatePartyPanel();
log('Welcome, sorcerer. Begin at the mission board tile marked in blue.');
drawWorld();
