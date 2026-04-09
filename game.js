const TILE = 48;
const MAP_W = 20;
const MAP_H = 12;

const AFFINITY = {
  Impact: { strong: "Barrier", weak: "Storm" },
  Spirit: { strong: "Void", weak: "Flame" },
  Barrier: { strong: "Impact", weak: "Void" },
  Flame: { strong: "Spirit", weak: "Storm" },
  Void: { strong: "Barrier", weak: "Spirit" },
  Storm: { strong: "Flame", weak: "Impact" }
};

const DATA = {
  zones: {
    hub: {
      id: "hub",
      name: "Kita Ward Hub",
      bg: "#20324f",
      fog: "#253c5d",
      portals: [{ x: 19, y: 5, to: "route", tx: 0, ty: 5 }],
      interactables: [{ x: 8, y: 4, text: "Mission Board: Exorcise 4 curses on the Outer Route." }],
      spawns: []
    },
    route: {
      id: "route",
      name: "Outer Route",
      bg: "#2b4332",
      fog: "#35583f",
      portals: [
        { x: 0, y: 5, to: "hub", tx: 19, ty: 5 },
        { x: 19, y: 6, to: "shrine", tx: 1, ty: 6, require: "rankE" }
      ],
      interactables: [{ x: 10, y: 8, text: "Cursed Fog: Affinity matters more against elite threats." }],
      spawns: [
        { x: 6, y: 3, hp: 70, affinity: "Flame", elite: false },
        { x: 10, y: 5, hp: 80, affinity: "Spirit", elite: false },
        { x: 14, y: 3, hp: 90, affinity: "Barrier", elite: true },
        { x: 16, y: 8, hp: 70, affinity: "Storm", elite: false }
      ]
    },
    shrine: {
      id: "shrine",
      name: "Ruin Shrine",
      bg: "#3f233f",
      fog: "#4c2b4c",
      portals: [{ x: 0, y: 6, to: "route", tx: 18, ty: 6 }],
      interactables: [],
      spawns: [{ x: 12, y: 6, hp: 320, affinity: "Void", boss: true, name: "Shrine Warden" }]
    }
  },
  summon: {
    name: "Nue: Storm Support",
    type: "Support",
    affinity: "Storm",
    cooldown: 6
  },
  techniques: [
    { key: "1", name: "Black Flash Thread", ceCost: 18, dmg: 35, affinity: "Impact", cd: 3 },
    { key: "2", name: "Barrier Rend", ceCost: 24, dmg: 52, affinity: "Void", cd: 6 }
  ]
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud-status");
const questText = document.getElementById("quest-text");
const feed = document.getElementById("combat-feed");
const loadoutText = document.getElementById("loadout-text");
const toast = document.getElementById("floating-toast");
const domainMeterFill = document.getElementById("domain-meter-fill");

const state = {
  t: 0,
  zone: "hub",
  player: {
    x: 2,
    y: 5,
    hp: 240,
    maxHp: 240,
    ce: 130,
    maxCe: 130,
    domain: 0,
    level: 8,
    rank: "F",
    affinity: "Impact",
    cd: {},
    dodgeUntil: 0,
    domainUntil: 0,
    kills: 0
  },
  enemies: [],
  msgTimer: 0,
  msg: "",
  quest: {
    id: "exorcise_4",
    text: "Exorcise 4 curses on Outer Route, then challenge Shrine Warden.",
    done: false
  }
};

const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  handleAction(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function setZone(zoneId, x, y) {
  state.zone = zoneId;
  state.player.x = x;
  state.player.y = y;
  const zone = DATA.zones[zoneId];
  state.enemies = zone.spawns.map((s, i) => ({
    id: `${zoneId}-${i}`,
    x: s.x,
    y: s.y,
    hp: s.hp,
    maxHp: s.hp,
    affinity: s.affinity,
    elite: Boolean(s.elite),
    boss: Boolean(s.boss),
    name: s.name || (s.elite ? "Cursed Elite" : "Lesser Curse"),
    attackCd: 0
  }));
  log(`Entered ${zone.name}.`, "special");
}

function showToast(msg, duration = 1600) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  state.msgTimer = duration;
}

function log(text, kind = "") {
  const line = document.createElement("div");
  line.className = `log-line ${kind ? `log-${kind}` : ""}`;
  line.textContent = text;
  feed.prepend(line);
}

function affinityModifier(atk, def) {
  if (!AFFINITY[atk]) return 1;
  if (AFFINITY[atk].strong === def) return 1.25;
  if (AFFINITY[atk].weak === def) return 0.8;
  return 1;
}

function getEnemyAt(x, y) {
  return state.enemies.find((e) => e.x === x && e.y === y && e.hp > 0);
}

function handleAction(k) {
  const p = state.player;
  if (k === "j") {
    meleeHit(24, p.affinity, "Light combo");
  } else if (k === "k") {
    meleeHit(42, "Impact", "Heavy breaker");
  } else if (k === "l") {
    p.dodgeUntil = state.t + 0.45;
    showToast("Dash! I-frames active.");
  } else if (k === "q") {
    castSummon();
  } else if (k === "e") {
    castDomain();
  } else if (k === "f") {
    interact();
  } else if (k === "1" || k === "2") {
    castTechnique(k);
  }
}

function castTechnique(key) {
  const tech = DATA.techniques.find((t) => t.key === key);
  const p = state.player;
  if (!tech) return;
  const cdLeft = p.cd[tech.name] || 0;
  if (cdLeft > state.t) return showToast(`${tech.name} cooling down`);
  if (p.ce < tech.ceCost) return showToast("Insufficient CE.");
  p.ce -= tech.ceCost;
  p.cd[tech.name] = state.t + tech.cd;
  const hit = meleeHit(tech.dmg, tech.affinity, tech.name);
  if (!hit) log(`${tech.name} whiffed.`, "bad");
}

function castSummon() {
  const p = state.player;
  const key = "summon";
  if ((p.cd[key] || 0) > state.t) return showToast("Summon recharging.");
  if (p.ce < 16) return showToast("Need 16 CE to summon.");
  p.ce -= 16;
  p.cd[key] = state.t + DATA.summon.cooldown;
  let hits = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (dist <= 3) {
      const dmg = Math.floor(20 * affinityModifier(DATA.summon.affinity, e.affinity));
      e.hp -= dmg;
      hits += 1;
      log(`${DATA.summon.name} zaps ${e.name} for ${dmg}.`, "good");
    }
  }
  if (hits === 0) log(`${DATA.summon.name} found no target.`, "bad");
  checkDeaths();
}

function castDomain() {
  const p = state.player;
  if (p.domain < 100) return showToast("Domain meter not full.");
  p.domain = 0;
  p.domainUntil = state.t + 8;
  showToast("Domain Expansion: Eclipse Court");
  log("Domain Expansion activated. Techniques empowered.", "special");
}

function meleeHit(base, affinity, label) {
  const p = state.player;
  let target = null;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (dist <= 1) {
      target = e;
      break;
    }
  }
  if (!target) return false;
  const inDomain = p.domainUntil > state.t;
  const mult = affinityModifier(affinity, target.affinity) * (inDomain ? 1.35 : 1);
  const dmg = Math.floor(base * mult);
  target.hp -= dmg;
  p.domain = Math.min(100, p.domain + 8);
  p.ce = Math.min(p.maxCe, p.ce + 4);
  log(`${label} hits ${target.name} for ${dmg} (${affinity} vs ${target.affinity}).`, "good");
  checkDeaths();
  return true;
}

function checkDeaths() {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.hp <= 0 && !e.deadMarked) {
      e.deadMarked = true;
      p.kills += 1;
      p.domain = Math.min(100, p.domain + (e.boss ? 50 : 14));
      log(`${e.name} exorcised.`, "special");
      if (p.kills >= 4 && p.rank === "F") {
        p.rank = "E";
        showToast("Rank up: F ➜ E. Shrine gate unlocked.", 2400);
        log("Exorcism Rank advanced to E.", "special");
      }
      if (e.boss) {
        state.quest.done = true;
        state.quest.text = "Demo complete. Shrine Warden defeated.";
        showToast("Mission Complete — Demo Clear", 3000);
      }
    }
  }
}

function interact() {
  const z = DATA.zones[state.zone];
  const p = state.player;
  const here = z.interactables.find((i) => i.x === p.x && i.y === p.y);
  if (here) {
    showToast(here.text, 2500);
    return;
  }
  const enemy = getEnemyAt(p.x, p.y);
  if (enemy) showToast(`${enemy.name}: ${enemy.hp}/${enemy.maxHp} HP`);
}

function update(dt) {
  state.t += dt;
  const p = state.player;
  if (state.msgTimer > 0) {
    state.msgTimer -= dt * 1000;
    if (state.msgTimer <= 0) toast.classList.add("hidden");
  }

  for (const k of Object.keys(p.cd)) {
    if (p.cd[k] < state.t) delete p.cd[k];
  }

  let nx = p.x;
  let ny = p.y;
  if (keys.has("w")) ny -= 1;
  else if (keys.has("s")) ny += 1;
  else if (keys.has("a")) nx -= 1;
  else if (keys.has("d")) nx += 1;
  nx = Math.max(0, Math.min(MAP_W - 1, nx));
  ny = Math.max(0, Math.min(MAP_H - 1, ny));
  if (!getEnemyAt(nx, ny)) {
    p.x = nx;
    p.y = ny;
  }

  for (const portal of DATA.zones[state.zone].portals) {
    if (portal.x === p.x && portal.y === p.y) {
      if (portal.require === "rankE" && p.rank === "F") {
        showToast("Gate sealed. Reach Rank E first.");
        break;
      }
      setZone(portal.to, portal.tx, portal.ty);
      break;
    }
  }

  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (dist <= 1 && e.attackCd < state.t) {
      e.attackCd = state.t + (e.boss ? 0.6 : 1.2);
      if (p.dodgeUntil > state.t) {
        log(`${e.name} attack avoided.`, "good");
      } else {
        const raw = e.boss ? 20 : e.elite ? 13 : 9;
        const reduced = Math.floor(raw * affinityModifier(e.affinity, p.affinity));
        p.hp -= reduced;
        log(`${e.name} hits you for ${reduced}.`, "bad");
      }
    }
  }

  p.ce = Math.min(p.maxCe, p.ce + dt * 4.5);
  if (p.hp <= 0) {
    p.hp = p.maxHp;
    p.ce = p.maxCe;
    p.domain = 0;
    setZone("hub", 2, 5);
    showToast("You were overwhelmed. Respawned in Hub.", 2600);
  }

  render();
}

function render() {
  const z = DATA.zones[state.zone];
  ctx.fillStyle = z.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      ctx.fillStyle = (x + y) % 2 ? z.fog : z.bg;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);
    }
  }
  ctx.globalAlpha = 1;

  for (const p of z.portals) {
    ctx.fillStyle = "#88d6ff";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(p.x * TILE + 9, p.y * TILE + 9, TILE - 18, TILE - 18);
  }
  ctx.globalAlpha = 1;

  for (const i of z.interactables) {
    ctx.fillStyle = "#f0d976";
    ctx.fillRect(i.x * TILE + 14, i.y * TILE + 14, TILE - 28, TILE - 28);
  }

  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    ctx.fillStyle = e.boss ? "#ff6fd1" : e.elite ? "#ff9b67" : "#ff6f8f";
    ctx.fillRect(e.x * TILE + 8, e.y * TILE + 8, TILE - 16, TILE - 16);
    const ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "#0f1320";
    ctx.fillRect(e.x * TILE + 5, e.y * TILE + 2, TILE - 10, 6);
    ctx.fillStyle = "#62f3a8";
    ctx.fillRect(e.x * TILE + 5, e.y * TILE + 2, (TILE - 10) * ratio, 6);
  }

  const p = state.player;
  ctx.fillStyle = p.domainUntil > state.t ? "#76d4ff" : "#7ad9a0";
  ctx.fillRect(p.x * TILE + 8, p.y * TILE + 8, TILE - 16, TILE - 16);
  if (p.dodgeUntil > state.t) {
    ctx.strokeStyle = "#b2f2ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x * TILE + 24, p.y * TILE + 24, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(5, 10, 20, 0.65)";
  ctx.fillRect(0, 0, canvas.width, 32);
  ctx.fillStyle = "#d9e7ff";
  ctx.font = "15px Inter, sans-serif";
  ctx.fillText(`${z.name} | Rank ${p.rank} | Kills ${p.kills}`, 12, 21);

  hud.innerHTML = [
    statLine("HP", `${Math.floor(p.hp)}/${p.maxHp}`),
    statLine("CE", `${Math.floor(p.ce)}/${p.maxCe}`),
    statLine("Level", p.level),
    statLine("Affinity", p.affinity),
    statLine("Zone", z.name)
  ].join("");

  domainMeterFill.style.width = `${p.domain}%`;
  questText.textContent = state.quest.text;

  const cd1 = Math.max(0, ((p.cd[DATA.techniques[0].name] || 0) - state.t)).toFixed(1);
  const cd2 = Math.max(0, ((p.cd[DATA.techniques[1].name] || 0) - state.t)).toFixed(1);
  const cds = Math.max(0, ((p.cd.summon || 0) - state.t)).toFixed(1);

  loadoutText.innerHTML = `
    <p><strong>Sorcerer:</strong> Yuji-inspired close-range striker</p>
    <p><strong>Techniques:</strong> [1] ${DATA.techniques[0].name} (${cd1}s), [2] ${DATA.techniques[1].name} (${cd2}s)</p>
    <p><strong>Summon:</strong> ${DATA.summon.name} (${DATA.summon.type}, CD ${cds}s)</p>
    <p><strong>Domain:</strong> Eclipse Court (${Math.floor(p.domain)}%)</p>
  `;
}

function statLine(name, value) {
  return `<div class="stat"><strong>${name}</strong>: ${value}</div>`;
}

setZone("hub", 2, 5);
showToast("Welcome, sorcerer. Reach Rank E and clear the shrine.", 2400);
let last = performance.now();

function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.08);
  last = ts;
  update(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
