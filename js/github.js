'use strict';

const GitHub = (() => {
  const CFG_KEY = 'sc_github_cfg';

  function getConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      // GitHub owner のデフォルト
      if (!cfg.owner) cfg.owner = 'kameao_club';
      if (!cfg.path)  cfg.path  = 'data/score.json';
      return cfg;
    } catch (e) {
      return { owner: 'kameao_club', repo: '', path: 'data/score.json', token: '' };
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function apiHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async function getFileMeta(cfg) {
    const res = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`,
      { headers: apiHeaders(cfg.token) }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message || `API error ${res.status}`);
    }
    return res.json();
  }

  async function push() {
    const cfg = getConfig();
    if (!cfg.owner || !cfg.repo || !cfg.path || !cfg.token)
      throw new Error('GitHub設定が不完全です（リポジトリ名・トークンを確認してください）');

    // 現在のデータを暗号化してbase64に
    const data    = Storage.get();
    const payload = Crypto.encrypt(data);
    const b64     = btoa(unescape(encodeURIComponent(payload)));

    const meta = await getFileMeta(cfg);
    const body = {
      message: `score update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      content: b64,
    };
    if (meta) body.sha = meta.sha; // 既存ファイルの場合はSHAが必要

    const res = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`,
      {
        method: 'PUT',
        headers: { ...apiHeaders(cfg.token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message || 'GitHubへの保存に失敗しました');
    }
  }

  async function pull() {
    const cfg = getConfig();
    if (!cfg.owner || !cfg.repo || !cfg.path || !cfg.token)
      throw new Error('GitHub設定が不完全です');

    const meta = await getFileMeta(cfg);
    if (!meta) throw new Error('GitHubにファイルが存在しません。先にPushしてください');

    // base64デコード → 復号
    const content = decodeURIComponent(escape(atob(meta.content.replace(/\n/g, ''))));
    const data    = Crypto.decrypt(content);
    if (!data || !data.players || !data.games)
      throw new Error('データの復号に失敗しました。パスワードまたはファイルを確認してください');

    Storage.save(data);
    return data;
  }

  return { getConfig, saveConfig, push, pull };
})();
