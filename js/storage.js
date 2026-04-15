'use strict';

const Storage = (() => {
  const KEY = 'baseball_scoreapp_v1';

  function get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : defaultData();
    } catch (e) {
      return defaultData();
    }
  }

  function defaultData() {
    return { myTeamName: '我がチーム', players: [], games: [] };
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function uid(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  return {
    get,
    save,

    getTeamName() { return get().myTeamName || '我がチーム'; },
    setTeamName(name) { const d = get(); d.myTeamName = name; save(d); },

    // --- Players ---
    getPlayers() { return get().players; },

    addPlayer(player) {
      const d = get();
      player.id = uid('p');
      d.players.push(player);
      save(d);
      return player;
    },

    updatePlayer(player) {
      const d = get();
      const i = d.players.findIndex(p => p.id === player.id);
      if (i >= 0) { d.players[i] = player; save(d); }
    },

    deletePlayer(id) {
      const d = get();
      d.players = d.players.filter(p => p.id !== id);
      save(d);
    },

    // --- Games ---
    getGames() { return get().games; },

    getGame(id) { return get().games.find(g => g.id === id) || null; },

    createGame(gameData) {
      const d = get();
      const game = {
        id: uid('g'),
        date: gameData.date,
        opponent: gameData.opponent,
        venue: gameData.venue || '',
        isHome: gameData.isHome ?? true,
        myLineup: [],
        oppLineup: [],
        innings: { my: [], opp: [] },
        atBats: [],
        pitching: [],
        status: 'lineup'
      };
      d.games.push(game);
      save(d);
      return game;
    },

    updateGame(game) {
      const d = get();
      const i = d.games.findIndex(g => g.id === game.id);
      if (i >= 0) { d.games[i] = game; save(d); }
    },

    deleteGame(id) {
      const d = get();
      d.games = d.games.filter(g => g.id !== id);
      save(d);
    },

    addAtBat(gameId, ab) {
      const d = get();
      const game = d.games.find(g => g.id === gameId);
      if (!game) return null;
      ab.id = uid('ab');
      game.atBats.push(ab);
      save(d);
      return ab;
    },

    updateAtBat(gameId, ab) {
      const d = get();
      const game = d.games.find(g => g.id === gameId);
      if (!game) return;
      const i = game.atBats.findIndex(a => a.id === ab.id);
      if (i >= 0) { game.atBats[i] = ab; save(d); }
    },

    deleteAtBat(gameId, abId) {
      const d = get();
      const game = d.games.find(g => g.id === gameId);
      if (!game) return;
      game.atBats = game.atBats.filter(a => a.id !== abId);
      save(d);
    },

    addPitching(gameId, pit) {
      const d = get();
      const game = d.games.find(g => g.id === gameId);
      if (!game) return null;
      pit.id = uid('pit');
      game.pitching.push(pit);
      save(d);
      return pit;
    },

    updatePitching(gameId, pit) {
      const d = get();
      const game = d.games.find(g => g.id === gameId);
      if (!game) return;
      const i = game.pitching.findIndex(p => p.id === pit.id);
      if (i >= 0) { game.pitching[i] = pit; save(d); }
    },

    deletePitching(gameId, pitId) {
      const d = get();
      const game = d.games.find(g => g.id === gameId);
      if (!game) return;
      game.pitching = game.pitching.filter(p => p.id !== pitId);
      save(d);
    },

    // --- Export / Import ---
    exportJSON() {
      const data = get();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'baseball_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    importJSON(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const data = JSON.parse(e.target.result);
            if (!data.players || !data.games) throw new Error('Invalid format');
            save(data);
            resolve(data);
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    },

    downloadCSV(content, filename) {
      const bom = '\uFEFF';
      const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
})();
