// ============================================================
//  GSS ENCELADUS ROVER – MAIN APPLICATION
//  Tab navigation, Enceladus info, simulation controls, stream
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // ---- Tab Navigation ----
  const navBtns = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page');

  function switchPage(id) {
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.page === id));
    pages.forEach(p => p.classList.toggle('active', p.id === id));
    if (id === 'page-simulation') {
      SimEngine.startAnimLoop();
    } else {
      SimEngine.stopAnimLoop();
    }
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  // ---- Simulation Init ----
  const simCanvas = document.getElementById('simCanvas');

  const telemetryEls = {
    pos: document.getElementById('tel-pos'),
    dir: document.getElementById('tel-dir'),
    explored: document.getElementById('tel-explored'),
    distance: document.getElementById('tel-distance'),
    obstacles: document.getElementById('tel-obstacles'),
    bumps: document.getElementById('tel-bumps'),
    tiles: document.getElementById('tel-tiles'),
  };

  SimEngine.init(simCanvas, {
    onTelemetry(data) {
      if (telemetryEls.pos) telemetryEls.pos.textContent = data.position;
      if (telemetryEls.dir) telemetryEls.dir.textContent = data.direction;
      if (telemetryEls.explored) telemetryEls.explored.textContent = data.explored;
      if (telemetryEls.distance) telemetryEls.distance.textContent = data.distance;
      if (telemetryEls.obstacles) telemetryEls.obstacles.textContent = data.obstacles;
      if (telemetryEls.bumps) telemetryEls.bumps.textContent = data.bumps;
      if (telemetryEls.tiles) telemetryEls.tiles.textContent = data.tiles;
    },
    onAutoComplete() {
      document.getElementById('btn-auto').textContent = '▶ AUTO EXPLORE';
    }
  });

  // Keyboard controls
  document.addEventListener('keydown', e => {
    const activePageEl = document.querySelector('.page.active');
    if (!activePageEl || activePageEl.id !== 'page-simulation') return;

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        SimEngine.moveUp();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        SimEngine.moveDown();
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        SimEngine.moveLeft();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        SimEngine.moveRight();
        break;
    }
  });

  // D-pad buttons
  document.getElementById('dpad-up')?.addEventListener('click', () => SimEngine.moveUp());
  document.getElementById('dpad-down')?.addEventListener('click', () => SimEngine.moveDown());
  document.getElementById('dpad-left')?.addEventListener('click', () => SimEngine.moveLeft());
  document.getElementById('dpad-right')?.addEventListener('click', () => SimEngine.moveRight());

  // Control buttons
  document.getElementById('btn-auto')?.addEventListener('click', function () {
    if (SimEngine.isAuto) {
      SimEngine.stopAuto();
      this.textContent = '▶ AUTO EXPLORE';
    } else {
      SimEngine.startAuto();
      this.textContent = '⏸ STOP AUTO';
    }
  });

  document.getElementById('btn-regen')?.addEventListener('click', () => {
    SimEngine.regenerate();
    const autoBtn = document.getElementById('btn-auto');
    if (autoBtn) autoBtn.textContent = '▶ AUTO EXPLORE';
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    SimEngine.reset();
    const autoBtn = document.getElementById('btn-auto');
    if (autoBtn) autoBtn.textContent = '▶ AUTO EXPLORE';
  });

  // Speed slider
  const speedSlider = document.getElementById('speed-slider');
  const speedLabel = document.getElementById('speed-label');
  if (speedSlider) {
    speedSlider.addEventListener('input', function () {
      const val = parseInt(this.value);
      const ms = 300 - val * 2.5;  // 10..300 → 275..50
      SimEngine.setSpeed(Math.max(30, ms));
      if (speedLabel) speedLabel.textContent = `${val}%`;
    });
  }


  // ---- Stream Page ----
  const streamUrlInput = document.getElementById('stream-url');
  const streamTypeSelect = document.getElementById('stream-type');
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const streamViewport = document.getElementById('stream-viewport');
  const streamPlaceholder = document.getElementById('stream-placeholder');
  const streamLiveBadge = document.getElementById('stream-live-badge');
  const detectionLog = document.getElementById('detection-log');

  let streamActive = false;

  btnConnect?.addEventListener('click', () => {
    const url = streamUrlInput?.value?.trim();
    const type = streamTypeSelect?.value;

    if (!url) {
      addDetection('⚠️', 'Please enter a stream URL', 'rgba(245, 158, 11, 0.15)');
      return;
    }

    // Clear viewport
    const existingMedia = streamViewport?.querySelector('video, img');
    if (existingMedia) existingMedia.remove();

    if (type === 'mjpeg') {
      // MJPEG stream (common for EV3 + camera setups)
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'EV3 Rover Camera Feed';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.onerror = () => {
        addDetection('❌', 'Failed to load MJPEG stream. Check URL and network.', 'rgba(239, 68, 68, 0.15)');
      };
      streamViewport?.appendChild(img);
    } else {
      // HLS / WebRTC / direct video
      const video = document.createElement('video');
      video.src = url;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.onerror = () => {
        addDetection('❌', 'Failed to load video stream. Check URL and format.', 'rgba(239, 68, 68, 0.15)');
      };
      streamViewport?.appendChild(video);
    }

    streamActive = true;
    if (streamPlaceholder) streamPlaceholder.style.display = 'none';
    if (streamLiveBadge) streamLiveBadge.style.display = 'flex';

    addDetection('🟢', `Connected to stream: <strong>${type.toUpperCase()}</strong>`, 'rgba(16, 185, 129, 0.15)');
    addDetection('📡', `URL: ${url.substring(0, 40)}...`, 'rgba(0, 210, 255, 0.1)');
  });

  btnDisconnect?.addEventListener('click', () => {
    const media = streamViewport?.querySelector('video, img');
    if (media) {
      if (media.tagName === 'VIDEO') media.pause();
      media.remove();
    }
    streamActive = false;
    if (streamPlaceholder) streamPlaceholder.style.display = 'flex';
    if (streamLiveBadge) streamLiveBadge.style.display = 'none';
    addDetection('🔴', 'Stream disconnected', 'rgba(239, 68, 68, 0.15)');
  });

  function addDetection(icon, text, bgColor) {
    const item = document.createElement('div');
    item.className = 'detection-item';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    item.innerHTML = `
      <div class="detection-item__icon" style="background: ${bgColor}">${icon}</div>
      <div class="detection-item__text">${text}</div>
      <div class="detection-item__time">${timeStr}</div>
    `;

    detectionLog?.prepend(item);

    // Keep only last 20
    while (detectionLog?.children.length > 20) {
      detectionLog.removeChild(detectionLog.lastChild);
    }
  }

  // Demo detection entries
  addDetection('🤖', 'AI Vision system initialized', 'rgba(0, 210, 255, 0.1)');
  addDetection('📋', 'EV3 controller ready', 'rgba(168, 85, 247, 0.1)');


  // ---- Animated Counter for stats ----
  const counters = document.querySelectorAll('[data-count]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = el.dataset.count;
        const isNumber = !isNaN(parseFloat(target));

        if (isNumber) {
          const end = parseFloat(target);
          const duration = 1500;
          const start = 0;
          const startTime = performance.now();

          function animate(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);
            el.textContent = current.toLocaleString();
            if (progress < 1) requestAnimationFrame(animate);
            else el.textContent = target;
          }
          requestAnimationFrame(animate);
        } else {
          el.textContent = target;
        }
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  counters.forEach(c => observer.observe(c));


  // ---- Init first page ----
  switchPage('page-dashboard');
});
