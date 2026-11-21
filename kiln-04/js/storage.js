const STORAGE_KEY = 'kiln04_telemetry_scores';
const MAX_RECORDS = 5;

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveScore(operatorId, yieldScore, sectorReached) {
  const sanitizedId = (operatorId || 'OP-04').trim().toUpperCase().slice(0, 8) || 'OP-04';
  const records = loadScores();
  records.push({ name: sanitizedId, score: yieldScore, level: sectorReached });
  records.sort((a, b) => b.score - a.score);
  records.splice(MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors in restricted browsing modes
  }
  return records;
}

function isHighScore(yieldScore) {
  if (yieldScore <= 0) return false;
  const records = loadScores();
  return records.length < MAX_RECORDS || yieldScore > (records[records.length - 1]?.score ?? 0);
}

function renderScoreTable(tbodyId, records) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.textContent = '';

  if (!records.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.textAlign = 'center';
    td.style.color = '#787d6f';
    td.style.padding = '10px';
    td.textContent = 'NO SHIFT LOGS RECORDED';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  records.forEach((rec, index) => {
    const tr = document.createElement('tr');

    const tdRank = document.createElement('td');
    tdRank.className = 'rank';
    tdRank.textContent = `0${index + 1}`;

    const tdName = document.createElement('td');
    tdName.textContent = rec.name;

    const tdScore = document.createElement('td');
    tdScore.className = 'hs-score';
    tdScore.textContent = String(rec.score).padStart(6, '0');

    const tdSector = document.createElement('td');
    tdSector.textContent = `B0${rec.level}`;

    tr.append(tdRank, tdName, tdScore, tdSector);
    tbody.appendChild(tr);
  });
}

function updateBestHUD() {
  const bestEl = document.getElementById('best-val');
  if (!bestEl) return;
  const records = loadScores();
  const topYield = records[0]?.score ?? 0;
  bestEl.textContent = String(topYield).padStart(6, '0');
}

/* Sampled Mechanical WAV Foley + Web Audio Engine */
const SoundRig = (() => {
  let ctx = null;
  let muted = false;
  const sampleBanks = {};

  function preloadSamples() {
    if (typeof ASSET_MANIFEST === 'undefined') return;
    const keys = Object.keys(ASSET_MANIFEST.audioPaths);
    for (const key of keys) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = ASSET_MANIFEST.audioPaths[key];
      audio.onerror = () => {
        if (ASSET_MANIFEST.audioFallbackURIs && ASSET_MANIFEST.audioFallbackURIs[key]) {
          audio.src = ASSET_MANIFEST.audioFallbackURIs[key];
        }
      };
      sampleBanks[key] = audio;
    }
  }

  preloadSamples();

  function ensureContext() {
    if (muted) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  function playSample(name, volume = 0.75, playbackRate = 1.0) {
    if (muted) return false;
    const baseAudio = sampleBanks[name];
    if (!baseAudio) return false;
    try {
      const node = baseAudio.cloneNode();
      node.volume = Math.max(0, Math.min(1, volume));
      node.playbackRate = playbackRate;
      const playPromise = node.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  function synthTone(type, startFreq, endFreq, duration, gainVal = 0.1) {
    const ac = ensureContext();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    jump(isSecondBurn = false) {
      const key = isSecondBurn ? 'double_jump' : 'jump';
      if (!playSample(key, 0.72)) {
        const base = isSecondBurn ? 210 : 145;
        synthTone('square', base, base * 2.3, 0.09, 0.09);
      }
    },
    land() {
      if (!playSample('land', 0.68)) {
        synthTone('triangle', 95, 38, 0.06, 0.11);
      }
    },
    slamStart() {
      if (!playSample('slam', 0.75)) {
        synthTone('sawtooth', 320, 75, 0.14, 0.1);
      }
    },
    cellPickup(comboIndex = 0) {
      const rate = 1.0 + (comboIndex % 8) * 0.06;
      if (!playSample('cell', 0.7, rate)) {
        const freq = 520 + (comboIndex % 8) * 65;
        synthTone('square', freq, freq * 1.25, 0.065, 0.08);
      }
    },
    bulkheadUnseal() {
      if (!playSample('unseal', 0.85)) {
        synthTone('sawtooth', 180, 420, 0.22, 0.12);
      }
    },
    crushScrubber() {
      if (!playSample('crush', 0.85)) {
        synthTone('sawtooth', 160, 42, 0.16, 0.16);
      }
    },
    hullShear() {
      if (!playSample('shear', 0.9)) {
        synthTone('sawtooth', 130, 32, 0.28, 0.18);
      }
    },
    sectorClear() {
      if (!playSample('clear', 0.82)) {
        synthTone('square', 440, 660, 0.18, 0.11);
      }
    }
  };
})();
