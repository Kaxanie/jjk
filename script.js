const districts = [
  {
    id: 'kanda',
    name: 'Kanda Commercial Zone',
    threat: 'Threat: Moderate Surge',
    objective: 'Investigate 3 resonance points and neutralize a Warden Curse.',
    enemyHp: 210,
    enemyAtk: [11, 16],
    reward: 120,
  },
  {
    id: 'shinagawa',
    name: 'Shinagawa Transit Ruins',
    threat: 'Threat: High Underground Swarm',
    objective: 'Purge tunnel nests and seal a cursed relay before overload.',
    enemyHp: 260,
    enemyAtk: [13, 19],
    reward: 160,
  },
  {
    id: 'sumida',
    name: 'Sumida Floodplain',
    threat: 'Threat: Corrupted Tide Event',
    objective: 'Escort evacuees and suppress domain distortion over the levees.',
    enemyHp: 300,
    enemyAtk: [14, 22],
    reward: 210,
  },
  {
    id: 'nexus',
    name: 'Nexus Exclusion Zone',
    threat: 'Threat: Special Grade Fragment',
    objective: 'Enter exclusion pocket and survive a 2-phase boss clash.',
    enemyHp: 380,
    enemyAtk: [18, 28],
    reward: 320,
  },
];

const state = {
  hp: 260,
  maxHp: 260,
  ce: 100,
  maxCe: 100,
  domain: 0,
  enemyHp: 0,
  enemyMaxHp: 0,
  rankPoints: 0,
  selectedDistrict: null,
  battleActive: false,
  isDomainActive: false,
};

const refs = {
  districts: document.getElementById('districts'),
  brief: document.getElementById('brief'),
  deployBtn: document.getElementById('deployBtn'),
  hpBar: document.getElementById('hpBar'),
  hpText: document.getElementById('hpText'),
  ceBar: document.getElementById('ceBar'),
  ceText: document.getElementById('ceText'),
  domainBar: document.getElementById('domainBar'),
  domainText: document.getElementById('domainText'),
  enemy: document.getElementById('enemy'),
  player: document.getElementById('player'),
  log: document.getElementById('log'),
  rank: document.getElementById('rank'),
  arenaBanner: document.getElementById('arenaBanner'),
  effects: document.getElementById('effects'),
  loadout: document.getElementById('loadout'),
};

function init() {
  renderDistricts();
  renderLoadout();
  bindControls();
  updateHud();
  log('Demo ready. Select a district and deploy.');
}

function renderDistricts() {
  const template = document.getElementById('districtTemplate');
  districts.forEach((district) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = district.id;
    node.querySelector('.district-name').textContent = district.name;
    node.querySelector('.district-threat').textContent = district.threat;
    node.addEventListener('click', () => selectDistrict(district.id));
    refs.districts.appendChild(node);
  });
}

function renderLoadout() {
  ['Melee Striker', 'Summon: Nue', 'Technique: Black Flash', 'Relic: Veil Pass'].forEach((x) => {
    const chip = document.createElement('span');
    chip.textContent = x;
    refs.loadout.appendChild(chip);
  });
}

function selectDistrict(id) {
  state.selectedDistrict = districts.find((d) => d.id === id);
  [...refs.districts.children].forEach((card) => {
    card.classList.toggle('active', card.dataset.id === id);
  });
  refs.brief.innerHTML = `
    <strong>${state.selectedDistrict.name}</strong><br />
    ${state.selectedDistrict.objective}<br /><br />
    <em>Enemy Strength:</em> ${state.selectedDistrict.enemyHp} HP · Reward ${state.selectedDistrict.reward} RP
  `;
  refs.deployBtn.disabled = false;
}

function bindControls() {
  refs.deployBtn.addEventListener('click', deploy);
  document.querySelectorAll('.controls button').forEach((btn) => {
    btn.addEventListener('click', () => runAction(btn.dataset.action));
  });
}

function deploy() {
  if (!state.selectedDistrict) return;
  state.battleActive = true;
  state.enemyHp = state.selectedDistrict.enemyHp;
  state.enemyMaxHp = state.selectedDistrict.enemyHp;
  state.hp = state.maxHp;
  state.ce = state.maxCe;
  state.domain = 0;
  state.isDomainActive = false;
  refs.arenaBanner.textContent = `Operation Active: ${state.selectedDistrict.name}`;
  log(`Deployed to ${state.selectedDistrict.name}. ${state.selectedDistrict.threat}.`);
  updateHud();
}

function runAction(action) {
  if (!state.battleActive) {
    log('Deploy first.');
    return;
  }

  const domainBuff = state.isDomainActive ? 1.4 : 1;

  if (action === 'light') {
    strikeEnemy(rand(14, 19) * domainBuff, 'Light combo landed.');
    gainCe(8);
    gainDomain(10);
  }

  if (action === 'heavy') {
    strikeEnemy(rand(24, 32) * domainBuff, 'Heavy break staggered the curse.');
    gainCe(4);
    gainDomain(15);
  }

  if (action === 'technique') {
    if (!spendCe(35, 'Not enough CE for technique.')) return;
    strikeEnemy(rand(45, 60) * domainBuff, 'Technique unleashed: Cursed Impact.');
    addEffect('TECH!');
    gainDomain(20);
  }

  if (action === 'summon') {
    if (!spendCe(45, 'Not enough CE for summon assist.')) return;
    strikeEnemy(rand(38, 52) * domainBuff, 'Nue assist strikes from above.');
    addEffect('SUMMON');
    gainDomain(18);
    heal(10);
  }

  if (action === 'domain') {
    if (state.domain < 100) {
      log('Domain gauge not full.');
      return;
    }
    state.domain = 0;
    state.isDomainActive = true;
    addEffect('DOMAIN', true);
    log('Domain Expansion activated for 3 turns!');
    refs.arenaBanner.textContent = 'Domain Expansion: Echo Chamber';
    setTimeout(() => {
      state.isDomainActive = false;
      refs.arenaBanner.textContent = `Operation Active: ${state.selectedDistrict.name}`;
      log('Domain ended. Battlefield normalized.');
      updateHud();
    }, 8500);
  }

  if (action === 'dodge') {
    const perfect = Math.random() < 0.45;
    if (perfect) {
      gainCe(18);
      gainDomain(8);
      log('Perfect Dodge! CE refunded and no damage taken.');
      updateHud();
      return;
    }
    log('Dodge mistimed.');
  }

  enemyTurn(action === 'dodge');
  updateHud();
}

function enemyTurn(wasDodge) {
  if (state.enemyHp <= 0) return;
  let dmg = rand(state.selectedDistrict.enemyAtk[0], state.selectedDistrict.enemyAtk[1]);
  if (state.isDomainActive) dmg = Math.floor(dmg * 0.65);
  if (wasDodge && Math.random() < 0.45) return;

  state.hp = clamp(state.hp - dmg, 0, state.maxHp);
  refs.player.classList.add('hit');
  setTimeout(() => refs.player.classList.remove('hit'), 160);
  log(`Enemy curse hits for ${dmg}.`);

  if (state.hp <= 0) {
    state.battleActive = false;
    refs.arenaBanner.textContent = 'Operation Failed — Regroup at HQ';
    log('You were exorcised. Re-deploy to try again.');
  }
}

function strikeEnemy(rawDamage, msg) {
  const dmg = Math.floor(rawDamage);
  state.enemyHp = clamp(state.enemyHp - dmg, 0, state.enemyMaxHp);
  refs.enemy.classList.add('hit');
  setTimeout(() => refs.enemy.classList.remove('hit'), 160);
  log(`${msg} (${dmg})`);

  if (state.enemyHp <= 0) {
    state.battleActive = false;
    state.rankPoints += state.selectedDistrict.reward;
    log(`Incident resolved. +${state.selectedDistrict.reward} rank points.`);
    refs.arenaBanner.textContent = 'Incident Purged — Return to HQ';
    checkRankUp();
  }
}

function checkRankUp() {
  if (state.rankPoints >= 600) refs.rank.textContent = 'D';
  else if (state.rankPoints >= 300) refs.rank.textContent = 'E';
  else refs.rank.textContent = 'F';
}

function spendCe(amount, failMessage) {
  if (state.ce < amount) {
    log(failMessage);
    return false;
  }
  state.ce -= amount;
  return true;
}

function gainCe(amount) {
  state.ce = clamp(state.ce + amount, 0, state.maxCe);
}

function gainDomain(amount) {
  state.domain = clamp(state.domain + amount, 0, 100);
}

function heal(amount) {
  state.hp = clamp(state.hp + amount, 0, state.maxHp);
}

function updateHud() {
  refs.hpBar.style.width = `${(state.hp / state.maxHp) * 100}%`;
  refs.ceBar.style.width = `${(state.ce / state.maxCe) * 100}%`;
  refs.domainBar.style.width = `${state.domain}%`;
  refs.hpText.textContent = `${state.hp} / ${state.maxHp}`;
  refs.ceText.textContent = `${state.ce} / ${state.maxCe}`;
  refs.domainText.textContent = `${Math.floor(state.domain)}%`;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = text;
  refs.log.prepend(li);
}

function addEffect(text, domain = false) {
  const fx = document.createElement('div');
  fx.className = `effect ${domain ? 'domain' : ''}`;
  fx.textContent = text;
  refs.effects.appendChild(fx);
  setTimeout(() => fx.remove(), 700);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

init();
