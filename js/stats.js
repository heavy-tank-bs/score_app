'use strict';

const Stats = (() => {
  const RESULT_LABELS = {
    '1B': '単打', '2B': '二塁打', '3B': '三塁打', 'HR': '本塁打',
    'BB': '四球', 'HBP': '死球', 'K': '三振(空)', 'KL': '三振(見)',
    'GO': 'ゴロ', 'FO': 'フライ', 'LO': 'ライナー',
    'SAC': '犠打', 'SF': '犠飛', 'E': 'エラー', 'FC': '野選', 'GIDP': '併殺打'
  };

  const DIRECTION_LABELS = {
    'P': 'P', '1B': '1B', '2B': '2B', '3B': '3B', 'SS': 'SS',
    'LF': 'LF', 'LC': '左中', 'CF': 'CF', 'RC': '右中', 'RF': 'RF'
  };

  // 打球方向が必要な結果コード
  const NEEDS_DIRECTION = new Set([
    '1B', '2B', '3B', 'HR', 'GO', 'FO', 'LO', 'SAC', 'SF', 'E', 'FC', 'GIDP'
  ]);

  // 打球方向のSVG座標（スプレーチャート用）
  const DIRECTION_SVG = {
    'P':  [150, 165],
    '1B': [200, 178],
    '2B': [172, 148],
    'SS': [128, 148],
    '3B': [100, 178],
    'LF': [ 48,  95],
    'LC': [ 88,  62],
    'CF': [150,  45],
    'RC': [212,  62],
    'RF': [252,  95]
  };

  // 打撃成績計算
  function calcBatting(atBats) {
    const s = {
      pa: 0, ab: 0, h: 0, s1b: 0, s2b: 0, s3b: 0, hr: 0,
      rbi: 0, bb: 0, hbp: 0, k: 0, sac: 0, sf: 0, e: 0
    };
    for (const ab of atBats) {
      s.pa++;
      s.rbi += (ab.rbi || 0);
      switch (ab.result) {
        case '1B':   s.ab++; s.h++; s.s1b++; break;
        case '2B':   s.ab++; s.h++; s.s2b++; break;
        case '3B':   s.ab++; s.h++; s.s3b++; break;
        case 'HR':   s.ab++; s.h++; s.hr++;  break;
        case 'BB':   s.bb++;  break;
        case 'HBP':  s.hbp++; break;
        case 'K':
        case 'KL':   s.ab++; s.k++; break;
        case 'GO':
        case 'FO':
        case 'LO':   s.ab++; break;
        case 'GIDP': s.ab++; break;
        case 'SAC':  s.sac++; s.pa--; break; // 犠打は打席数にカウントしない
        case 'SF':   s.sf++; break;
        case 'E':    s.ab++; s.e++; break;
        case 'FC':   s.ab++; break;
      }
    }
    const tb = s.s1b + 2 * s.s2b + 3 * s.s3b + 4 * s.hr;
    const obpDen = s.ab + s.bb + s.hbp + s.sf;
    s.avg  = s.ab > 0 ? s.h / s.ab : null;
    s.obp  = obpDen > 0 ? (s.h + s.bb + s.hbp) / obpDen : null;
    s.slg  = s.ab > 0 ? tb / s.ab : null;
    s.ops  = (s.obp != null && s.slg != null) ? s.obp + s.slg : null;
    s.isoP = (s.slg != null && s.avg != null) ? s.slg - s.avg : null;
    s.isoD = (s.obp != null && s.avg != null) ? s.obp - s.avg : null;
    return s;
  }

  // 投球イニング文字列をアウト数に変換（例: "6.2" → 20）
  function parseInnings(str) {
    if (!str && str !== 0) return 0;
    const parts = str.toString().split('.');
    return parseInt(parts[0] || 0) * 3 + (parseInt(parts[1]) || 0);
  }

  // アウト数を投球イニング文字列に変換（例: 20 → "6.2"）
  function formatInnings(totalOuts) {
    const full = Math.floor(totalOuts / 3);
    const rem  = totalOuts % 3;
    return rem === 0 ? String(full) : `${full}.${rem}`;
  }

  // 投手成績計算
  function calcPitching(records) {
    const s = {
      games: 0, wins: 0, losses: 0, saves: 0,
      totalOuts: 0, hits: 0, k: 0, bb: 0, hbp: 0, r: 0, er: 0
    };
    for (const p of records) {
      s.games++;
      if (p.win)  s.wins++;
      if (p.loss) s.losses++;
      if (p.save) s.saves++;
      s.totalOuts += parseInnings(p.innings);
      s.hits += (p.hits       || 0);
      s.k    += (p.strikeouts || 0);
      s.bb   += (p.walks      || 0);
      s.hbp  += (p.hbp        || 0);
      s.r    += (p.runs       || 0);
      s.er   += (p.earnedRuns || 0);
    }
    s.ip  = formatInnings(s.totalOuts);
    s.era = s.totalOuts > 0 ? s.er * 27 / s.totalOuts : null;
    return s;
  }

  // 数値のフォーマット（打率は.333形式）
  function fmt(val, dec = 3) {
    if (val === null || val === undefined || isNaN(val)) return '-';
    const str = val.toFixed(dec);
    if (dec === 3) {
      if (str.startsWith('0.'))  return str.slice(1);
      if (str.startsWith('-0.')) return '-' + str.slice(2);
    }
    return str;
  }

  // 全選手の打撃成績
  function getAllBatting(data) {
    return data.players.map(p => {
      const abs = data.games.flatMap(g =>
        (g.atBats || []).filter(ab => ab.playerId === p.id && ab.isMyTeam)
      );
      const games = data.games.filter(g =>
        (g.myLineup || []).some(l => l.playerId === p.id)
      ).length;
      return { ...p, games, ...calcBatting(abs) };
    });
  }

  // 全選手の投手成績（登板実績があるもののみ）
  function getAllPitching(data) {
    return data.players.map(p => {
      const recs = data.games.flatMap(g =>
        (g.pitching || []).filter(pit => pit.playerId === p.id && pit.isMyTeam)
      );
      if (!recs.length) return null;
      return { ...p, ...calcPitching(recs) };
    }).filter(Boolean);
  }

  // 試合の合計スコア
  function gameScore(game) {
    const myTotal  = (game.innings?.my  || []).reduce((a, v) => a + (v || 0), 0);
    const oppTotal = (game.innings?.opp || []).reduce((a, v) => a + (v || 0), 0);
    return { my: myTotal, opp: oppTotal };
  }

  return {
    RESULT_LABELS,
    DIRECTION_LABELS,
    NEEDS_DIRECTION,
    DIRECTION_SVG,
    calcBatting,
    calcPitching,
    parseInnings,
    formatInnings,
    getAllBatting,
    getAllPitching,
    gameScore,
    fmt
  };
})();
