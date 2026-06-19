/* ═══════════════════════════════════════════════════════════════════
   AirSense AI — Main Application Script
   Handles: session management, encrypted key storage, AQI fetching,
   chat, and settings drawer
   ═══════════════════════════════════════════════════════════════════ */

// ── Session guard ──────────────────────────────────────────────────
let sessionKey = null; // CryptoKey — lives only in memory
let decryptedKeys = { groq: "", weather: "" };

(async function initSession() {
  // Check if user has a session
  const sessionActive = sessionStorage.getItem("airsense_session");
  const encodedPwd    = sessionStorage.getItem("airsense_session_key");

  if (!sessionActive || !encodedPwd || !CryptoModule.accountExists()) {
    // No valid session — redirect to login
    window.location.href = "/login";
    return;
  }

  try {
    // Re-derive the encryption key from the stored password
    const password = atob(encodedPwd);
    const account  = JSON.parse(localStorage.getItem("airsense_account"));
    const salt     = CryptoModule.fromBase64(account.salt);
    sessionKey     = await CryptoModule.deriveKey(password, salt);

    // Load saved API keys
    const savedKeys = await CryptoModule.loadAndDecrypt("airsense_apikeys", sessionKey);
    if (savedKeys) {
      decryptedKeys.groq    = savedKeys.groq || "";
      decryptedKeys.weather = savedKeys.weather || "";
    }

    // Load and restore encrypted chat history
    const savedChat = await CryptoModule.loadAndDecrypt("airsense_chathistory", sessionKey);
    if (savedChat && Array.isArray(savedChat)) {
      restoreChatHistory(savedChat);
    }

    // Populate settings UI
    populateSettings();

    // Boot the app
    bootApp();
  } catch (err) {
    console.error("Session init failed:", err);
    // Clear bad session and redirect
    sessionStorage.clear();
    window.location.href = "/login";
  }
})();


// ── Chat history tracking ──────────────────────────────────────────
let chatHistory = [];

function trackMessage(role, text) {
  chatHistory.push({ role, text, ts: Date.now() });
  saveChatHistory();
}

async function saveChatHistory() {
  if (!sessionKey) return;
  try {
    await CryptoModule.encryptAndStore("airsense_chathistory", chatHistory, sessionKey);
  } catch (e) {
    console.warn("Failed to save chat history:", e);
  }
}

function restoreChatHistory(history) {
  const chatLog = document.getElementById("chat-log");
  // Clear default welcome message
  chatLog.innerHTML = "";

  // Re-add welcome message
  const welcome = document.createElement("div");
  welcome.className = "msg msg--bot";
  welcome.innerHTML = `
    <i class="ti ti-wind msg-icon"></i>
    <div class="msg-bubble">
      Hi, I'm AirSense AI. Enter your city on the left, then ask me anything about air quality and health precautions — I'll ground my answers in WHO guidelines and live AQI data.
    </div>
  `;
  chatLog.appendChild(welcome);

  // Restore messages
  history.forEach(msg => {
    addMessageRaw(msg.role, msg.text);
  });

  chatHistory = history;
}


// ── Main app boot ──────────────────────────────────────────────────
function bootApp() {
  const cityForm     = document.getElementById("city-form");
  const cityInput    = document.getElementById("city-input");
  const aqiCard      = document.getElementById("aqi-card");
  const pollutantGrid= document.getElementById("pollutant-grid");
  const chatLog      = document.getElementById("chat-log");
  const chatForm     = document.getElementById("chat-form");
  const chatInput    = document.getElementById("chat-input");
  const chipRow      = document.getElementById("chip-row");

  let currentCity = "Ahmedabad";

  const BADGE_STYLES = {
    good:                { bg: "var(--good-bg)",   text: "var(--good-text)" },
    moderate:            { bg: "var(--good-bg)",   text: "var(--good-text)" },
    unhealthy_sensitive: { bg: "var(--warn-bg)",   text: "var(--warn-text)" },
    unhealthy:           { bg: "var(--warn-bg)",   text: "var(--warn-text)" },
    very_unhealthy:      { bg: "var(--danger-bg)", text: "var(--danger-text)" },
    hazardous:           { bg: "var(--danger-bg)", text: "var(--danger-text)" },
  };

  function renderAqiCard(data) {
    const style = BADGE_STYLES[data.bucket] || BADGE_STYLES.moderate;
    aqiCard.classList.remove("aqi-card--empty");
    aqiCard.innerHTML = `
      <div class="aqi-number">${data.aqi}</div>
      <div class="aqi-sub">Air Quality Index</div>
      <span class="aqi-badge" style="background:${style.bg}; color:${style.text}">${data.label}</span>
      <div class="aqi-city"><i class="ti ti-map-pin"></i> ${data.city}${data.country ? ", " + data.country : ""}</div>
    `;

    pollutantGrid.innerHTML = `
      <div class="pollutant-item"><div class="pollutant-val">${data.pollutants.pm2_5}</div><div class="pollutant-key">PM2.5 µg/m³</div></div>
      <div class="pollutant-item"><div class="pollutant-val">${data.pollutants.pm10}</div><div class="pollutant-key">PM10 µg/m³</div></div>
      <div class="pollutant-item"><div class="pollutant-val">${data.pollutants.no2}</div><div class="pollutant-key">NO2 µg/m³</div></div>
      <div class="pollutant-item"><div class="pollutant-val">${data.pollutants.o3}</div><div class="pollutant-key">O3 µg/m³</div></div>
    `;
  }

  async function fetchAqi(city) {
    if (!decryptedKeys.weather) {
      aqiCard.innerHTML = `<p class="aqi-empty-msg">Please add your OpenWeatherMap API key in Settings.</p>`;
      return;
    }
    aqiCard.innerHTML = `<p class="aqi-empty-msg">Loading live AQI for ${city}…</p>`;
    pollutantGrid.innerHTML = "";
    try {
      const res = await fetch("/api/aqi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, weather_key: decryptedKeys.weather }),
      });
      const data = await res.json();
      if (!res.ok) {
        aqiCard.innerHTML = `<p class="aqi-empty-msg">${data.error || "Could not fetch AQI."}</p>`;
        return;
      }
      currentCity = data.city;
      renderAqiCard(data);
    } catch (err) {
      aqiCard.innerHTML = `<p class="aqi-empty-msg">Network error. Check your connection.</p>`;
    }
  }

  function addMessage(role, html) {
    const msg = document.createElement("div");
    msg.className = `msg msg--${role}`;
    msg.innerHTML = `
      <div class="msg-icon"><i class="ti ${role === "user" ? "ti-user" : "ti-wind"}"></i></div>
      <div class="msg-bubble">${html}</div>
    `;
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
    return msg;
  }

  // Make addMessage available globally for restoreChatHistory
  window._addMessage = addMessage;

  async function sendQuestion(question) {
    if (!decryptedKeys.groq) {
      addMessage("bot", "Please add your Groq AI API key in <strong>Settings</strong> (⚙️) to use the chat.");
      return;
    }
    if (!decryptedKeys.weather) {
      addMessage("bot", "Please add your OpenWeatherMap API key in <strong>Settings</strong> (⚙️) first.");
      return;
    }

    addMessage("user", question);
    trackMessage("user", question);

    const loadingMsg = addMessage("bot", `<span class="loading">Checking live air quality and WHO guidance…</span>`);
    chatInput.disabled = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: currentCity,
          question,
          history: chatHistory.slice(-10),
          groq_key: decryptedKeys.groq,
          weather_key: decryptedKeys.weather,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        loadingMsg.innerHTML = `<div class="msg-icon"><i class="ti ti-wind"></i></div><div class="msg-bubble">${data.error || "Something went wrong."}</div>`;
        return;
      }

      const style = BADGE_STYLES[data.label?.toLowerCase().replace(/ /g, "_")] || { bg: "var(--good-bg)", text: "var(--good-text)" };
      const advisoryHtml = `
        <span class="tag" style="background:${style.bg}; color:${style.text}">AQI ${data.aqi} — ${data.label}</span><br>
        ${data.advisory.replace(/\n/g, "<br>")}
      `;
      loadingMsg.innerHTML = `
        <div class="msg-icon"><i class="ti ti-wind"></i></div>
        <div class="msg-bubble">${advisoryHtml}</div>
      `;

      trackMessage("bot", advisoryHtml);
      fetchAqi(currentCity);
    } catch (err) {
      loadingMsg.innerHTML = `<div class="msg-icon"><i class="ti ti-wind"></i></div><div class="msg-bubble">Network error. Try again.</div>`;
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  cityForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (city) fetchAqi(city);
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (!q) return;
    chatInput.value = "";
    sendQuestion(q);
  });

  chipRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (btn) sendQuestion(btn.dataset.q);
  });

  // Initial load
  if (decryptedKeys.weather) {
    fetchAqi(currentCity);
  }

  // ── Settings drawer logic ────────────────────────────────────────
  initSettings();
}


// ── Raw message adder (for history restore) ────────────────────────
function addMessageRaw(role, html) {
  const chatLog = document.getElementById("chat-log");
  const msg = document.createElement("div");
  msg.className = `msg msg--${role}`;
  msg.innerHTML = `
    <div class="msg-icon"><i class="ti ${role === "user" ? "ti-user" : "ti-wind"}"></i></div>
    <div class="msg-bubble">${html}</div>
  `;
  chatLog.appendChild(msg);
}


// ── Settings logic ─────────────────────────────────────────────────
function populateSettings() {
  // Set username
  const username = CryptoModule.getUsername() || "User";
  const usernameEl = document.getElementById("settings-username");
  const avatarEl   = document.getElementById("settings-avatar");
  if (usernameEl) usernameEl.textContent = username;
  if (avatarEl)   avatarEl.textContent = username.charAt(0).toUpperCase();

  // Set key inputs
  const groqInput    = document.getElementById("groq-key-input");
  const weatherInput = document.getElementById("weather-key-input");
  if (groqInput)    groqInput.value    = decryptedKeys.groq;
  if (weatherInput) weatherInput.value = decryptedKeys.weather;
}

function initSettings() {
  const overlay    = document.getElementById("settings-overlay");
  const drawer     = document.getElementById("settings-drawer");
  const openBtn    = document.getElementById("open-settings");
  const closeBtn   = document.getElementById("close-settings");
  const saveBtn    = document.getElementById("save-keys-btn");
  const statusEl   = document.getElementById("key-status");
  const logoutBtn  = document.getElementById("logout-btn");
  const deleteBtn  = document.getElementById("delete-account-btn");

  function openSettings() {
    overlay.classList.add("open");
    drawer.classList.add("open");
  }
  function closeSettings() {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
  }

  openBtn.addEventListener("click", openSettings);
  closeBtn.addEventListener("click", closeSettings);
  overlay.addEventListener("click", closeSettings);

  // Key visibility toggles
  document.getElementById("toggle-groq-key").addEventListener("click", () => {
    const inp = document.getElementById("groq-key-input");
    const icon = document.querySelector("#toggle-groq-key i");
    if (inp.type === "password") { inp.type = "text"; icon.className = "ti ti-eye-off"; }
    else { inp.type = "password"; icon.className = "ti ti-eye"; }
  });
  document.getElementById("toggle-weather-key").addEventListener("click", () => {
    const inp = document.getElementById("weather-key-input");
    const icon = document.querySelector("#toggle-weather-key i");
    if (inp.type === "password") { inp.type = "text"; icon.className = "ti ti-eye-off"; }
    else { inp.type = "password"; icon.className = "ti ti-eye"; }
  });

  // Save keys
  saveBtn.addEventListener("click", async () => {
    const groqVal    = document.getElementById("groq-key-input").value.trim();
    const weatherVal = document.getElementById("weather-key-input").value.trim();

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="login-spinner" style="display:block;width:18px;height:18px;border-width:2px;"></div>';

    try {
      decryptedKeys.groq    = groqVal;
      decryptedKeys.weather = weatherVal;

      // Encrypt and store
      await CryptoModule.encryptAndStore("airsense_apikeys", decryptedKeys, sessionKey);

      statusEl.className = "settings-status success";
      statusEl.innerHTML = '<i class="ti ti-check"></i> Keys encrypted and saved securely!';
      statusEl.style.display = "block";

      // Auto-fetch AQI if weather key was just added
      if (weatherVal) {
        const cityInput = document.getElementById("city-input");
        const city = cityInput.value.trim() || "Ahmedabad";
        // Trigger a fresh AQI fetch (this is handled by bootApp's closure)
        const aqiCard = document.getElementById("aqi-card");
        aqiCard.innerHTML = `<p class="aqi-empty-msg">Loading live AQI…</p>`;
        fetch("/api/aqi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city, weather_key: weatherVal }),
        }).then(r => r.json()).then(data => {
          if (data.aqi !== undefined) {
            // Simple re-render
            location.reload();
          }
        }).catch(() => {});
      }

      setTimeout(() => { statusEl.style.display = "none"; }, 3000);
    } catch (err) {
      statusEl.className = "settings-status error";
      statusEl.innerHTML = '<i class="ti ti-alert-circle"></i> Failed to save keys. Try again.';
      statusEl.style.display = "block";
      console.error(err);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ti ti-device-floppy"></i><span>Save & Encrypt Keys</span>';
    }
  });

  // Logout
  logoutBtn.addEventListener("click", () => {
    sessionKey = null;
    decryptedKeys = { groq: "", weather: "" };
    sessionStorage.clear();
    window.location.href = "/login";
  });

  // Delete account
  deleteBtn.addEventListener("click", () => {
    if (confirm("⚠️ This will permanently delete your account, API keys, and chat history. Continue?")) {
      CryptoModule.deleteAccount();
      sessionStorage.clear();
      sessionKey = null;
      window.location.href = "/login";
    }
  });

  // Close drawer on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) {
      closeSettings();
    }
  });

  // Mute Toggle Logic
  const muteBtn = document.getElementById("toggle-mute-btn");
  const muteIcon = muteBtn.querySelector("i");
  const muteText = document.getElementById("mute-btn-text");
  
  if (SoundEngine && SoundEngine.isMuted()) {
    muteIcon.className = "ti ti-volume-3";
    muteText.textContent = "Off";
  }

  muteBtn.addEventListener("click", () => {
    if (!SoundEngine) return;
    const isMuted = SoundEngine.toggleMute();
    if (isMuted) {
      muteIcon.className = "ti ti-volume-3";
      muteText.textContent = "Off";
    } else {
      muteIcon.className = "ti ti-volume";
      muteText.textContent = "On";
      SoundEngine.playPop(); // Play a test sound when unmuting
    }
  });
}
