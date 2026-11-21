/* Slide-Over Manual Drawer Controller & Live Attract-Mode Monitor */
(function initManualAndMonitor() {
  const drawer = document.getElementById('manual-drawer');
  const backdrop = document.getElementById('manual-backdrop');
  const toggleBtn = document.getElementById('manual-btn');
  const closeBtn = document.getElementById('drawer-close-btn');

  window.toggleManualDrawer = function toggleManualDrawer(forceState) {
    if (!drawer || !backdrop) return;
    const willOpen = typeof forceState === 'boolean' ? forceState : !drawer.classList.contains('open');
    drawer.classList.toggle('open', willOpen);
    backdrop.classList.toggle('open', willOpen);
    if (toggleBtn) toggleBtn.classList.toggle('active-drawer', willOpen);
  };

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => window.toggleManualDrawer());
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => window.toggleManualDrawer(false));
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => window.toggleManualDrawer(false));
  }

  const previewCanvas = document.getElementById('preview');
  if (!previewCanvas) return;
  const pctx = previewCanvas.getContext('2d');
  pctx.imageSmoothingEnabled = false;
  const W = previewCanvas.width;
  const H = previewCanvas.height;
  let tick = 0;

  const SPANS = [
    { x: 12,  y: 132, w: 128, h: 16 },
    { x: 154, y: 102, w: 96,  h: 16, moving: true },
    { x: 266, y: 74,  w: 96,  h: 16 },
    { x: 364, y: 48,  w: 48,  h: 16 }
  ];

  const CELLS = [
    { x: 68,  y: 112 },
    { x: 198, y: 82 },
    { x: 310, y: 54 },
    { x: 386, y: 28 }
  ];

  function renderMonitor() {
    pctx.fillStyle = '#0d0e0b';
    pctx.fillRect(0, 0, W, H);

    pctx.strokeStyle = '#1f221b';
    pctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 42) {
      pctx.beginPath();
      pctx.moveTo(x + 0.5, 0);
      pctx.lineTo(x + 0.5, H);
      pctx.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
      pctx.beginPath();
      pctx.moveTo(0, y + 0.5);
      pctx.lineTo(W, y + 0.5);
      pctx.stroke();
    }

    const useAtlas = typeof spriteAtlas !== 'undefined' && typeof atlasReady !== 'undefined' && atlasReady;

    for (const sp of SPANS) {
      const offsetX = sp.moving ? Math.round(Math.sin(tick * 0.8) * 12) : 0;
      const sx = sp.x + offsetX;
      pctx.fillStyle = '#000';
      pctx.fillRect(sx + 2, sp.y + 2, sp.w, sp.h);

      if (useAtlas) {
        const srcX = sp.moving ? 160 : 128;
        pctx.save();
        pctx.beginPath();
        pctx.rect(sx, sp.y, sp.w, sp.h);
        pctx.clip();
        for (let tx = sx; tx < sx + sp.w; tx += 32) {
          pctx.drawImage(spriteAtlas, srcX, 32, 32, 16, tx, sp.y, 32, 16);
        }
        pctx.restore();
      } else {
        pctx.fillStyle = sp.moving ? '#292116' : '#171914';
        pctx.fillRect(sx, sp.y, sp.w, sp.h);
      }
    }

    for (const c of CELLS) {
      const cy = Math.round(c.y + Math.sin(tick * 2 + c.x) * 2);
      if (useAtlas) {
        pctx.drawImage(spriteAtlas, 64, 32, 32, 32, c.x - 16, cy - 16, 32, 32);
      } else {
        pctx.fillStyle = '#c8ff00';
        pctx.fillRect(c.x - 3, cy - 3, 6, 6);
      }
    }

    const cycle = (tick * 0.45) % SPANS.length;
    const idx = Math.floor(cycle);
    const nextIdx = (idx + 1) % SPANS.length;
    const frac = cycle - idx;

    const a = SPANS[idx];
    const b = SPANS[nextIdx];
    const rx = Math.round(a.x + 24 + (b.x - a.x) * frac);
    const arcLift = Math.sin(frac * Math.PI) * 28;
    const ry = Math.round(a.y - 32 + (b.y - a.y) * frac - arcLift);

    if (useAtlas) {
      pctx.drawImage(spriteAtlas, 99, 0, 26, 32, rx - 13, ry, 26, 32);
    } else {
      pctx.fillStyle = '#23271e';
      pctx.fillRect(rx - 8, ry, 16, 24);
    }

    const scrubberX = Math.round(284 + Math.sin(tick * 1.3) * 18);
    if (useAtlas) {
      pctx.drawImage(spriteAtlas, 2, 34, 28, 28, scrubberX, 46, 28, 28);
    } else {
      pctx.fillStyle = '#241315';
      pctx.fillRect(scrubberX, 54, 20, 20);
    }

    tick += 0.035;
    requestAnimationFrame(renderMonitor);
  }

  renderMonitor();
})();
