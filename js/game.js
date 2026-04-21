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

const CELL_LABELS = {
  '1B':'安',  '2B':'二',  '3B':'三',  'HR':'本',
  'BB':'四',  'HBP':'死', 'K':'振',   'KL':'振',
  'GO':'ゴ',  'FO':'飛',  'LO':'ラ',  'GIDP':'併',
  'SAC':'犠', 'SF':'犠飛','E':'E',    'FC':'FC'
};

const CELL_CLS = {
  '1B':'hit',  '2B':'hit',  '3B':'hit',  'HR':'hr',
  'BB':'walk', 'HBP':'walk',
  'K':'out',   'KL':'out',  'GO':'out',  'FO':'out',
  'LO':'out',  'GIDP':'out',
  'SAC':'spc', 'SF':'spc',  'E':'spc',   'FC':'spc'
};

// モーダル状態
let selectedResult      = '';
let selectedDirection   = '';
let currentRbi          = 0;
let currentPitches      = [];
let lastAutoAddedPitch  = false;

// 守備入替モーダル
let posSwapTeam = 'my';
let posSwapOpts  = '';

// タイマー
let timerInterval = null;
let timerSeconds  = 0;
let timerRunning  = false;

// スコアカードのセル編集状態
let currentOrder  = null;
let currentInning = null;
let _preSelectPlayerId = null;  // 自チーム事前選択
let _preSelectOppName  = null;  // 相手チーム事前選択

// 代打/代走モーダルの状態
let subTargetOrder = null;
let subTargetTeam  = 'my';

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  Crypto.requireAuth(() => {
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
    const isDone   = cur === 'record' && s.key === 'lineup';
    const isActive = s.key === cur;
    return `
      ${i > 0 ? '<span class="step-sep">›</span>' : ''}
      <div class="step-item">
        <div class="step-circle ${isDone?'done':isActive?'active':''}">${isDone?'✓':i+1}</div>
        <span class="step-label ${isActive?'active':''}">${s.label}</span>
      </div>`;
  }).join('');
}

function showStep(step) {
  document.getElementById('stepLineup').style.display = step === 'lineup' ? '' : 'none';
  document.getElementById('stepRecord').style.display = step === 'record'  ? '' : 'none';
}

// ===== STEP 1: スタメン登録 =====
let myLineupData  = [];
let oppLineupData = [];

function renderLineupSlots() {
  // 保存済みデータを復元しつつ、常に9枠以上を確保する
  const myBase  = (GAME.myLineup  && GAME.myLineup.length)  ? [...GAME.myLineup]  : [];
  const oppBase = (GAME.oppLineup && GAME.oppLineup.length) ? [...GAME.oppLineup] : [];
  while (myBase.length  < 9) myBase.push({ order: myBase.length  + 1, playerId: '', position: '' });
  while (oppBase.length < 9) oppBase.push({ order: oppBase.length + 1, name: '',     position: '' });
  myLineupData  = myBase;
  oppLineupData = oppBase;
  renderMySlots();
  renderOppSlots();
}

// 自チームスタメン（選手・ポジション重複防止）
function renderMySlots() {
  const players = Storage.getPlayers();
  const el = document.getElementById('myLineupSlots');
  el.innerHTML = myLineupData.map((slot, idx) => {
    const usedPlayers   = myLineupData.filter((_,i)=>i!==idx).map(s=>s.playerId).filter(Boolean);
    const usedPositions = myLineupData.filter((_,i)=>i!==idx).map(s=>s.position).filter(Boolean);
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
          const used = pos!=='DH' && usedPositions.includes(pos);
          return `<option value="${pos}" ${pos===slot.position?'selected':''} ${used?'disabled':''}>
            ${pos}${used?' *':''}
          </option>`;
        }).join('')}
      </select>
    </div>`;
  }).join('');
}

// 相手チームスタメン（ポジション重複防止）
function renderOppSlots() {
  const el = document.getElementById('oppLineupSlots');
  el.innerHTML = oppLineupData.map((slot, idx) => {
    const usedPositions = oppLineupData.filter((_,i)=>i!==idx).map(s=>s.position).filter(Boolean);
    return `<div class="lineup-row">
      <div class="order-label">${slot.order}</div>
      <input type="text" class="form-control form-control-sm" placeholder="選手名" value="${slot.name||''}"
        oninput="oppLineupData[${idx}].name=this.value">
      <select class="form-select form-select-sm" onchange="oppLineupData[${idx}].position=this.value;renderOppSlots()">
        <option value="">守備</option>
        ${POSITIONS.map(pos => {
          const used = pos!=='DH' && usedPositions.includes(pos);
          return `<option value="${pos}" ${pos===slot.position?'selected':''} ${used?'disabled':''}>
            ${pos}${used?' *':''}
          </option>`;
        }).join('')}
      </select>
    </div>`;
  }).join('');
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

function editLineup() {
  showStep('lineup');
  renderStepBar();
  renderLineupSlots();
}

function saveLineupAndGo() {
  GAME.myLineup  = myLineupData.filter(s => s.playerId);
  GAME.oppLineup = oppLineupData.filter(s => s.name);
  GAME.status    = 'recording';
  if (!GAME.numInnings) GAME.numInnings = 7;
  try {
    Storage.updateGame(GAME);
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'danger');
    console.error('saveLineupAndGo Storage.updateGame:', e);
    return;
  }
  renderStepBar();
  showStep('record');
  try {
    renderRecord();
  } catch (e) {
    console.error('saveLineupAndGo renderRecord:', e);
    showToast('画面の更新に失敗しました: ' + e.message, 'danger');
  }
  showToast('スタメンを保存しました');
}

// ===== STEP 2: 試合記録 =====

function getNumInnings() { return GAME.numInnings || 7; }

function snapshotScoreInputs() {
  if (!GAME.innings) GAME.innings = { my: [], opp: [] };
  if (!GAME.innings.my)  GAME.innings.my  = [];
  if (!GAME.innings.opp) GAME.innings.opp = [];
  document.querySelectorAll('.score-input[data-score-team]').forEach(inp => {
    const team = inp.dataset.scoreTeam;
    const idx  = parseInt(inp.dataset.scoreIdx);
    if (!isNaN(idx)) GAME.innings[team][idx] = parseInt(inp.value) || 0;
  });
}

function changeInnings(delta) {
  snapshotScoreInputs();
  const next = Math.max(1, Math.min(15, getNumInnings() + delta));
  if (next === getNumInnings()) return;
  GAME.numInnings = next;
  Storage.updateGame(GAME);
  renderScorecard();
  renderOppScorecard();
  buildScoreboard();
  renderPitcherAssignment();
  renderOppPitcherAssignment();
  const el = document.getElementById('scoreInnDisplay');
  if (el) el.textContent = next + '回';
  updateInningBadge();
}

function renderRecord() {
  document.getElementById('recTeamName').textContent = Storage.getTeamName();
  document.getElementById('recOpponent').textContent = GAME.opponent;
  document.getElementById('recDate').textContent     = GAME.date;
  const rOpp = document.getElementById('recOpponentSc');
  if (rOpp) rOpp.textContent = GAME.opponent;
  const sInn = document.getElementById('scoreInnDisplay');
  if (sInn) sInn.textContent = getNumInnings() + '回';
  updateScoreDisplay();
  updateInningBadge();
  updateHomeAwayDisplay();
  renderScorecard();
  renderOppScorecard();
  buildScoreboard();
  renderPitcherAssignment();
  renderOppPitcherAssignment();
}

function updateScoreDisplay() {
  const n   = getNumInnings();
  const my  = (GAME.innings?.my  || []).slice(0, n).reduce((a,v)=>a+(v||0),0);
  const opp = (GAME.innings?.opp || []).slice(0, n).reduce((a,v)=>a+(v||0),0);
  const myEl  = document.getElementById('recMyScore');
  const oppEl = document.getElementById('recOppScore');
  if (myEl)  myEl.textContent  = my;
  if (oppEl) oppEl.textContent = opp;
}

function updateInningBadge() {
  const badge = document.getElementById('recInningBadge');
  if (!badge) return;
  const n      = getNumInnings();
  const status = GAME.status === 'done' ? '試合終了' : '試合中';
  badge.textContent = `${n}回・${status}`;
}

// ===== 自チーム スコアカードグリッド =====

function getBatterForSlot(order, inning, players) {
  const subs = (GAME.mySubs || [])
    .filter(s => s.order === order && s.inning <= inning)
    .sort((a, b) => b.inning - a.inning);
  if (subs.length) {
    const sub = subs[0];
    const p = players.find(pl => pl.id === sub.playerId);
    return { playerId: sub.playerId, playerName: p?.name || '?', isSub: true };
  }
  const slot = (GAME.myLineup || []).find(l => l.order === order);
  if (!slot?.playerId) return null;
  const p = players.find(pl => pl.id === slot.playerId);
  return { playerId: slot.playerId, playerName: p?.name || '?', isSub: false };
}

function getAtBatForCell(order, inning) {
  return (GAME.atBats || []).find(ab =>
    ab.isMyTeam && ab.order === order && ab.inning === inning
  );
}

function getAtBatsForCell(order, inning) {
  return (GAME.atBats || []).filter(ab =>
    ab.isMyTeam && ab.order === order && ab.inning === inning
  );
}

function getOppAtBatsForCell(order, inning) {
  return (GAME.atBats || []).filter(ab =>
    !ab.isMyTeam && ab.order === order && ab.inning === inning
  );
}

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

  let html = '<thead><tr><th class="sc-ord">打</th><th class="sc-name">選手</th>';
  for (let i = 1; i <= numInnings; i++) html += `<th class="sc-inn">${i}</th>`;
  html += '</tr></thead><tbody>';

  for (const slot of sorted) {
    const order  = slot.order;
    const player = players.find(p => p.id === slot.playerId);
    const pos    = getPlayerCurrentPos(order, 'my');
    const firstSub = (GAME.mySubs || []).filter(s=>s.order===order).sort((a,b)=>a.inning-b.inning)[0];
    const starterEnd = firstSub ? firstSub.inning - 1 : numInnings;

    html += '<tr>';
    html += `<td class="sc-ord">${order}</td>`;
    html += `<td class="sc-name" style="font-size:0.88rem">${player?.name||'?'}<small class="sc-pos">${pos}</small></td>`;
    for (let inn = 1; inn <= numInnings; inn++) {
      html += inn > starterEnd ? '<td class="sc-cell sc-na"></td>' : renderMyCell(order, inn);
    }
    html += '</tr>';

    const subs = (GAME.mySubs||[]).filter(s=>s.order===order).sort((a,b)=>a.inning-b.inning);
    subs.forEach((sub, si) => {
      const subPlayer = players.find(p => p.id === sub.playerId);
      const nextSub   = subs[si + 1];
      const subEnd    = nextSub ? nextSub.inning - 1 : numInnings;
      const isDef     = sub.type === '守備交代';
      html += `<tr class="sc-sub-row${isDef?' sc-sub-def':''}">`;
      html += `<td class="sc-ord sc-sub-ord">${sub.inning}↑</td>`;
      html += `<td class="sc-name sc-sub-name">${sub.type||'代打'} ${subPlayer?.name||'?'}
        <button class="sc-sub-del" onclick="deleteSub(${order},${sub.inning})" title="削除">×</button></td>`;
      for (let inn = 1; inn <= numInnings; inn++) {
        html += (inn < sub.inning || inn > subEnd)
          ? '<td class="sc-cell sc-na"></td>'
          : renderMyCell(order, inn);
      }
      html += '</tr>';
    });
    // 守備位置入替サブ行
    const myPosChanges = (GAME.myPositionChanges||[])
      .filter(c => c.orderA === order || c.orderB === order)
      .sort((a,b) => a.inning - b.inning || (a.seq ?? 0) - (b.seq ?? 0));
    const seenMyGroups = new Set();
    for (const c of myPosChanges) {
      if (c.groupId) {
        if (seenMyGroups.has(c.groupId)) continue;
        seenMyGroups.add(c.groupId);
        const oldP = c.orderA === order ? c.origPosA : c.origPosB;
        const newP = getPosAfterGroup(order, c.groupId, 'my');
        html += `<tr class="sc-sub-row sc-sub-def">`;
        html += `<td class="sc-ord sc-sub-ord">${c.inning}↑</td>`;
        html += `<td class="sc-name sc-sub-name">守備 ${oldP||'?'}→${newP||'?'}
          <button class="sc-sub-del" onclick="deletePosSwapGroup('${c.groupId}','my')" title="削除">×</button></td>`;
        for (let inn = 1; inn <= numInnings; inn++) html += '<td class="sc-cell sc-na"></td>';
        html += '</tr>';
      } else {
        const isA  = c.orderA === order;
        const oldP = isA ? c.posA : c.posB;
        const newP = isA ? c.posB : c.posA;
        html += `<tr class="sc-sub-row sc-sub-def">`;
        html += `<td class="sc-ord sc-sub-ord">${c.inning}↑</td>`;
        html += `<td class="sc-name sc-sub-name">守備 ${oldP||'?'}→${newP||'?'}
          <button class="sc-sub-del" onclick="deletePosSwap(${c.inning},${c.orderA},${c.orderB},'my')" title="削除">×</button></td>`;
        for (let inn = 1; inn <= numInnings; inn++) html += '<td class="sc-cell sc-na"></td>';
        html += '</tr>';
      }
    }
  }
  html += '</tbody>';
  tbl.innerHTML = html;
}

function renderAbEntries(abs, editFn) {
  return abs.map(ab => {
    const label = CELL_LABELS[ab.result] || ab.result || '?';
    const cls   = CELL_CLS[ab.result] || 'out';
    const dir   = ab.direction ? `<small class="cell-dir">${Stats.DIRECTION_LABELS[ab.direction]||ab.direction}</small>` : '';
    const rbi   = ab.rbi > 0 ? `<small class="cell-rbi">${ab.rbi}点</small>` : '';
    return `<div class="sc-ab-entry sc-${cls}" onclick="${editFn(ab.id)};event.stopPropagation()">
      <div class="cell-res">${label}</div>${dir}${rbi}
    </div>`;
  }).join('');
}

function renderMyCell(order, inn) {
  const abs = getAtBatsForCell(order, inn);
  if (!abs.length) {
    return `<td class="sc-cell sc-empty" onclick="openCellAtbat(${order},${inn},null)">
      <span class="cell-plus">＋</span>
    </td>`;
  }
  return `<td class="sc-cell sc-multi" onclick="openCellAtbat(${order},${inn},null)">
    ${renderAbEntries(abs, id => `openCellAtbat(${order},${inn},'${id}')`)}
    <div class="sc-ab-add">＋</div>
  </td>`;
}

function openCellAtbat(order, inning, abId = null) {
  currentOrder  = order;
  currentInning = inning;
  const players = Storage.getPlayers();
  const batter  = getBatterForSlot(order, inning, players);
  _preSelectPlayerId = batter?.playerId || null;
  openAtbatModal(abId, 'my');
}

// ===== 相手チーム スコアカードグリッド =====

function getOppAtBatForCell(order, inning) {
  return (GAME.atBats || []).find(ab =>
    !ab.isMyTeam && ab.order === order && ab.inning === inning
  );
}

function getOppBatterForSlot(order, inning) {
  const subs = (GAME.oppSubs || [])
    .filter(s => s.order === order && s.inning <= inning)
    .sort((a, b) => b.inning - a.inning);
  if (subs.length) return { name: subs[0].name, isSub: true };
  const slot = (GAME.oppLineup || []).find(l => l.order === order);
  return slot ? { name: slot.name || '', isSub: false } : null;
}

function renderOppScorecard() {
  const numInnings = getNumInnings();
  const oppLineup  = GAME.oppLineup || [];
  const sorted = [...oppLineup].filter(s => s.name).sort((a, b) => a.order - b.order);
  const tbl = document.getElementById('oppScorecardTable');

  if (!sorted.length) {
    tbl.innerHTML = '<tbody><tr><td colspan="10" class="empty-msg py-3">相手スタメンが登録されていません</td></tr></tbody>';
    return;
  }

  let html = '<thead><tr><th class="sc-ord">打</th><th class="sc-name">選手</th>';
  for (let i = 1; i <= numInnings; i++) html += `<th class="sc-inn">${i}</th>`;
  html += '</tr></thead><tbody>';

  for (const slot of sorted) {
    const order = slot.order;
    const name  = slot.name || '';
    const pos   = getPlayerCurrentPos(order, 'opp');
    const firstSub = (GAME.oppSubs||[]).filter(s=>s.order===order).sort((a,b)=>a.inning-b.inning)[0];
    const starterEnd = firstSub ? firstSub.inning - 1 : numInnings;

    html += '<tr>';
    html += `<td class="sc-ord">${order}</td>`;
    html += `<td class="sc-name" style="font-size:0.88rem">${name}<small class="sc-pos">${pos}</small></td>`;
    for (let inn = 1; inn <= numInnings; inn++) {
      html += inn > starterEnd ? '<td class="sc-cell sc-na"></td>' : renderOppCell(order, inn);
    }
    html += '</tr>';

    const subs = (GAME.oppSubs||[]).filter(s=>s.order===order).sort((a,b)=>a.inning-b.inning);
    subs.forEach((sub, si) => {
      const nextSub = subs[si + 1];
      const subEnd  = nextSub ? nextSub.inning - 1 : numInnings;
      const isDef   = sub.type === '守備交代';
      html += `<tr class="sc-sub-row${isDef?' sc-sub-def':''}">`;
      html += `<td class="sc-ord sc-sub-ord">${sub.inning}↑</td>`;
      html += `<td class="sc-name sc-sub-name">${sub.type||'代打'} ${sub.name||'?'}
        <button class="sc-sub-del" onclick="deleteOppSub(${order},${sub.inning})" title="削除">×</button></td>`;
      for (let inn = 1; inn <= numInnings; inn++) {
        html += (inn < sub.inning || inn > subEnd)
          ? '<td class="sc-cell sc-na"></td>'
          : renderOppCell(order, inn);
      }
      html += '</tr>';
    });
    // 守備位置入替サブ行
    const oppPosChanges = (GAME.oppPositionChanges||[])
      .filter(c => c.orderA === order || c.orderB === order)
      .sort((a,b) => a.inning - b.inning || (a.seq ?? 0) - (b.seq ?? 0));
    const seenOppGroups = new Set();
    for (const c of oppPosChanges) {
      if (c.groupId) {
        if (seenOppGroups.has(c.groupId)) continue;
        seenOppGroups.add(c.groupId);
        const oldP = c.orderA === order ? c.origPosA : c.origPosB;
        const newP = getPosAfterGroup(order, c.groupId, 'opp');
        html += `<tr class="sc-sub-row sc-sub-def">`;
        html += `<td class="sc-ord sc-sub-ord">${c.inning}↑</td>`;
        html += `<td class="sc-name sc-sub-name">守備 ${oldP||'?'}→${newP||'?'}
          <button class="sc-sub-del" onclick="deletePosSwapGroup('${c.groupId}','opp')" title="削除">×</button></td>`;
        for (let inn = 1; inn <= numInnings; inn++) html += '<td class="sc-cell sc-na"></td>';
        html += '</tr>';
      } else {
        const isA  = c.orderA === order;
        const oldP = isA ? c.posA : c.posB;
        const newP = isA ? c.posB : c.posA;
        html += `<tr class="sc-sub-row sc-sub-def">`;
        html += `<td class="sc-ord sc-sub-ord">${c.inning}↑</td>`;
        html += `<td class="sc-name sc-sub-name">守備 ${oldP||'?'}→${newP||'?'}
          <button class="sc-sub-del" onclick="deletePosSwap(${c.inning},${c.orderA},${c.orderB},'opp')" title="削除">×</button></td>`;
        for (let inn = 1; inn <= numInnings; inn++) html += '<td class="sc-cell sc-na"></td>';
        html += '</tr>';
      }
    }
  }
  html += '</tbody>';
  tbl.innerHTML = html;
}

function renderOppCell(order, inn) {
  const abs = getOppAtBatsForCell(order, inn);
  if (!abs.length) {
    return `<td class="sc-cell sc-empty" onclick="openOppCellAtbat(${order},${inn},null)">
      <span class="cell-plus">＋</span>
    </td>`;
  }
  return `<td class="sc-cell sc-multi" onclick="openOppCellAtbat(${order},${inn},null)">
    ${renderAbEntries(abs, id => `openOppCellAtbat(${order},${inn},'${id}')`)}
    <div class="sc-ab-add">＋</div>
  </td>`;
}

function openOppCellAtbat(order, inning, abId = null) {
  currentOrder  = order;
  currentInning = inning;
  const batter  = getOppBatterForSlot(order, inning);
  _preSelectOppName = batter?.name || null;
  openAtbatModal(abId, 'opp');
}

// 共通のセル描画ヘルパー
function renderFilledCell(ab, onclickStr) {
  const label = CELL_LABELS[ab.result] || ab.result || '?';
  const cls   = CELL_CLS[ab.result] || 'out';
  const dir   = ab.direction
    ? `<small class="cell-dir">${Stats.DIRECTION_LABELS[ab.direction]||ab.direction}</small>` : '';
  const rbi = ab.rbi > 0 ? `<small class="cell-rbi">${ab.rbi}点</small>` : '';
  return `<td class="sc-cell sc-${cls}" onclick="${onclickStr}">
    <div class="cell-res">${label}</div>${dir}${rbi}
  </td>`;
}

function renderEmptyCell(onclickStr) {
  return `<td class="sc-cell sc-empty" onclick="${onclickStr}">
    <span class="cell-plus">＋</span>
  </td>`;
}

// ===== 代打/代走モーダル（両チーム共通）=====
function openSubModal(order, team = 'my', type = '代打') {
  subTargetOrder = order || null;
  subTargetTeam  = team;

  const replSel = document.getElementById('subReplaceOrder');
  const replTxt = document.getElementById('subReplaceText');
  const sel     = document.getElementById('subPlayerSel');
  const txt     = document.getElementById('subPlayerText');

  if (team === 'my') {
    // 退く選手：現在出場中の選手（交代済みは最新の交代選手を表示）
    replSel.style.display = '';
    replTxt.style.display = 'none';
    const players = Storage.getPlayers();
    const lineup  = (GAME.myLineup || []).filter(l => l.playerId).sort((a,b) => a.order - b.order);
    const mySubs  = GAME.mySubs || [];
    replSel.innerHTML = '<option value="">選択してください</option>'
      + lineup.map(l => {
          const latestSub = mySubs
            .filter(s => s.order === l.order)
            .sort((a,b) => b.inning - a.inning)[0];
          const currentId = latestSub ? latestSub.playerId : l.playerId;
          const p = players.find(pl => pl.id === currentId);
          return `<option value="${l.order}">${l.order}番 ${p?.name || '?'}</option>`;
        }).join('');
    if (order) replSel.value = String(order);
    // 交代選手：全登録選手
    sel.style.display = '';
    txt.style.display = 'none';
    sel.innerHTML = '<option value="">選択してください</option>'
      + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    txt.value = '';
  } else {
    // 退く選手：現在出場中の相手選手（交代済みは最新の交代選手を表示）
    replSel.style.display = '';
    replTxt.style.display = 'none';
    const oppLineup = (GAME.oppLineup || []).filter(l => l.name).sort((a,b) => a.order - b.order);
    const oppSubs   = GAME.oppSubs || [];
    replSel.innerHTML = '<option value="">選択してください</option>'
      + oppLineup.map(l => {
          const latestSub = oppSubs
            .filter(s => s.order === l.order)
            .sort((a,b) => b.inning - a.inning)[0];
          const currentName = latestSub ? latestSub.name : l.name;
          return `<option value="${l.order}">${l.order}番 ${currentName}</option>`;
        }).join('');
    if (order) replSel.value = String(order);
    // 交代選手：テキスト入力
    sel.style.display = 'none';
    txt.style.display = '';
    sel.innerHTML = '';
    txt.value = '';
  }

  document.getElementById('subInning').value = '';
  document.getElementById('subType').value   = type;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('subModal')).show();
}

function saveSub() {
  const inning = parseInt(document.getElementById('subInning').value);
  const type   = document.getElementById('subType').value;
  if (!inning || inning < 1) { showToast('登場イニングを入力してください', 'warning'); return; }

  // 退く選手の打順を確定
  const replOrder = subTargetOrder || parseInt(document.getElementById('subReplaceOrder').value);
  if (!replOrder) { showToast('退く選手を選択してください', 'warning'); return; }
  subTargetOrder = replOrder;

  if (subTargetTeam === 'my') {
    const playerId = document.getElementById('subPlayerSel').value;
    if (!playerId) { showToast('交代選手を選択してください', 'warning'); return; }
    if (!GAME.mySubs) GAME.mySubs = [];
    if (GAME.mySubs.find(s => s.order === subTargetOrder && s.inning === inning)) {
      showToast('そのイニングにはすでに登録があります', 'warning'); return;
    }
    GAME.mySubs.push({ order: subTargetOrder, inning, playerId, type });
    Storage.updateGame(GAME);
    bootstrap.Modal.getInstance(document.getElementById('subModal')).hide();
    renderScorecard();
  } else {
    const name = document.getElementById('subPlayerText').value.trim();
    if (!name) { showToast('選手名を入力してください', 'warning'); return; }
    if (!GAME.oppSubs) GAME.oppSubs = [];
    if (GAME.oppSubs.find(s => s.order === subTargetOrder && s.inning === inning)) {
      showToast('そのイニングにはすでに登録があります', 'warning'); return;
    }
    GAME.oppSubs.push({ order: subTargetOrder, inning, name, type });
    Storage.updateGame(GAME);
    bootstrap.Modal.getInstance(document.getElementById('subModal')).hide();
    renderOppScorecard();
  }
  showToast('代打/代走を登録しました');
}

// ===== 守備位置入替 =====

function getPlayerCurrentPos(order, team = 'my') {
  const lineup  = team === 'my' ? (GAME.myLineup  || []) : (GAME.oppLineup  || []);
  const changes = team === 'my' ? (GAME.myPositionChanges || []) : (GAME.oppPositionChanges || []);
  const slot    = lineup.find(l => l.order === order);
  let pos = slot?.position || '';
  // swapレコードを時系列順に適用
  const swaps = changes
    .filter(c => c.orderA === order || c.orderB === order)
    .sort((a, b) => a.inning - b.inning || (a.seq ?? 0) - (b.seq ?? 0));
  for (const c of swaps) {
    pos = c.orderA === order ? c.posB : c.posA;
  }
  return pos;
}

function openPosSwapModal(team = 'my') {
  posSwapTeam = team;
  const players  = Storage.getPlayers();

  const buildOpts = (lineup, subs, isMyTeam) =>
    '<option value="">選択してください</option>' +
    lineup.map(l => {
      const latest = (subs || []).filter(s => s.order === l.order).sort((a,b) => b.inning - a.inning)[0];
      const name   = isMyTeam
        ? (players.find(p => p.id === (latest?.playerId || l.playerId))?.name || '?')
        : (latest?.name || l.name || '?');
      const pos = getPlayerCurrentPos(l.order, team) || '—';
      return `<option value="${l.order}">${l.order}番 ${name}（${pos}）</option>`;
    }).join('');

  if (team === 'my') {
    const lineup = (GAME.myLineup || []).filter(l => l.playerId).sort((a,b) => a.order - b.order);
    posSwapOpts  = buildOpts(lineup, GAME.mySubs, true);
  } else {
    const lineup = (GAME.oppLineup || []).filter(l => l.name).sort((a,b) => a.order - b.order);
    posSwapOpts  = buildOpts(lineup, GAME.oppSubs, false);
  }

  const list = document.getElementById('posSwapList');
  list.innerHTML = '';
  addPosSwapRow();
  addPosSwapRow();

  document.getElementById('posSwapInning').value = '';
  document.getElementById('posSwapPreview').style.display = 'none';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('posSwapModal')).show();
}

function addPosSwapRow() {
  const list = document.getElementById('posSwapList');
  const idx  = list.children.length;
  const div  = document.createElement('div');
  div.className = 'd-flex align-items-center gap-2 mb-2';
  div.innerHTML =
    `<span class="text-muted small fw-semibold" style="min-width:20px">${idx + 1}</span>` +
    `<select class="form-select form-select-sm posSwapSelect" onchange="renderPosSwapPreview()">${posSwapOpts}</select>` +
    (idx >= 2
      ? `<button type="button" class="btn btn-outline-danger btn-sm px-2" onclick="removePosSwapRow(this)">－</button>`
      : `<span style="width:38px"></span>`);
  list.appendChild(div);
}

function removePosSwapRow(btn) {
  btn.closest('div').remove();
  document.querySelectorAll('#posSwapList > div').forEach((row, i) => {
    row.querySelector('span').textContent = i + 1;
  });
  renderPosSwapPreview();
}

function renderPosSwapPreview() {
  const orders  = [...document.querySelectorAll('.posSwapSelect')]
    .map(s => parseInt(s.value)).filter(v => v > 0);
  const preview = document.getElementById('posSwapPreview');
  if (orders.length < 2 || new Set(orders).size !== orders.length) {
    preview.style.display = 'none'; return;
  }
  const positions = orders.map(o => getPlayerCurrentPos(o, posSwapTeam) || '?');
  const parts = orders.map((o, i) => `${o}番 <b>${positions[(i + 1) % orders.length]}</b>`);
  preview.style.display = '';
  preview.innerHTML = '入替後: ' + parts.join(' ／ ');
}

function savePosSwap() {
  const inning = parseInt(document.getElementById('posSwapInning').value);
  if (!inning || inning < 1) { showToast('イニングを入力してください', 'warning'); return; }

  const orders = [...document.querySelectorAll('.posSwapSelect')].map(s => parseInt(s.value));
  if (orders.some(o => isNaN(o) || !o))       { showToast('全ての選手を選択してください', 'warning'); return; }
  if (new Set(orders).size !== orders.length)  { showToast('同じ選手が重複しています', 'warning'); return; }

  const key = posSwapTeam === 'my' ? 'myPositionChanges' : 'oppPositionChanges';
  if (!GAME[key]) GAME[key] = [];

  const origPositions = orders.map(o => getPlayerCurrentPos(o, posSwapTeam));
  const runningPos    = [...origPositions];
  const groupId       = orders.length >= 3 ? `g_${Date.now()}` : undefined;

  for (let i = 0; i < orders.length - 1; i++) {
    const entry = {
      inning,
      orderA: orders[i],   posA: runningPos[i],
      orderB: orders[i+1], posB: runningPos[i+1],
      seq: i,
      origPosA: origPositions[i],
      origPosB: origPositions[i+1]
    };
    if (groupId) entry.groupId = groupId;
    GAME[key].push(entry);
    runningPos[i+1] = runningPos[i];
  }

  Storage.updateGame(GAME);
  bootstrap.Modal.getInstance(document.getElementById('posSwapModal')).hide();
  if (posSwapTeam === 'my') renderScorecard(); else renderOppScorecard();
  showToast('守備位置を入れ替えました');
}

function getPosAfterGroup(order, groupId, team) {
  const lineup  = team === 'my' ? (GAME.myLineup  || []) : (GAME.oppLineup  || []);
  const changes = team === 'my' ? (GAME.myPositionChanges || []) : (GAME.oppPositionChanges || []);
  const slot    = lineup.find(l => l.order === order);
  let pos = slot?.position || '';
  const groupChanges = changes.filter(c => c.groupId === groupId);
  const groupInning  = groupChanges[0]?.inning ?? 0;
  const maxSeq       = Math.max(...groupChanges.map(c => c.seq ?? 0));
  const swaps = changes
    .filter(c => c.orderA === order || c.orderB === order)
    .filter(c => c.inning < groupInning ||
                 (c.inning === groupInning && (c.seq ?? 0) <= maxSeq))
    .sort((a, b) => a.inning - b.inning || (a.seq ?? 0) - (b.seq ?? 0));
  for (const c of swaps) {
    pos = c.orderA === order ? c.posB : c.posA;
  }
  return pos;
}

function deletePosSwapGroup(groupId, team) {
  if (!confirm('この守備位置入替（循環）を削除しますか？')) return;
  const key = team === 'my' ? 'myPositionChanges' : 'oppPositionChanges';
  GAME[key] = (GAME[key] || []).filter(c => c.groupId !== groupId);
  Storage.updateGame(GAME);
  if (team === 'my') renderScorecard(); else renderOppScorecard();
  showToast('守備位置入替を削除しました');
}

function deletePosSwap(inning, orderA, orderB, team) {
  if (!confirm('この守備位置入替を削除しますか？')) return;
  const key = team === 'my' ? 'myPositionChanges' : 'oppPositionChanges';
  GAME[key] = (GAME[key] || []).filter(c =>
    !(c.inning === inning && c.orderA === orderA && c.orderB === orderB)
  );
  Storage.updateGame(GAME);
  if (team === 'my') renderScorecard(); else renderOppScorecard();
}

function deleteSub(order, inning) {
  if (!confirm('この代打/代走を削除しますか？')) return;
  GAME.mySubs = (GAME.mySubs||[]).filter(s => !(s.order===order && s.inning===inning));
  Storage.updateGame(GAME);
  renderScorecard();
  showToast('削除しました', 'secondary');
}

function deleteOppSub(order, inning) {
  if (!confirm('この代打/代走を削除しますか？')) return;
  GAME.oppSubs = (GAME.oppSubs||[]).filter(s => !(s.order===order && s.inning===inning));
  Storage.updateGame(GAME);
  renderOppScorecard();
  showToast('削除しました', 'secondary');
}

// ===== スコアボード =====
function buildScoreboard() {
  const numInnings = getNumInnings();
  const myArr  = GAME.innings?.my  || [];
  const oppArr = GAME.innings?.opp || [];
  const isHome = GAME.isHome ?? true;

  document.getElementById('inningHeader').innerHTML =
    '<th class="team-name">チーム</th>'
    + Array.from({length: numInnings}, (_, i) => `<th>${i+1}</th>`).join('')
    + '<th class="total">計</th>';

  // チームの行HTMLを生成（先攻/後攻ラベル付き）
  function rowHtml(team, label) {
    const arr  = team === 'my' ? myArr : oppArr;
    const name = team === 'my' ? Storage.getTeamName() : GAME.opponent;
    return `<tr id="${team}ScoreRow">
      <td class="team-name">
        ${name}<small class="text-muted ms-1" style="font-size:0.65rem">${label}</small>
      </td>
      ${Array.from({length: numInnings}, (_, i) =>
        `<td><input type="number" class="score-input" data-score-team="${team}" data-score-idx="${i}" min="0" value="${arr[i]??''}"
          onchange="updateInningScore('${team}',${i},this.value)"></td>`
      ).join('')}
      <td class="total" id="${team}Total">${arr.slice(0,numInnings).reduce((a,v)=>a+(v||0),0)}</td>
    </tr>`;
  }

  // 先攻チームを上行・後攻チームを下行に表示
  const tbody = document.querySelector('#scoreboard tbody');
  tbody.innerHTML = isHome
    ? rowHtml('opp', '先攻') + rowHtml('my',  '後攻')  // 自チームが後攻
    : rowHtml('my',  '先攻') + rowHtml('opp', '後攻'); // 自チームが先攻
}

function updateInningScore(team, idx, val) {
  if (!GAME.innings) GAME.innings = { my: [], opp: [] };
  GAME.innings[team][idx] = parseInt(val) || 0;
  const arr    = GAME.innings[team];
  const totalEl = document.getElementById(team==='my'?'myTotal':'oppTotal');
  const n = getNumInnings();
  if (totalEl) totalEl.textContent = arr.slice(0,n).reduce((a,v) => a+(v||0), 0);
  updateScoreDisplay();
  Storage.updateGame(GAME);
}

function saveScore() {
  Storage.updateGame(GAME);
  updateScoreDisplay();
  renderPitcherAssignment();
  renderOppPitcherAssignment();
  showToast('スコアを保存しました');
}

// ===== 投手記録（交代対応・自動集計）=====

// 指定イニングを担当する投手エントリを返す
function getPitcherForInning(changes, inning) {
  const sorted = changes.slice().sort((a,b) => a.entryInning - b.entryInning);
  let result = null;
  for (const ch of sorted) {
    if (ch.entryInning <= inning) result = ch;
    else break;
  }
  return result;
}


function migratePitcherData() {
  if (GAME.myPitchersByInning && !GAME.myPitcherChanges) {
    const changes = [];
    let lastPid = null;
    (GAME.myPitchersByInning).forEach((pid, i) => {
      if (pid && pid !== lastPid) {
        changes.push({ id:'pc_migr_'+i, playerId:pid, entryInning:i+1, entryOuts:0 });
        lastPid = pid;
      }
    });
    if (changes.length) { GAME.myPitcherChanges = changes; Storage.updateGame(GAME); }
  }
}

function computePitcherStats() {
  migratePitcherData();
  const changes = (GAME.myPitcherChanges || []).slice()
    .sort((a,b) => (a.entryInning-1)*3+a.entryOuts - ((b.entryInning-1)*3+b.entryOuts));
  if (!changes.length) return [];

  const numInnings  = getNumInnings();
  const oppScore    = GAME.innings?.opp || [];
  const players     = Storage.getPlayers();
  const manStats    = GAME.pitcherManualStats || {};
  const decisions   = GAME.pitcherDecisions   || {};
  const byPitcher   = {};

  changes.forEach((ch, i) => {
    const pid = ch.playerId;
    if (!pid) return;
    if (!byPitcher[pid]) {
      const pl = players.find(p => p.id === pid);
      byPitcher[pid] = { name: pl?.name||'?', totalOuts: 0, runs: 0, autoHits: 0, autoBb: 0, autoK: 0, autoPitches: 0 };
    }
    const next          = changes[i + 1];
    const myEntry       = (ch.entryInning-1)*3 + ch.entryOuts;
    const nextEntry     = next ? (next.entryInning-1)*3 + next.entryOuts : numInnings*3;
    byPitcher[pid].totalOuts += (nextEntry - myEntry);

    for (let inn = 1; inn <= numInnings; inn++) {
      const endOuts = inn * 3;
      if (myEntry >= endOuts) continue;
      if (next && (next.entryInning-1)*3+next.entryOuts < endOuts) continue;
      byPitcher[pid].runs += (oppScore[inn-1] || 0);
    }
  });

  // 打席記録（相手打者）から被安打・四死球・三振を自動集計
  const validChanges = changes.filter(c => c.playerId);
  (GAME.atBats || []).filter(ab => !ab.isMyTeam && ab.inning).forEach(ab => {
    const ch = getPitcherForInning(validChanges, ab.inning);
    if (!ch || !byPitcher[ch.playerId]) return;
    const s = byPitcher[ch.playerId];
    if (['1B','2B','3B','HR'].includes(ab.result)) s.autoHits++;
    if (['BB','HBP'].includes(ab.result))          s.autoBb++;
    if (['K','KL'].includes(ab.result))            s.autoK++;
    s.autoPitches += (ab.pitches?.length || 0);
  });

  return Object.entries(byPitcher).map(([pid, s]) => ({
    id:         pid, name: s.name,
    ip:         Stats.formatInnings(s.totalOuts), totalOuts: s.totalOuts,
    r:          s.runs,
    hits:       manStats[pid]?.hits ?? s.autoHits,
    k:          manStats[pid]?.k    ?? s.autoK,
    bb:         manStats[pid]?.bb   ?? s.autoBb,
    pitches:    s.autoPitches,
    hitsAuto:   s.autoHits,
    kAuto:      s.autoK,
    bbAuto:     s.autoBb,
    dec:        decisions[pid] || '',
  }));
}

function renderPitcherAssignment() {
  migratePitcherData();
  const numInnings = getNumInnings();
  const players    = Storage.getPlayers();
  const changes    = (GAME.myPitcherChanges || []).slice()
    .sort((a,b) => (a.entryInning-1)*3+a.entryOuts - ((b.entryInning-1)*3+b.entryOuts));

  const playerOptions = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  let html = '<div class="mb-2">';
  if (!changes.length) {
    html += `<p class="text-muted small mb-2">「先発投手を追加」ボタンで投手を登録してください</p>`;
  } else {
    changes.forEach((ch, i) => {
      const isFirst = i === 0;
      const pid = ch.playerId || '';
      const sel = `<option value="">選手を選択</option>${playerOptions}`.replace(
        `value="${pid}"`, `value="${pid}" selected`
      );
      if (isFirst) {
        html += `<div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <span class="badge bg-secondary">先発</span>
          <select class="form-select form-select-sm" style="width:auto"
            onchange="updatePitcherChange('${ch.id}','playerId',this.value)">${sel}</select>
          ${changes.length>1 ? `<button class="btn btn-xs btn-outline-danger" onclick="deletePitcherChange('${ch.id}')">×</button>` : ''}
        </div>`;
      } else {
        const innOpts = Array.from({length:numInnings}, (_,k) => {
          const v = k+1;
          return `<option value="${v}" ${v===ch.entryInning?'selected':''}>${v}回</option>`;
        }).join('');
        const outsOpts = [0,1,2].map(o =>
          `<option value="${o}" ${o===ch.entryOuts?'selected':''}>${['回頭','1アウト時','2アウト時'][o]}</option>`
        ).join('');
        html += `<div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <span class="badge bg-warning text-dark">交代</span>
          <select class="form-select form-select-sm" style="width:auto"
            onchange="updatePitcherChange('${ch.id}','entryInning',this.value)">${innOpts}</select>
          <select class="form-select form-select-sm" style="width:auto"
            onchange="updatePitcherChange('${ch.id}','entryOuts',this.value)">${outsOpts}</select>
          <span class="text-muted small">から</span>
          <select class="form-select form-select-sm" style="width:auto"
            onchange="updatePitcherChange('${ch.id}','playerId',this.value)">${sel}</select>
          <button class="btn btn-xs btn-outline-danger" onclick="deletePitcherChange('${ch.id}')">×</button>
        </div>`;
      }
    });
  }
  html += `</div>
  <button class="btn btn-sm btn-outline-primary mb-2" onclick="addPitcherChange()">
    <i class="bi bi-plus-circle me-1"></i>${changes.length===0 ? '先発投手を追加' : '投手交代を追加'}
  </button>`;

  const stats = computePitcherStats();
  if (stats.length) {
    html += '<div class="mt-1 border-top pt-2">';
    stats.forEach(p => {
      const dec = p.dec;
      html += `<div class="pit-stat-row">
        <span class="fw-semibold" style="min-width:56px">${p.name}</span>
        <span class="text-muted">${p.ip}回</span>
        <span class="text-danger">${p.r}失点</span>
        <span class="text-muted" style="font-size:0.75rem">
          被安:<input type="number" min="0" value="${p.hits}" onchange="setPitcherStat('${p.id}','hits',this.value)">
          K:<input type="number" min="0" value="${p.k}" onchange="setPitcherStat('${p.id}','k',this.value)">
          BB:<input type="number" min="0" value="${p.bb}" onchange="setPitcherStat('${p.id}','bb',this.value)">
        </span>
        ${p.pitches > 0 ? `<span class="badge bg-light text-dark border" style="font-size:0.72rem">${p.pitches}球</span>` : ''}
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
    </div></div>`;
  }
  document.getElementById('pitcherAssignmentArea').innerHTML = html;
}

function addPitcherChange() {
  if (!GAME.myPitcherChanges) GAME.myPitcherChanges = [];
  const sorted = (GAME.myPitcherChanges).slice()
    .sort((a,b) => (a.entryInning-1)*3+a.entryOuts - ((b.entryInning-1)*3+b.entryOuts));
  const last = sorted.slice(-1)[0];
  GAME.myPitcherChanges.push({
    id: 'pc_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    playerId: '',
    entryInning: last ? Math.min(last.entryInning+1, getNumInnings()) : 1,
    entryOuts: 0,
  });
  Storage.updateGame(GAME);
  renderPitcherAssignment();
}

function deletePitcherChange(id) {
  if (!confirm('この投手エントリを削除しますか？')) return;
  GAME.myPitcherChanges = (GAME.myPitcherChanges||[]).filter(c => c.id !== id);
  Storage.updateGame(GAME);
  renderPitcherAssignment();
}

function updatePitcherChange(id, field, value) {
  const ch = (GAME.myPitcherChanges||[]).find(c => c.id === id);
  if (!ch) return;
  ch[field] = (field==='entryInning'||field==='entryOuts') ? (parseInt(value)||0) : value;
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

function savePitcherStats() {
  autoGeneratePitchingRecords();
  showToast('投手記録を保存しました');
}

function autoGeneratePitchingRecords() {
  const pitStats  = computePitcherStats();
  const decisions = GAME.pitcherDecisions   || {};
  const manStats  = GAME.pitcherManualStats  || {};
  const manualOnly = (GAME.pitching||[]).filter(r => !r._auto);

  pitStats.forEach(p => {
    const dec = decisions[p.id] || '';
    manualOnly.push({
      _auto:       true,
      id:          'pit_auto_' + p.id,
      isMyTeam:    true,
      playerId:    p.id,
      pitcherName: p.name,
      innings:     p.ip,
      win:         dec==='win',
      loss:        dec==='loss',
      save:        dec==='save',
      hits:        p.hits,
      strikeouts:  p.k,
      walks:       p.bb,
      hbp:         0,
      runs:        p.r,
      earnedRuns:  p.r,
    });
  });
  GAME.pitching = manualOnly;
  Storage.updateGame(GAME);
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

function addPitch(type) {
  currentPitches.push(type);
  renderPitchDisplay();
}

function removeLastPitch() {
  currentPitches.pop();
  renderPitchDisplay();
}

function renderPitchDisplay() {
  const seq = document.getElementById('pitchSequence');
  const lbl = document.getElementById('pitchCountLabel');
  if (!seq) return;
  const colorMap = { B: 'success', K: 'warning', S: 'warning', F: 'warning', X: 'secondary' };
  const labelMap = { B: 'B', K: '見', S: '空', F: 'F', X: '打' };
  if (!currentPitches.length) {
    seq.innerHTML = '';
    if (lbl) lbl.textContent = '';
    return;
  }
  const darkText = new Set(['K','S','F','X']);
  seq.innerHTML = currentPitches.map(p =>
    `<span class="badge bg-${colorMap[p]||'secondary'}${darkText.has(p)?' text-dark':''}">${labelMap[p]||p}</span>`
  ).join('');
  let balls = 0, strikes = 0;
  for (const p of currentPitches) {
    if (p === 'B') balls++;
    else if (p === 'F') { if (strikes < 2) strikes++; }
    else strikes++;
  }
  if (lbl) lbl.textContent = `計 ${currentPitches.length}球（${balls}B - ${strikes}S）`;
}

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

function selectResult(code, noPitchAutoAdd = false) {
  selectedResult = code;
  document.querySelectorAll('.result-btn[data-code]').forEach(el =>
    el.classList.toggle('active', el.getAttribute('data-code') === code)
  );
  const needsDir = Stats.NEEDS_DIRECTION.has(code);
  document.getElementById('directionSection').style.display = needsDir ? '' : 'none';
  if (!needsDir) {
    selectedDirection = '';
    document.getElementById('dirLabel').textContent = '未選択';
    document.querySelectorAll('.spray-zone').forEach(z => z.classList.remove('selected-zone'));
  }

  if (!noPitchAutoAdd) {
    // 前回の自動追加球を取消し
    if (lastAutoAddedPitch) {
      currentPitches.pop();
      lastAutoAddedPitch = false;
    }
    // 打席結果に対応する球を自動追加
    const pitchAutoMap = {
      'K':  'S', 'KL': 'K', 'BB': 'B',
      '1B': 'X', '2B': 'X', '3B': 'X', 'HR': 'X',
      'GO': 'X', 'FO': 'X', 'LO': 'X', 'GIDP': 'X',
      'SAC':'X', 'SF': 'X', 'E':  'X', 'FC':  'X', 'HBP': 'X',
    };
    if (pitchAutoMap[code]) {
      currentPitches.push(pitchAutoMap[code]);
      lastAutoAddedPitch = true;
    }
    renderPitchDisplay();
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
  selectedResult     = '';
  selectedDirection  = '';
  currentRbi         = 0;
  currentPitches     = [];
  lastAutoAddedPitch = false;
  document.getElementById('rbiVal').textContent = '0';
  document.getElementById('abNote').value       = '';
  document.getElementById('abId').value         = abId || '';
  document.getElementById('abTeam').value       = team;
  document.getElementById('directionSection').style.display = 'none';
  document.querySelectorAll('.result-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.spray-zone').forEach(el => el.classList.remove('selected-zone'));
  document.getElementById('dirLabel').textContent = '未選択';
  renderPitchDisplay();

  const isMyTeam = team === 'my';

  // モーダルタイトル
  if (currentInning && currentOrder) {
    document.getElementById('abModalTitle').textContent =
      `${currentInning}回 ${currentOrder}番打席` + (isMyTeam ? '' : '（相手）');
  } else {
    document.getElementById('abModalTitle').textContent =
      (isMyTeam ? '自チーム' : '相手チーム') + '打席を記録';
  }

  document.getElementById('abDeleteBtn').style.display = abId ? '' : 'none';

  const sel = document.getElementById('abBatter');
  if (isMyTeam) {
    const players = Storage.getPlayers();
    const lineup  = GAME.myLineup || [];
    const ordered = lineup
      .map(l => ({ order:l.order, player:players.find(p=>p.id===l.playerId) }))
      .filter(x => x.player)
      .sort((a,b) => a.order - b.order);
    sel.innerHTML = '<option value="">選手を選択...</option>'
      + ordered.map(x => `<option value="${x.player.id}">${x.order}番 ${x.player.name}</option>`).join('')
      + players.filter(p => !lineup.some(l=>l.playerId===p.id))
               .map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (!abId && _preSelectPlayerId) sel.value = _preSelectPlayerId;
  } else {
    // 相手チーム：スタメン + 代打のリスト
    const lineup = GAME.oppLineup || [];
    const subNames = [...new Set((GAME.oppSubs||[]).map(s=>s.name).filter(Boolean))];
    sel.innerHTML = '<option value="">選手を選択...</option>'
      + lineup.map((l,i) =>
          `<option value="${l.name||i}">${l.order||i+1}番 ${l.name||'(未登録)'}</option>`
        ).join('')
      + subNames
          .filter(n => !lineup.some(l=>l.name===n))
          .map(n => `<option value="${n}">代打 ${n}</option>`).join('');
    if (!abId && _preSelectOppName) sel.value = _preSelectOppName;
  }
  _preSelectPlayerId = null;
  _preSelectOppName  = null;

  // 既存データ読み込み（編集時）
  if (abId) {
    const ab = (GAME.atBats||[]).find(a => a.id === abId);
    if (ab) {
      sel.value      = ab.playerId || ab.playerName || '';
      currentRbi     = ab.rbi || 0;
      currentPitches = ab.pitches ? [...ab.pitches] : [];
      document.getElementById('rbiVal').textContent = currentRbi;
      document.getElementById('abNote').value = ab.note || '';
      if (ab.result)    selectResult(ab.result, true);
      if (ab.direction) selectDirection(ab.direction);
      renderPitchDisplay();
    }
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('abModal')).show();
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

  // 打点差分を算出（編集前の値と比較するため保存前に取得）
  const prevRbi   = abId ? ((GAME.atBats||[]).find(a=>a.id===abId)?.rbi || 0) : 0;
  const rbiDelta  = currentRbi - prevRbi;
  const rbiInning = currentInning;
  const rbiTeam   = isMyTeam ? 'my' : 'opp';

  const players = Storage.getPlayers();
  const player  = isMyTeam ? players.find(p => p.id === batterVal) : null;

  const ab = {
    isMyTeam,
    playerId:   isMyTeam ? batterVal : null,
    playerName: player ? player.name : batterVal,
    result:     selectedResult,
    direction:  selectedDirection || null,
    rbi:        currentRbi,
    pitches:    currentPitches.length ? [...currentPitches] : undefined,
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

  // 打点をスコアに自動反映
  if (rbiDelta !== 0 && rbiInning) {
    if (!GAME.innings) GAME.innings = { my: [], opp: [] };
    if (!GAME.innings[rbiTeam]) GAME.innings[rbiTeam] = [];
    const idx = rbiInning - 1;
    GAME.innings[rbiTeam][idx] = Math.max(0, (GAME.innings[rbiTeam][idx] || 0) + rbiDelta);
    Storage.updateGame(GAME);
  }

  bootstrap.Modal.getInstance(document.getElementById('abModal')).hide();
  if (isMyTeam) renderScorecard(); else renderOppScorecard();
  buildScoreboard();
  renderPitcherAssignment();
  renderOppPitcherAssignment();
  currentOrder  = null;
  currentInning = null;
}

function deleteCurrentAtBat() {
  const abId     = document.getElementById('abId').value;
  const isMyTeam = document.getElementById('abTeam').value === 'my';
  if (!abId) return;
  if (!confirm('この打席記録を削除しますか？')) return;

  const existingAb  = (GAME.atBats||[]).find(a => a.id === abId);
  const rbiToRemove = existingAb?.rbi || 0;
  const rbiInning   = existingAb?.inning;
  const rbiTeam     = isMyTeam ? 'my' : 'opp';

  Storage.deleteAtBat(GAMEID, abId);
  GAME = Storage.getGame(GAMEID);

  if (rbiToRemove > 0 && rbiInning) {
    if (!GAME.innings) GAME.innings = { my: [], opp: [] };
    if (!GAME.innings[rbiTeam]) GAME.innings[rbiTeam] = [];
    const idx = rbiInning - 1;
    GAME.innings[rbiTeam][idx] = Math.max(0, (GAME.innings[rbiTeam][idx] || 0) - rbiToRemove);
    Storage.updateGame(GAME);
  }

  bootstrap.Modal.getInstance(document.getElementById('abModal')).hide();
  if (isMyTeam) renderScorecard(); else renderOppScorecard();
  buildScoreboard();
  renderPitcherAssignment();
  renderOppPitcherAssignment();
  currentOrder  = null;
  currentInning = null;
  showToast('削除しました', 'secondary');
}

// ===== 相手チーム投手記録 =====

function computeOppPitcherStats() {
  const changes = (GAME.oppPitcherChanges || []).slice()
    .sort((a,b) => (a.entryInning-1)*3+a.entryOuts - ((b.entryInning-1)*3+b.entryOuts));
  if (!changes.length) return [];

  const numInnings = getNumInnings();
  const myScore    = GAME.innings?.my || [];
  const manStats   = GAME.oppPitcherManualStats || {};

  // 打席記録（自チーム打者）から被安打・四死球・三振を自動集計
  const autoStats = {};
  (GAME.atBats || []).filter(ab => ab.isMyTeam && ab.inning).forEach(ab => {
    const ch = getPitcherForInning(changes, ab.inning);
    if (!ch) return;
    if (!autoStats[ch.id]) autoStats[ch.id] = { hits: 0, bb: 0, k: 0, pitches: 0 };
    if (['1B','2B','3B','HR'].includes(ab.result)) autoStats[ch.id].hits++;
    if (['BB','HBP'].includes(ab.result))          autoStats[ch.id].bb++;
    if (['K','KL'].includes(ab.result))            autoStats[ch.id].k++;
    autoStats[ch.id].pitches += (ab.pitches?.length || 0);
  });

  return changes.map((ch, i) => {
    const next      = changes[i + 1];
    const myEntry   = (ch.entryInning - 1) * 3 + ch.entryOuts;
    const nextEntry = next ? (next.entryInning - 1) * 3 + next.entryOuts : numInnings * 3;
    const totalOuts = nextEntry - myEntry;
    let runs = 0;
    for (let inn = 1; inn <= numInnings; inn++) {
      const endOuts = inn * 3;
      if (myEntry >= endOuts) continue;
      if (next && (next.entryInning - 1) * 3 + next.entryOuts < endOuts) continue;
      runs += (myScore[inn - 1] || 0);
    }
    const man  = manStats[ch.id] || {};
    const auto = autoStats[ch.id] || { hits: 0, bb: 0, k: 0, pitches: 0 };
    return {
      id:        ch.id,
      name:      ch.name || '(未設定)',
      ip:        Stats.formatInnings(totalOuts),
      totalOuts,
      r:         runs,
      hits:      man.hits ?? auto.hits,
      k:         man.k    ?? auto.k,
      bb:        man.bb   ?? auto.bb,
      pitches:   auto.pitches,
      hitsAuto:  auto.hits,
      kAuto:     auto.k,
      bbAuto:    auto.bb,
    };
  });
}

function renderOppPitcherAssignment() {
  const numInnings = getNumInnings();
  const changes    = (GAME.oppPitcherChanges || []).slice()
    .sort((a,b) => (a.entryInning-1)*3+a.entryOuts - ((b.entryInning-1)*3+b.entryOuts));

  let html = '<div class="mb-2">';
  if (!changes.length) {
    html += `<p class="text-muted small mb-2">「先発投手を追加」ボタンで相手投手を登録してください</p>`;
  } else {
    changes.forEach((ch, i) => {
      const isFirst = i === 0;
      const nameVal = (ch.name || '').replace(/"/g, '&quot;');
      if (isFirst) {
        html += `<div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <span class="badge bg-secondary">先発</span>
          <input type="text" class="form-control form-control-sm" style="width:auto;min-width:100px"
            placeholder="投手名" value="${nameVal}"
            onchange="updateOppPitcherChange('${ch.id}','name',this.value)">
          ${changes.length > 1 ? `<button class="btn btn-xs btn-outline-danger" onclick="deleteOppPitcherChange('${ch.id}')">×</button>` : ''}
        </div>`;
      } else {
        const innOpts = Array.from({length: numInnings}, (_, k) => {
          const v = k + 1;
          return `<option value="${v}" ${v === ch.entryInning ? 'selected' : ''}>${v}回</option>`;
        }).join('');
        const outsOpts = [0, 1, 2].map(o =>
          `<option value="${o}" ${o === ch.entryOuts ? 'selected' : ''}>${['回頭','1アウト時','2アウト時'][o]}</option>`
        ).join('');
        html += `<div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <span class="badge bg-warning text-dark">交代</span>
          <select class="form-select form-select-sm" style="width:auto"
            onchange="updateOppPitcherChange('${ch.id}','entryInning',this.value)">${innOpts}</select>
          <select class="form-select form-select-sm" style="width:auto"
            onchange="updateOppPitcherChange('${ch.id}','entryOuts',this.value)">${outsOpts}</select>
          <span class="text-muted small">から</span>
          <input type="text" class="form-control form-control-sm" style="width:auto;min-width:100px"
            placeholder="投手名" value="${nameVal}"
            onchange="updateOppPitcherChange('${ch.id}','name',this.value)">
          <button class="btn btn-xs btn-outline-danger" onclick="deleteOppPitcherChange('${ch.id}')">×</button>
        </div>`;
      }
    });
  }
  html += `</div>
  <button class="btn btn-sm btn-outline-secondary mb-2" onclick="addOppPitcherChange()">
    <i class="bi bi-plus-circle me-1"></i>${changes.length === 0 ? '先発投手を追加' : '投手交代を追加'}
  </button>`;

  const stats = computeOppPitcherStats();
  if (stats.length) {
    html += '<div class="mt-1 border-top pt-2">';
    stats.forEach(p => {
      html += `<div class="pit-stat-row">
        <span class="fw-semibold" style="min-width:56px">${p.name}</span>
        <span class="text-muted">${p.ip}回</span>
        <span class="text-danger">${p.r}失点</span>
        <span class="text-muted" style="font-size:0.75rem">
          被安:<input type="number" min="0" value="${p.hits}" onchange="setOppPitcherStat('${p.id}','hits',this.value)">
          K:<input type="number" min="0" value="${p.k}" onchange="setOppPitcherStat('${p.id}','k',this.value)">
          BB:<input type="number" min="0" value="${p.bb}" onchange="setOppPitcherStat('${p.id}','bb',this.value)">
        </span>
        ${p.pitches > 0 ? `<span class="badge bg-light text-dark border" style="font-size:0.72rem">${p.pitches}球</span>` : ''}
      </div>`;
    });
    html += `<div class="mt-2">
      <button class="btn btn-sm btn-outline-secondary" onclick="saveOppPitcherStats()">
        <i class="bi bi-save me-1"></i>相手投手記録を保存
      </button>
    </div></div>`;
  }
  document.getElementById('oppPitcherAssignmentArea').innerHTML = html;
}

function addOppPitcherChange() {
  if (!GAME.oppPitcherChanges) GAME.oppPitcherChanges = [];
  const sorted = (GAME.oppPitcherChanges).slice()
    .sort((a,b) => (a.entryInning-1)*3+a.entryOuts - ((b.entryInning-1)*3+b.entryOuts));
  const last = sorted.slice(-1)[0];
  GAME.oppPitcherChanges.push({
    id: 'opc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    name: '',
    entryInning: last ? Math.min(last.entryInning + 1, getNumInnings()) : 1,
    entryOuts: 0,
  });
  Storage.updateGame(GAME);
  renderOppPitcherAssignment();
}

function deleteOppPitcherChange(id) {
  if (!confirm('この投手エントリを削除しますか？')) return;
  GAME.oppPitcherChanges = (GAME.oppPitcherChanges || []).filter(c => c.id !== id);
  Storage.updateGame(GAME);
  renderOppPitcherAssignment();
}

function updateOppPitcherChange(id, field, value) {
  const ch = (GAME.oppPitcherChanges || []).find(c => c.id === id);
  if (!ch) return;
  ch[field] = (field === 'entryInning' || field === 'entryOuts') ? (parseInt(value) || 0) : value;
  Storage.updateGame(GAME);
  renderOppPitcherAssignment();
}

function setOppPitcherStat(id, stat, value) {
  if (!GAME.oppPitcherManualStats) GAME.oppPitcherManualStats = {};
  if (!GAME.oppPitcherManualStats[id]) GAME.oppPitcherManualStats[id] = {};
  GAME.oppPitcherManualStats[id][stat] = parseInt(value) || 0;
  Storage.updateGame(GAME);
}

function saveOppPitcherStats() {
  Storage.updateGame(GAME);
  showToast('相手投手記録を保存しました');
}

// ===== 先攻・後攻切り替え =====

function toggleHomeAway() {
  GAME.isHome = !GAME.isHome;
  Storage.updateGame(GAME);
  updateHomeAwayDisplay();
  buildScoreboard();
  showToast(GAME.isHome ? '後攻（ホーム）に変更しました' : '先攻（アウェイ）に変更しました');
}

function updateHomeAwayDisplay() {
  const btn = document.getElementById('homeAwayBtn');
  if (!btn) return;
  if (GAME.isHome) {
    btn.textContent = '後攻（ホーム）';
    btn.className   = 'btn btn-xs btn-outline-primary';
  } else {
    btn.textContent = '先攻（アウェイ）';
    btn.className   = 'btn btn-xs btn-outline-warning';
  }
}

// ===== タイマー =====

function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('timerBtn').innerHTML = '<i class="bi bi-play-fill"></i>';
    document.getElementById('timerBtn').className = 'btn btn-sm btn-outline-success';
  } else {
    timerInterval = setInterval(() => {
      timerSeconds++;
      document.getElementById('timerDisplay').textContent = formatTimerTime(timerSeconds);
    }, 1000);
    timerRunning = true;
    document.getElementById('timerBtn').innerHTML = '<i class="bi bi-pause-fill"></i>';
    document.getElementById('timerBtn').className = 'btn btn-sm btn-warning';
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSeconds = 0;
  document.getElementById('timerDisplay').textContent = '00:00:00';
  document.getElementById('timerBtn').innerHTML = '<i class="bi bi-play-fill"></i>';
  document.getElementById('timerBtn').className = 'btn btn-sm btn-outline-success';
}

function formatTimerTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
