'use strict';

// ===== グローバル =====
let allData     = null;
let filtered    = null;  // フィルタ後のデータオブジェクト (players + games)
let rankChartObj = null;

// 打球方向 → SVG座標 (dashboard.html の45°フィールドに合わせた座標)
// Home(150,245) / 1B(214,181) / 2B(150,117) / 3B(86,181) / ファウルライン45°
const DIR_COORDS = {
  'P':  [150, 170],
  '1B': [205, 192],
  '2B': [182, 157],
  'SS': [118, 157],
  '3B': [ 95, 192],
  'LF': [ 50, 120],
  'LC': [ 90,  92],
  'CF': [150,  74],
  'RC': [210,  92],
  'RF': [250, 120]
};

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  Crypto.requireAuth(() => {
    allData = Storage.get();
    buildYearFilter();
    applyFilter();
  });
});

function buildYearFilter() {
  const years = new Set(
    (allData.games || []).map(g => g.date?.slice(0, 4)).filter(Boolean)
  );
  const sel = document.getElementById('filterYear');
  [...years].sort().reverse().forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年';
    sel.appendChild(opt);
  });
}

function applyFilter() {
  const year = document.getElementById('filterYear').value;
  const games = allData.games.filter(g =>
    year === 'all' || g.date?.startsWith(year)
  );
  filtered = { players: allData.players, games };
  document.getElementById('filterGameCount').textContent =
    `（${games.length}試合）`;

  renderBatting();
  renderPitching();
  renderRankingChart();
  buildSprayPlayerFilter();
  renderSprayChart();
}

// ===== Tab切替 =====
function switchTab(tab) {
  ['batting','pitching','ranking','spray'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1))
      .style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#mainTabs .nav-link').forEach((el, i) => {
    el.classList.toggle('active',
      ['batting','pitching','ranking','spray'][i] === tab);
  });
  if (tab === 'ranking') renderRankingChart();
  if (tab === 'spray')   renderSprayChart();
}

// ===== 打撃成績テーブル =====
function renderBatting() {
  const stats = Stats.getAllBatting(filtered);
  const body  = document.getElementById('battingBody');
  if (!stats.length || stats.every(s => s.pa === 0)) {
    body.innerHTML = '<tr><td colspan="17" class="empty-msg py-3">データがありません</td></tr>';
    return;
  }

  // 打率トップを強調表示
  const maxAvg = Math.max(...stats.filter(s => s.ab >= 1).map(s => s.avg || 0));

  body.innerHTML = stats
    .filter(s => s.pa > 0)
    .sort((a, b) => (b.pa || 0) - (a.pa || 0))
    .map(s => {
      const isLeader = s.avg != null && s.avg === maxAvg && s.ab >= 1;
      return `
        <tr>
          <td class="fw-semibold ${isLeader ? 'leader' : ''}">${s.name}</td>
          <td>${s.games}</td>
          <td>${s.pa}</td>
          <td>${s.ab}</td>
          <td>${s.h}</td>
          <td>${s.s2b}</td>
          <td>${s.s3b}</td>
          <td>${s.hr}</td>
          <td>${s.rbi}</td>
          <td>${s.bb}</td>
          <td>${s.k}</td>
          <td class="fw-semibold">${Stats.fmt(s.avg)}</td>
          <td>${Stats.fmt(s.obp)}</td>
          <td>${Stats.fmt(s.slg)}</td>
          <td class="fw-semibold">${Stats.fmt(s.ops)}</td>
          <td>${Stats.fmt(s.isoP)}</td>
          <td>${Stats.fmt(s.isoD)}</td>
        </tr>`;
    }).join('');
}

// ===== 投手成績テーブル =====
function renderPitching() {
  const stats = Stats.getAllPitching(filtered);
  const body  = document.getElementById('pitchingBody');
  if (!stats.length) {
    body.innerHTML = '<tr><td colspan="13" class="empty-msg py-3">データがありません</td></tr>';
    return;
  }

  body.innerHTML = stats
    .sort((a, b) => (b.wins || 0) - (a.wins || 0))
    .map(s => `
      <tr>
        <td class="fw-semibold">${s.name}</td>
        <td>${s.games}</td>
        <td class="text-success fw-bold">${s.wins}</td>
        <td class="text-danger">${s.losses}</td>
        <td>${s.saves}</td>
        <td>${s.ip}</td>
        <td>${s.hits}</td>
        <td>${s.k}</td>
        <td>${s.bb}</td>
        <td>${s.hbp}</td>
        <td>${s.r}</td>
        <td>${s.er}</td>
        <td class="fw-semibold">${s.era != null ? s.era.toFixed(2) : '-'}</td>
      </tr>`
    ).join('');
}

// ===== チーム内ランキング（Chart.js）=====
const METRIC_LABELS = {
  avg:  '打率', ops: 'OPS', obp: '出塁率', slg: '長打率',
  hr:   '本塁打', rbi: '打点', h: '安打数', bb: '四球',
  k:    '三振', isoP: 'IsoP', isoD: 'IsoD'
};

function renderRankingChart() {
  const metric = document.getElementById('rankMetric').value;
  const stats  = Stats.getAllBatting(filtered).filter(s => s.pa > 0);

  if (!stats.length) {
    if (rankChartObj) { rankChartObj.destroy(); rankChartObj = null; }
    return;
  }

  const sorted = stats
    .map(s => ({ name: s.name, val: s[metric] }))
    .filter(x => x.val != null && !isNaN(x.val))
    .sort((a, b) => b.val - a.val);

  const labels = sorted.map(x => x.name);
  const values = sorted.map(x => x.val);

  // 色: 上位3位をグラデーション
  const colors = values.map((_, i) => {
    if (i === 0) return '#1a472a';
    if (i === 1) return '#2d6a4f';
    if (i === 2) return '#52b788';
    return '#74c69d';
  });

  const ctx = document.getElementById('rankChart');
  if (rankChartObj) rankChartObj.destroy();

  rankChartObj = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: METRIC_LABELS[metric] || metric,
        data: values,
        backgroundColor: colors,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.x;
              if (['avg','ops','obp','slg','isoP','isoD'].includes(metric)) {
                return ` ${Stats.fmt(val)}`;
              }
              return ` ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: v => {
              if (['avg','ops','obp','slg','isoP','isoD'].includes(metric)) {
                return Stats.fmt(v);
              }
              return v;
            }
          }
        }
      }
    }
  });
}

// ===== スプレーチャート =====
function buildSprayPlayerFilter() {
  const players = filtered.players;
  const sel     = document.getElementById('sprayPlayer');
  sel.innerHTML = '<option value="all">全選手</option>'
    + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function renderSprayChart() {
  const playerId = document.getElementById('sprayPlayer').value;
  const dotsG    = document.getElementById('sprayDots');
  dotsG.innerHTML = '';

  // 対象打席を絞り込む（方向記録あり・自チームのみ）
  const abs = filtered.games.flatMap(g => (g.atBats || [])).filter(ab => {
    if (!ab.isMyTeam)           return false;
    if (!ab.direction)          return false;
    if (!DIR_COORDS[ab.direction]) return false;
    if (playerId !== 'all' && ab.playerId !== playerId) return false;
    return true;
  });

  // 方向ごとに集計
  const zoneData = {};
  abs.forEach(ab => {
    const dir = ab.direction;
    if (!zoneData[dir]) zoneData[dir] = { total: 0, results: [], names: [] };
    zoneData[dir].total++;
    zoneData[dir].results.push(ab.result);
    zoneData[dir].names.push(ab.playerName);
  });

  // 各ゾーンに数字バッジを描画
  const NS = 'http://www.w3.org/2000/svg';
  Object.entries(zoneData).forEach(([dir, data]) => {
    const [cx, cy] = DIR_COORDS[dir];
    const color  = getZoneColor(data.results);
    const r      = data.total >= 10 ? 14 : 12;

    // 背景円
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r',  r);
    circle.setAttribute('fill',         color);
    circle.setAttribute('stroke',       'white');
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('class',        'spray-dot');
    // ホバーツールチップ
    const title = document.createElementNS(NS, 'title');
    title.textContent =
      `${Stats.DIRECTION_LABELS[dir]||dir}: ${data.total}件\n${getZoneBreakdown(data.results)}`;
    circle.appendChild(title);
    dotsG.appendChild(circle);

    // 数字テキスト
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x',           cx);
    text.setAttribute('y',           cy + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill',        'white');
    text.setAttribute('font-size',   data.total >= 10 ? '10' : '11');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('pointer-events', 'none');
    text.textContent = data.total;
    dotsG.appendChild(text);
  });

  document.getElementById('sprayInfo').textContent =
    `方向記録: ${abs.length}件 / ${Object.keys(zoneData).length}ゾーン`;
}

// ゾーンの代表色（結果の多数決）
function getZoneColor(results) {
  let hr = 0, xbh = 0, single = 0, out = 0;
  results.forEach(r => {
    if      (r === 'HR')                    hr++;
    else if (r === '2B' || r === '3B')      xbh++;
    else if (r === '1B')                    single++;
    else                                    out++;
  });
  const n = results.length;
  if (n === 0) return '#6c757d';
  if (hr === n)                             return '#dc3545'; // 全部HR
  if ((hr + xbh) / n >= 0.5)               return '#fd7e14'; // 長打が半数以上
  if ((hr + xbh + single) / n >= 0.5)      return '#198754'; // 安打が半数以上
  return '#6c757d'; // アウト多数
}

// ゾーン内訳テキスト
function getZoneBreakdown(results) {
  const counts = {};
  results.forEach(r => {
    const label = Stats.RESULT_LABELS[r] || r;
    counts[label] = (counts[label] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}件`)
    .join(' / ');
}
