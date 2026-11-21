const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

/* Load Bitmap Sprite Atlas with Embedded Fallback */
const spriteAtlas = new Image();
let atlasReady = false;
spriteAtlas.onload = () => {
  atlasReady = true;
};
spriteAtlas.onerror = () => {
  if (typeof ASSET_MANIFEST !== 'undefined' && spriteAtlas.src !== ASSET_MANIFEST.atlasFallbackURI) {
    spriteAtlas.src = ASSET_MANIFEST.atlasFallbackURI;
  }
};
if (typeof ASSET_MANIFEST !== 'undefined') {
  spriteAtlas.src = ASSET_MANIFEST.atlasPath;
}

const BOUND_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Tab'
]);
const inputState = {};

let runState = 'standby';
let rig = null;
let catwalks = [];
let powerCells = [];
let scrubbers = [];
let bulkhead = null;
let debrisList = [];
let popups = [];

let worldW = 1280;
let worldH = 600;
let camera = { x: 0, y: 0 };

let yieldScore = 0;
let hullPlates = 3;
let sectorIndex = 0;
let sectorStartStamp = 0;
let elapsedSectorSec = 0;
let lastTick = performance.now();
let hitStopTimer = 0;
let cameraShake = { x: 0, y: 0, trauma: 0 };
let activeModalBinding = null;

const PARALLAX_SHAFTS = [
  { x: 60,  w: 44, factor: 0.25 },
  { x: 230, w: 68, factor: 0.25 },
  { x: 440, w: 36, factor: 0.25 },
  { x: 640, w: 74, factor: 0.25 },
  { x: 880, w: 50, factor: 0.25 },
  { x: 140, w: 28, factor: 0.55 },
  { x: 360, w: 32, factor: 0.55 },
  { x: 560, w: 26, factor: 0.55 },
  { x: 780, w: 38, factor: 0.55 }
];

document.addEventListener('keydown', e => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  if (e.code === 'Tab') {
    e.preventDefault();
    if (typeof window.toggleManualDrawer === 'function') {
      window.toggleManualDrawer();
    }
    return;
  }

  if (e.code === 'Escape') {
    const drawer = document.getElementById('manual-drawer');
    if (drawer && drawer.classList.contains('open') && typeof window.toggleManualDrawer === 'function') {
      window.toggleManualDrawer(false);
      return;
    }
  }

  if (BOUND_KEYS.has(e.code)) e.preventDefault();

  if (!inputState[e.code]) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (rig) rig.jumpBuffer = PHYSICS.jumpBufferFrames;
      if (runState === 'standby') {
        document.getElementById('start-btn').click();
      }
    }
    if (e.code === 'KeyM') toggleAudioMute();
    if (e.code === 'KeyR' && runState === 'active') resetShift();
  }
  inputState[e.code] = true;
});

document.addEventListener('keyup', e => {
  inputState[e.code] = false;
  if (
    (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') &&
    rig &&
    rig.vy < 0 &&
    !rig.slamming
  ) {
    rig.vy *= PHYSICS.jumpCutMultiplier;
  }
});

function isHeld(...codes) {
  return codes.some(code => inputState[code]);
}

function addTrauma(amount) {
  cameraShake.trauma = Math.min(1, cameraShake.trauma + amount);
}

function spawnDebris(x, y, color, count = 10, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const speed = (1.6 + Math.random() * 3.4) * speedScale;
    debrisList.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.8,
      life: 1,
      decay: 0.028 + Math.random() * 0.025,
      w: 3 + Math.random() * 3,
      h: 2 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 0.25,
      color
    });
  }
}

function spawnTelemetryPopup(x, y, text, color = PALETTE.paper) {
  popups.push({ x, y, text, color, life: 1 });
}

function updateEffects(dtScale) {
  if (cameraShake.trauma > 0) {
    const shakePower = cameraShake.trauma * cameraShake.trauma * 9;
    cameraShake.x = (Math.random() * 2 - 1) * shakePower;
    cameraShake.y = (Math.random() * 2 - 1) * shakePower;
    cameraShake.trauma = Math.max(0, cameraShake.trauma - 0.045 * dtScale);
  } else {
    cameraShake.x = 0;
    cameraShake.y = 0;
  }

  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i];
    d.x += d.vx * dtScale;
    d.y += d.vy * dtScale;
    d.vy += 0.18 * dtScale;
    d.rot += d.vRot * dtScale;
    d.life -= d.decay * dtScale;
    if (d.life <= 0) debrisList.splice(i, 1);
  }

  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y -= 0.65 * dtScale;
    p.life -= 0.028 * dtScale;
    if (p.life <= 0) popups.splice(i, 1);
  }
}

function snapCameraToRig() {
  if (!rig) return;
  const targetX = rig.x + rig.w / 2 - VIEW_W / 2;
  const targetY = rig.y + rig.h / 2 - VIEW_H / 2;
  camera.x = Math.max(0, Math.min(worldW - VIEW_W, targetX));
  camera.y = Math.max(0, Math.min(worldH - VIEW_H, targetY));
}

function updateCamera(dtScale) {
  if (!rig) return;
  const rigCenterX = rig.x + rig.w / 2;
  const rigCenterY = rig.y + rig.h / 2;
  const viewCenterX = camera.x + VIEW_W / 2;
  const viewCenterY = camera.y + VIEW_H / 2;

  let desiredX = camera.x;
  let desiredY = camera.y;

  const dx = rigCenterX - viewCenterX;
  if (Math.abs(dx) > PHYSICS.cameraDeadzoneX) {
    desiredX += dx - Math.sign(dx) * PHYSICS.cameraDeadzoneX;
  }

  const dy = rigCenterY - viewCenterY;
  if (Math.abs(dy) > PHYSICS.cameraDeadzoneY) {
    desiredY += dy - Math.sign(dy) * PHYSICS.cameraDeadzoneY;
  }

  desiredX = Math.max(0, Math.min(worldW - VIEW_W, desiredX));
  desiredY = Math.max(0, Math.min(worldH - VIEW_H, desiredY));

  const smoothFactor = 1 - Math.pow(1 - PHYSICS.cameraSmooth, dtScale);
  camera.x += (desiredX - camera.x) * smoothFactor;
  camera.y += (desiredY - camera.y) * smoothFactor;
}

function loadSector(idx) {
  const sector = SECTORS[idx];
  worldW = sector.worldW || 1280;
  worldH = sector.worldH || 600;
  catwalks = sector.platforms.map(p => ({ ...p }));
  powerCells = sector.coins.map((c, i) => ({
    ...c,
    collected: false,
    phase: i * 0.6
  }));
  scrubbers = sector.enemies.map(e => ({ ...e, wheelPhase: 0 }));
  bulkhead = {
    x: sector.portal.x,
    y: sector.portal.y,
    openRatio: 0,
    wasUnsealed: false
  };
  rig = {
    x: sector.playerStart.x,
    y: sector.playerStart.y,
    w: 26,
    h: 32,
    vx: 0,
    vy: 0,
    onGround: false,
    wasOnGround: false,
    groundPlatform: null,
    coyoteTimer: 0,
    jumpBuffer: 0,
    jumpsRemaining: 2,
    invincibleTimer: 0,
    slamming: false,
    facing: 1,
    scaleX: 1,
    scaleY: 1,
    stridePhase: 0,
    afterimages: []
  };
  snapCameraToRig();
  sectorStartStamp = performance.now();
  elapsedSectorSec = 0;
  runState = 'active';
}

function resetShift() {
  yieldScore = 0;
  hullPlates = 3;
  sectorIndex = 0;
  debrisList = [];
  popups = [];
  loadSector(0);
  syncHUD();
  triggerSectorBanner(`${SECTORS[0].code} // ${SECTORS[0].name}`);
}

function triggerSectorBanner(label) {
  const banner = document.getElementById('level-announce');
  banner.textContent = label;
  banner.classList.add('active');
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => {
    banner.classList.remove('active');
  }, 1900);
}

function syncHUD() {
  document.getElementById('score-val').textContent = String(yieldScore).padStart(6, '0');
  document.getElementById('level-val').textContent = String(sectorIndex + 1).padStart(2, '0');

  const seatedCount = powerCells.filter(c => c.collected).length;
  document.getElementById('coins-val').textContent = `${seatedCount}/${powerCells.length}`;

  const timerEl = document.getElementById('timer-val');
  if (timerEl) {
    timerEl.textContent = `${elapsedSectorSec.toFixed(1)}S`;
    timerEl.style.color = elapsedSectorSec < PHYSICS.parTimeSeconds ? PALETTE.lime : PALETTE.paper;
  }

  const pips = document.querySelectorAll('#lives-val .pip');
  pips.forEach((pip, idx) => {
    pip.classList.toggle('spent', idx >= hullPlates);
  });
}

function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function executeJump() {
  const isFirstJump = rig.onGround || rig.coyoteTimer > 0;
  rig.vy = isFirstJump ? PHYSICS.jumpVelocity : PHYSICS.doubleJumpVelocity;
  rig.jumpsRemaining = isFirstJump ? 1 : 0;
  rig.onGround = false;
  rig.groundPlatform = null;
  rig.coyoteTimer = 0;
  rig.jumpBuffer = 0;
  rig.slamming = false;
  rig.scaleX = 0.76;
  rig.scaleY = 1.28;

  SoundRig.jump(!isFirstJump);
  spawnDebris(
    rig.x + rig.w / 2,
    rig.y + rig.h,
    isFirstJump ? PALETTE.paper : PALETTE.amber,
    7,
    0.75
  );
}

/* Substepped Swept Collision Resolution (Prevents High-Speed Tunneling) */
function moveRigWithSweptCCD(totalDx, totalDy) {
  const maxDisp = Math.max(Math.abs(totalDx), Math.abs(totalDy));
  const steps = Math.max(1, Math.ceil(maxDisp / PHYSICS.ccdMaxStepPx));
  const stepX = totalDx / steps;
  const stepY = totalDy / steps;

  rig.wasOnGround = rig.onGround;
  rig.onGround = false;
  rig.groundPlatform = null;

  for (let s = 0; s < steps; s++) {
    // 1. Sweep X Axis
    rig.x += stepX;
    for (const cw of catwalks) {
      if (aabbOverlap(rig.x, rig.y, rig.w, rig.h, cw.x, cw.y, cw.w, cw.h)) {
        if (stepX > 0) {
          rig.x = cw.x - rig.w;
        } else if (stepX < 0) {
          rig.x = cw.x + cw.w;
        }
        rig.vx = 0;
      }
    }

    // 2. Sweep Y Axis
    const prevBottom = rig.y + rig.h;
    const prevTop = rig.y;
    rig.y += stepY;

    for (const cw of catwalks) {
      if (aabbOverlap(rig.x, rig.y, rig.w, rig.h, cw.x, cw.y, cw.w, cw.h)) {
        if (stepY >= 0 && prevBottom <= cw.y + 4) {
          const impactSpeed = rig.vy;
          const wasSlam = rig.slamming;
          rig.y = cw.y - rig.h;
          rig.vy = 0;
          rig.onGround = true;
          rig.groundPlatform = cw;
          rig.coyoteTimer = PHYSICS.coyoteFrames;
          rig.jumpsRemaining = 2;
          rig.slamming = false;

          if (!rig.wasOnGround && impactSpeed > 3) {
            rig.scaleX = wasSlam ? 1.38 : 1.22;
            rig.scaleY = wasSlam ? 0.68 : 0.8;
            SoundRig.land();
            if (wasSlam) {
              addTrauma(0.34);
              spawnDebris(rig.x + rig.w / 2, rig.y + rig.h, PALETTE.amber, 10, 0.9);
            }
          }
        } else if (stepY < 0 && prevTop >= cw.y + cw.h - 4) {
          rig.y = cw.y + cw.h;
          rig.vy = 0;
        } else {
          // Fallback penetration pushout
          const overlapT = (rig.y + rig.h) - cw.y;
          const overlapB = (cw.y + cw.h) - rig.y;
          if (overlapT < overlapB) {
            rig.y = cw.y - rig.h;
            rig.vy = 0;
            rig.onGround = true;
            rig.groundPlatform = cw;
          } else {
            rig.y = cw.y + cw.h;
            rig.vy = 0;
          }
        }
      }
    }
  }
}

function stepSimulation(dtScale) {
  updateEffects(dtScale);

  const manualDrawer = document.getElementById('manual-drawer');
  if (manualDrawer && manualDrawer.classList.contains('open')) return;
  if (runState !== 'active') return;

  elapsedSectorSec = (performance.now() - sectorStartStamp) / 1000;

  if (hitStopTimer > 0) {
    hitStopTimer = Math.max(0, hitStopTimer - dtScale);
    return;
  }

  const moveLeft = isHeld('ArrowLeft', 'KeyA');
  const moveRight = isHeld('ArrowRight', 'KeyD');
  const accel = rig.onGround ? PHYSICS.groundAccel : PHYSICS.airAccel;

  if (moveLeft && !rig.slamming) {
    rig.vx = Math.max(-PHYSICS.maxSpeed, rig.vx - accel * dtScale);
    rig.facing = -1;
  } else if (moveRight && !rig.slamming) {
    rig.vx = Math.min(PHYSICS.maxSpeed, rig.vx + accel * dtScale);
    rig.facing = 1;
  } else {
    const friction = rig.onGround ? PHYSICS.groundFriction : PHYSICS.airDrag;
    rig.vx *= Math.pow(friction, dtScale);
    if (Math.abs(rig.vx) < 0.05) rig.vx = 0;
  }

  if (rig.coyoteTimer > 0) rig.coyoteTimer = Math.max(0, rig.coyoteTimer - dtScale);
  if (rig.jumpBuffer > 0) rig.jumpBuffer = Math.max(0, rig.jumpBuffer - dtScale);

  const canJump = rig.onGround || rig.coyoteTimer > 0 || rig.jumpsRemaining > 0;
  if (rig.jumpBuffer > 0 && canJump) {
    executeJump();
  }

  if (isHeld('ArrowDown', 'KeyS') && !rig.onGround && !rig.slamming) {
    rig.slamming = true;
    rig.vx *= 0.2;
    rig.vy = PHYSICS.slamVelocity;
    rig.scaleX = 0.72;
    rig.scaleY = 1.35;
    SoundRig.slamStart();
  }

  if (rig.slamming) {
    rig.vy = Math.max(rig.vy, PHYSICS.slamVelocity);
  } else {
    const gravMultiplier = rig.vy > 0 ? PHYSICS.fallGravityMultiplier : 1;
    rig.vy = Math.min(
      PHYSICS.maxFallSpeed,
      rig.vy + PHYSICS.gravity * gravMultiplier * dtScale
    );
  }

  // Advance moving gantries and carry rig if standing on one
  let platformCarryX = 0;
  for (const cw of catwalks) {
    if (cw.vx) {
      const stepPlatX = cw.vx * dtScale;
      cw.x += stepPlatX;
      if (cw.x <= cw.range[0] || cw.x + cw.w >= cw.range[1]) {
        cw.vx *= -1;
      }
      if (rig.onGround && rig.groundPlatform === cw) {
        platformCarryX = stepPlatX;
      }
    }
  }

  moveRigWithSweptCCD(rig.vx * dtScale + platformCarryX, rig.vy * dtScale);

  if (rig.wasOnGround && !rig.onGround && rig.vy >= 0) {
    rig.coyoteTimer = PHYSICS.coyoteFrames;
  }

  rig.x = Math.max(0, Math.min(worldW - rig.w, rig.x));
  rig.scaleX += (1 - rig.scaleX) * 0.22 * dtScale;
  rig.scaleY += (1 - rig.scaleY) * 0.22 * dtScale;

  if (rig.onGround && Math.abs(rig.vx) > 0.3) {
    rig.stridePhase += Math.abs(rig.vx) * 0.14 * dtScale;
  } else {
    rig.stridePhase = 0;
  }

  if (rig.slamming || Math.abs(rig.vx) > 2.8) {
    rig.afterimages.push({
      x: rig.x,
      y: rig.y,
      slam: rig.slamming,
      life: 1
    });
    if (rig.afterimages.length > 7) rig.afterimages.shift();
  }
  for (let i = rig.afterimages.length - 1; i >= 0; i--) {
    rig.afterimages[i].life -= 0.14 * dtScale;
    if (rig.afterimages[i].life <= 0) rig.afterimages.splice(i, 1);
  }

  updateCamera(dtScale);

  if (rig.y > worldH + 65) {
    shearHullPlate();
    return;
  }

  let seatedCount = 0;
  for (const cell of powerCells) {
    cell.phase += 0.06 * dtScale;
    if (!cell.collected && aabbOverlap(rig.x, rig.y, rig.w, rig.h, cell.x - 9, cell.y - 9, 18, 18)) {
      cell.collected = true;
      yieldScore += SCORING.cellValue;
      const currentSeated = powerCells.filter(c => c.collected).length;
      SoundRig.cellPickup(currentSeated);
      spawnDebris(cell.x, cell.y, PALETTE.lime, 8, 0.7);
      spawnTelemetryPopup(cell.x, cell.y - 10, `+${SCORING.cellValue}`, PALETTE.lime);
    }
    if (cell.collected) seatedCount++;
  }

  const allCellsSeated = seatedCount === powerCells.length;
  if (allCellsSeated && !bulkhead.wasUnsealed) {
    bulkhead.wasUnsealed = true;
    SoundRig.bulkheadUnseal();
    addTrauma(0.24);
    spawnTelemetryPopup(bulkhead.x, bulkhead.y - 26, 'BULKHEAD UNSEALED', PALETTE.lime);
  }
  const targetRatio = allCellsSeated ? 1 : 0;
  bulkhead.openRatio += (targetRatio - bulkhead.openRatio) * 0.12 * dtScale;

  for (const sc of scrubbers) {
    sc.x += sc.dir * sc.speed * dtScale;
    sc.wheelPhase += Math.abs(sc.speed) * 0.18 * dtScale;
    if (sc.x <= sc.range[0] || sc.x + sc.w >= sc.range[1]) {
      sc.dir *= -1;
    }

    if (rig.invincibleTimer <= 0 && aabbOverlap(rig.x, rig.y, rig.w, rig.h, sc.x, sc.y, sc.w, sc.h)) {
      const crushCeiling = rig.slamming ? sc.y + sc.h * 0.9 : sc.y + sc.h * 0.65;
      if (rig.vy > 0 && rig.y + rig.h <= crushCeiling) {
        sc.crushed = true;
        rig.vy = PHYSICS.stompBounceVelocity;
        rig.slamming = false;
        rig.jumpsRemaining = 2;
        rig.scaleX = 1.3;
        rig.scaleY = 0.72;
        yieldScore += SCORING.scrubberCrush;
        hitStopTimer = PHYSICS.hitStopFrames;
        addTrauma(0.48);
        SoundRig.crushScrubber();
        spawnDebris(sc.x + sc.w / 2, sc.y + sc.h / 2, PALETTE.crimson, 16, 1.15);
        spawnTelemetryPopup(sc.x + sc.w / 2, sc.y - 6, `+${SCORING.scrubberCrush}`, PALETTE.amber);
      } else {
        shearHullPlate();
        return;
      }
    }
  }
  scrubbers = scrubbers.filter(sc => !sc.crushed);

  if (
    allCellsSeated &&
    aabbOverlap(rig.x, rig.y, rig.w, rig.h, bulkhead.x - 18, bulkhead.y - 22, 36, 44)
  ) {
    advanceSector();
    return;
  }

  if (rig.invincibleTimer > 0) {
    rig.invincibleTimer = Math.max(0, rig.invincibleTimer - dtScale);
  }

  syncHUD();
}

function shearHullPlate() {
  hullPlates--;
  hitStopTimer = PHYSICS.hitStopFrames + 2;
  addTrauma(0.75);
  SoundRig.hullShear();
  spawnDebris(rig.x + rig.w / 2, Math.min(worldH - 12, rig.y + rig.h / 2), PALETTE.crimson, 22, 1.3);
  syncHUD();

  if (hullPlates <= 0) {
    runState = 'terminated';
    setTimeout(() => {
      openEndModal({
        overlayId: 'gameover-screen',
        scoreElId: 'final-score',
        recordBannerId: 'go-record-msg',
        inputRowId: 'go-name-row',
        inputElId: 'go-name-input',
        saveBtnId: 'go-save-btn',
        tableBodyId: 'go-hs-body',
        finalScore: yieldScore,
        sectorReached: sectorIndex + 1
      });
      updateBestHUD();
    }, 550);
  } else {
    const startPos = SECTORS[sectorIndex].playerStart;
    rig.x = startPos.x;
    rig.y = startPos.y;
    rig.vx = 0;
    rig.vy = 0;
    rig.slamming = false;
    rig.invincibleTimer = PHYSICS.invincibleFrames;
    snapCameraToRig();
  }
}

function advanceSector() {
  SoundRig.sectorClear();
  spawnDebris(bulkhead.x, bulkhead.y, PALETTE.lime, 24, 1.1);

  const elapsedSeconds = (performance.now() - sectorStartStamp) / 1000;
  const underParBonus = elapsedSeconds < PHYSICS.parTimeSeconds ? SCORING.parBonus : 0;
  yieldScore += SCORING.sectorClear + underParBonus;

  sectorIndex++;
  if (sectorIndex >= SECTORS.length) {
    runState = 'cleared';
    syncHUD();
    setTimeout(() => {
      openEndModal({
        overlayId: 'win-screen',
        scoreElId: 'win-score',
        recordBannerId: 'win-record-msg',
        inputRowId: 'win-name-row',
        inputElId: 'win-name-input',
        saveBtnId: 'win-save-btn',
        tableBodyId: 'win-hs-body',
        finalScore: yieldScore,
        sectorReached: SECTORS.length
      });
      updateBestHUD();
    }, 550);
    return;
  }

  loadSector(sectorIndex);
  syncHUD();
  const parTag = underParBonus ? ` // PAR BONUS +${SCORING.parBonus}` : '';
  triggerSectorBanner(`${SECTORS[sectorIndex].code} // ${SECTORS[sectorIndex].name}${parTag}`);
}

function openEndModal(cfg) {
  document.getElementById(cfg.scoreElId).textContent = String(cfg.finalScore).padStart(6, '0');
  const qualifies = isHighScore(cfg.finalScore);
  document.getElementById(cfg.recordBannerId).style.display = qualifies ? 'block' : 'none';
  document.getElementById(cfg.inputRowId).style.display = qualifies ? 'flex' : 'none';

  renderScoreTable(cfg.tableBodyId, loadScores());
  document.getElementById(cfg.overlayId).style.display = 'flex';

  const inputEl = document.getElementById(cfg.inputElId);
  const saveBtn = document.getElementById(cfg.saveBtnId);
  inputEl.value = '';
  if (qualifies) setTimeout(() => inputEl.focus(), 40);

  activeModalBinding = () => {
    const operatorId = inputEl.value || 'OP-04';
    saveScore(operatorId, cfg.finalScore, cfg.sectorReached);
    document.getElementById(cfg.recordBannerId).style.display = 'none';
    document.getElementById(cfg.inputRowId).style.display = 'none';
    renderScoreTable(cfg.tableBodyId, loadScores());
    renderScoreTable('start-hs-body', loadScores());
    updateBestHUD();
  };

  saveBtn.onclick = activeModalBinding;
  inputEl.onkeydown = e => {
    if (e.key === 'Enter' && activeModalBinding) activeModalBinding();
  };
}

/* Parallax Bore Shaft & Sprite-Atlas Renderer */
function drawParallaxBore() {
  ctx.fillStyle = PALETTE.bgVoid;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Parallax vertical industrial columns
  for (const shaft of PARALLAX_SHAFTS) {
    const screenX = ((shaft.x - camera.x * shaft.factor) % VIEW_W + VIEW_W) % VIEW_W;
    ctx.fillStyle = shaft.factor < 0.4 ? '#12140f' : '#161913';
    ctx.fillRect(screenX, 0, shaft.w, VIEW_H);
    ctx.strokeStyle = PALETTE.gridLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(screenX + 0.5, -1, shaft.w, VIEW_H + 2);
  }

  // World-locked structural grid lines + depth elevation markers
  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = 1;
  const startGridX = Math.floor(camera.x / 80) * 80;
  for (let wx = startGridX; wx <= camera.x + VIEW_W; wx += 80) {
    const sx = Math.round(wx - camera.x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, VIEW_H);
    ctx.stroke();
  }

  const startGridY = Math.floor(camera.y / 75) * 75;
  ctx.fillStyle = 'rgba(140, 145, 132, 0.22)';
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  for (let wy = startGridY; wy <= camera.y + VIEW_H; wy += 75) {
    const sy = Math.round(wy - camera.y) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(VIEW_W, sy);
    ctx.stroke();
    const elevationM = Math.max(0, Math.round((worldH - wy) / 10));
    ctx.fillText(`+${String(elevationM).padStart(2, '0')}M`, 8, sy - 4);
  }

  const sector = SECTORS[sectorIndex] || SECTORS[0];
  ctx.fillStyle = 'rgba(140, 145, 132, 0.08)';
  ctx.font = '700 52px "Chakra Petch", sans-serif';
  ctx.fillText(sector.code, 28 - camera.x * 0.15, 68 - camera.y * 0.1);
  ctx.font = '600 12px "IBM Plex Mono", monospace';
  ctx.fillText(`SECTOR // ${sector.name} [${worldW}x${worldH}]`, 30 - camera.x * 0.15, 88 - camera.y * 0.1);
}

function drawCatwalks() {
  for (const cw of catwalks) {
    const isMoving = Boolean(cw.vx);

    if (isMoving && cw.range) {
      ctx.strokeStyle = PALETTE.steelDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cw.range[0], cw.y + cw.h / 2);
      ctx.lineTo(cw.range[1], cw.y + cw.h / 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(cw.x + 3, cw.y + 3, cw.w, cw.h);

    if (atlasReady) {
      const tileSrcX = isMoving ? 160 : 128;
      const tileSrcY = 32;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cw.x, cw.y, cw.w, cw.h);
      ctx.clip();
      for (let tx = cw.x; tx < cw.x + cw.w; tx += 32) {
        for (let ty = cw.y; ty < cw.y + cw.h; ty += 16) {
          ctx.drawImage(spriteAtlas, tileSrcX, tileSrcY, 32, 16, tx, ty, 32, 16);
        }
      }
      ctx.restore();
      ctx.strokeStyle = isMoving ? PALETTE.amber : PALETTE.steelDark;
      ctx.lineWidth = 1;
      ctx.strokeRect(cw.x + 0.5, cw.y + 0.5, cw.w - 1, cw.h - 1);
    } else {
      ctx.fillStyle = isMoving ? '#292116' : PALETTE.bgPanel;
      ctx.fillRect(cw.x, cw.y, cw.w, cw.h);
      ctx.fillStyle = isMoving ? PALETTE.amber : PALETTE.steel;
      ctx.fillRect(cw.x, cw.y, cw.w, 3);
    }
  }
}

function drawPowerCells() {
  for (const cell of powerCells) {
    if (cell.collected) continue;
    const offsetY = Math.sin(cell.phase) * 2.5;
    const cx = Math.round(cell.x);
    const cy = Math.round(cell.y + offsetY);

    if (atlasReady) {
      const pulseFrame = Math.floor(cell.phase * 1.5) % 2;
      const srcX = pulseFrame === 0 ? 64 : 96;
      ctx.drawImage(spriteAtlas, srcX, 32, 32, 32, cx - 16, cy - 16, 32, 32);
    } else {
      ctx.fillStyle = PALETTE.lime;
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
    }
  }
}

function drawScrubbers() {
  for (const sc of scrubbers) {
    const sx = Math.round(sc.x);
    const sy = Math.round(sc.y);

    if (atlasReady) {
      const frame = Math.floor(sc.wheelPhase) % 2;
      const srcX = frame === 0 ? 0 : 32;
      ctx.save();
      ctx.translate(sx + sc.w / 2, sy + sc.h / 2);
      if (sc.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(spriteAtlas, srcX + 2, 34, 28, 28, -sc.w / 2, -sc.h / 2, sc.w, sc.h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#241315';
      ctx.fillRect(sx, sy, sc.w, sc.h);
      ctx.strokeStyle = PALETTE.crimson;
      ctx.strokeRect(sx, sy, sc.w, sc.h);
    }
  }
}

function drawBulkhead() {
  const bx = Math.round(bulkhead.x);
  const by = Math.round(bulkhead.y);
  const isUnsealed = bulkhead.openRatio > 0.85;

  ctx.save();
  ctx.translate(bx, by);

  if (atlasReady) {
    ctx.drawImage(spriteAtlas, 0, 64, 40, 46, -20, -24, 40, 46);
    if (isUnsealed) {
      ctx.fillStyle = 'rgba(200, 255, 0, 0.22)';
      ctx.fillRect(-14, -18, 28, 34);
    }
    const slideOffset = Math.round(bulkhead.openRatio * 12);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-14, -18, 28, 34);
    ctx.clip();
    ctx.drawImage(spriteAtlas, 48, 64, 14, 34, -14 - slideOffset, -18, 14, 34);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(spriteAtlas, 48, 64, 14, 34, -14 - slideOffset, -18, 14, 34);
    ctx.restore();
    ctx.restore();
  } else {
    ctx.fillStyle = PALETTE.bgPanel;
    ctx.fillRect(-20, -24, 40, 46);
  }

  ctx.fillStyle = isUnsealed ? PALETTE.lime : PALETTE.amber;
  ctx.font = '600 9px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(isUnsealed ? 'OPEN' : 'SEALED', 0, 32);
  ctx.restore();
}

function drawRig() {
  const blinkSkip = rig.invincibleTimer > 0 && Math.floor(rig.invincibleTimer / 4) % 2 === 0;
  if (blinkSkip) return;

  for (const ghost of rig.afterimages) {
    ctx.save();
    ctx.globalAlpha = ghost.life * 0.28;
    ctx.strokeStyle = ghost.slam ? PALETTE.amber : PALETTE.lime;
    ctx.lineWidth = 1;
    ctx.strokeRect(ghost.x + 2, ghost.y + 2, rig.w - 4, rig.h - 4);
    ctx.restore();
  }

  ctx.save();
  const pivotX = Math.round(rig.x + rig.w / 2);
  const pivotY = Math.round(rig.y + rig.h);
  ctx.translate(pivotX, pivotY);
  ctx.scale(rig.scaleX * rig.facing, rig.scaleY);

  if (atlasReady) {
    let frameIndex = 0;
    if (rig.slamming) {
      frameIndex = 4;
    } else if (!rig.onGround) {
      frameIndex = 3;
    } else if (Math.abs(rig.vx) > 0.35) {
      frameIndex = (Math.floor(rig.stridePhase) % 2) + 1;
    }
    const srcX = frameIndex * 32 + 3;
    ctx.drawImage(spriteAtlas, srcX, 0, 26, 32, -rig.w / 2, -rig.h, rig.w, rig.h);

    if (rig.jumpsRemaining === 0 && !rig.slamming) {
      ctx.fillStyle = PALETTE.steelDark;
      ctx.fillRect(-rig.w / 2 + 3, -rig.h + 3, rig.w - 6, 3);
    }
  } else {
    ctx.fillStyle = '#23271e';
    ctx.fillRect(-rig.w / 2, -rig.h, rig.w, rig.h);
  }

  ctx.restore();
}

function drawEffects() {
  for (const d of debrisList) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, d.life);
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = d.color;
    ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.restore();
  }

  for (const p of popups) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.font = '700 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#000';
    ctx.fillText(p.text, p.x + 1, p.y + 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

/* Live Bore Radar Minimap (Shows Off-Screen Cells, Bulkhead & Camera Box) */
function drawBoreRadar() {
  if (!rig) return;
  const mapW = 108;
  const mapH = Math.round((worldH / worldW) * mapW);
  const mx = VIEW_W - mapW - 12;
  const my = 12;
  const scaleX = mapW / worldW;
  const scaleY = mapH / worldH;

  ctx.save();
  ctx.fillStyle = 'rgba(13, 14, 11, 0.86)';
  ctx.fillRect(mx, my, mapW, mapH);
  ctx.strokeStyle = PALETTE.steelDark;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mapW - 1, mapH - 1);

  ctx.fillStyle = PALETTE.steelDark;
  for (const cw of catwalks) {
    ctx.fillRect(
      mx + cw.x * scaleX,
      my + cw.y * scaleY,
      Math.max(2, cw.w * scaleX),
      Math.max(1.5, cw.h * scaleY)
    );
  }

  ctx.fillStyle = PALETTE.lime;
  for (const cell of powerCells) {
    if (cell.collected) continue;
    ctx.fillRect(mx + cell.x * scaleX - 1, my + cell.y * scaleY - 1, 2.5, 2.5);
  }

  ctx.fillStyle = bulkhead.openRatio > 0.8 ? PALETTE.lime : PALETTE.amber;
  ctx.fillRect(mx + bulkhead.x * scaleX - 2, my + bulkhead.y * scaleY - 2, 4, 4);

  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(mx + rig.x * scaleX - 1.5, my + rig.y * scaleY - 1.5, 3, 3);

  ctx.strokeStyle = 'rgba(255, 85, 0, 0.55)';
  ctx.strokeRect(
    mx + camera.x * scaleX,
    my + camera.y * scaleY,
    VIEW_W * scaleX,
    VIEW_H * scaleY
  );
  ctx.restore();
}

function renderFrame() {
  ctx.save();
  const shakeX = Math.round(cameraShake.x);
  const shakeY = Math.round(cameraShake.y);

  drawParallaxBore();

  if (rig) {
    ctx.save();
    ctx.translate(shakeX - Math.round(camera.x), shakeY - Math.round(camera.y));
    drawCatwalks();
    drawBulkhead();
    drawPowerCells();
    drawScrubbers();
    drawRig();
    drawEffects();
    ctx.restore();

    drawBoreRadar();
  }
  ctx.restore();
}

function frameLoop(now = performance.now()) {
  const dtSeconds = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;
  const dtScale = dtSeconds * 60;

  stepSimulation(dtScale);
  renderFrame();
  requestAnimationFrame(frameLoop);
}

function toggleAudioMute() {
  const isMuted = SoundRig.toggleMute();
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = `AUDIO: ${isMuted ? 'OFF' : 'ON'} [M]`;
}

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-screen').style.display = 'none';
  resetShift();
});

document.getElementById('retry-btn').addEventListener('click', () => {
  document.getElementById('gameover-screen').style.display = 'none';
  resetShift();
});

document.getElementById('win-retry-btn').addEventListener('click', () => {
  document.getElementById('win-screen').style.display = 'none';
  resetShift();
});

document.getElementById('mute-btn').addEventListener('click', toggleAudioMute);
document.getElementById('reset-btn').addEventListener('click', () => {
  if (runState === 'active') resetShift();
});

updateBestHUD();
renderScoreTable('start-hs-body', loadScores());
requestAnimationFrame(frameLoop);
