'use strict';

const Crypto = (() => {
  const PW_KEY   = 'sc_pw';
  const DATA_KEY = 'baseball_scoreapp_v1';

  // チーム固定パスワード（データ暗号化キー）
  const TEAM_PASSWORD = 'kameao_221_0123';

  function setPassword(pw) { sessionStorage.setItem(PW_KEY, pw); }
  function getPassword()   { return sessionStorage.getItem(PW_KEY) || ''; }
  function hasPassword()   { return !!sessionStorage.getItem(PW_KEY); }
  function clearPassword() { sessionStorage.removeItem(PW_KEY); }

  // CryptoJS AES 出力は "U2Fsd" ("Salted__" のbase64) から始まる
  function isEncrypted(str) {
    return typeof str === 'string' && str.startsWith('U2Fsd');
  }

  function encrypt(obj) {
    return CryptoJS.AES.encrypt(JSON.stringify(obj), TEAM_PASSWORD).toString();
  }

  function decrypt(str) {
    if (!str) return null;
    if (isEncrypted(str)) {
      try {
        const bytes = CryptoJS.AES.decrypt(str, TEAM_PASSWORD);
        const plain = bytes.toString(CryptoJS.enc.Utf8);
        if (!plain) return null;
        return JSON.parse(plain);
      } catch (e) { return null; }
    }
    // 平文JSON（旧データ互換）
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  // ページロード時に自動認証（ログイン画面なし）
  function requireAuth(onSuccess) {
    setPassword(TEAM_PASSWORD);
    onSuccess();
  }

  return {
    setPassword, getPassword, hasPassword, clearPassword,
    encrypt, decrypt, isEncrypted, requireAuth,
    TEAM_PASSWORD
  };
})();
