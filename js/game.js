'use strict';

// ===== グローバル状態 =====
let GAME   = null;
let GAMEID = null;

const POSITIONS = ['P','C','1B','2B','3B','SS','LF','CF','RF','DH'];

const RESULT_GROUPS = [
  { code:'1B',   label:'単打',     cls:'hit'    },
  { code:'2B',   label:'二塁打',   cls:'hit'    },
  { code:'3B',   label:'三塁打',   cls:'hit'    },
  { code:'HR',   label:'本塁打',   cls:'hr'     },
  { code:'BB',   label:'四球',     cls:'walk'   },
  { code:'HBP',  label:'死球',     cls:'walk'   },
  { code:'K',    label:'三振(空)', cls:'out'    },
  { code:'KL',   label:'三振(見)', cls:'out'    },
  { code:'GO',   label:'ゴロ',     cls:'out'    },
  { code:'FO',   label:'フライ',   cls:'out'    },
  { code:'LO',   label:'ライナー', cls:'out'    },
  { code:'GIDP', label:'併殺打',   cls:'out'    },
  { code:'SAC',  label:'犠打',     cls:'special'},
  { code:'SF',   label:'犠飛',     cls:'special'},
  { code:'E',    label:'エラー',   cls:'special'},
  { code:'FC',   label:'野選',     cls:'special'},
];

// スコアカードのセル表示ラベル（短縮形）
const CELL_LABELS = {
  '1B':'安',  '2B':'二',  '3B':'三',  'HR':'本',
  'BB':'四',  'HBP':'死', 'K':'振',   'KL':'振',
  'GO':'ゴ',  'FO':'飛',  'LO':'ラ',  'GIDP':'併',
  'SAC':'犠', 'SF':'犠飛','E':'E',    'FC':'FC'
};

// セルの色クラス
const CELL_CLS = {
  '1B':'hit',  '2B':'hit',  '3B':'hit',  'HR':'hr',
  'BB':'walk', 'HBP':'walk',
  'K':'out',   'KL':'out',  'GO':'out',  'FO':'out',
  'LO':'out',  'GIDP':'out',
  'SAC':'spc', 'SF':'spc',  'E':'spc',   'FC':'spc'
};

// モーダル内の状態
let selectedResult    = '';
let selectedDirection = '';
let currentRbi        = 0;

// スコアカードのセル編集状態
let currentOrder  = null;   // 現在編集中の打順スロット
let currentInning = null;   // 現在編集中のイニング
let _preSelectPlayerId = null; // セルから開く際の事前選択選手ID

// 代打/代走モーダルの状態
let subTargetOrder = null;

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  GAMEID = params.get('id');
  if (!GAMEID) { window.location.href = 'index.html'; return; }

  GAME = Storage.getGame(GAMEID);
  if (!GAME) { alert('試合データが見つかりません'); window.location.href = 'index.html'; return; }

  renderStepBar();
  buildResultGrid();
  initDirectionSvg();

  if (GAME.status === 'lineup') {
    showStep('lineup');
    renderLineupSlots();
  } else {
    showStep('record');
    renderRecord();
  }
});

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.className = `toast align-items-center text-white border-0 bg-${type}`;
  document.getElementById('toastMsg').textContent = msg;
  bootstrap.Toast.getOrCreateInstance(el, { delay: 2500 }).show();
}

// ===== Step Bar =====
function renderStepBar() {
  const steps = [
    { label: 'スタメン', key: 'lineup' },
    { label: '試合記録', key: 'record'  }
  ];
  const cur = GAME.status === 'lineup' ? 'lineup' : 'record';
  document.getElementById('stepBar').innerHTML = steps.map((s, i) => {
    const isDone   = (cur === 'record' && s.key === 'lineup');
    const isActive = s.key === cur;
    return `
      ${i > 0 ? '<span class="step-sep">›</span>' : ''}
      <div class="step-item">
        <div class="step-circle ${isDone ? 'done' : isActive ? 'active' : ''}">${isDone ? '✓' : i+1}</div>
        <span class="step-label ${isActive ? 'active' : ''}">${s.label}</span>
      </div>`;
  }).join('');
}

function showStep(step) {
  document.getElementById('stepLineup').style.display = step === 'lineup' ? '' : 'none';
  document.getElementById('stepRecord').style.display = step === 'record' ? '' : 'none';
}

// ===== STEP 1: スタメン登録 =====
let myLineupData  = [];
let oppLineupData = [];

function renderLineupSlots() {
  myLineupData  = GAME.myLineup  && GAME.myLineup.length
    ? [...GAME.myLineup]
    : Array.from({length:9}, (_,i) => ({ order: i+1, playerId:'', position:'' }));
  oppLineupData = GAME.oppLineup && GAME.oppLineup.length
    ? [...GAME.oppLineup]
    : Array.from({length:9}, (_,i) => ({ order: i+1, name:'', position:'' }));
  renderMySlots();
  renderOppSlots();
}

function renderMySlots() {
  const players = Storage.getPlayers();
  const el = document.getElementById('myLineupSlots');

  el.innerHTML = myLineupData.map((slot, idx) => {
    // 他スロットで使用済みの選手・ポジション（DHは重複可能）
    const usedPlayers   = myLineupData.filter((_,i) => i !== idx).map(s => s.playerId).filter(Boolean);
    const usedPositions = myLineupData.filter((_,i) => i !== idx).map(s => s.position).filter(Boolean);

    return `<div class="lineup-row">
      <div class="order-label">${slot.order}</div>
      <select class="form-select form-select-sm" onchange="myLineupData[${idx}].playerId=this.value;renderMySlots()">
        <option value="">選手を選択</option>
        ${players.map(p => {
          const used = usedPlayers.includes(p.id);
          return `<option value="${p.id}" ${p.id===slot.playerId?'selected':''} ${used?'disabled':''}>
            ${p.number?'#'+p.number+' ':''}${p.name}${used?' (使用中)':''}
          </option>`;
        }).join('')}
      </select>
      <select class="form-select form-select-sm" onchange="myLineupData[${idx}].position=this.value;renderMySlots()">
        <option value="">守備</option>
        ${POSITIONS.map(pos => {
          const used = pos !== 'DH' && usedPositions.includes(pos);
          return `<option value="${pos}" ${pos===slot.position?'selected':''} ${used?'disabled':''}>
            ${pos}${used?' *':''}
          </option>`;
        }).join('')}
      </select>
    </div>`;
  }).join('');
}

function renderOppSlots() {
  const el = document.getElementById('oppLineupSlots');
  el.innerHTML = oppLineupData.map((slot, idx) => `
    <div class="lineup-row">
      <div class="order-label">${slot.order}</div>
      <input type="text" class="form-control form-control-sm" placeholder="選手名" value="${slot.name||''}"
        oninput="oppLineupData[${idx}].name=this.value">
      <select class="form-select form-select-sm" onchange="oppLineupData[${idx}].position=this.value">
        <option value="">守備</option>
        ${POSITIONS.map(pos => `<option value="${pos}" ${pos===slot.position?'selected':''}>${pos}</option>`).join('')}
      </select>
    </div>
  `).join('');
}

function addLineupSlot(team) {
  if (team === 'my') {
    myLineupData.push({ order: myLineupData.length + 1, playerId: '', position: '' });
    renderMySlots();
  } else {
    oppLineupData.push({ order: oppLineupData.length + 1, name: '', position: '' });
    renderOppSlots();
  }
}

function saveLineupAndGo() {
  GAME.myLineup  = myLineupData.filter(s => s.playerId);
  GAME.oppLineup = oppLineupData.filter(s => s.name);
  GAME.status    = 'recording';
  if (!GAME.numInnings) GAME.numInnings = 7;
  Storage.updateGame(GAME);
  renderStepBar();
  showStep('record');
  renderRecord();
  showToast('スタメンを保存しました');
}

// ===== STEP 2: 試合記録 =====

function getNumInnings() {
  return GAME.numInnings || 7;
}

function changeInnings(delta) {
  const next = Math.max(1, Math.min(15, getNumInnings() + delta));
  if (next === getNumInnings()) return;
  GAME.numInnings = next;
  Storage.updateGame(GAME);
  renderScorecard();
  buildScoreboard();
  renderPitcherAssignment();
}

// 特定の打順スロット×イニングで誰が打つかを返す
function getBatterForSlot(order, inning, players) {
  const subs = (GAME.mySubs || [])
    .filter(s => s.order === order && s.inning <= inning)
    .sort((a, b) => b.inning - a.inning);
  if (subs.length > 0) {
    const sub = subs[0];
    const p = players.find(pl => pl.id === sub.playerId);
    return { playerId: sub.playerId, playerName: p?.name || '?', isSub: true };
  }
  const slot = (GAME.myLineup || []).find(l => l.order === order);
  if (!slot || !slot.playerId) return null;
  const p = players.find(pl => pl.id === slot.playerId);
  return { playerId: slot.playerId, playerName: p?.name || '?', isSub: false };
}

// 特定の打順×イニングの打席記録を返す
function getAtBatForCell(order, inning) {
  return (GAME.atBats || []).find(ab =>
    ab.isMyTeam && ab.order === order && ab.inning === inning
  );
}

function renderRecord() {
  document.getElementById('recTeamName').textContent = Storage.getTeamName();
  document.getElementById('recOpponent').textContent  = GAME.opponent;
  document.getElementById('recDate').textContent      = GAME.date;
  updateScoreDisplay();
  renderScorecard();
  buildScoreboard();
  renderPitcherAssignment();
}

function updateScoreDisplay() {
  const sc = Stats.gameScore(GAME);
  document.getElementById('recScore').textContent = `${sc.my} - ${sc.opp}`;
}

// ===== スコアカードグリッド =====
function renderScorecard() {
  const numInnings = getNumInnings();
  const myLineup   = GAME.myLineup || [];
  const players    = Storage.getPlayers();

  document.getElementById('inningCountDisplay').textContent = numInnings + '回';

  const sorted = [...myLineup].filter(s => s.playerId).sort((a, b) => a.order - b.order);
  const tbl = document.getElementById('scorecardTable');

  if (!sorted.length) {
    tbl.innerHTML = '<tbody><tr><td colspan="10" class="empty-msg py-3">スタメンが登録されていません</td></tr></tbody>';
    return;
  }

  // ヘッダー
  let html = '<thead><tr>';
  html += '<th class="sc-ord">打</th><th class="sc-name">選手</th>';
  for (let i = 1; i <= numInnings; i++) html += `<th class="sc-inn">${i}</th>`;
  html += '</tr></thead><tbody>';

  for (const slot of sorted) {
    const order  = slot.order;
    const player = players.find(p => p.id === slot.playerId);
    const pos    = slot.position || '';

    // スターターの担当範囲（最初の代打が来るまで）
    const firstSub = (GAME.mySubs || [])
      .filter(s => s.order === order)
      .sort((a, b) => a.inning - b.inning)[0];
    const starterEnd = firstSub ? firstSub.inning - 1 : numInnings;

    // スターター行
    html += '<tr>';
    html += `<td class="sc-ord">${order}</td>`;
    html += `<td class="sc-name">${player?.name || '?'}<small class="sc-pos">${pos}</small></td>`;
    for (let inn = 1; inn <= numInnings; inn++) {
      html += inn > starterEnd ? '<td class="sc-cell sc-na"></td>' : renderCell(order, inn);
    }
    html += '</tr>';

    // 代打/代走行
    const subs = (GAME.mySubs || [])
      .filter(s => s.order === order)
      .sort((a, b) => a.inning - b.inning);

    subs.forEach((sub, si) => {
      const subPlayer = players.find(p => p.id === sub.playerId);
      const nextSub   = subs[si + 1];
      const subEnd    = nextSub ? nextSub.inning - 1 : numInnings;

      html += '<tr class="sc-sub-row">';
      html += `<td class="sc-ord sc-sub-ord">${sub.inning}↑</td>`;
      html += `<td class="sc-name sc-sub-name">${sub.type||'代打'} ${subPlayer?.name||'?'}
        <button class="sc-sub-del" onclick="deleteSub(${order},${sub.inning})" title="削除">×</button></td>`;
      for (let inn = 1; inn <= numInnings; inn++) {
        if (inn < sub.inning || inn > subEnd) {
          html += '<td class="sc-cell sc-na"></td>';
        } else {
          html += renderCell(order, inn);
        }
      }
      html += '</tr>';
    });

    // 代打/代走追加ボタン行
    html += `<tr class="sc-add-row"><td colspan="${numInnings + 2}">
      <button class="btn btn-link btn-sm py-0 px-1 text-muted" style="font-size:0.7rem" onclick="openSubModal(${order})">
        <i class="bi bi-person-plus"></i> 代打/代走
      </button>
    </td></tr>`;
  }

  html += '</tbody>';
  tbl.innerHTML = html;
}

function renderCell(order, inn) {
  const ab = getAtBatForCell(order, inn);
  if (ab) {
    const label = CELL_LABELS[ab.result] || ab.result || '?';
    const cls   = CELL_CLS[ab.result] || 'out';
    const dir   = ab.direction
      ? `<small class="cell-dir">${Stats.DIRECTION_LABELS[ab.direction]||ab.direction}</small>`
      : '';
    const rbi = ab.rbi > 0 ? `<small class="cell-rbi">${ab.rbi}点</small>` : '';
    return `<td class="sc-cell sc-${cls}" onclick="openCellAtbat(${order},${inn})">
      <div class="cell-res">${label}</div>${dir}${rbi}
    </td>`;
  }
  return `<td class="sc-cell sc-empty" onclick="openCellAtbat(${order},${inn})">
    <span class="cell-plus">＋</span>
  </td>`;
}

// セルタップで打席モーダルを開く
function openCellAtbat(order, inning) {
  currentOrder  = order;
  currentInning = inning;
  const players = Storage.getPlayers();
  const batter  = getBatterForSlot(order, inning, players);
  _preSelectPlayerId = batter?.playerId || null;
  const existingAb   = getAtBatForCell(order, inning);
  openAtbatModal(existingAb?.id || null, 'my');
}

// ===== 代打/代走モーダル =====
function openSubModal(order) {
  subTargetOrder = order;
  const players  = Storage.getPlayers();
  const sel = document.getElementById('subPlayerSel');
  sel.innerHTML = '<option value="">選択してください</option>'
    + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('subInning').value = '';
  document.getElementById('subType').value   = '代打';
  new bootstrap.Modal(document.getElementById('subModal')).show();
}

function saveSub() {
  const playerId = document.getElementById('subPlayerSel').value;
  const inning   = parseInt(document.getElementById('subInning').value);
  const type     = document.getElementById('subType').value;
  if (!playerId)              { showToast('選手を選択してください', 'warning'); return; }
  if (!inning || inning < 1)  { showToast('登場イニングを入力してください', 'warning'); return; }

  if (!GAME.mySubs) GAME.mySubs = [];
  if (GAME.mySubs.find(s => s.order === subTargetOrder && s.inning === inning)) {
    showToast('そのイニングにはすでに登録があります', 'warning'); return;
  }
  GAME.mySubs.push({ order: subTargetOrder, inning, playerId, type });
  Storage.updateGame(GAME);
  bootstrap.Modal.getInstance(document.getElementById('subModal')).hide();
  renderScorecard();
  showToast('代打/代走を登録しました');
}

function deleteSub(order, inning) {
  if (!confirm('この代打/代走を削除しますか？')) return;
  GAME.mySubs = (GAME.mySubs || []).filter(s => !(s.order === order && s.inning === inning));
  Storage.updateGame(GAME);
  renderScorecard();
  showToast('削除しました', 'secondary');
}

// ===== スコアボード =====
function buildScoreboard() {
  const numInnings = Math.max(
    getNumInnings(),
    (GAME.innings?.my  || []).length,
    (GAME.innings?.opp || []).length
  );
  const myArr  = GAME.innings?.my  || [];
  const oppArr = GAME.innings?.opp || [];

  document.getElementById('inningHeader').innerHTML =
    '<th class="team-name">チーム</th>'
    + Array.from({length: numInnings}, (_, i) => `<th>${i+1}</th>`).join('')
    + '<th class="total">計</th>';

  document.getElementById('myScoreRow').innerHTML =
    `<td class="team-name">${Storage.getTeamName()}</td>`
    + Array.from({length: numInnings}, (_, i) =>
        `<td><input type="number" class="score-input" min="0" value="${myArr[i]??''}"
          onchange="updateInningScore('my',${i},this.value)"></td>`
      ).join('')
    + `<td class="total" id="myTotal">${myArr.reduce((a,v) => a+(v||0), 0)}</td>`;

  document.getElementById('oppScoreRow').innerHTML =
    `<td class="team-name">${GAME.opponent}</td>`
    + Array.from({length: numInnings}, (_, i) =>
        `<td><input type="number" class="score-input" min="0" value="${oppArr[i]??''}"
          onchange="updateInningScore('opp',${i},this.value)"></td>`
      ).join('')
    + `<td class="total" id="oppTotal">${oppArr.reduce((a,v) => a+(v||0), 0)}</td>`;
}

function updateInningScore(team, idx, val) {
  if (!GAME.innings) GAME.innings = { my: [], opp: [] };
  GAME.innings[team][idx] = parseInt(val) || 0;
  const arr = GAME.innings[team];
  document.getElementById(team === 'my' ? 'myTotal' : 'oppTotal').textContent =
    arr.reduce((a, v) => a + (v || 0), 0);
  updateScoreDisplay();
}

function saveScore() {
  Storage.updateGame(GAME);
  updateScoreDisplay();
  renderPitcherAssignment(); // 失点が変わるので再計算
  showToast('スコアを保存しました');
}

// ===== 投手記録（自動集計） =====
function renderPitcherAssignment() {
  const numInnings = getNumInnings();
  const players    = Storage.getPlayers();
  const assigns    = GAME.myPitchersByInning || [];
  const decisions  = GAME.pitcherDecisions   || {};
  const manStats   = GAME.pitcherManualStats  || {};

  // イニングごとの投手選択グリッド
  let html = '<div class="pit-assign-grid">';
  for (let i = 1; i <= numInnings; i++) {
    const pid = assigns[i - 1] || '';
    html += `<div class="pit-assign-col">
      <div class="inn-lbl">${i}回</div>
      <select onchange="setPitcherForInning(${i},this.value)">
        <option value="">-</option>
        ${players.map(p =>
          `<option value="${p.id}" ${p.id===pid?'selected':''}>${p.name}</option>`
        ).join('')}
      </select>
    </div>`;
  }
  html += '</div>';

  // 投手ごとの自動集計
  const stats = computeAutoPitching();
  if (stats.length) {
    html += '<div class="mt-2">';
    stats.forEach(p => {
      const dec  = decisions[p.id] || '';
      const man  = manStats[p.id]  || {};
      html += `<div class="pit-stat-row">
        <span class="fw-semibold" style="min-width:56px">${p.name}</span>
        <span class="text-muted">${p.ip}回</span>
        <span class="text-danger">${p.r}失点</span>
        <span class="text-muted" style="font-size:0.75rem">
          被安:<input type="number" min="0" value="${man.hits||0}"
            onchange="setPitcherStat('${p.id}','hits',this.value)">
          K:<input type="number" min="0" value="${man.k||0}"
            onchange="setPitcherStat('${p.id}','k',this.value)">
          BB:<input type="number" min="0" value="${man.bb||0}"
            onchange="setPitcherStat('${p.id}','bb',this.value)">
        </span>
        <div class="d-flex gap-1">
          <button class="btn btn-xs ${dec==='win'?'btn-success':'btn-outline-secondary'}"
            onclick="setPitcherDecision('${p.id}','win')">勝</button>
          <button class="btn btn-xs ${dec==='loss'?'btn-danger':'btn-outline-secondary'}"
            onclick="setPitcherDecision('${p.id}','loss')">負</button>
          <button class="btn btn-xs ${dec==='save'?'btn-primary':'btn-outline-secondary'}"
            onclick="setPitcherDecision('${p.id}','save')">S</button>
        </div>
      </div>`;
    });
    html += `<div class="mt-2">
      <button class="btn btn-sm btn-outline-primary" onclick="savePitcherStats()">
        <i class="bi bi-save me-1"></i>投手記録を保存
      </button>
    </div>`;
    html += '</div>';
  }

  document.getElementById('pitcherAssignmentArea').innerHTML = html;
}

function setPitcherForInning(inning, playerId) {
  if (!GAME.myPitchersByInning) GAME.myPitchersByInning = [];
  GAME.myPitchersByInning[inning - 1] = playerId;
  Storage.updateGame(GAME);
  renderPitcherAssignment();
}

function setPitcherStat(playerId, stat, value) {
  if (!GAME.pitcherManualStats) GAME.pitcherManualStats = {};
  if (!GAME.pitcherManualStats[playerId]) GAME.pitcherManualStats[playerId] = {};
  GAME.pitcherManualStats[playerId][stat] = parseInt(value) || 0;
  Storage.updateGame(GAME);
}

function setPitcherDecision(playerId, decision) {
  if (!GAME.pitcherDecisions) GAME.pitcherDecisions = {};
  GAME.pitcherDecisions[playerId] =
    GAME.pitcherDecisions[playerId] === decision ? '' : decision;
  Storage.updateGame(GAME);
  renderPitcherAssignment();
}

// イニング割り当て × スコアから投手ごとのIP/失点を計算
function computeAutoPitching() {
  const assigns  = GAME.myPitchersByInning || [];
  const players  = Storage.getPlayers();
  const oppScore = GAME.innings?.opp || [];

  const map = {};
  assigns.forEach((pid, i) => {
    if (!pid) return;
    if (!map[pid]) {
      const pl = players.find(p => p.id === pid);
      map[pid] = { id: pid, name: pl?.name || '?', totalOuts: 0, r: 0 };
    }
    map[pid].totalOuts += 3;
    map[pid].r         += (oppScore[i] || 0);
  });

  return Object.values(map).map(p => ({
    ...p, ip: Stats.formatInnings(p.totalOuts)
  }));
}

// 投手記録を game.pitching に保存（ダッシュボード集計用）
function savePitcherStats() {
  autoGeneratePitchingRecords();
  showToast('投手記録を保存しました');
}

function autoGeneratePitchingRecords() {
  const pitStats  = computeAutoPitching();
  const decisions = GAME.pitcherDecisions   || {};
  const manStats  = GAME.pitcherManualStats  || {};

  pitStats.forEach(p => {
    const dec = decisions[p.id] || '';
    const man = manStats[p.id]  || {};
    const existing = (GAME.pitching || []).find(r => r.playerId === p.id && r.isMyTeam);

    const rec = {
      isMyTeam:    true,
      playerId:    p.id,
      pitcherName: p.name,
      innings:     p.ip,
      win:         dec === 'win',
      loss:        dec === 'loss',
      save:        dec === 'save',
      hits:        man.hits || 0,
      strikeouts:  man.k    || 0,
      walks:       man.bb   || 0,
      hbp:         0,
      runs:        p.r,
      earnedRuns:  p.r,
    };

    if (existing) {
      rec.id = existing.id;
      Storage.updatePitching(GAMEID, rec);
    } else {
      Storage.addPitching(GAMEID, rec);
    }
  });

  GAME = Storage.getGame(GAMEID);
}

function completeGame() {
  if (!confirm('試合を終了・確定しますか？')) return;
  autoGeneratePitchingRecords();
  GAME.status = 'completed';
  Storage.updateGame(GAME);
  showToast('試合を確定しました');
  renderStepBar();
}

// ===== 打席モーダル =====
function buildResultGrid() {
  document.getElementById('resultGrid').innerHTML = RESULT_GROUPS.map(r =>
    `<div class="result-btn ${r.cls}" data-code="${r.code}" onclick="selectResult('${r.code}')">${r.label}</div>`
  ).join('');
}

function initDirectionSvg() {
  document.querySelectorAll('#dirSvg .spray-zone').forEach(el => {
    el.addEventListener('click', () => selectDirection(el.getAttribute('data-dir')));
  });
}

function selectResult(code) {
  selectedResult = code;
  document.querySelectorAll('.result-btn').forEach(el =>
    el.classList.toggle('active', el.getAttribute('data-code') === code)
  );
  const needsDir = Stats.NEEDS_DIRECTION.has(code);
  document.getElementById('directionSection').style.display = needsDir ? '' : 'none';
  if (!needsDir) {
    selectedDirection = '';
    document.getElementById('dirLabel').textContent = '未選択';
    document.querySelectorAll('.spray-zone').forEach(z => z.classList.remove('selected-zone'));
  }
}

function selectDirection(dir) {
  selectedDirection = dir;
  document.querySelectorAll('#dirSvg .spray-zone').forEach(el =>
    el.classList.toggle('selected-zone', el.getAttribute('data-dir') === dir)
  );
  document.getElementById('dirLabel').textContent = Stats.DIRECTION_LABELS[dir] || dir;
}

function changeRbi(delta) {
  currentRbi = Math.max(0, currentRbi + delta);
  document.getElementById('rbiVal').textContent = currentRbi;
}

function openAtbatModal(abId, team) {
  selectedResult    = '';
  selectedDirection = '';
  currentRbi        = 0;
  document.getElementById('rbiVal').textContent = '0';
  document.getElementById('abNote').value       = '';
  document.getElementById('abId').value         = abId || '';
  document.getElementById('abTeam').value       = team;
  document.getElementById('directionSection').style.display = 'none';
  document.querySelectorAll('.result-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.spray-zone').forEach(el => el.classList.remove('selected-zone'));
  document.getElementById('dirLabel').textContent = '未選択';

  const isMyTeam = team === 'my';

  // モーダルタイトル
  if (currentInning && currentOrder) {
    document.getElementById('abModalTitle').textContent = `${currentInning}回 ${currentOrder}番打席`;
  } else {
    document.getElementById('abModalTitle').textContent =
      (isMyTeam ? '自チーム' : '相手チーム') + '打席を記録';
  }

  // 削除ボタン表示制御
  document.getElementById('abDeleteBtn').style.display = abId ? '' : 'none';

  // 打者セレクト
  const sel = document.getElementById('abBatter');
  if (isMyTeam) {
    const players = Storage.getPlayers();
    const lineup  = GAME.myLineup || [];
    const ordered = lineup
      .map(l => ({ order: l.order, player: players.find(p => p.id === l.playerId) }))
      .filter(x => x.player)
      .sort((a, b) => a.order - b.order);
    sel.innerHTML = '<option value="">選手を選択...</option>'
      + ordered.map(x =>
          `<option value="${x.player.id}">${x.order}番 ${x.player.name}</option>`
        ).join('')
      + players
          .filter(p => !lineup.some(l => l.playerId === p.id))
          .map(p => `<option value="${p.id}">${p.name}</option>`)
          .join('');
    // セルから開いた場合は事前選択（新規のみ）
    if (!abId && _preSelectPlayerId) {
      sel.value = _preSelectPlayerId;
    }
  } else {
    const lineup = GAME.oppLineup || [];
    sel.innerHTML = '<option value="">選手を選択...</option>'
      + lineup.map((l, i) =>
          `<option value="${l.name||i}">${l.order||i+1}番 ${l.name||'(未登録)'}</option>`
        ).join('');
    // 非スコアカード起動なのでcell状態をリセット
    currentOrder  = null;
    currentInning = null;
  }
  _preSelectPlayerId = null;

  // 既存データ読み込み（編集）
  if (abId) {
    const ab = (GAME.atBats || []).find(a => a.id === abId);
    if (ab) {
      sel.value  = ab.playerId || ab.playerName || '';
      currentRbi = ab.rbi || 0;
      document.getElementById('rbiVal').textContent = currentRbi;
      document.getElementById('abNote').value = ab.note || '';
      if (ab.result)    selectResult(ab.result);
      if (ab.direction) selectDirection(ab.direction);
    }
  }

  new bootstrap.Modal(document.getElementById('abModal')).show();
}

function saveAtBat() {
  const isMyTeam  = document.getElementById('abTeam').value === 'my';
  const batterVal = document.getElementById('abBatter').value;
  const abId      = document.getElementById('abId').value;

  if (!batterVal)     { showToast('打者を選択してください', 'warning'); return; }
  if (!selectedResult){ showToast('打席結果を選択してください', 'warning'); return; }
  if (Stats.NEEDS_DIRECTION.has(selectedResult) && !selectedDirection) {
    showToast('打球方向を選択してください', 'warning'); return;
  }

  const players    = Storage.getPlayers();
  const player     = isMyTeam ? players.find(p => p.id === batterVal) : null;

  const ab = {
    isMyTeam,
    playerId:   isMyTeam ? batterVal : null,
    playerName: player ? player.name : batterVal,
    result:     selectedResult,
    direction:  selectedDirection || null,
    rbi:        currentRbi,
    note:       document.getElementById('abNote').value.trim(),
    inning:     currentInning,
    order:      currentOrder,
  };

  if (abId) {
    ab.id = abId;
    Storage.updateAtBat(GAMEID, ab);
    showToast('打席を更新しました');
  } else {
    Storage.addAtBat(GAMEID, ab);
    showToast('打席を記録しました');
  }

  GAME = Storage.getGame(GAMEID);
  bootstrap.Modal.getInstance(document.getElementById('abModal')).hide();

  // スコアカード再描画
  if (isMyTeam) renderScorecard();
  currentOrder  = null;
  currentInning = null;
}

function deleteCurrentAtBat() {
  const abId = document.getElementById('abId').value;
  if (!abId) return;
  if (!confirm('この打席記録を削除しますか？')) return;

  Storage.deleteAtBat(GAMEID, abId);
  GAME = Storage.getGame(GAMEID);
  bootstrap.Modal.getInstance(document.getElementById('abModal')).hide();
  renderScorecard();
  currentOrder  = null;
  currentInning = null;
  showToast('削除しました', 'secondary');
}
