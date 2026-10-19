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


  // ---- Stream Page (YouTube iframe) ----
  const streamUrlInput   = document.getElementById('stream-url');
  const btnConnect       = document.getElementById('btn-connect');
  const btnDisconnect    = document.getElementById('btn-disconnect');
  const streamViewport   = document.getElementById('stream-viewport');
  const streamPlaceholder = document.getElementById('stream-placeholder');
  const streamLiveBadge  = document.getElementById('stream-live-badge');

  /**
   * Extract YouTube video ID from any common YouTube URL format:
   *  - youtube.com/watch?v=ID
   *  - youtu.be/ID
   *  - youtube.com/live/ID
   *  - youtube.com/embed/ID
   */
  function extractYouTubeId(url) {
    try {
      const u = new URL(url);
      // youtu.be/ID
      if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
      // youtube.com/watch?v=ID
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      // youtube.com/live/ID  or  youtube.com/embed/ID
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (['live', 'embed'].includes(pathParts[0]) && pathParts[1]) return pathParts[1];
    } catch (_) { /* invalid URL */ }
    return null;
  }

  btnConnect?.addEventListener('click', () => {
    const raw = streamUrlInput?.value?.trim();
    if (!raw) {
      alert('Please enter a YouTube URL.');
      return;
    }

    const videoId = extractYouTubeId(raw);
    if (!videoId) {
      alert('Could not recognise a YouTube video ID in that URL.\nPlease paste a valid YouTube link.');
      return;
    }

    // Remove any previous iframe
    const existing = streamViewport?.querySelector('iframe');
    if (existing) existing.remove();

    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

    const iframe = document.createElement('iframe');
    iframe.id             = 'yt-iframe';
    iframe.src            = embedUrl;
    iframe.allow          = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.style.cssText  = 'width:100%;height:100%;border:none;display:block;';

    streamViewport?.appendChild(iframe);

    if (streamPlaceholder) streamPlaceholder.style.display = 'none';
    if (streamLiveBadge)   streamLiveBadge.style.display   = 'flex';
  });

  btnDisconnect?.addEventListener('click', () => {
    const iframe = streamViewport?.querySelector('iframe');
    if (iframe) iframe.remove();

    if (streamPlaceholder) streamPlaceholder.style.display = 'flex';
    if (streamLiveBadge)   streamLiveBadge.style.display   = 'none';
    if (streamUrlInput)    streamUrlInput.value             = '';
  });


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
