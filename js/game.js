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

// モーダル内の状態
let selectedResult    = '';
let selectedDirection = '';
let currentRbi        = 0;

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
    const circleClass = isDone ? 'done' : isActive ? 'active' : '';
    const labelClass  = isActive ? 'active' : '';
    return `
      ${i > 0 ? '<span class="step-sep">›</span>' : ''}
      <div class="step-item">
        <div class="step-circle ${circleClass}">${isDone ? '✓' : i+1}</div>
        <span class="step-label ${labelClass}">${s.label}</span>
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
  // 既存スタメンを読み込む
  myLineupData  = GAME.myLineup  && GAME.myLineup.length  ? [...GAME.myLineup]  : Array.from({length:9}, (_,i)=>({ order: i+1, playerId:'', position:'' }));
  oppLineupData = GAME.oppLineup && GAME.oppLineup.length ? [...GAME.oppLineup] : Array.from({length:9}, (_,i)=>({ order: i+1, name:'',     position:'' }));

  renderMySlots();
  renderOppSlots();
}

function renderMySlots() {
  const players = Storage.getPlayers();
  const el = document.getElementById('myLineupSlots');
  el.innerHTML = myLineupData.map((slot, idx) => `
    <div class="lineup-row">
      <div class="order-label">${slot.order}</div>
      <select class="form-select form-select-sm" onchange="myLineupData[${idx}].playerId=this.value">
        <option value="">選手を選択</option>
        ${players.map(p => `<option value="${p.id}" ${p.id===slot.playerId?'selected':''}>${p.number?'#'+p.number+' ':''}${p.name}</option>`).join('')}
      </select>
      <select class="form-select form-select-sm" onchange="myLineupData[${idx}].position=this.value">
        <option value="">守備</option>
        ${POSITIONS.map(pos => `<option value="${pos}" ${pos===slot.position?'selected':''}>${pos}</option>`).join('')}
      </select>
    </div>
  `).join('');
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
  Storage.updateGame(GAME);
  renderStepBar();
  showStep('record');
  renderRecord();
  showToast('スタメンを保存しました');
}

// ===== STEP 2: 試合記録 =====
function renderRecord() {
  const myTeam = Storage.getTeamName();
  document.getElementById('recTeamName').textContent = myTeam;
  document.getElementById('recOpponent').textContent = GAME.opponent;
  document.getElementById('recDate').textContent     = GAME.date;
  updateScoreDisplay();
  buildScoreboard();
  renderAtbatList();
  renderPitchingList();
}

function updateScoreDisplay() {
  const sc = Stats.gameScore(GAME);
  document.getElementById('recScore').textContent = `${sc.my} - ${sc.opp}`;
}

// ===== Tabs =====
function showTab(tab) {
  ['atbat','score','pitching'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#recTabs .nav-link').forEach((el, i) => {
    el.classList.toggle('active', i === ['atbat','score','pitching'].indexOf(tab));
  });
}

// ===== Score Board =====
function buildScoreboard() {
  const maxInn = Math.max(
    (GAME.innings?.my  || []).length,
    (GAME.innings?.opp || []).length,
    9
  );
  const myArr  = GAME.innings?.my  || [];
  const oppArr = GAME.innings?.opp || [];

  // Header
  const header = document.getElementById('inningHeader');
  header.innerHTML = '<th class="team-name">チーム</th>'
    + Array.from({length: maxInn}, (_,i) => `<th>${i+1}</th>`).join('')
    + '<th class="total">計</th>';

  // My team row
  const myRow = document.getElementById('myScoreRow');
  myRow.innerHTML = `<td class="team-name">${Storage.getTeamName()}</td>`
    + Array.from({length: maxInn}, (_,i) =>
        `<td><input type="number" class="score-input" min="0" value="${myArr[i]??''}"
          onchange="updateInningScore('my',${i},this.value)"></td>`
      ).join('')
    + `<td class="total" id="myTotal">${myArr.reduce((a,v)=>a+(v||0),0)}</td>`;

  // Opp team row
  const oppRow = document.getElementById('oppScoreRow');
  oppRow.innerHTML = `<td class="team-name">${GAME.opponent}</td>`
    + Array.from({length: maxInn}, (_,i) =>
        `<td><input type="number" class="score-input" min="0" value="${oppArr[i]??''}"
          onchange="updateInningScore('opp',${i},this.value)"></td>`
      ).join('')
    + `<td class="total" id="oppTotal">${oppArr.reduce((a,v)=>a+(v||0),0)}</td>`;
}

function updateInningScore(team, idx, val) {
  if (!GAME.innings) GAME.innings = { my: [], opp: [] };
  GAME.innings[team][idx] = parseInt(val) || 0;
  const arr = GAME.innings[team];
  document.getElementById(team === 'my' ? 'myTotal' : 'oppTotal').textContent =
    arr.reduce((a, v) => a + (v || 0), 0);
  updateScoreDisplay();
}

function addInning() {
  if (!GAME.innings) GAME.innings = { my: [], opp: [] };
  GAME.innings.my.push(0);
  GAME.innings.opp.push(0);
  buildScoreboard();
}

function saveScore() {
  Storage.updateGame(GAME);
  updateScoreDisplay();
  showToast('スコアを保存しました');
}

function completeGame() {
  if (!confirm('試合を終了・確定しますか？')) return;
  GAME.status = 'completed';
  Storage.updateGame(GAME);
  showToast('試合を確定しました');
  renderStepBar();
}

// ===== At-bat Modal =====
function buildResultGrid() {
  const grid = document.getElementById('resultGrid');
  grid.innerHTML = RESULT_GROUPS.map(r =>
    `<div class="result-btn ${r.cls}" data-code="${r.code}" onclick="selectResult('${r.code}')">${r.label}</div>`
  ).join('');
}

function initDirectionSvg() {
  document.querySelectorAll('#dirSvg .spray-zone').forEach(el => {
    el.addEventListener('click', () => {
      const dir = el.getAttribute('data-dir');
      selectDirection(dir);
    });
  });
}

function selectResult(code) {
  selectedResult = code;
  document.querySelectorAll('.result-btn').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-code') === code);
  });
  // 方向選択の表示制御
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
  document.querySelectorAll('#dirSvg .spray-zone').forEach(el => {
    el.classList.toggle('selected-zone', el.getAttribute('data-dir') === dir);
  });
  document.getElementById('dirLabel').textContent = Stats.DIRECTION_LABELS[dir] || dir;
}

function changeRbi(delta) {
  currentRbi = Math.max(0, currentRbi + delta);
  document.getElementById('rbiVal').textContent = currentRbi;
}

function openAtbatModal(abId, team) {
  // reset
  selectedResult    = '';
  selectedDirection = '';
  currentRbi        = 0;
  document.getElementById('rbiVal').textContent = '0';
  document.getElementById('abNote').value = '';
  document.getElementById('abId').value   = abId || '';
  document.getElementById('abTeam').value = team;
  document.getElementById('directionSection').style.display = 'none';
  document.querySelectorAll('.result-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.spray-zone').forEach(el => el.classList.remove('selected-zone'));
  document.getElementById('dirLabel').textContent = '未選択';

  const isMyTeam = team === 'my';
  document.getElementById('abModalTitle').textContent =
    (isMyTeam ? '自チーム' : '相手チーム') + '打席を記録';

  // Batter dropdown
  const sel = document.getElementById('abBatter');
  if (isMyTeam) {
    const players = Storage.getPlayers();
    const lineup  = GAME.myLineup || [];
    // 打順順に並べる
    const ordered = lineup
      .map(l => ({ order: l.order, player: players.find(p => p.id === l.playerId) }))
      .filter(x => x.player)
      .sort((a,b) => a.order - b.order);
    sel.innerHTML = '<option value="">選手を選択...</option>'
      + ordered.map(x =>
          `<option value="${x.player.id}">${x.order}番 ${x.player.name}</option>`
        ).join('')
      + players
          .filter(p => !lineup.some(l => l.playerId === p.id))
          .map(p => `<option value="${p.id}">${p.name}</option>`)
          .join('');
  } else {
    const lineup = GAME.oppLineup || [];
    sel.innerHTML = '<option value="">選手を選択...</option>'
      + lineup.map((l, i) =>
          `<option value="${l.name||i}">${l.order||i+1}番 ${l.name||'(未登録)'}</option>`
        ).join('');
  }

  // 編集の場合は既存データを読み込む
  if (abId) {
    const ab = (GAME.atBats || []).find(a => a.id === abId);
    if (ab) {
      sel.value       = ab.playerId || ab.playerName || '';
      currentRbi      = ab.rbi || 0;
      document.getElementById('rbiVal').textContent = currentRbi;
      document.getElementById('abNote').value = ab.note || '';
      if (ab.result) selectResult(ab.result);
      if (ab.direction) selectDirection(ab.direction);
    }
  }

  new bootstrap.Modal(document.getElementById('abModal')).show();
}

function saveAtBat() {
  const isMyTeam     = document.getElementById('abTeam').value === 'my';
  const batterVal    = document.getElementById('abBatter').value;
  const abId         = document.getElementById('abId').value;

  if (!batterVal)   { showToast('打者を選択してください', 'warning'); return; }
  if (!selectedResult){ showToast('打席結果を選択してください', 'warning'); return; }
  if (Stats.NEEDS_DIRECTION.has(selectedResult) && !selectedDirection) {
    showToast('打球方向を選択してください', 'warning');
    return;
  }

  const players = Storage.getPlayers();
  const player  = isMyTeam ? players.find(p => p.id === batterVal) : null;

  const ab = {
    isMyTeam,
    playerId:    isMyTeam ? batterVal : null,
    playerName:  player ? player.name : batterVal,
    result:      selectedResult,
    direction:   selectedDirection || null,
    rbi:         currentRbi,
    note:        document.getElementById('abNote').value.trim()
  };

  if (abId) {
    ab.id = abId;
    Storage.updateAtBat(GAMEID, ab);
    GAME = Storage.getGame(GAMEID);
    showToast('打席を更新しました');
  } else {
    Storage.addAtBat(GAMEID, ab);
    GAME = Storage.getGame(GAMEID);
    showToast('打席を記録しました');
  }

  bootstrap.Modal.getInstance(document.getElementById('abModal')).hide();
  renderAtbatList();
}

function renderAtbatList() {
  const list = document.getElementById('atbatList');
  const abs  = (GAME.atBats || []).slice().reverse();
  if (!abs.length) {
    list.innerHTML = '<li class="empty-msg py-3">打席が記録されていません</li>';
    return;
  }
  const myTeam = Storage.getTeamName();
  list.innerHTML = abs.map(ab => {
    const teamLabel = ab.isMyTeam ? myTeam : GAME.opponent;
    const dirLabel  = ab.direction ? ' ' + (Stats.DIRECTION_LABELS[ab.direction] || ab.direction) : '';
    const rbiLabel  = ab.rbi > 0 ? ` <span class="text-danger fw-bold">${ab.rbi}打点</span>` : '';
    return `
      <li>
        <span class="ab-badge badge-${ab.result}">${Stats.RESULT_LABELS[ab.result] || ab.result}</span>
        <span class="flex-grow-1">
          <span class="fw-semibold">${ab.playerName}</span>
          <span class="text-muted small">(${teamLabel})${dirLabel}</span>
          ${rbiLabel}
          ${ab.note ? `<span class="text-muted small ms-1">📝${ab.note}</span>` : ''}
        </span>
        <div class="d-flex gap-1">
          <button class="btn btn-xs btn-outline-secondary p-1" style="line-height:1" onclick="openAtbatModal('${ab.id}','${ab.isMyTeam?'my':'opp'}')">
            <i class="bi bi-pencil" style="font-size:.75rem"></i>
          </button>
          <button class="btn btn-xs btn-outline-danger p-1" style="line-height:1" onclick="deleteAtBat('${ab.id}')">
            <i class="bi bi-trash3" style="font-size:.75rem"></i>
          </button>
        </div>
      </li>`;
  }).join('');
}

function deleteAtBat(id) {
  if (!confirm('この打席を削除しますか？')) return;
  Storage.deleteAtBat(GAMEID, id);
  GAME = Storage.getGame(GAMEID);
  renderAtbatList();
  showToast('削除しました', 'secondary');
}

// ===== Pitching Modal =====
function openPitchingModal(pitId, team) {
  const isMyTeam = team === 'my';
  document.getElementById('pitModalTitle').textContent =
    (isMyTeam ? '自チーム' : '相手チーム') + '投手を記録';
  document.getElementById('pitId').value   = pitId || '';
  document.getElementById('pitTeam').value = team;
  document.getElementById('pitInnings').value = '';
  document.getElementById('pitDecision').value = '';
  ['pitHits','pitK','pitBB','pitHBP','pitR','pitER'].forEach(id => {
    document.getElementById(id).value = '0';
  });

  // Pitcher dropdown / text input
  const pitSel  = document.getElementById('pitPitcherSelect');
  const pitText = document.getElementById('pitPitcherText');
  if (isMyTeam) {
    pitSel.style.display  = '';
    pitText.style.display = 'none';
    const players = Storage.getPlayers();
    pitSel.innerHTML = '<option value="">投手を選択...</option>'
      + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    pitText.value = '';
  } else {
    pitSel.style.display  = 'none';
    pitText.style.display = '';
    pitText.value = '';
    pitSel.innerHTML = '';
  }

  if (pitId) {
    const pit = (GAME.pitching || []).find(p => p.id === pitId);
    if (pit) {
      if (isMyTeam) pitSel.value  = pit.playerId    || '';
      else          pitText.value = pit.pitcherName  || '';
      document.getElementById('pitInnings').value  = pit.innings || '';
      document.getElementById('pitDecision').value = pit.win ? 'win' : pit.loss ? 'loss' : pit.save ? 'save' : '';
      document.getElementById('pitHits').value = pit.hits       || 0;
      document.getElementById('pitK').value    = pit.strikeouts || 0;
      document.getElementById('pitBB').value   = pit.walks      || 0;
      document.getElementById('pitHBP').value  = pit.hbp        || 0;
      document.getElementById('pitR').value    = pit.runs       || 0;
      document.getElementById('pitER').value   = pit.earnedRuns || 0;
    }
  }

  new bootstrap.Modal(document.getElementById('pitModal')).show();
}

function savePitching() {
  const isMyTeam   = document.getElementById('pitTeam').value === 'my';
  const pitId      = document.getElementById('pitId').value;
  const pitcherVal = isMyTeam
    ? document.getElementById('pitPitcherSelect').value.trim()
    : document.getElementById('pitPitcherText').value.trim();
  const innings    = document.getElementById('pitInnings').value.trim();
  const decision   = document.getElementById('pitDecision').value;

  if (!pitcherVal) { showToast('投手を入力/選択してください', 'warning'); return; }
  if (!innings)    { showToast('投球回数を入力してください', 'warning'); return; }

  const players     = Storage.getPlayers();
  const player      = isMyTeam ? players.find(p => p.id === pitcherVal) : null;
  const pitcherName = player ? player.name : pitcherVal;

  const pit = {
    isMyTeam,
    playerId:    player ? player.id : null,
    pitcherName,
    innings,
    win:  decision === 'win',
    loss: decision === 'loss',
    save: decision === 'save',
    hits:       parseInt(document.getElementById('pitHits').value) || 0,
    strikeouts: parseInt(document.getElementById('pitK').value)    || 0,
    walks:      parseInt(document.getElementById('pitBB').value)   || 0,
    hbp:        parseInt(document.getElementById('pitHBP').value)  || 0,
    runs:       parseInt(document.getElementById('pitR').value)    || 0,
    earnedRuns: parseInt(document.getElementById('pitER').value)   || 0
  };

  if (pitId) {
    pit.id = pitId;
    Storage.updatePitching(GAMEID, pit);
    GAME = Storage.getGame(GAMEID);
    showToast('投手記録を更新しました');
  } else {
    Storage.addPitching(GAMEID, pit);
    GAME = Storage.getGame(GAMEID);
    showToast('投手記録を保存しました');
  }

  bootstrap.Modal.getInstance(document.getElementById('pitModal')).hide();
  renderPitchingList();
}

function renderPitchingList() {
  const list = document.getElementById('pitchingList');
  const pits = (GAME.pitching || []).slice().reverse();
  if (!pits.length) {
    list.innerHTML = '<li class="empty-msg py-3">投手が記録されていません</li>';
    return;
  }
  const myTeam = Storage.getTeamName();
  list.innerHTML = pits.map(p => {
    const teamLabel = p.isMyTeam ? myTeam : GAME.opponent;
    const decision  = p.win ? '●勝' : p.loss ? '●負' : p.save ? '●S' : '';
    return `
      <li>
        <div class="flex-grow-1">
          <div class="fw-semibold">${p.pitcherName} <span class="text-muted small">(${teamLabel})</span>
            ${decision ? `<span class="badge bg-primary ms-1">${decision}</span>` : ''}
          </div>
          <div class="text-muted small">
            ${p.innings}回 ${p.hits}被安打 ${p.strikeouts}K ${p.walks}BB
            ${p.hbp?p.hbp+'死球 ':''} ${p.runs}失点 ${p.earnedRuns}自責
          </div>
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-xs btn-outline-secondary p-1" style="line-height:1"
            onclick="openPitchingModal('${p.id}','${p.isMyTeam?'my':'opp'}')">
            <i class="bi bi-pencil" style="font-size:.75rem"></i>
          </button>
          <button class="btn btn-xs btn-outline-danger p-1" style="line-height:1"
            onclick="deletePitching('${p.id}')">
            <i class="bi bi-trash3" style="font-size:.75rem"></i>
          </button>
        </div>
      </li>`;
  }).join('');
}

function deletePitching(id) {
  if (!confirm('この投手記録を削除しますか？')) return;
  Storage.deletePitching(GAMEID, id);
  GAME = Storage.getGame(GAMEID);
  renderPitchingList();
  showToast('削除しました', 'secondary');
}
