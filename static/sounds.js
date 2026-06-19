/**
 * AirSense AI — UI Sound Synthesizer (Web Audio API)
 * Zero external assets.
 */

const SoundEngine = (function() {
  let audioCtx = null;
  let muted = localStorage.getItem("airsense_muted") === "true";

  function init() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
  }

  // Resume context on user gesture (browsers require this)
  document.addEventListener("click", () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }, { once: true });

  function playOscillator(type, freqStart, freqEnd, duration, volStart) {
    if (muted || !audioCtx) return;
    init();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    }

    gain.gain.setValueAtTime(volStart, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    toggleMute() {
      muted = !muted;
      localStorage.setItem("airsense_muted", muted.toString());
      return muted;
    },
    isMuted() {
      return muted;
    },
    init,
    
    // UI Sounds
    playClick() {
      // Soft, high-pitched click
      playOscillator("sine", 600, 300, 0.05, 0.1);
    },
    playPop() {
      // Gentle bubble pop
      playOscillator("sine", 400, 800, 0.08, 0.15);
    },
    playWhoosh() {
      // Low swoosh for drawer open
      playOscillator("triangle", 100, 50, 0.2, 0.1);
    },
    playSuccess() {
      // Cheerful double chime
      if (muted || !audioCtx) return;
      init();
      const t = audioCtx.currentTime;
      
      const playTone = (freq, startT, dur) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startT);
        gain.gain.setValueAtTime(0.1, startT);
        gain.gain.exponentialRampToValueAtTime(0.001, startT + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startT);
        osc.stop(startT + dur);
      };

      playTone(523.25, t, 0.15); // C5
      playTone(659.25, t + 0.15, 0.3); // E5
    }
  };
})();

// Auto-bind sound effects to standard elements
document.addEventListener("DOMContentLoaded", () => {
  SoundEngine.init();
  
  document.body.addEventListener("click", (e) => {
    const target = e.target.closest("a, button, .chip, .feature-card");
    if (target) {
      // Prevent sound if disabled
      if (target.disabled) return;

      // Special sounds based on classes
      if (target.classList.contains("hero-cta") || target.classList.contains("login-btn") || target.classList.contains("settings-save-btn")) {
        SoundEngine.playPop();
      } else if (target.id === "open-settings") {
        SoundEngine.playWhoosh();
      } else if (target.classList.contains("close-settings") || target.classList.contains("settings-close")) {
        SoundEngine.playClick();
      } else {
        SoundEngine.playClick();
      }
    }
  });
});
