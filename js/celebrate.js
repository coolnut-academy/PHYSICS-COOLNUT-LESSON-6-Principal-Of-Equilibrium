/* ==========================================================================
   Moment Lab — Perfect 10/10 Celebration Engine
   Funny Dancing Cat GIFs + Web Audio API Short Victory Song + Confetti Burst
   Zero external audio/library dependencies. Works offline & on mobile Safari!
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.__ML_BOOT__ = root.__ML_BOOT__ || {};
    root.__ML_BOOT__.Celebrate = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // All 4 verified HTTP 200 image/gif funny dancing cat memes
  const DANCING_CAT_GIFS = [
    {
      url: 'https://media.tenor.com/JWFEQcWcJyQAAAAM/happy-catto-cats.gif',
      caption: 'Happy Happy Happy Cat! 🎉🐱'
    },
    {
      url: 'https://media.tenor.com/WsWej1C3ePYAAAAM/yippee-cat-kitty.gif',
      caption: 'Yippee Dancing Cat! 🐾✨'
    },
    {
      url: 'https://media.giphy.com/media/UpzSszqw1BjD87KoPt/giphy.gif',
      caption: 'Vibing Cat เต็ม 10 ไปเลย! 🎵🐱'
    },
    {
      url: 'https://media.giphy.com/media/GK7dGndK4kyOozR9Xk/giphy.gif',
      caption: 'แมวเต้นฉลองคะแนนเต็ม 10/10! 🕺🧡'
    }
  ];

  const FALLBACK_IMAGE = 'assets/cat-celebrate.jpg';

  let activeAudioCtx = null;
  let activeCanvas = null;
  let activeRafId = null;

  function pickGif(index) {
    if (typeof index === 'number') {
      const i = ((index % DANCING_CAT_GIFS.length) + DANCING_CAT_GIFS.length) % DANCING_CAT_GIFS.length;
      return { index: i, ...DANCING_CAT_GIFS[i] };
    }
    const i = Math.floor(Math.random() * DANCING_CAT_GIFS.length);
    return { index: i, ...DANCING_CAT_GIFS[i] };
  }

  /* ------------------------------------------------------------------------
     Short Joyful Cat-Party Victory Song (~4.2s) via Web Audio API
     Bright kalimba/chiptune melody + bouncy bass + cute "Meow!" pitch glide!
     ------------------------------------------------------------------------ */
  function stopVictorySong() {
    if (activeAudioCtx) {
      try { activeAudioCtx.close(); } catch (_) {}
      activeAudioCtx = null;
    }
  }

  function playVictorySong() {
    if (typeof window === 'undefined') return false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    stopVictorySong();

    try {
      const ctx = new AudioCtx();
      activeAudioCtx = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const master = ctx.createGain();
      master.gain.value = 0.24;
      master.connect(ctx.destination);

      const t0 = ctx.currentTime + 0.04;

      function note(freq, startBeat, durBeats, type, vol) {
        const beatSec = 0.175; // upbeat ~171 BPM eighth-note bounce
        const start = t0 + startBeat * beatSec;
        const dur = durBeats * beatSec;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(vol || 0.7, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);

        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      }

      // Cheerful happy-cat victory melody (C Major / Pentatonic sparkle)
      const melody = [
        [523.25, 0, 1.0],   // C5
        [659.25, 1, 1.0],   // E5
        [783.99, 2, 1.0],   // G5
        [1046.50, 3, 1.8],  // C6!
        [880.00, 5, 0.9],   // A5
        [783.99, 6, 0.9],   // G5
        [880.00, 7, 1.0],   // A5
        [1046.50, 8, 2.0],  // C6!
        [783.99, 10.5, 0.9],// G5
        [880.00, 11.5, 0.9],// A5
        [987.77, 12.5, 0.9],// B5
        [1046.50, 13.5, 1.2],// C6
        [1318.51, 15.0, 2.8] // E6 sparkle finish!
      ];
      melody.forEach(([f, s, d]) => {
        note(f, s, d, 'triangle', 0.8);
        note(f * 2, s, d * 0.6, 'sine', 0.18); // soft bell overtone
      });

      // Bouncy bass companion
      const bass = [
        [261.63, 0, 1.5], [196.00, 2, 1.5], [261.63, 4, 1.5], [220.00, 6, 1.5],
        [174.61, 8, 1.5], [196.00, 10, 1.5], [261.63, 12, 1.5], [261.63, 15, 3.0]
      ];
      bass.forEach(([f, s, d]) => note(f, s, d, 'sine', 0.45));

      // Final celebration chord sparkle (C6 + E6 + G6)
      [523.25, 659.25, 783.99, 1046.50, 1567.98].forEach((f, idx) => {
        note(f, 15 + idx * 0.18, 3.2, 'sine', 0.25);
      });

      // Adorable cute synthesized "Meow!" chirp at the end
      const meowStart = t0 + 18.6 * 0.175;
      const meowOsc = ctx.createOscillator();
      const meowGain = ctx.createGain();
      meowOsc.type = 'sine';
      meowOsc.frequency.setValueAtTime(660, meowStart);
      meowOsc.frequency.exponentialRampToValueAtTime(1020, meowStart + 0.11);
      meowOsc.frequency.exponentialRampToValueAtTime(720, meowStart + 0.34);
      meowGain.gain.setValueAtTime(0.0001, meowStart);
      meowGain.gain.linearRampToValueAtTime(0.55, meowStart + 0.04);
      meowGain.gain.exponentialRampToValueAtTime(0.0008, meowStart + 0.38);
      meowOsc.connect(meowGain);
      meowGain.connect(master);
      meowOsc.start(meowStart);
      meowOsc.stop(meowStart + 0.42);

      // Auto-release context after ~4.6 seconds
      setTimeout(() => {
        if (activeAudioCtx === ctx) stopVictorySong();
      }, 4700);

      return true;
    } catch (_) {
      return false;
    }
  }

  /* ------------------------------------------------------------------------
     Full-Screen Confetti + Ginger Paw-Print Celebration Burst (<canvas>)
     ------------------------------------------------------------------------ */
  function stopConfetti() {
    if (activeRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(activeRafId);
      activeRafId = null;
    }
    if (activeCanvas && activeCanvas.parentNode) {
      activeCanvas.parentNode.removeChild(activeCanvas);
    }
    activeCanvas = null;
  }

  function launchConfetti() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    stopConfetti();

    const canvas = document.createElement('canvas');
    canvas.className = 'celebrate-canvas no-print';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    activeCanvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) { stopConfetti(); return; }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const colors = ['#FF9442', '#FFD166', '#FF99B8', '#67C8FF', '#4ADE80', '#FFF1D6', '#F472B6'];
    const particles = [];
    const total = 115;

    for (let i = 0; i < total; i++) {
      const fromLeft = i % 3 === 0;
      const fromRight = i % 3 === 1;
      const x = fromLeft ? canvas.width * 0.08 : fromRight ? canvas.width * 0.92 : Math.random() * canvas.width;
      const y = (fromLeft || fromRight) ? canvas.height * 0.72 : -20 - Math.random() * 140;
      const vx = fromLeft ? (3 + Math.random() * 7) : fromRight ? -(3 + Math.random() * 7) : (Math.random() - 0.5) * 4;
      const vy = (fromLeft || fromRight) ? -(9 + Math.random() * 8) : (2 + Math.random() * 4);
      particles.push({
        x, y, vx, vy,
        size: 6 + Math.random() * 7,
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25,
        shape: i % 9 === 0 ? 'paw' : (i % 4 === 0 ? 'star' : 'rect'),
        alpha: 1
      });
    }

    const startTime = Date.now();
    const durationMs = 4600;

    function drawStar(c, x, y, r) {
      c.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
    }

    function drawPaw(c, x, y, r) {
      c.beginPath();
      c.arc(x, y + r * 0.2, r * 0.52, 0, Math.PI * 2);
      c.arc(x - r * 0.55, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
      c.arc(x, y - r * 0.55, r * 0.26, 0, Math.PI * 2);
      c.arc(x + r * 0.55, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
      c.fill();
    }

    function frame() {
      const elapsed = Date.now() - startTime;
      if (elapsed >= durationMs || !activeCanvas) {
        stopConfetti();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fade = elapsed > durationMs - 900 ? Math.max(0, (durationMs - elapsed) / 900) : 1;

      for (const p of particles) {
        p.vy += 0.22; // gentle gravity
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;

        if (p.shape === 'paw') {
          drawPaw(ctx, 0, 0, p.size * 0.9);
        } else if (p.shape === 'star') {
          drawStar(ctx, 0, 0, p.size * 0.85);
        } else {
          ctx.fillRect(-p.size / 2, -p.size * 0.32, p.size, p.size * 0.64);
        }
        ctx.restore();
      }

      activeRafId = requestAnimationFrame(frame);
    }

    activeRafId = requestAnimationFrame(frame);
  }

  return {
    DANCING_CAT_GIFS,
    FALLBACK_IMAGE,
    pickGif,
    playVictorySong,
    stopVictorySong,
    launchConfetti,
    stopConfetti
  };
});
