/**
 * AirSense AI — Client-Side Encryption Module
 * AES-256-GCM via Web Crypto API  +  PBKDF2 key derivation
 *
 * Nothing is stored in plain text. The user's password becomes the
 * encryption key through PBKDF2 (100 000 iterations, SHA-256).
 */

const CryptoModule = (() => {
  const PBKDF2_ITERATIONS = 100_000;
  const KEY_LENGTH = 256;           // AES-256
  const IV_LENGTH = 12;             // 96-bit IV for GCM
  const SALT_LENGTH = 16;           // 128-bit salt

  /* ─── helpers ─────────────────────────────────────────────────── */
  function toBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  function fromBase64(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  }

  /* ─── key derivation ─────────────────────────────────────────── */
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: KEY_LENGTH },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /* ─── encrypt / decrypt ──────────────────────────────────────── */
  async function encrypt(plaintext, cryptoKey) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      enc.encode(plaintext)
    );
    return {
      ciphertext: toBase64(cipherBuf),
      iv: toBase64(iv),
    };
  }

  async function decrypt(ciphertext, iv, cryptoKey) {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      cryptoKey,
      fromBase64(ciphertext)
    );
    return new TextDecoder().decode(plainBuf);
  }

  /* ─── password hashing (for login verification) ─────────────── */
  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(password + toBase64(salt));
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    return toBase64(hashBuf);
  }

  /* ─── high-level storage helpers ─────────────────────────────── */
  async function encryptAndStore(key, value, cryptoKey) {
    const { ciphertext, iv } = await encrypt(JSON.stringify(value), cryptoKey);
    localStorage.setItem(key, JSON.stringify({ c: ciphertext, v: iv }));
  }

  async function loadAndDecrypt(key, cryptoKey) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const { c, v } = JSON.parse(raw);
      const plain = await decrypt(c, v, cryptoKey);
      return JSON.parse(plain);
    } catch {
      return null;
    }
  }

  /* ─── account management ─────────────────────────────────────── */
  async function createAccount(username, password) {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const cryptoKey = await deriveKey(password, salt);

    const accountData = {
      username,
      salt: toBase64(salt),
      hash,
    };
    localStorage.setItem("airsense_account", JSON.stringify(accountData));
    return cryptoKey;
  }

  async function login(password) {
    const raw = localStorage.getItem("airsense_account");
    if (!raw) return null;

    const account = JSON.parse(raw);
    const salt = fromBase64(account.salt);
    const hash = await hashPassword(password, salt);

    if (hash !== account.hash) return null;

    return deriveKey(password, salt);
  }

  function accountExists() {
    return localStorage.getItem("airsense_account") !== null;
  }

  function getUsername() {
    const raw = localStorage.getItem("airsense_account");
    if (!raw) return null;
    return JSON.parse(raw).username;
  }

  function logout() {
    // Only clear the session key reference — account data stays
    // (the caller is responsible for clearing the in-memory key)
  }

  function deleteAccount() {
    localStorage.removeItem("airsense_account");
    localStorage.removeItem("airsense_apikeys");
    localStorage.removeItem("airsense_chathistory");
  }

  /* ─── public API ─────────────────────────────────────────────── */
  return {
    generateSalt,
    deriveKey,
    encrypt,
    decrypt,
    hashPassword,
    encryptAndStore,
    loadAndDecrypt,
    createAccount,
    login,
    accountExists,
    getUsername,
    logout,
    deleteAccount,
    toBase64,
    fromBase64,
  };
})();
