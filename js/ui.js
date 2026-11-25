/* ==========================================================================
   Moment Lab — Main UI Controller, State Machine & KaTeX Renderers
   Covers: Home, Learn (+ Interactive Demo + 6 Examples w/ m & cm toggle),
   Practice Exam, Real Exam (Preflight + Active + Monitor + Multi-Tab + Result)
   ========================================================================== */
(function () {
  'use strict';

  // Closure Isolation: capture internal modules from temporary boot object,
  // then immediately wipe global references so DevTools Console cannot invoke solver directly.
  const boot = window.__ML_BOOT__ || {};
  const P = boot.Physics;
  const S = boot.Svg;
  const E = boot.Exam;
  const ST = boot.Stats;
  const CEL = boot.Celebrate;
  try { delete window.__ML_BOOT__; } catch (_) { window.__ML_BOOT__ = undefined; }
  try {
    Object.defineProperty(window, 'MomentLab', {
      value: Object.freeze({ appVersion: P ? P.APP_VERSION : '1.3' }),
      writable: false,
      configurable: false
    });
  } catch (_) {}

  /* ------------------------------------------------------------------------
     DOM Handles & Application State
     ------------------------------------------------------------------------ */
  const mainEl = document.getElementById('main-content');
  const modePillEl = document.getElementById('header-mode-pill');
  const brandBtnEl = document.getElementById('brand-home-btn');
  const themeBtnEl = document.getElementById('theme-toggle-btn');
  const themeLabelEl = document.getElementById('theme-toggle-label');
  const bannerStackEl = document.getElementById('banner-stack');
  const timerSrEl = document.getElementById('timer-sr-announce');

  const modalBackdropEl = document.getElementById('modal-backdrop');
  const modalDialogEl = document.getElementById('modal-dialog');
  const modalTitleEl = document.getElementById('modal-title');
  const modalBodyEl = document.getElementById('modal-body');
  const modalFooterEl = document.getElementById('modal-footer');
  const modalCloseBtnEl = document.getElementById('modal-close-btn');
  const teacherKeyBtnEl = document.getElementById('teacher-key-btn');

  const appState = {
    view: 'HOME',
    session: null,
    corruptedRealError: null,
    clockAnchor: null,
    timerInterval: null,
    lastAnnouncedMilestone: null,
    submitting: false,
    concurrentLocked: false,
    monitorAttached: false,
    tabCoordinator: null,
    liveClockInterval: null,

    learn: {
      activeSection: 'theory',
      studentNo: 1,
      distanceMode: 'cm', // 'cm' | 'm' | 'mixed_m'
      demoPivot: 50,
      demoForceX: 20,
      demoForceN: 10,
      demoZoom: 100,
      openSolutions: {},
      stepMode: {},
      currentStepIdx: {},
      tryAnswers: {}
    },

    svgZoomLevels: {}, // { viewerId: percent }
    resultExpanded: {},
    dashboardUnlocked: false,
    dashboardFilter: 'all',
    dashboardAutoRefresh: true,
    dashboardTimer: null,
    dashboardLastData: null,
    celebrateGifIndex: 0
  };

  const UNIT_OPTION_LABELS = {
    'kg': 'kg (กิโลกรัม)',
    'g': 'g (กรัม)',
    'cm': 'cm (เซนติเมตร)',
    'm': 'm (เมตร)',
    'N': 'N (นิวตัน)',
    'N·m': 'N·m (นิวตัน·เมตร)'
  };

  function buildUnitSelectOptions(selectedUnit) {
    const opts = [`<option value="" ${!selectedUnit ? 'selected' : ''}>-- เลือกหน่วย --</option>`];
    for (const u of P.UNITS) {
      const sel = selectedUnit === u ? 'selected' : '';
      opts.push(`<option value="${esc(u)}" ${sel}>${esc(UNIT_OPTION_LABELS[u] || u)}</option>`);
    }
    return opts.join('');
  }

  /* ------------------------------------------------------------------------
     Reusable Zoomable SVG Frame (Zoom Out / Reset 100% / Zoom In)
     ------------------------------------------------------------------------ */
  const ZOOM_MIN = 80;
  const ZOOM_MAX = 240;
  const ZOOM_STEP = 20;

  function renderZoomableSvg(svgHtml, viewerId, labelText = 'แผนภาพจำลอง') {
    const zoom = appState.svgZoomLevels[viewerId] || 100;
    return `
      <div class="svg-frame" data-svg-viewer="${esc(viewerId)}">
        <div class="svg-zoom-bar no-print">
          <span class="svg-zoom-hint">${esc(labelText)}</span>
          <div class="svg-zoom-controls" role="group" aria-label="ปรับขนาดซูมแผนภาพ">
            <button type="button" class="svg-zoom-btn" data-zoom-action="out" data-zoom-target="${esc(viewerId)}" aria-label="ซูมออก" title="ซูมออก (Zoom Out)" ${zoom <= ZOOM_MIN ? 'disabled' : ''}>−</button>
            <button type="button" class="svg-zoom-btn svg-zoom-pct" data-zoom-action="reset" data-zoom-target="${esc(viewerId)}" aria-label="รีเซ็ตขนาด 100 เปอร์เซ็นต์" title="รีเซ็ตเป็น 100%">${zoom}%</button>
            <button type="button" class="svg-zoom-btn" data-zoom-action="in" data-zoom-target="${esc(viewerId)}" aria-label="ซูมเข้า" title="ซูมเข้า (Zoom In)" ${zoom >= ZOOM_MAX ? 'disabled' : ''}>+</button>
          </div>
        </div>
        <div class="svg-scroll-viewport">
          <div class="svg-zoom-stage" data-zoom-stage="${esc(viewerId)}" style="width:${zoom}%;">
            ${svgHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Delegated click handler for ALL Zoom In / Out / Reset buttons across every view
  mainEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-zoom-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-zoom-action');
    const vid = btn.getAttribute('data-zoom-target');
    const cur = appState.svgZoomLevels[vid] || 100;
    let next = cur;
    if (action === 'in') next = Math.min(ZOOM_MAX, cur + ZOOM_STEP);
    else if (action === 'out') next = Math.max(ZOOM_MIN, cur - ZOOM_STEP);
    else if (action === 'reset') next = 100;
    appState.svgZoomLevels[vid] = next;

    const frame = mainEl.querySelector(`[data-svg-viewer="${CSS.escape(vid)}"]`);
    if (!frame) return;
    const stage = frame.querySelector(`[data-zoom-stage="${CSS.escape(vid)}"]`);
    if (stage) stage.style.width = `${next}%`;
    const pctBtn = frame.querySelector('[data-zoom-action="reset"]');
    if (pctBtn) pctBtn.textContent = `${next}%`;
    const outBtn = frame.querySelector('[data-zoom-action="out"]');
    if (outBtn) outBtn.disabled = next <= ZOOM_MIN;
    const inBtn = frame.querySelector('[data-zoom-action="in"]');
    if (inBtn) inBtn.disabled = next >= ZOOM_MAX;
  });

  /* ------------------------------------------------------------------------
     Safe Escaping & KaTeX Math Rendering Helpers (Sarabun Thai + Latin Math)
     ------------------------------------------------------------------------ */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLatex(latex, fallbackText, displayMode = false) {
    if (typeof window.katex !== 'undefined' && typeof window.katex.renderToString === 'function') {
      try {
        return window.katex.renderToString(latex, {
          displayMode: Boolean(displayMode),
          throwOnError: false,
          strict: 'ignore'
        });
      } catch (_) { /* fall through */ }
    }
    return `<span class="math-fallback">${esc(fallbackText || latex)}</span>`;
  }

  /**
   * Render mixed Thai prose + inline $...$ LaTeX segments safely.
   * Plain Thai segments are escaped via esc() and rendered in Sarabun;
   * $...$ segments are rendered via KaTeX in Latin math typography.
   */
  function renderRichText(richStr, fallbackPlain) {
    const src = richStr || fallbackPlain || '';
    const tokens = src.split(/(\$[^$]+\$)/g);
    return tokens.map(tok => {
      if (tok.length >= 2 && tok.startsWith('$') && tok.endsWith('$')) {
        const inner = tok.slice(1, -1);
        return renderLatex(inner, inner, false);
      }
      return esc(tok);
    }).join('');
  }

  /* ------------------------------------------------------------------------
     Theme Controller (Default: Dark Mode)
     ------------------------------------------------------------------------ */
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    themeLabelEl.textContent = t === 'dark' ? 'โหมดมืด' : 'โหมดสว่าง';
    themeBtnEl.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    try { localStorage.setItem(E.STORAGE_KEYS.THEME, t); } catch (_) {}
  }

  themeBtnEl.addEventListener('click', () => {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  });

  /* ------------------------------------------------------------------------
     In-Page Accessible Modal System (Zero alert() / confirm())
     ------------------------------------------------------------------------ */
  let modalOnClose = null;

  function openModal({ title, bodyHtml, buttons, wide = false, dashboard = false, dismissible = true, onClose = null }) {
    modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = bodyHtml;
    modalFooterEl.innerHTML = '';
    modalDialogEl.classList.toggle('is-wide', Boolean(wide));
    modalDialogEl.classList.toggle('is-dashboard', Boolean(dashboard));
    modalCloseBtnEl.classList.toggle('hidden', !dismissible);
    modalOnClose = onClose;

    for (const btnCfg of buttons || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${btnCfg.variant || 'btn-secondary'}`;
      b.textContent = btnCfg.label;
      if (btnCfg.disabled) b.disabled = true;
      if (btnCfg.id) b.id = btnCfg.id;
      b.addEventListener('click', () => {
        if (btnCfg.onClick) btnCfg.onClick();
      });
      modalFooterEl.appendChild(b);
    }

    modalBackdropEl.classList.remove('hidden');
    const focusTarget = modalFooterEl.querySelector('button:not(:disabled)') || modalCloseBtnEl;
    if (focusTarget) focusTarget.focus();
  }

  function closeModal() {
    modalBackdropEl.classList.add('hidden');
    if (modalOnClose) {
      const fn = modalOnClose;
      modalOnClose = null;
      fn();
    }
  }

  modalCloseBtnEl.addEventListener('click', closeModal);
  modalBackdropEl.addEventListener('click', e => {
    if (e.target === modalBackdropEl && !modalCloseBtnEl.classList.contains('hidden')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalBackdropEl.classList.contains('hidden') && !modalCloseBtnEl.classList.contains('hidden')) {
      closeModal();
    }
  });

  /* ------------------------------------------------------------------------
     Banner Notifications
     ------------------------------------------------------------------------ */
  function showBanner({ id, kind = 'info', text, dismissible = true }) {
    if (id) {
      const existing = bannerStackEl.querySelector(`[data-banner-id="${id}"]`);
      if (existing) existing.remove();
    }
    const div = document.createElement('div');
    div.className = `alert-banner ${kind}`;
    if (id) div.setAttribute('data-banner-id', id);

    const span = document.createElement('div');
    span.textContent = text;
    div.appendChild(span);

    if (dismissible) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn btn-ghost btn-sm';
      close.textContent = 'รับทราบ';
      close.addEventListener('click', () => div.remove());
      div.appendChild(close);
    }
    bannerStackEl.appendChild(div);
  }

  function clearBanners() {
    bannerStackEl.innerHTML = '';
  }

  /* ------------------------------------------------------------------------
     Header Mode Pill & Navigation Lock During Real Active Exam
     ------------------------------------------------------------------------ */
  function updateHeader() {
    const v = appState.view;
    modePillEl.className = 'mode-pill';
    let label = 'หน้าหลัก';
    let lockHome = false;

    if (v === 'LEARN') {
      label = 'โหมดเรียน';
    } else if (v === 'PRACTICE_SETUP' || v === 'PRACTICE_ACTIVE' || v === 'PRACTICE_RESULT') {
      label = 'ทดลองสอบ';
      modePillEl.classList.add('is-practice');
    } else if (v === 'REAL_SETUP') {
      label = 'เตรียมสอบจริง';
      modePillEl.classList.add('is-real');
    } else if (v === 'REAL_ACTIVE') {
      label = 'กำลังสอบจริง';
      modePillEl.classList.add('is-real');
      lockHome = true;
    } else if (v === 'REAL_RESULT') {
      label = 'ผลการสอบจริง';
      modePillEl.classList.add('is-real');
    } else if (v === 'CORRUPTED_REAL') {
      label = 'แจ้งเตือนข้อมูลสอบ';
      modePillEl.classList.add('is-real');
    }

    modePillEl.textContent = label;
    brandBtnEl.disabled = lockHome;
    brandBtnEl.setAttribute('aria-disabled', lockHome ? 'true' : 'false');
    if (teacherKeyBtnEl) {
      teacherKeyBtnEl.classList.toggle('hidden', lockHome);
    }
  }

  brandBtnEl.addEventListener('click', () => {
    if (appState.view === 'REAL_ACTIVE') return;
    if (appState.view === 'PRACTICE_ACTIVE') {
      openModal({
        title: 'ออกจากโหมดทดลองสอบ?',
        bodyHtml: '<p>หากกลับหน้าหลักตอนนี้ ชุดข้อสอบทดลองที่ทำค้างไว้จะยังถูกเก็บไว้ชั่วคราวจนกว่าจะเริ่มชุดใหม่ หรือคุณต้องการทำข้อสอบต่อ?</p>',
        buttons: [
          { label: 'ทำข้อสอบต่อ', variant: 'btn-secondary', onClick: closeModal },
          {
            label: 'กลับหน้าหลัก',
            variant: 'btn-primary',
            onClick: () => {
              closeModal();
              stopExamTimers();
              navigate('HOME');
            }
          }
        ]
      });
      return;
    }
    navigate('HOME');
  });

  /* ------------------------------------------------------------------------
     Timer Loop & Anti-Cheating Incident Listeners (Real Active Only)
     ------------------------------------------------------------------------ */
  function stopLiveClock() {
    if (appState.liveClockInterval) {
      clearInterval(appState.liveClockInterval);
      appState.liveClockInterval = null;
    }
  }

  function stopExamTimers() {
    if (appState.timerInterval) {
      clearInterval(appState.timerInterval);
      appState.timerInterval = null;
    }
    detachRealExamMonitor();
    if (appState.tabCoordinator) {
      appState.tabCoordinator.releaseLock();
    }
  }

  function handleRealSignal(signal) {
    if (appState.view !== 'REAL_ACTIVE' || !appState.session || appState.session.status !== 'active' || appState.concurrentLocked) {
      return;
    }
    const now = E.getEffectiveNow(appState.session, appState.clockAnchor);
    if (now >= appState.session.deadlineAt) {
      triggerFinalize('timeout');
      return;
    }
    const res = E.recordIncident(appState.session, signal, now);
    if (res.changed) {
      const saved = E.saveSession(appState.session);
      if (!saved.ok) showStorageErrorBanner(saved.error);
    }
    if (res.banner) {
      showBanner({
        id: 'incident-return',
        kind: 'warn',
        text: 'ระบบบันทึกการออกจากหน้าสอบแล้ว กรุณาทำข้อสอบต่อ เวลาไม่หยุดเดิน',
        dismissible: true
      });
    }
    updateTimerDisplay();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') handleRealSignal('visibility_hidden');
    else if (document.visibilityState === 'visible') handleRealSignal('visibility_visible');
  }
  function onWindowBlur() { handleRealSignal('blur'); }
  function onWindowFocus() { handleRealSignal('focus'); }
  function onPageHide() { handleRealSignal('pagehide'); }
  function onPageShow() { handleRealSignal('pageshow'); }
  function onFullscreenChange() {
    if (!document.fullscreenElement) handleRealSignal('fullscreen_exit');
  }

  function attachRealExamMonitor() {
    if (appState.monitorAttached) return;
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    appState.monitorAttached = true;
  }

  function detachRealExamMonitor() {
    if (!appState.monitorAttached) return;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    appState.monitorAttached = false;
  }

  function showStorageErrorBanner(errMsg) {
    showBanner({
      id: 'storage-err',
      kind: 'danger',
      text: `คำเตือนสำคัญ: ไม่สามารถบันทึกข้อมูลลงเบราว์เซอร์ได้ (${errMsg || 'Storage Error'}) กรุณาอย่าปิดหน้านี้และแจ้งครูคุมสอบทันที`,
      dismissible: false
    });
  }

  function startExamTimerLoop() {
    if (appState.timerInterval) clearInterval(appState.timerInterval);
    appState.lastAnnouncedMilestone = null;

    let persistCounter = 0;
    appState.timerInterval = setInterval(() => {
      if (!appState.session || appState.session.status !== 'active') {
        clearInterval(appState.timerInterval);
        appState.timerInterval = null;
        return;
      }
      if (appState.concurrentLocked) return;

      const effNow = E.getEffectiveNow(appState.session, appState.clockAnchor);
      if (effNow >= appState.session.deadlineAt) {
        triggerFinalize('timeout');
        return;
      }

      updateTimerDisplay(effNow);

      persistCounter++;
      if (persistCounter >= 20) {
        persistCounter = 0;
        appState.session.lastSeenAt = effNow;
        const saved = E.saveSession(appState.session);
        if (appState.session.mode === 'real' && !saved.ok) showStorageErrorBanner(saved.error);
      }
    }, 250);
  }

  function updateTimerDisplay(effNowArg) {
    const sess = appState.session;
    if (!sess || sess.status !== 'active') return;
    const effNow = typeof effNowArg === 'number' ? effNowArg : E.getEffectiveNow(sess, appState.clockAnchor);
    const remMs = Math.max(0, sess.deadlineAt - effNow);
    const remSec = Math.ceil(remMs / 1000);

    const timerEl = document.getElementById('exam-timer-chip');
    const timerValEl = document.getElementById('exam-timer-value');
    const timerWarnEl = document.getElementById('exam-timer-warn-text');

    if (timerValEl) timerValEl.textContent = E.formatCountdown(remMs);
    if (timerEl) {
      timerEl.classList.remove('is-warn', 'is-critical');
      if (remSec <= 60) {
        timerEl.classList.add('is-critical');
        if (timerWarnEl) timerWarnEl.textContent = 'เหลือไม่ถึง 1 นาที!';
      } else if (remSec <= 300) {
        timerEl.classList.add('is-warn');
        if (timerWarnEl) timerWarnEl.textContent = 'เหลือ 5 นาทีสุดท้าย';
      } else if (timerWarnEl) {
        timerWarnEl.textContent = '';
      }
    }

    if (remSec <= 60 && appState.lastAnnouncedMilestone !== 60 && remSec > 0) {
      appState.lastAnnouncedMilestone = 60;
      timerSrEl.textContent = 'เหลือเวลาทำข้อสอบอีก 1 นาที';
    } else if (remSec <= 300 && remSec > 60 && appState.lastAnnouncedMilestone !== 300) {
      appState.lastAnnouncedMilestone = 300;
      timerSrEl.textContent = 'เหลือเวลาทำข้อสอบอีก 5 นาที';
    }
  }

  function triggerFinalize(reason) {
    if (appState.submitting || !appState.session) return;
    if (appState.session.status === 'finished') {
      navigate(appState.session.mode === 'real' ? 'REAL_RESULT' : 'PRACTICE_RESULT');
      return;
    }
    appState.submitting = true;
    try {
      const effNow = E.getEffectiveNow(appState.session, appState.clockAnchor);
      if (reason === 'timeout') {
        timerSrEl.textContent = 'หมดเวลาทำข้อสอบแล้ว ระบบส่งคำตอบอัตโนมัติ';
      }
      stopExamTimers();
      closeModal();

      const { session, alreadyFinished, saved } = E.finalizeExam(appState.session, reason, effNow);
      if (!alreadyFinished && ST && typeof ST.recordExamStats === 'function') {
        ST.recordExamStats(session);
      }
      appState.session = session;
      appState.resultExpanded = {};
      clearBanners();

      const isPerfect = Boolean(!alreadyFinished && session.result && session.result.scoreHalf === session.result.maxHalf);
      if (isPerfect && CEL) {
        appState.celebrateGifIndex = CEL.pickGif().index;
        CEL.launchConfetti();
        CEL.playVictorySong();
      }

      if (session.mode === 'real' && !saved.ok) showStorageErrorBanner(saved.error);
      navigate(session.mode === 'real' ? 'REAL_RESULT' : 'PRACTICE_RESULT');

      if (isPerfect && CEL) {
        openPerfectScoreModal(session);
      }
    } finally {
      appState.submitting = false;
    }
  }

  /* ------------------------------------------------------------------------
     Multi-Tab Coordinator Setup
     ------------------------------------------------------------------------ */
  function initTabCoordinator() {
    if (appState.tabCoordinator) return;
    appState.tabCoordinator = E.createTabCoordinator({
      onConcurrentAttempt() {
        if (appState.session && appState.session.mode === 'real' && appState.session.status === 'active') {
          const now = E.getEffectiveNow(appState.session, appState.clockAnchor);
          E.addTechnicalFlag(appState.session, 'concurrent_tab', 'ตรวจพบการเปิดหน้าสอบจริงพร้อมกันในแท็บอื่นของเบราว์เซอร์เดียวกัน', now);
          E.saveSession(appState.session);
          showBanner({
            id: 'concurrent-warn',
            kind: 'warn',
            text: 'ตรวจพบว่ามีการเปิดหน้าสอบในแท็บอื่น กรุณาใช้เพียงแท็บนี้ในการทำข้อสอบ',
            dismissible: true
          });
        }
      },
      onLockedOut() {
        if (appState.view === 'REAL_ACTIVE') {
          appState.concurrentLocked = true;
          detachRealExamMonitor();
          renderCurrentView();
        }
      },
      onOwnerReleased() {
        if (appState.concurrentLocked && appState.view === 'REAL_ACTIVE') {
          showBanner({
            id: 'owner-released',
            kind: 'info',
            text: 'แท็บก่อนหน้าปิดลงแล้ว คุณสามารถกดปุ่มด้านล่างเพื่อทำข้อสอบต่อจากเซสชันเดิมได้',
            dismissible: true
          });
        }
      },
      onExternalSessionUpdate() {
        if (appState.concurrentLocked) {
          const loaded = E.loadSession('real');
          if (loaded.status === 'ok' && loaded.session && loaded.session.status === 'finished') {
            appState.session = loaded.session;
            appState.concurrentLocked = false;
            navigate('REAL_RESULT');
          }
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     Navigation & State Machine
     ------------------------------------------------------------------------ */
  function navigate(view) {
    stopLiveClock();
    if (view !== 'REAL_RESULT' && view !== 'PRACTICE_RESULT' && CEL) {
      CEL.stopVictorySong();
    }
    if (view !== 'REAL_ACTIVE' && view !== 'PRACTICE_ACTIVE') {
      stopExamTimers();
    }
    appState.view = view;
    updateHeader();
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    mainEl.focus({ preventScroll: true });
  }

  function renderCurrentView() {
    switch (appState.view) {
      case 'HOME': renderHome(); break;
      case 'LEARN': renderLearn(); break;
      case 'PRACTICE_SETUP': renderPracticeSetup(); break;
      case 'PRACTICE_ACTIVE': renderExamActive(); break;
      case 'PRACTICE_RESULT': renderResult(appState.session); break;
      case 'REAL_SETUP': renderRealSetup(); break;
      case 'REAL_ACTIVE': renderExamActive(); break;
      case 'REAL_RESULT': renderResult(appState.session); break;
      case 'CORRUPTED_REAL': renderCorruptedReal(); break;
      default: renderHome();
    }
  }

  /* ------------------------------------------------------------------------
     VIEW 1: HOME
     ------------------------------------------------------------------------ */
  function renderHome() {
    const realState = E.loadSession('real');
    const practiceState = E.loadSession('practice');

    let realNoticeHtml = '';
    let realBtnHtml = '<button type="button" class="btn btn-primary btn-block" id="go-real-btn">เข้าสู่โหมดสอบจริง</button>';

    if (realState.status === 'corrupted') {
      realNoticeHtml = `
        <div class="alert-banner danger" style="margin-bottom:14px;">
          <div>
            <strong>พบข้อมูลการสอบจริงที่บันทึกไว้เสียหาย:</strong> ${esc(realState.error)}
            <div style="margin-top:6px;"><button type="button" class="btn btn-danger btn-sm" id="home-open-corrupted-btn">ดูรายละเอียดและแจ้งครูคุมสอบ</button></div>
          </div>
        </div>`;
    } else if (realState.status === 'ok' && realState.session) {
      if (realState.session.status === 'active') {
        realNoticeHtml = `
          <div class="alert-banner warn" style="margin-bottom:14px;">
            <div>
              <strong>มีการสอบจริงค้างอยู่ในเบราว์เซอร์นี้</strong> (${esc(realState.session.student.firstName)} ${esc(realState.session.student.lastName)} · เลขที่ ${realState.session.student.number} · Session ${esc(realState.session.sessionId)})
              <div style="margin-top:8px;"><button type="button" class="btn btn-primary btn-sm" id="home-resume-real-btn">กลับไปทำข้อสอบจริงต่อทันที</button></div>
            </div>
          </div>`;
        realBtnHtml = '<button type="button" class="btn btn-primary btn-block" id="go-real-btn">ทำข้อสอบจริงต่อ (Resume)</button>';
      } else if (realState.session.status === 'finished') {
        const res = realState.session.result;
        realNoticeHtml = `
          <div class="alert-banner info" style="margin-bottom:14px;">
            <div>
              <strong>มีผลการสอบจริงล่าสุดบันทึกไว้แล้ว:</strong> ${esc(realState.session.student.firstName)} ${esc(realState.session.student.lastName)} (${esc(realState.session.student.classroom)} เลขที่ ${realState.session.student.number}) — ได้ <strong>${esc(res.scoreDisplay)} / ${esc(res.maxDisplay)} คะแนน</strong> · Session ${esc(realState.session.sessionId)}
              <div style="margin-top:8px;"><button type="button" class="btn btn-primary btn-sm" id="home-view-real-result-btn">เปิดผลสอบจริงล่าสุดให้ครูตรวจ</button></div>
            </div>
          </div>`;
        realBtnHtml = '<button type="button" class="btn btn-primary btn-block" id="go-real-btn">เปิดผลสอบจริงล่าสุด</button>';
      }
    }

    const practiceActiveResume = (practiceState.status === 'ok' && practiceState.session && practiceState.session.status === 'active');

    mainEl.innerHTML = `
      ${realNoticeHtml}
      <section class="card hero-card">
        <div class="hero-cat-layout">
          <img src="assets/cat-hero.jpg" alt="น้องแมวส้มอ้วนใส่แว่นกำลังทดลองสมดุลไม้เมตร" class="hero-cat-avatar" loading="eager">
          <div class="hero-cat-content">
            <span class="badge badge-blue">🐱 แมวส้มอ้วนพาติวฟิสิกส์ ม.4 · Future Education</span>
            <h1 class="hero-title">Moment Lab: สมดุลต่อการหมุน</h1>
            <p class="hero-desc">มาเรียนรู้หลักโมเมนต์ของแรงกับเจ้าแมวส้มอ้วนจากภาพและโจทย์มาตรฐาน 6 ข้อ ทั้งระยะหน่วยเมตร (${renderLatex('\\text{m}', 'm')}) และเซนติเมตร (${renderLatex('\\text{cm}', 'cm')}) พร้อมเฉลยสมการทีละขั้น ฝึกทดลองสอบสุ่มไม่ซ้ำ และสอบจริงพร้อมหลักฐานตรวจหน้าชั้น</p>
            <div class="formula-chip" style="margin-top:4px;" aria-label="สมการหลัก ผลรวมโมเมนต์ทวนเข็มเท่ากับผลรวมโมเมนต์ตามเข็ม">
              🐾 ${renderLatex('\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}', 'ΣMทวน = ΣMตาม')}
            </div>
          </div>
        </div>
      </section>

      <section class="mode-grid" aria-label="เลือกโหมดการใช้งาน">
        <article class="card mode-card">
          <div>
            <div class="mode-card-head">
              <span class="mode-icon" aria-hidden="true">📘</span>
              <span class="badge badge-blue">ไม่จำกัดเวลา</span>
            </div>
            <h2>โหมดเรียน (Learn)</h2>
            <p>สรุปนิยามฟิสิกส์ แผนภาพโต้ตอบจุดหมุน–แขนโมเมนต์ และตัวอย่างครบ 6 ข้อ สลับฝึกได้ทั้งหน่วย cm, m และผสม m+cm พร้อมเฉลยละเอียดด้วยสมการ LaTeX</p>
          </div>
          <div>
            <div class="meta-pills" style="margin-bottom:12px;">
              <span class="badge badge-neutral">ตัวอย่าง 6 ข้อ</span>
              <span class="badge badge-neutral">ระยะ m &amp; cm</span>
              <span class="badge badge-neutral">Lab โต้ตอบ</span>
            </div>
            <button type="button" class="btn btn-secondary btn-block" id="go-learn-btn">เข้าสู่โหมดเรียน</button>
          </div>
        </article>

        <article class="card mode-card">
          <div>
            <div class="mode-card-head">
              <span class="mode-icon sky" aria-hidden="true">🧪</span>
              <span class="badge badge-sky">ฝึกสุ่มไม่จำกัด</span>
            </div>
            <h2>โหมดทดลองสอบ (Practice)</h2>
            <p>สุ่มตัวเลขใหม่ทุกครั้งตามเลขที่ 1–41 คละระยะทั้ง m และ cm พร้อมช่องตอบตัวเลขและปุ่มเลือกหน่วย ตรวจคะแนนและเฉลยละเอียดทันทีหลังส่ง</p>
          </div>
          <div>
            <div class="meta-pills" style="margin-bottom:12px;">
              <span class="badge badge-neutral">3 ข้อ · 15 นาที</span>
              <span class="badge badge-neutral">เต็ม 10 คะแนน</span>
              <span class="badge badge-neutral">2.5 + 2.5 + 5</span>
            </div>
            <button type="button" class="btn btn-secondary btn-block" id="go-practice-btn">
              ${practiceActiveResume ? 'ทำทดลองสอบต่อ / เริ่มชุดใหม่' : 'เริ่มโหมดทดลองสอบ'}
            </button>
          </div>
        </article>

        <article class="card mode-card is-real-card">
          <div>
            <div class="mode-card-head">
              <span class="mode-icon real" aria-hidden="true">⏱</span>
              <span class="badge badge-danger">บันทึกผลในเครื่อง</span>
            </div>
            <h2>โหมดสอบจริง (Real Exam)</h2>
            <p>สอบเก็บคะแนนในคาบเรียนต่อหน้าครูคุมสอบ เก็บชื่อ–ชั้น–เลขที่ จับเวลาต่อเนื่องแม้รีเฟรช พร้อมบันทึกเหตุการณ์ออกจากหน้าและแสดงผลค้างไว้ให้ครูตรวจ</p>
          </div>
          <div>
            <div class="meta-pills" style="margin-bottom:12px;">
              <span class="badge badge-neutral">3 ข้อ · 15 นาที</span>
              <span class="badge badge-neutral">เต็ม 10 คะแนน</span>
              <span class="badge badge-neutral">Export JSON / PDF</span>
            </div>
            ${realBtnHtml}
          </div>
        </article>
      </section>

      <aside class="notice-footnote" aria-label="ขอบเขตทางเทคนิคของระบบ">
        <strong>ข้อจำกัดความน่าเชื่อถือของเว็บแอปแบบ Static (GitHub Pages):</strong>
        ระบบทำงานบนเบราว์เซอร์ของอุปกรณ์โดยไม่เชื่อมต่อเซิร์ฟเวอร์กลาง จึงใช้เวลาจากนาฬิกาอุปกรณ์และตรวจจับการสลับหน้าในระดับเบราว์เซอร์เท่านั้น ไม่ใช่การยืนยันเวลาโดยเซิร์ฟเวอร์และไม่สามารถป้องกันการดัดแปลงผ่านเครื่องมือผู้พัฒนาได้ การสอบจริงควรดำเนินการในคาบเรียนต่อหน้าครูคุมสอบและตรวจหน้าผลสอบพร้อม Session ID โดยตรง
      </aside>
    `;

    document.getElementById('go-learn-btn').addEventListener('click', () => navigate('LEARN'));
    document.getElementById('go-practice-btn').addEventListener('click', () => {
      if (practiceActiveResume) resumeExistingSession(practiceState.session);
      else navigate('PRACTICE_SETUP');
    });
    document.getElementById('go-real-btn').addEventListener('click', () => handleEnterRealFromHome());

    const resumeRealBtn = document.getElementById('home-resume-real-btn');
    if (resumeRealBtn) resumeRealBtn.addEventListener('click', () => handleEnterRealFromHome());
    const viewRealBtn = document.getElementById('home-view-real-result-btn');
    if (viewRealBtn) viewRealBtn.addEventListener('click', () => handleEnterRealFromHome());
    const openCorruptedBtn = document.getElementById('home-open-corrupted-btn');
    if (openCorruptedBtn) {
      openCorruptedBtn.addEventListener('click', () => {
        appState.corruptedRealError = realState.error;
        navigate('CORRUPTED_REAL');
      });
    }
  }

  function handleEnterRealFromHome() {
    const realState = E.loadSession('real');
    if (realState.status === 'corrupted') {
      appState.corruptedRealError = realState.error;
      navigate('CORRUPTED_REAL');
      return;
    }
    if (realState.status === 'ok' && realState.session) {
      if (realState.session.status === 'active') resumeExistingSession(realState.session);
      else { appState.session = realState.session; navigate('REAL_RESULT'); }
      return;
    }
    navigate('REAL_SETUP');
  }

  /* ------------------------------------------------------------------------
     VIEW 2: LEARN MODE (Blueprint §3, §5, §6, §8 + m/cm distance modes)
     ------------------------------------------------------------------------ */
  const LEARN_SECTIONS = [
    { id: 'theory', label: '1. สรุปความรู้ฟิสิกส์' },
    { id: 'demo', label: '2. Lab โต้ตอบแขนโมเมนต์' },
    { id: 'M1', label: 'ตัวอย่างที่ 1 (M1 · 4 แขน)' },
    { id: 'F1', label: 'ตัวอย่างที่ 2 (F1 · 4 แขน)' },
    { id: 'M2', label: 'ตัวอย่างที่ 3 (M2 · เลขที่ n)' },
    { id: 'F2', label: 'ตัวอย่างที่ 4 (F2 · เลขที่ n)' },
    { id: 'MA', label: 'ตัวอย่างที่ 5 (MA · A-Level)' },
    { id: 'FA', label: 'ตัวอย่างที่ 6 (FA · A-Level)' }
  ];

  function renderLearn() {
    const sec = appState.learn.activeSection;
    const navItemsHtml = LEARN_SECTIONS.map(item => `
      <button type="button" class="learn-nav-btn ${sec === item.id ? 'is-active' : ''}" data-learn-sec="${item.id}">
        ${esc(item.label)}
      </button>
    `).join('');

    let contentHtml = '';
    if (sec === 'theory') contentHtml = buildLearnTheoryHtml();
    else if (sec === 'demo') contentHtml = buildLearnDemoHtml();
    else contentHtml = buildLearnExampleHtml(sec);

    mainEl.innerHTML = `
      <div class="learn-shell">
        <nav class="learn-nav" aria-label="สารบัญโหมดเรียน">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 4px;">
            <strong style="font-size:0.86rem;color:var(--text-muted);">สารบัญบทเรียน</strong>
            <button type="button" class="btn btn-ghost btn-sm" id="learn-back-home" style="min-height:36px;padding:4px 10px;">← หน้าหลัก</button>
          </div>
          <div class="learn-nav-list">${navItemsHtml}</div>
        </nav>

        <div class="learn-content">${contentHtml}</div>
      </div>
    `;

    document.getElementById('learn-back-home').addEventListener('click', () => navigate('HOME'));
    mainEl.querySelectorAll('[data-learn-sec]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.learn.activeSection = btn.getAttribute('data-learn-sec');
        renderLearn();
      });
    });

    bindLearnSectionHandlers(sec);
  }

  function buildLearnTheoryHtml() {
    return `
      <section class="card">
        <div class="cat-buddy-strip">
          <img src="assets/cat-study.jpg" alt="น้องแมวส้มอ้วนใส่หมวกเบเรต์พร้อมไม้บรรทัด" class="cat-buddy-thumb" loading="lazy">
          <div>
            <strong style="color:var(--accent);font-size:0.98rem;">เมี๊ยว~ ยินดีต้อนรับสู่ห้องเรียนแมวส้มอ้วน! 🐾</strong>
            <div style="font-size:0.86rem;color:var(--text-secondary);">ค่อย ๆ อ่านนิยาม ลองเล่น Lab เลื่อนจุดหมุน แล้วฝึกทำตัวอย่าง 6 ข้อทีละขั้นกันนะ ถ้าสอบได้เต็ม 10/10 น้องแมวมีท่าเต้นพิเศษรอฉลองอยู่ด้วย!</div>
          </div>
        </div>
        <div class="example-head" style="margin-bottom:10px;">
          <span class="badge badge-blue">พื้นฐานฟิสิกส์ ม.4</span>
          <span class="badge badge-neutral">${renderLatex('g = 9.8\\text{ m/s}^2\\; (9.8\\text{ N/kg})', 'g = 9.8 m/s²')}</span>
        </div>
        <h1 class="section-title">สรุปหลักสมดุลต่อการหมุน (Rotational Equilibrium)</h1>
        <p class="section-subtitle">โจทย์ชุดนี้พิจารณาแท่งไม้หรือคานอยู่ในแนวระดับ แรงทั้งหมดกระทำในแนวดิ่ง และจุดหมุนเป็นฐานรองรับแบบอุดมคติ</p>

        <div class="card-inset" style="margin-bottom:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-size:0.84rem;color:var(--text-muted);font-weight:700;">สมการหลักที่ใช้แก้โจทย์ทุกข้อ</div>
            <div style="font-size:1.3rem;color:var(--accent);margin-top:4px;">
              ${renderLatex('\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}', 'ΣMทวน = ΣMตาม')}
            </div>
          </div>
          <div style="font-size:0.88rem;color:var(--text-secondary);max-width:44ch;">
            หมายเหตุ: สมดุลต่อการหมุนเพียงอย่างเดียวไม่ใช่เงื่อนไขครบถ้วนของสมดุลสถิตทั่วไป ในโจทย์ชุดนี้ฐานรองรับ (ลิ่ม) จัดให้มีแรงปฏิกิริยาในแนวดิ่งเพื่อรองรับแรงทั้งหมด (${renderLatex('\\sum F = 0', 'ΣF = 0')})
          </div>
        </div>

        <div class="concept-grid">
          <div class="concept-item">
            <h3>1. โมเมนต์ของแรง (Moment of Force)</h3>
            <p>ผลของแรงที่มีแนวโน้มทำให้วัตถุหมุนรอบจุดหมุน มีขนาด ${renderLatex('M = F d', 'M = Fd')} หน่วยมาตรฐาน SI คือ ${renderLatex('\\text{N}\\cdot\\text{m}', 'N·m')}</p>
          </div>
          <div class="concept-item">
            <h3>2. จุดหมุน (Pivot) &amp; แขนโมเมนต์ (Moment Arm)</h3>
            <p>แขนโมเมนต์ ${renderLatex('d = \\left|x_{\\text{แรง}} - x_{\\text{pivot}}\\right|', 'd = |x - x_pivot|')} คือระยะตั้งฉากจากจุดหมุนถึงแนวแรง <em>ไม่ใช่ระยะจากปลายไม้เสมอไป</em></p>
          </div>
          <div class="concept-item">
            <h3>3. น้ำหนักและจุดศูนย์กลางมวลของแท่งสม่ำเสมอ</h3>
            <p>น้ำหนัก ${renderLatex('W = m g', 'W = mg')} หน่วย ${renderLatex('\\text{N}', 'N')} (มวล ${renderLatex('m', 'm')} ต้องเป็น ${renderLatex('\\text{kg}', 'kg')}) แท่งไม้สม่ำเสมอมีจุดศูนย์กลางมวลที่กึ่งกลาง ${renderLatex('x_{\\text{cm}} = \\frac{L}{2}', 'x_cm = L/2')}</p>
          </div>
          <div class="concept-item">
            <h3>4. แรงที่ให้โมเมนต์เป็นศูนย์ (${renderLatex('M = 0', 'M = 0')})</h3>
            <p>เมื่อแนวแรงผ่านจุดหมุน (${renderLatex('d = 0', 'd = 0')}) โมเมนต์จะเป็นศูนย์ เช่น แรงปฏิกิริยาที่จุดหมุน และน้ำหนักแท่งเมื่อวางลิ่มตรงกึ่งกลางแท่งพอดี</p>
          </div>
          <div class="concept-item">
            <h3>5. วิธีแยกทิศการหมุน (แรงชี้ลงบนแท่งแนวระดับ)</h3>
            <p>แรงชี้ลง <strong>ด้านซ้ายจุดหมุน → ทวนเข็มนาฬิกา (↺)</strong> · <strong>ด้านขวาจุดหมุน → ตามเข็มนาฬิกา (↻)</strong> · <strong>ตรงจุดหมุน → ไม่หมุน (${renderLatex('0', '0')})</strong></p>
          </div>
          <div class="concept-item">
            <h3>6. การแปลงหน่วย ${renderLatex('\\text{m} \\leftrightarrow \\text{cm}', 'm <-> cm')} และ ${renderLatex('\\text{g} \\to \\text{kg}', 'g -> kg')}</h3>
            <p>แปลงระยะให้เป็นหน่วยเดียวกันทั้งสมการก่อนแทนค่า (${renderLatex('1\\text{ m} = 100\\text{ cm}', '1 m = 100 cm')} และ ${renderLatex('1\\text{ kg} = 1000\\text{ g}', '1 kg = 1000 g')}) · หากทุกแรงเป็นน้ำหนักให้ตั้งด้วย ${renderLatex('mg', 'mg')} ก่อนหารทั้งสองข้างด้วย ${renderLatex('g', 'g')} (ห้ามใช้ ${renderLatex('g = 10', 'g = 10')})</p>
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="section-title" style="font-size:1.1rem;">กระบวนการคิด 7 ขั้นเดียวกันทุกข้อ</h2>
        <div class="meta-pills">
          <span class="badge badge-blue">1. หาจุดหมุน &amp; ${renderLatex('x_{\\text{cm}}', 'x_cm')}</span>
          <span class="badge badge-blue">2. แปลงหน่วย m/cm &amp; g/kg</span>
          <span class="badge badge-blue">3. ระบุแรงและแขน ${renderLatex('d', 'd')}</span>
          <span class="badge badge-blue">4. จำแนกทวน/ตามเข็ม</span>
          <span class="badge badge-blue">5. ตั้ง ${renderLatex('\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}', 'ΣMทวน = ΣMตาม')}</span>
          <span class="badge badge-blue">6. แก้สมการทีละขั้น</span>
          <span class="badge badge-success">7. ตรวจคำตอบและหน่วย</span>
        </div>
        <div class="btn-row" style="margin-top:16px;">
          <button type="button" class="btn btn-primary" id="theory-next-demo">ไปลอง Lab โต้ตอบแขนโมเมนต์ →</button>
          <button type="button" class="btn btn-secondary" id="theory-jump-m1">ข้ามไปดูตัวอย่างที่ 1 (M1)</button>
        </div>
      </section>
    `;
  }

  function buildLearnDemoHtml() {
    const { demoPivot, demoForceX, demoForceN } = appState.learn;
    const dCm = Math.abs(demoForceX - demoPivot);
    const dM = (dCm / 100).toFixed(2);
    const mNcm = demoForceN * dCm;
    const mNm = (demoForceN * dCm / 100).toFixed(2);
    const dirText = demoForceX === demoPivot
      ? 'โมเมนต์เป็นศูนย์ (แนวแรงผ่านจุดหมุน)'
      : (demoForceX < demoPivot ? '↺ ทวนเข็มนาฬิกา (CCW)' : '↻ ตามเข็มนาฬิกา (CW)');

    return `
      <section class="card">
        <span class="badge badge-sky" style="margin-bottom:8px;">Interactive Mini-Lab</span>
        <h1 class="section-title">ทดลองเลื่อนจุดหมุนและตำแหน่งแรง</h1>
        <p class="section-subtitle">ลองปรับตำแหน่งจุดหมุน ตำแหน่งแรงกด และขนาดแรงบนไม้เมตรยาว ${renderLatex('1.00\\text{ m}\\; (100\\text{ cm})', '1.00 m (100 cm)')} เพื่อสังเกตแขนโมเมนต์ ${renderLatex('d = \\left|x - x_{\\text{pivot}}\\right|', 'd = |x - x_pivot|')} ทั้งในหน่วย ${renderLatex('\\text{cm}', 'cm')} และ ${renderLatex('\\text{m}', 'm')}</p>

        <div class="demo-layout">
          <div id="learn-demo-svg-wrap">
            ${renderZoomableSvg(S.renderInteractiveDemoSvg({ lengthCm: 100, pivotCm: demoPivot, forceXCm: demoForceX, forceN: demoForceN }), 'learn-demo', 'จำลองจุดหมุนและแขนโมเมนต์ (ซูมได้)')}
          </div>

          <div class="demo-controls">
            <div class="range-group">
              <label for="demo-pivot-slider">
                <span>ตำแหน่งจุดหมุน (${renderLatex('x_{\\text{pivot}}', 'x_pivot')})</span>
                <span id="demo-pivot-val">${renderLatex(`${demoPivot}\\text{ cm} = ${(demoPivot / 100).toFixed(2)}\\text{ m}`, `${demoPivot} cm`)}</span>
              </label>
              <input type="range" id="demo-pivot-slider" min="10" max="90" step="5" value="${demoPivot}">
            </div>

            <div class="range-group">
              <label for="demo-forcex-slider">
                <span>ตำแหน่งแรงกด (${renderLatex('x', 'x')})</span>
                <span id="demo-forcex-val">${renderLatex(`${demoForceX}\\text{ cm} = ${(demoForceX / 100).toFixed(2)}\\text{ m}`, `${demoForceX} cm`)}</span>
              </label>
              <input type="range" id="demo-forcex-slider" min="0" max="100" step="5" value="${demoForceX}">
            </div>

            <div class="range-group">
              <label for="demo-forcen-slider">
                <span>ขนาดแรงกด (${renderLatex('F', 'F')})</span>
                <span id="demo-forcen-val">${renderLatex(`${demoForceN}\\text{ N}`, `${demoForceN} N`)}</span>
              </label>
              <input type="range" id="demo-forcen-slider" min="2" max="20" step="1" value="${demoForceN}">
            </div>

            <div class="demo-readout">
              <div class="readout-box">
                <div class="readout-label">แขนโมเมนต์ ${renderLatex('d', 'd')}</div>
                <div class="readout-val" id="demo-d-out">${renderLatex(`${dCm}\\text{ cm} = ${dM}\\text{ m}`, `${dCm} cm (${dM} m)`)}</div>
              </div>
              <div class="readout-box">
                <div class="readout-label">โมเมนต์ ${renderLatex('M = F d', 'M = Fd')}</div>
                <div class="readout-val" id="demo-m-out">${renderLatex(`${mNm}\\text{ N}\\cdot\\text{m}\\; (${mNcm}\\text{ N}\\cdot\\text{cm})`, `${mNm} N·m`)}</div>
              </div>
            </div>

            <div class="card-inset" style="font-size:0.9rem;font-weight:700;" id="demo-dir-out">${dirText}</div>

            <div class="btn-row">
              <button type="button" class="btn btn-ghost btn-sm" id="demo-preset-zero">ลองกรณี ${renderLatex('d = 0', 'd = 0')} (ผ่านจุดหมุน)</button>
              <button type="button" class="btn btn-primary btn-sm" id="demo-next-m1">เริ่มตัวอย่างที่ 1 →</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function buildLearnExampleHtml(templateId) {
    const meta = P.TEMPLATE_META[templateId];
    const distMode = appState.learn.distanceMode || 'cm';
    const q = P.getLearnQuestion(templateId, appState.learn.studentNo, distMode);
    const sol = P.solveQuestion(q);
    const isSolOpen = Boolean(appState.learn.openSolutions[templateId]);
    const mode = appState.learn.stepMode[templateId] || 'all';
    const tryKey = `${templateId}_${distMode}`;
    const tryState = appState.learn.tryAnswers[tryKey] || { rawValue: '', unit: '', feedback: null };

    const unitModeBarHtml = `
      <div class="unit-mode-strip" role="group" aria-label="สลับรูปแบบหน่วยระยะของตัวอย่าง">
        <span style="font-size:0.84rem;font-weight:700;color:var(--text-muted);margin-right:4px;">ฝึกดูรูปแบบระยะ:</span>
        <button type="button" class="unit-mode-pill ${distMode === 'cm' ? 'is-active' : ''}" data-dist-mode="cm">ต้นฉบับ (cm)</button>
        <button type="button" class="unit-mode-pill ${distMode === 'm' ? 'is-active' : ''}" data-dist-mode="m">หน่วยเมตร (m)</button>
        <button type="button" class="unit-mode-pill ${distMode === 'mixed_m' ? 'is-active' : ''}" data-dist-mode="mixed_m">ผสม m และ cm</button>
      </div>
    `;

    const personalBarHtml = meta.personalizedInLearn ? `
      <div class="personalized-bar">
        <label for="learn-student-no" style="font-weight:700;font-size:0.9rem;">
          กำหนดเลขที่ (${renderLatex('n = 1\\text{–}41', 'n = 1-41')}) สำหรับตัวอย่างเฉพาะบุคคล:
        </label>
        <input type="text" inputmode="numeric" id="learn-student-no" class="text-input math-font" value="${appState.learn.studentNo}" aria-label="เลขที่สำหรับตัวอย่าง">
        <button type="button" class="btn btn-primary btn-sm" id="learn-apply-n-btn">อัปเดตตัวเลข</button>
        <span class="badge badge-neutral">ค่าเริ่มต้น n = 1 · ปัจจุบัน n = ${appState.learn.studentNo}</span>
        <span class="field-error hidden" id="learn-n-err"></span>
      </div>
    ` : '';

    const origChoicesHtml = q.originalChoices ? `
      <div>
        <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;margin-bottom:4px;">ตัวเลือกต้นฉบับ (แสดงเฉพาะในโหมดเรียน · โหมดสอบให้เติมตัวเลขและเลือกหน่วย):</div>
        <div class="choices-strip">
          ${q.originalChoices.map((c, idx) => `<span class="choice-chip">${idx + 1}) ${esc(c)}</span>`).join('')}
        </div>
      </div>
    ` : '';

    let tryFeedbackHtml = '';
    if (tryState.feedback) {
      const fb = tryState.feedback;
      const cls = fb.isCorrect ? 'badge-success' : 'badge-warn';
      const icon = fb.isCorrect ? '✓ ถูกต้องทั้งค่าตัวเลขและหน่วย!' : '✕ ยังไม่ตรงตามเฉลย ลองตรวจสอบค่าตัวเลขและหน่วยอีกครั้ง';
      const numLbl = fb.numericStatus === 'correct' ? '✓ ค่าตัวเลขถูก' : fb.numericStatus === 'unanswered' ? '— ยังไม่ได้กรอกตัวเลข' : '✕ ค่าตัวเลขยังไม่ถูก';
      const unitLbl = fb.unitStatus === 'correct' ? '✓ หน่วยถูก' : fb.unitStatus === 'unselected' ? '— ยังไม่ได้เลือกหน่วย' : `✕ หน่วยผิด (โจทย์ถามหน่วย ${fb.expectedUnit})`;
      tryFeedbackHtml = `
        <div class="card-inset" style="margin-top:10px;">
          <span class="badge ${cls}" style="margin-bottom:6px;">${icon}</span>
          <div style="font-size:0.88rem;color:var(--text-secondary);">${numLbl} · ${unitLbl}</div>
        </div>
      `;
    }

    const solutionHtml = isSolOpen ? buildSolutionHtml(q, sol, {
      mode,
      stepIdx: appState.learn.currentStepIdx[templateId] || 0,
      idPrefix: `learn-${templateId}`,
      allowStepToggle: true
    }) : '';

    const order = ['M1', 'F1', 'M2', 'F2', 'MA', 'FA'];
    const curIdx = order.indexOf(templateId);
    const prevId = curIdx > 0 ? order[curIdx - 1] : 'demo';
    const nextId = curIdx < order.length - 1 ? order[curIdx + 1] : null;

    return `
      <article class="card example-card">
        <div class="example-head">
          <span class="badge badge-blue">${esc(meta.learnBadge)}</span>
          <span class="badge badge-neutral">คะแนนในโหมดสอบ: ${P.formatHalfPoints(meta.pointsHalf)} คะแนน</span>
        </div>

        ${unitModeBarHtml}
        ${personalBarHtml}

        <p class="problem-text">${renderRichText(q.problemRich, q.problemText)}</p>

        ${origChoicesHtml}

        ${renderZoomableSvg(S.renderQuestionSvg(q, { showSolution: false }), `learn-prob-${templateId}`, 'แผนภาพโจทย์ (ซูมเข้า/ออกได้)')}

        <details class="card-inset" ${tryState.open ? 'open' : ''} id="learn-try-details">
          <summary style="cursor:pointer;font-weight:700;padding:4px 0;">✏️ ลองคำนวณ (กรอกตัวเลข + เลือกหน่วย) ก่อนดูเฉลย</summary>
          <div style="margin-top:12px;">
            <div class="answer-input-pair">
              <div class="field-group" style="margin-bottom:0;">
                <label class="field-label" for="learn-try-input">1) กรอกค่าตัวเลข (ทศนิยม 2 ตำแหน่ง, ±0.05)</label>
                <input type="text" inputmode="decimal" id="learn-try-input" class="text-input math-font" placeholder="เช่น 0.40 หรือ 1.85" autocomplete="off" value="${esc(tryState.rawValue)}">
              </div>
              <div class="field-group" style="margin-bottom:0;">
                <label class="field-label" for="learn-try-unit">2) เลือกหน่วย</label>
                <select id="learn-try-unit" class="unit-select is-compact ${!tryState.unit ? 'is-unselected' : ''}" aria-label="เลือกหน่วยคำตอบ">
                  ${buildUnitSelectOptions(tryState.unit)}
                </select>
              </div>
            </div>
            <div class="btn-row" style="margin-top:12px;">
              <button type="button" class="btn btn-primary btn-sm" id="learn-check-try-btn">ตรวจคำตอบที่ลองทำ</button>
              <button type="button" class="btn btn-ghost btn-sm" id="learn-clear-try-btn">ล้างคำตอบ</button>
            </div>
            ${tryFeedbackHtml}
          </div>
        </details>

        <div class="btn-row" style="justify-content:space-between;">
          <button type="button" class="btn ${isSolOpen ? 'btn-secondary' : 'btn-primary'}" id="learn-toggle-sol-btn">
            ${isSolOpen ? '▲ ซ่อนเฉลยทีละขั้น' : '▼ ดูเฉลยทีละขั้นอย่างละเอียด'}
          </button>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" data-jump-sec="${prevId}">← ก่อนหน้า</button>
            ${nextId
              ? `<button type="button" class="btn btn-secondary btn-sm" data-jump-sec="${nextId}">ตัวอย่างถัดไป →</button>`
              : `<button type="button" class="btn btn-primary btn-sm" id="learn-go-practice">ไปทดลองสอบ →</button>`
            }
          </div>
        </div>

        ${solutionHtml}
      </article>
    `;
  }

  function bindLearnSectionHandlers(sec) {
    if (sec === 'theory') {
      const b1 = document.getElementById('theory-next-demo');
      if (b1) b1.addEventListener('click', () => { appState.learn.activeSection = 'demo'; renderLearn(); });
      const b2 = document.getElementById('theory-jump-m1');
      if (b2) b2.addEventListener('click', () => { appState.learn.activeSection = 'M1'; renderLearn(); });
      return;
    }

    if (sec === 'demo') {
      const pSlider = document.getElementById('demo-pivot-slider');
      const fxSlider = document.getElementById('demo-forcex-slider');
      const fnSlider = document.getElementById('demo-forcen-slider');

      const refreshDemo = () => {
        const pv = Number(pSlider.value);
        const fx = Number(fxSlider.value);
        const fn = Number(fnSlider.value);
        appState.learn.demoPivot = pv;
        appState.learn.demoForceX = fx;
        appState.learn.demoForceN = fn;
        const dCm = Math.abs(fx - pv);
        const dM = (dCm / 100).toFixed(2);
        const mNm = (fn * dCm / 100).toFixed(2);
        document.getElementById('demo-pivot-val').innerHTML = renderLatex(`${pv}\\text{ cm} = ${(pv / 100).toFixed(2)}\\text{ m}`, `${pv} cm`);
        document.getElementById('demo-forcex-val').innerHTML = renderLatex(`${fx}\\text{ cm} = ${(fx / 100).toFixed(2)}\\text{ m}`, `${fx} cm`);
        document.getElementById('demo-forcen-val').innerHTML = renderLatex(`${fn}\\text{ N}`, `${fn} N`);
        document.getElementById('demo-d-out').innerHTML = renderLatex(`${dCm}\\text{ cm} = ${dM}\\text{ m}`, `${dCm} cm`);
        document.getElementById('demo-m-out').innerHTML = renderLatex(`${mNm}\\text{ N}\\cdot\\text{m}\\; (${fn * dCm}\\text{ N}\\cdot\\text{cm})`, `${mNm} N·m`);
        document.getElementById('demo-dir-out').textContent = fx === pv
          ? 'โมเมนต์เป็นศูนย์ (แนวแรงผ่านจุดหมุน)'
          : (fx < pv ? '↺ ทวนเข็มนาฬิกา (CCW)' : '↻ ตามเข็มนาฬิกา (CW)');
        const stageEl = document.querySelector('[data-zoom-stage="learn-demo"]');
        if (stageEl) {
          stageEl.innerHTML = S.renderInteractiveDemoSvg({
            lengthCm: 100, pivotCm: pv, forceXCm: fx, forceN: fn
          });
        }
      };

      pSlider.addEventListener('input', refreshDemo);
      fxSlider.addEventListener('input', refreshDemo);
      fnSlider.addEventListener('input', refreshDemo);

      document.getElementById('demo-preset-zero').addEventListener('click', () => {
        fxSlider.value = pSlider.value;
        refreshDemo();
      });
      document.getElementById('demo-next-m1').addEventListener('click', () => {
        appState.learn.activeSection = 'M1';
        renderLearn();
      });
      return;
    }

    // Distance mode toggle (cm | m | mixed_m)
    mainEl.querySelectorAll('[data-dist-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.learn.distanceMode = btn.getAttribute('data-dist-mode');
        renderLearn();
      });
    });

    const distMode = appState.learn.distanceMode || 'cm';
    const tryKey = `${sec}_${distMode}`;

    const applyNBtn = document.getElementById('learn-apply-n-btn');
    const nInput = document.getElementById('learn-student-no');
    if (applyNBtn && nInput) {
      const applyN = () => {
        const check = P.validateStudentNo(nInput.value);
        const errEl = document.getElementById('learn-n-err');
        if (!check.valid) {
          errEl.textContent = check.error;
          errEl.classList.remove('hidden');
          return;
        }
        errEl.classList.add('hidden');
        appState.learn.studentNo = check.value;
        if (appState.learn.tryAnswers[tryKey]) appState.learn.tryAnswers[tryKey].feedback = null;
        renderLearn();
      };
      applyNBtn.addEventListener('click', applyN);
      nInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyN(); });
    }

    const tryDetails = document.getElementById('learn-try-details');
    const tryInput = document.getElementById('learn-try-input');
    const tryUnitSelect = document.getElementById('learn-try-unit');
    const ensureTry = () => {
      if (!appState.learn.tryAnswers[tryKey]) {
        appState.learn.tryAnswers[tryKey] = { rawValue: '', unit: '', feedback: null, open: true };
      }
      return appState.learn.tryAnswers[tryKey];
    };
    if (tryDetails) tryDetails.addEventListener('toggle', () => { ensureTry().open = tryDetails.open; });
    if (tryInput) tryInput.addEventListener('input', () => { ensureTry().rawValue = tryInput.value; });
    if (tryUnitSelect) {
      tryUnitSelect.addEventListener('change', () => {
        const t = ensureTry();
        t.unit = tryUnitSelect.value;
        t.open = true;
        tryUnitSelect.classList.toggle('is-unselected', !t.unit);
      });
    }

    const checkBtn = document.getElementById('learn-check-try-btn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        const t = ensureTry();
        t.rawValue = tryInput ? tryInput.value : '';
        t.open = true;
        const q = P.getLearnQuestion(sec, appState.learn.studentNo, distMode);
        t.feedback = P.gradeAnswer(q, { rawValue: t.rawValue, unit: t.unit });
        if (t.feedback.isCorrect && CEL) CEL.launchConfetti();
        renderLearn();
      });
    }
    const clearBtn = document.getElementById('learn-clear-try-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        appState.learn.tryAnswers[tryKey] = { rawValue: '', unit: '', feedback: null, open: true };
        renderLearn();
      });
    }

    const toggleSolBtn = document.getElementById('learn-toggle-sol-btn');
    if (toggleSolBtn) {
      toggleSolBtn.addEventListener('click', () => {
        appState.learn.openSolutions[sec] = !appState.learn.openSolutions[sec];
        if (!appState.learn.stepMode[sec]) appState.learn.stepMode[sec] = 'all';
        renderLearn();
      });
    }

    bindSolutionStepControls(sec, `learn-${sec}`, () => renderLearn());

    mainEl.querySelectorAll('[data-jump-sec]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.learn.activeSection = btn.getAttribute('data-jump-sec');
        renderLearn();
      });
    });

    const goPractice = document.getElementById('learn-go-practice');
    if (goPractice) goPractice.addEventListener('click', () => navigate('PRACTICE_SETUP'));
  }

  /* ------------------------------------------------------------------------
     Reusable Detailed KaTeX Solution Renderer (Blueprint §6)
     ------------------------------------------------------------------------ */
  function buildSolutionHtml(question, solution, { mode = 'all', stepIdx = 0, idPrefix = 'sol', allowStepToggle = false }) {
    const steps = P.buildSolutionSteps(question, solution);
    const clampedIdx = Math.max(0, Math.min(stepIdx, steps.length - 1));
    const visibleSteps = mode === 'step' ? [steps[clampedIdx]] : steps;

    const toolbarHtml = allowStepToggle ? `
      <div class="solution-toolbar no-print">
        <div class="btn-row">
          <button type="button" class="btn btn-sm ${mode === 'all' ? 'btn-primary' : 'btn-ghost'}" id="${idPrefix}-mode-all">แสดงเฉลยทั้งหมด (${steps.length} ขั้น)</button>
          <button type="button" class="btn btn-sm ${mode === 'step' ? 'btn-primary' : 'btn-ghost'}" id="${idPrefix}-mode-step">ดูทีละขั้น</button>
        </div>
        ${mode === 'step' ? `
          <div class="btn-row">
            <button type="button" class="btn btn-secondary btn-sm" id="${idPrefix}-step-prev" ${clampedIdx === 0 ? 'disabled' : ''}>← ขั้นก่อนหน้า</button>
            <span class="badge badge-neutral">ขั้น ${clampedIdx + 1} / ${steps.length}</span>
            <button type="button" class="btn btn-secondary btn-sm" id="${idPrefix}-step-next" ${clampedIdx >= steps.length - 1 ? 'disabled' : ''}>ขั้นถัดไป →</button>
          </div>
        ` : ''}
      </div>
    ` : '';

    const diagramHtml = `
      <div>
        <div style="font-size:0.86rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">แผนภาพเฉลย (แสดงน้ำหนักแท่ง ณ ${renderLatex('x_{\\text{cm}} = L/2', 'L/2')}, แขนโมเมนต์ทุกแขน และทิศการหมุน)</div>
        ${renderZoomableSvg(S.renderQuestionSvg(question, { showSolution: true }), `${idPrefix}-sol-svg`, 'แผนภาพเฉลย (ซูมเข้า/ออกได้)')}
      </div>
    `;

    const stepsHtml = visibleSteps.map(st => {
      let tableHtml = '';
      if (st.tableRows && st.tableRows.length > 0) {
        tableHtml = `
          <div class="table-scroll">
            <table class="force-table">
              <thead>
                <tr>
                  <th>แรง / วัตถุ</th>
                  <th>ตำแหน่ง</th>
                  <th>ขนาด</th>
                  <th>แขนโมเมนต์ ${renderLatex('d', 'd')}</th>
                  <th>ทิศการหมุน</th>
                  <th>พจน์โมเมนต์</th>
                </tr>
              </thead>
              <tbody>
                ${st.tableRows.map(r => `
                  <tr>
                    <td><strong>${esc(r.name)}</strong></td>
                    <td>${renderLatex(r.positionLatex, r.positionLatex)}</td>
                    <td>${renderLatex(r.magnitudeLatex, r.magnitudeLatex)}</td>
                    <td>${renderLatex(r.armCalcLatex, r.armCalcLatex)}</td>
                    <td>${esc(r.direction)}</td>
                    <td>${renderLatex(r.termLatex, r.termLatex)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      const eqHtml = (st.equations || []).map(eq => `
        <div class="eq-line">
          <div class="eq-expr">${renderLatex(eq.latex || eq.expr, eq.expr, false)}</div>
          ${eq.note ? `<span class="eq-note">— ${esc(eq.note)}</span>` : ''}
        </div>
      `).join('');

      let finalHtml = '';
      if (st.finalAnswer) {
        const fa = st.finalAnswer;
        finalHtml = `
          <div class="final-answer-box">
            <div>
              <div style="font-size:0.82rem;color:var(--text-secondary);font-weight:700;">คำตอบที่ถูกต้อง</div>
              <div class="final-answer-val">${renderLatex(fa.latex, `${fa.exactText} ${fa.unit}`, false)}</div>
            </div>
            ${fa.originalCorrectChoice ? `<span class="badge badge-success">ตรงกับตัวเลือกที่ ${fa.originalCorrectChoice}</span>` : '<span class="badge badge-success">✓ ตรวจสมดุลแล้ว</span>'}
          </div>
        `;
      }

      return `
        <div class="solution-step">
          <h3 class="step-heading">${esc(st.heading)}</h3>
          <p class="step-explanation">${renderRichText(st.explanation, st.explanation)}</p>
          ${tableHtml}
          <div class="eq-list">${eqHtml}</div>
          ${finalHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="solution-panel">
        ${toolbarHtml}
        ${diagramHtml}
        ${stepsHtml}
      </div>
    `;
  }

  function bindSolutionStepControls(key, idPrefix, rerenderFn) {
    const allBtn = document.getElementById(`${idPrefix}-mode-all`);
    const stepBtn = document.getElementById(`${idPrefix}-mode-step`);
    const prevBtn = document.getElementById(`${idPrefix}-step-prev`);
    const nextBtn = document.getElementById(`${idPrefix}-step-next`);

    if (allBtn) allBtn.addEventListener('click', () => { appState.learn.stepMode[key] = 'all'; rerenderFn(); });
    if (stepBtn) stepBtn.addEventListener('click', () => {
      appState.learn.stepMode[key] = 'step';
      appState.learn.currentStepIdx[key] = appState.learn.currentStepIdx[key] || 0;
      rerenderFn();
    });
    if (prevBtn) prevBtn.addEventListener('click', () => {
      appState.learn.currentStepIdx[key] = Math.max(0, (appState.learn.currentStepIdx[key] || 0) - 1);
      rerenderFn();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      appState.learn.currentStepIdx[key] = (appState.learn.currentStepIdx[key] || 0) + 1;
      rerenderFn();
    });
  }

  /* ------------------------------------------------------------------------
     VIEW 3: PRACTICE SETUP (Blueprint §9.1)
     ------------------------------------------------------------------------ */
  function renderPracticeSetup() {
    const storageCheck = E.testStorageAvailability();
    const storageWarn = !storageCheck.available
      ? `<div class="alert-banner warn" style="margin:0;">หมายเหตุ: พื้นที่จัดเก็บเบราว์เซอร์ไม่พร้อมใช้งาน โหมดทดลองสอบจะทำงานในหน่วยความจำชั่วคราว (หากรีเฟรชหน้าข้อมูลอาจสูญหาย)</div>`
      : '';

    mainEl.innerHTML = `
      <div class="setup-container">
        <div class="btn-row">
          <button type="button" class="btn btn-ghost btn-sm" id="practice-back-home">← กลับหน้าหลัก</button>
        </div>

        <section class="card">
          <span class="badge badge-sky" style="margin-bottom:8px;">โหมดทดลองสอบ · ไม่ใช่คะแนนเก็บ</span>
          <h1 class="section-title">เตรียมเริ่มทดลองสอบ</h1>
          <p class="section-subtitle">สุ่มตัวเลขใหม่ทุกข้อตามเลขที่ของคุณ พร้อมคละระยะทั้งหน่วยเมตร (${renderLatex('\\text{m}', 'm')}) และเซนติเมตร (${renderLatex('\\text{cm}', 'cm')})</p>

          ${storageWarn}

          <div class="card-inset" style="margin:14px 0;">
            <strong>กติกาการทดลองสอบ</strong>
            <ul class="rules-list">
              <li>จำนวน <strong>3 ข้อ</strong> เวลา <strong>15 นาที</strong> คะแนนเต็ม <strong>10 คะแนน</strong> (ข้อ 1: 2.5 คะแนน · ข้อ 2: 2.5 คะแนน · ข้อ 3: 5 คะแนน)</li>
              <li>เลขที่ (${renderLatex('n', 'n')}) ที่กรอกจะมีผลต่อตัวเลขโจทย์และคำตอบทั้ง 3 ข้อ และไม่สามารถเปลี่ยนเลขที่กลางการสอบได้</li>
              <li>โจทย์มีระยะทั้งหน่วย <strong>${renderLatex('\\text{m}', 'm')}</strong> และ <strong>${renderLatex('\\text{cm}', 'cm')}</strong> (บางข้อผสมทั้งสองหน่วย) กรุณาอ่านหน่วยที่โจทย์สั่งให้ละเอียด</li>
              <li>ต้องกรอก <strong>ค่าตัวเลข</strong> (ใช้จุดทศนิยม <code>.</code> เท่านั้น ไม่ใส่หน่วยในช่องตัวเลข) และเลือก <strong>หน่วยจากรายการ (Dropdown)</strong> ให้ถูกต้องทั้งคู่จึงจะได้คะแนน</li>
              <li>ตอบเป็น <strong>ทศนิยม 2 ตำแหน่ง</strong> โดยระบบอนุโลมความคลาดเคลื่อนได้ <strong>±0.05</strong> (แนะนำไม่ปัดเศษระหว่างคำนวณ)</li>
            </ul>
          </div>

          <form id="practice-setup-form" novalidate>
            <div class="field-group">
              <label class="field-label" for="practice-student-no">เลขที่นักเรียน (1–41)</label>
              <input type="text" inputmode="numeric" id="practice-student-no" class="text-input input-lg math-font" placeholder="กรอกเลขที่ 1–41" autocomplete="off" required>
              <span class="field-hint">ไม่ต้องกรอกชื่อ–นามสกุล หรือชั้นเรียนในโหมดทดลองสอบ</span>
              <span class="field-error hidden" id="practice-setup-err"></span>
            </div>

            <button type="submit" class="btn btn-primary btn-block">เริ่มทดลองสอบ (15 นาที)</button>
          </form>
        </section>
      </div>
    `;

    document.getElementById('practice-back-home').addEventListener('click', () => navigate('HOME'));
    const form = document.getElementById('practice-setup-form');
    const noInput = document.getElementById('practice-student-no');
    const errEl = document.getElementById('practice-setup-err');

    form.addEventListener('submit', e => {
      e.preventDefault();
      const check = P.validateStudentNo(noInput.value);
      if (!check.valid) {
        errEl.textContent = check.error;
        errEl.classList.remove('hidden');
        noInput.focus();
        return;
      }
      errEl.classList.add('hidden');
      try {
        const { session } = E.createExamSession({ mode: 'practice', studentNo: check.value });
        enterActiveExam(session, false);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }

  /* ------------------------------------------------------------------------
     VIEW 4: REAL EXAM PREFLIGHT / SETUP (Blueprint §10.1)
     ------------------------------------------------------------------------ */
  function renderRealSetup() {
    const storageCheck = E.testStorageAvailability();
    const nowMs = Date.now();

    mainEl.innerHTML = `
      <div class="setup-container">
        <div class="btn-row">
          <button type="button" class="btn btn-ghost btn-sm" id="real-back-home">← กลับหน้าหลัก</button>
        </div>

        <section class="card">
          <span class="badge badge-danger" style="margin-bottom:8px;">โหมดสอบจริง · เก็บคะแนนในคาบ</span>
          <h1 class="section-title">ลงทะเบียนผู้สอบและตรวจความพร้อมก่อนเริ่มสอบจริง</h1>
          <p class="section-subtitle">กรุณากรอกข้อมูลให้ถูกต้องและเริ่มสอบต่อหน้าครูคุมสอบ เมื่อกดเริ่มแล้วจะไม่สามารถแก้ไขข้อมูลหรือเริ่มใหม่ระหว่างสอบได้</p>

          ${!storageCheck.available ? `
            <div class="alert-banner danger" style="margin-bottom:14px;">
              <div>
                <strong>ไม่สามารถเริ่มสอบจริงบนเบราว์เซอร์นี้ได้:</strong> ${esc(storageCheck.error)}<br>
                ระบบต้องการพื้นที่จัดเก็บในเบราว์เซอร์เพื่อรักษาเวลาและผลสอบจริง กรุณาเปิดใช้คุกกี้/พื้นที่จัดเก็บข้อมูล หรือเปลี่ยนเบราว์เซอร์ และแจ้งครูคุมสอบ
              </div>
            </div>
          ` : `
            <div class="badge badge-success" style="margin-bottom:14px;">✓ ตรวจสอบพื้นที่จัดเก็บข้อมูลในเบราว์เซอร์พร้อมใช้งาน</div>
          `}

          <div class="clock-box" style="margin-bottom:14px;">
            <div>
              <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;">เวลาปัจจุบันจากนาฬิกาอุปกรณ์ (ให้ครูตรวจสอบว่าใกล้เคียงเวลาจริง)</div>
              <div class="math-font" style="font-size:1.05rem;font-weight:800;" id="preflight-clock">${esc(E.formatThaiDateTime(nowMs))}</div>
            </div>
            <span class="badge badge-warn">ไม่ซิงก์เซิร์ฟเวอร์</span>
          </div>

          <form id="real-setup-form" novalidate>
            <div class="form-grid-2">
              <div class="field-group">
                <label class="field-label" for="real-first-name">ชื่อ</label>
                <input type="text" id="real-first-name" class="text-input" maxlength="60" placeholder="เช่น สมชาย" autocomplete="given-name" required>
              </div>
              <div class="field-group">
                <label class="field-label" for="real-last-name">นามสกุล</label>
                <input type="text" id="real-last-name" class="text-input" maxlength="60" placeholder="เช่น ใจดี" autocomplete="family-name" required>
              </div>
            </div>

            <div class="form-grid-2">
              <div class="field-group">
                <label class="field-label" for="real-classroom">ชั้น / ห้อง</label>
                <input type="text" id="real-classroom" class="text-input" maxlength="30" placeholder="เช่น ม.4/1" required>
              </div>
              <div class="field-group">
                <label class="field-label" for="real-student-no">เลขที่ (1–41)</label>
                <input type="text" inputmode="numeric" id="real-student-no" class="text-input math-font" placeholder="1–41" required>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label" for="real-room-code">รหัสคาบสอบที่ครูประกาศบนกระดาน (ไม่บังคับ)</label>
              <input type="text" id="real-room-code" class="text-input math-font" maxlength="20" placeholder="เช่น PHY4-01 (เว้นว่างได้หากครูไม่ได้กำหนด)" autocomplete="off">
              <span class="field-hint">ช่วยยืนยันว่าเป็นผลสอบของคาบเรียนปัจจุบัน ไม่ใช่ภาพแคปหน้าจอเก่า</span>
            </div>

            <div class="card-inset" style="margin-bottom:14px;">
              <strong>กติกาและข้อมูลที่จะถูกบันทึกในอุปกรณ์นี้</strong>
              <ul class="rules-list">
                <li>ข้อสอบมี <strong>3 ข้อ / 15 นาที / เต็ม 10 คะแนน</strong> (ข้อ 1: 2.5 · ข้อ 2: 2.5 · ข้อ 3: 5) มีระยะทั้ง <strong>m</strong> และ <strong>cm</strong> ตอบทศนิยม 2 ตำแหน่ง (อนุโลม ±0.05) และเลือกหน่วยจากรายการให้ถูกทั้งคู่</li>
                <li>ห้ามสลับแท็บ เปิดแอปอื่น หรือออกจากหน้าสอบเพื่อช่วยตอบ ระบบอาจบันทึกสัญญาณการออกจากหน้าและ focus loss เพื่อให้ครูพิจารณา (ไม่ได้หักคะแนนอัตโนมัติ)</li>
                <li>ระบบเก็บชื่อ นามสกุล ชั้น เลขที่ คะแนน เวลาสอบ และบันทึกเหตุการณ์ไว้ <strong>ภายในเบราว์เซอร์ของอุปกรณ์นี้เท่านั้น</strong> ไม่ส่งไปยังเซิร์ฟเวอร์ภายนอก</li>
                <li>เมื่อส่งข้อสอบแล้วไม่สามารถแก้ไขคำตอบผ่านหน้าจอปกติได้ กรุณาค้างหน้าผลสอบไว้ให้ครูตรวจต่อหน้า</li>
              </ul>
            </div>

            <label class="checkbox-row" style="margin-bottom:14px;">
              <input type="checkbox" id="real-agree-chk">
              <span style="font-size:0.9rem;">ข้าพเจ้าได้อ่านและเข้าใจกติกาการสอบจริง ข้อจำกัดการบันทึกข้อมูลในเครื่อง และตรวจสอบชื่อ–ชั้น–เลขที่ถูกต้องแล้ว</span>
            </label>

            <div class="field-error hidden" id="real-setup-err" style="margin-bottom:12px;"></div>

            <button type="submit" class="btn btn-primary btn-block" id="real-start-btn" ${!storageCheck.available ? 'disabled' : ''}>
              ยืนยันข้อมูลและเริ่มสอบจริง (จับเวลา 15 นาทีทันที)
            </button>
          </form>
        </section>
      </div>
    `;

    document.getElementById('real-back-home').addEventListener('click', () => navigate('HOME'));
    appState.liveClockInterval = setInterval(() => {
      const el = document.getElementById('preflight-clock');
      if (el) el.textContent = E.formatThaiDateTime(Date.now());
    }, 1000);

    const form = document.getElementById('real-setup-form');
    const errEl = document.getElementById('real-setup-err');

    form.addEventListener('submit', e => {
      e.preventDefault();
      const existing = E.loadSession('real');
      if (existing.status === 'ok' && existing.session) {
        handleEnterRealFromHome();
        return;
      }

      const firstName = document.getElementById('real-first-name').value.trim();
      const lastName = document.getElementById('real-last-name').value.trim();
      const classroom = document.getElementById('real-classroom').value.trim();
      const roomCode = (document.getElementById('real-room-code') ? document.getElementById('real-room-code').value.trim() : '');
      const noCheck = P.validateStudentNo(document.getElementById('real-student-no').value);
      const agreed = document.getElementById('real-agree-chk').checked;

      if (!firstName || !lastName || !classroom) {
        errEl.textContent = 'กรุณากรอกชื่อ นามสกุล และชั้น/ห้องให้ครบถ้วน';
        errEl.classList.remove('hidden');
        return;
      }
      if (!noCheck.valid) {
        errEl.textContent = noCheck.error;
        errEl.classList.remove('hidden');
        return;
      }
      if (!agreed) {
        errEl.textContent = 'กรุณาทำเครื่องหมายยืนยันว่าได้อ่านกติกาการสอบก่อนเริ่มสอบ';
        errEl.classList.remove('hidden');
        return;
      }

      errEl.classList.add('hidden');
      try {
        const { session } = E.createExamSession({
          mode: 'real',
          firstName,
          lastName,
          classroom,
          roomCode,
          studentNo: noCheck.value
        });
        enterActiveExam(session, false);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  }

  /* ------------------------------------------------------------------------
     Enter / Resume Active Exam
     ------------------------------------------------------------------------ */
  function enterActiveExam(session, isResume) {
    clearBanners();
    appState.session = session;
    appState.concurrentLocked = false;
    appState.clockAnchor = E.createClockAnchor(Date.now());

    const effNow = E.getEffectiveNow(session, appState.clockAnchor);
    if (effNow >= session.deadlineAt) {
      if (session.mode === 'real' && isResume) {
        E.recordIncident(session, 'resume', effNow, { lastSeenAt: session.lastSeenAt });
      }
      triggerFinalize('timeout');
      return;
    }

    if (session.mode === 'real') {
      initTabCoordinator();
      const lockRes = appState.tabCoordinator.acquireForSession(session);
      if (!lockRes.acquired) {
        appState.concurrentLocked = true;
        navigate('REAL_ACTIVE');
        return;
      }
      if (lockRes.takeover) {
        E.addTechnicalFlag(session, 'tab_takeover', 'แท็บนี้รับช่วงต่อการสอบจริงจากแท็บเดิมที่ปิดไปแล้ว', effNow);
      }
      if (isResume) {
        E.recordIncident(session, 'resume', effNow, { lastSeenAt: session.lastSeenAt });
        const saved = E.saveSession(session);
        if (!saved.ok) showStorageErrorBanner(saved.error);
        showBanner({
          id: 'resume-info',
          kind: 'warn',
          text: 'กู้คืนเซสชันสอบจริงเดิมเรียบร้อยแล้ว (ระบบบันทึกเหตุการณ์รีเฟรช/เปิดหน้าใหม่ไว้แล้ว เวลาเดินต่อเนื่องไม่รีเซ็ต)',
          dismissible: true
        });
      }
      attachRealExamMonitor();
      navigate('REAL_ACTIVE');
    } else {
      navigate('PRACTICE_ACTIVE');
    }

    startExamTimerLoop();
    updateTimerDisplay(effNow);
  }

  function resumeExistingSession(session) {
    if (!session) return;
    if (session.status === 'finished') {
      appState.session = session;
      navigate(session.mode === 'real' ? 'REAL_RESULT' : 'PRACTICE_RESULT');
      return;
    }
    enterActiveExam(session, true);
  }

  /* ------------------------------------------------------------------------
     VIEW 5: ACTIVE EXAM (Zero Spoilers in DOM!)
     ------------------------------------------------------------------------ */
  function isQuestionAnswered(session, qId) {
    const a = session.answers && session.answers[qId];
    return Boolean(a && a.rawValue.trim() !== '' && a.unit !== '');
  }

  function renderExamActive() {
    const sess = appState.session;
    if (!sess) { navigate('HOME'); return; }

    if (sess.mode === 'real' && appState.concurrentLocked) {
      mainEl.innerHTML = `
        <section class="card" style="max-width:640px;margin:24px auto;">
          <span class="badge badge-danger" style="margin-bottom:10px;">โหมดอ่านอย่างเดียว · ตรวจพบหลายแท็บ</span>
          <h1 class="section-title">มีการสอบจริงเปิดอยู่ในแท็บอื่นของเบราว์เซอร์นี้</h1>
          <p class="section-subtitle">
            เพื่อป้องกันการเขียนทับคำตอบและเวลา ระบบล็อกแท็บนี้ไว้ชั่วคราว กรุณากลับไปทำข้อสอบในแท็บเดิมที่เปิดไว้ก่อนหน้า
          </p>
          <div class="card-inset" style="margin-bottom:14px;font-size:0.9rem;">
            Session ID: <strong class="math-font">${esc(sess.sessionId)}</strong><br>
            ผู้สอบ: <strong>${esc(sess.student.firstName)} ${esc(sess.student.lastName)}</strong> (เลขที่ ${sess.student.number})
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" id="tab-retry-takeover-btn">ตรวจสอบอีกครั้ง / ทำข้อสอบต่อในแท็บนี้ (เมื่อแท็บเดิมปิดแล้ว)</button>
          </div>
        </section>
      `;
      document.getElementById('tab-retry-takeover-btn').addEventListener('click', () => {
        const fresh = E.loadSession('real');
        if (fresh.status === 'ok' && fresh.session) resumeExistingSession(fresh.session);
      });
      return;
    }

    const qIdx = Math.max(0, Math.min(sess.activeQuestionIndex || 0, sess.questions.length - 1));
    sess.activeQuestionIndex = qIdx;
    const q = sess.questions[qIdx];
    const ans = (sess.answers && sess.answers[q.id]) || { rawValue: '', unit: '' };
    const answeredCount = sess.questions.filter(item => isQuestionAnswered(sess, item.id)).length;
    const effNow = E.getEffectiveNow(sess, appState.clockAnchor);
    const remMs = Math.max(0, sess.deadlineAt - effNow);

    const pillsHtml = sess.questions.map((item, idx) => {
      const done = isQuestionAnswered(sess, item.id);
      return `
        <button type="button" class="q-pill ${idx === qIdx ? 'is-current' : ''} ${done ? 'is-answered' : ''}" data-q-idx="${idx}" aria-label="ข้อที่ ${idx + 1} ${done ? 'ตอบแล้ว' : 'ยังไม่ครบ'}">
          <span class="answered-dot" aria-hidden="true"></span>
          <span>ข้อ ${idx + 1}</span>
        </button>
      `;
    }).join('');

    const canFullscreen = Boolean(document.documentElement.requestFullscreen) && sess.mode === 'real';
    const svgHtml = S.renderQuestionSvg(q, { showSolution: false });
    const parsedPreview = P.parseNumericAnswer(ans.rawValue);
    let syntaxNoteHtml = '';
    if (parsedPreview.status === 'invalid') {
      syntaxNoteHtml = `<div class="field-error">รูปแบบตัวเลขไม่ถูกต้อง: กรุณากรอกเฉพาะตัวเลขบวกและจุดทศนิยม (.) เท่านั้น ไม่ใส่หน่วย ลูกน้ำ หรือเศษส่วน</div>`;
    }

    mainEl.innerHTML = `
      <div class="exam-sticky-bar" role="region" aria-label="แถบเวลาและการเลือกข้อสอบ">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div class="timer-chip" id="exam-timer-chip" aria-label="เวลาคงเหลือ">
            <span aria-hidden="true">⏱</span>
            <span id="exam-timer-value">${E.formatCountdown(remMs)}</span>
          </div>
          <span id="exam-timer-warn-text" style="font-size:0.82rem;font-weight:700;color:var(--amber);"></span>
        </div>

        <div class="q-nav-pills" role="tablist" aria-label="สลับข้อสอบ">${pillsHtml}</div>

        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-neutral" id="exam-progress-badge">ตอบครบ ${answeredCount}/${sess.questions.length}</span>
          ${canFullscreen ? `<button type="button" class="btn btn-ghost btn-sm" id="exam-fs-btn" style="min-height:38px;padding:4px 10px;" title="เต็มหน้าจอ (ไม่บังคับ)">⛶</button>` : ''}
        </div>
      </div>

      <div class="exam-workspace">
        <section class="card exam-problem-pane" aria-label="โจทย์ข้อที่ ${qIdx + 1}">
          <div class="example-head">
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
              <span class="badge badge-blue">ข้อที่ ${qIdx + 1} / ${sess.questions.length}</span>
              <span class="badge badge-sky">โจทย์ฝึกแนว A-Level</span>
              <span class="badge badge-neutral">เลขที่ ${renderLatex(`n = ${sess.student.number}`, `n = ${sess.student.number}`)}</span>
            </div>
            <span class="badge badge-warn">คะแนนเต็ม ${P.formatHalfPoints(q.pointsHalf)} คะแนน</span>
          </div>

          <p class="problem-text">${renderRichText(q.problemRich, q.problemText)}</p>

          ${renderZoomableSvg(svgHtml, `exam-svg-${q.id}`, 'แผนภาพโจทย์ (ซูมเข้า/ออกได้)')}

          ${sess.mode === 'real' ? `
            <div style="font-size:0.82rem;color:var(--text-muted);display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;border-top:1px solid var(--border-subtle);padding-top:10px;">
              <span>ผู้สอบ: <strong>${esc(sess.student.firstName)} ${esc(sess.student.lastName)}</strong> (${esc(sess.student.classroom)} · เลขที่ ${sess.student.number})</span>
              <span class="math-font">Session: ${esc(sess.sessionId)}</span>
            </div>
          ` : `
            <div style="font-size:0.82rem;color:var(--text-muted);border-top:1px solid var(--border-subtle);padding-top:10px;">
              โหมดทดลองสอบ (ไม่ใช่คะแนนเก็บ) · เลขที่ ${renderLatex(`n = ${sess.student.number}`, `n = ${sess.student.number}`)}
            </div>
          `}
        </section>

        <aside class="card exam-answer-pane" aria-label="ส่วนกรอกคำตอบข้อที่ ${qIdx + 1}">
          <div>
            <h2 style="margin:0 0 4px;font-size:1.08rem;font-weight:800;">คำตอบข้อที่ ${qIdx + 1}</h2>
            <p style="margin:0;font-size:0.86rem;color:var(--text-muted);">
              ตอบเป็นทศนิยม 2 ตำแหน่ง (อนุโลมความคลาดเคลื่อน ±0.05) และเลือกหน่วยจากรายการให้ตรงตามที่โจทย์สั่ง
            </p>
          </div>

          <div class="answer-input-pair">
            <div class="field-group" style="margin-bottom:0;">
              <label class="field-label" for="exam-num-input">1) ค่าตัวเลข (ใช้จุด .)</label>
              <input
                type="text"
                inputmode="decimal"
                id="exam-num-input"
                name="ans_${esc(q.id)}"
                class="text-input input-lg math-font"
                placeholder="เช่น 0.40"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                value="${esc(ans.rawValue)}"
              >
            </div>

            <div class="field-group" style="margin-bottom:0;">
              <label class="field-label" for="exam-unit-select">2) หน่วยคำตอบ</label>
              <select
                id="exam-unit-select"
                name="unit_${esc(q.id)}"
                class="unit-select ${!ans.unit ? 'is-unselected' : ''}"
                aria-label="เลือกหน่วยคำตอบข้อที่ ${qIdx + 1}"
              >
                ${buildUnitSelectOptions(ans.unit)}
              </select>
            </div>
          </div>

          <div id="exam-syntax-feedback">${syntaxNoteHtml}</div>

          <div class="answer-status-line">
            <span id="exam-unit-status">${ans.unit ? `หน่วยที่เลือก: ${esc(UNIT_OPTION_LABELS[ans.unit] || ans.unit)}` : 'ยังไม่เลือกหน่วย'}</span>
            <span id="exam-saved-indicator">${sess.storageError ? '⚠ บันทึกในหน่วยความจำเท่านั้น' : 'บันทึกอัตโนมัติแล้ว'}</span>
          </div>

          <div class="exam-nav-actions">
            <button type="button" class="btn btn-secondary" id="exam-prev-btn" ${qIdx === 0 ? 'disabled' : ''}>← ข้อก่อนหน้า</button>
            <button type="button" class="btn btn-secondary" id="exam-next-btn" ${qIdx >= sess.questions.length - 1 ? 'disabled' : ''}>ข้อถัดไป →</button>
          </div>

          <button type="button" class="btn btn-primary btn-block" id="exam-submit-btn">
            ส่งข้อสอบ (${answeredCount}/${sess.questions.length} ข้อที่ตอบครบ)
          </button>
        </aside>
      </div>
    `;

    const numInput = document.getElementById('exam-num-input');
    const syntaxFb = document.getElementById('exam-syntax-feedback');
    const unitStatusEl = document.getElementById('exam-unit-status');
    const progressBadge = document.getElementById('exam-progress-badge');
    const submitBtn = document.getElementById('exam-submit-btn');

    const persistCurrentAnswer = () => {
      const now = E.getEffectiveNow(sess, appState.clockAnchor);
      if (now >= sess.deadlineAt) {
        triggerFinalize('timeout');
        return;
      }
      sess.lastSeenAt = now;
      const saved = E.saveSession(sess);
      const savedEl = document.getElementById('exam-saved-indicator');
      if (!saved.ok && sess.mode === 'real') {
        showStorageErrorBanner(saved.error);
        if (savedEl) savedEl.textContent = '⚠ บันทึกลงเบราว์เซอร์ไม่ได้!';
      } else if (savedEl) {
        savedEl.textContent = saved.persisted ? 'บันทึกอัตโนมัติแล้ว' : 'บันทึกในหน่วยความจำชั่วคราว';
      }

      const cnt = sess.questions.filter(it => isQuestionAnswered(sess, it.id)).length;
      if (progressBadge) progressBadge.textContent = `ตอบครบ ${cnt}/${sess.questions.length}`;
      if (submitBtn) submitBtn.textContent = `ส่งข้อสอบ (${cnt}/${sess.questions.length} ข้อที่ตอบครบ)`;
      mainEl.querySelectorAll('.q-pill').forEach(pill => {
        const i = Number(pill.getAttribute('data-q-idx'));
        pill.classList.toggle('is-answered', isQuestionAnswered(sess, sess.questions[i].id));
      });
    };

    numInput.addEventListener('input', () => {
      sess.answers[q.id] = sess.answers[q.id] || { rawValue: '', unit: '' };
      sess.answers[q.id].rawValue = numInput.value;
      const p = P.parseNumericAnswer(numInput.value);
      syntaxFb.innerHTML = p.status === 'invalid'
        ? '<div class="field-error">รูปแบบตัวเลขไม่ถูกต้อง: กรุณากรอกเฉพาะตัวเลขบวกและจุดทศนิยม (.) เท่านั้น ไม่ใส่หน่วย ลูกน้ำ หรือเศษส่วน</div>'
        : '';
      persistCurrentAnswer();
    });

    const unitSelectEl = document.getElementById('exam-unit-select');
    if (unitSelectEl) {
      unitSelectEl.addEventListener('change', () => {
        const chosen = unitSelectEl.value;
        sess.answers[q.id] = sess.answers[q.id] || { rawValue: '', unit: '' };
        sess.answers[q.id].unit = chosen;
        unitSelectEl.classList.toggle('is-unselected', !chosen);
        unitStatusEl.textContent = chosen ? `หน่วยที่เลือก: ${UNIT_OPTION_LABELS[chosen] || chosen}` : 'ยังไม่เลือกหน่วย';
        persistCurrentAnswer();
      });
    }

    mainEl.querySelectorAll('[data-q-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        sess.activeQuestionIndex = Number(btn.getAttribute('data-q-idx'));
        E.saveSession(sess);
        renderExamActive();
      });
    });

    document.getElementById('exam-prev-btn').addEventListener('click', () => {
      if (qIdx > 0) { sess.activeQuestionIndex = qIdx - 1; E.saveSession(sess); renderExamActive(); }
    });
    document.getElementById('exam-next-btn').addEventListener('click', () => {
      if (qIdx < sess.questions.length - 1) { sess.activeQuestionIndex = qIdx + 1; E.saveSession(sess); renderExamActive(); }
    });

    const fsBtn = document.getElementById('exam-fs-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      });
    }

    submitBtn.addEventListener('click', () => {
      const now = E.getEffectiveNow(sess, appState.clockAnchor);
      if (now >= sess.deadlineAt) { triggerFinalize('timeout'); return; }
      const missingList = [];
      sess.questions.forEach((item, idx) => {
        const a = sess.answers[item.id] || { rawValue: '', unit: '' };
        if (!a.rawValue.trim() && !a.unit) missingList.push(`ข้อ ${idx + 1} (ยังไม่ได้ตอบ)`);
        else if (!a.rawValue.trim()) missingList.push(`ข้อ ${idx + 1} (ยังไม่ได้กรอกตัวเลข)`);
        else if (!a.unit) missingList.push(`ข้อ ${idx + 1} (ยังไม่ได้เลือกหน่วย)`);
      });

      const warnHtml = missingList.length > 0
        ? `<div class="alert-banner warn" style="margin:0 0 12px;"><div><strong>ยังมี ${missingList.length} ข้อที่ตอบไม่ครบ:</strong><br>${missingList.map(esc).join(' · ')}</div></div>`
        : `<div class="badge badge-success" style="margin-bottom:12px;">✓ ตอบครบทั้ง ${sess.questions.length} ข้อแล้ว</div>`;

      openModal({
        title: sess.mode === 'real' ? 'ยืนยันการส่งข้อสอบจริง?' : 'ยืนยันการส่งทดลองสอบ?',
        bodyHtml: `
          ${warnHtml}
          <p style="margin:0;">เมื่อยืนยันส่งแล้ว ระบบจะตรวจคะแนนและแสดงเฉลยทันที${sess.mode === 'real' ? ' และจะไม่สามารถกลับมาแก้ไขคำตอบในรอบนี้ได้' : ''}</p>
        `,
        buttons: [
          { label: 'กลับไปตรวจสอบ', variant: 'btn-secondary', onClick: closeModal },
          { label: 'ยืนยันส่งข้อสอบ', variant: 'btn-primary', onClick: () => triggerFinalize('manual') }
        ]
      });
    });

    updateTimerDisplay(effNow);
  }

  /* ------------------------------------------------------------------------
     VIEW 6: RESULTS SCREEN (Blueprint §13)
     ------------------------------------------------------------------------ */
  function renderResult(session) {
    if (!session || !session.result) { navigate('HOME'); return; }

    const isReal = session.mode === 'real';
    const res = session.result;
    const integ = res.integritySummary || {};
    const durationMs = Math.max(0, Math.min(P.DURATION_MS, (session.endedAt || session.deadlineAt) - session.startedAt));
    const delayedFinalize = session.finalizedAt && (session.finalizedAt - session.endedAt > 2000);
    const hasClockAnomaly = (session.flags || []).some(f => f.code === 'clock_anomaly');

    const modeBadgeHtml = isReal
      ? '<span class="badge badge-danger" style="font-size:0.86rem;padding:6px 12px;">📋 ผลการสอบจริง (Real Exam)</span>'
      : '<span class="badge badge-sky" style="font-size:0.86rem;padding:6px 12px;">🧪 ผลทดลองสอบ — ไม่ใช่คะแนนเก็บ</span>';

    const saveStatusBadge = session.storageError
      ? '<span class="badge badge-danger">⚠ มีข้อผิดพลาดการบันทึก (storageError) — แจ้งครูทันที</span>'
      : (isReal ? '<span class="badge badge-success">✓ บันทึกผลลงเบราว์เซอร์แล้ว</span>' : '<span class="badge badge-neutral">บันทึกชั่วคราวสำหรับฝึกฝน</span>');

    const integBadgesHtml = isReal
      ? (integ.statusBadges || []).map(b => {
          const cls = b.kind === 'clean' ? 'badge-success' : b.kind === 'review' ? 'badge-warn' : 'badge-danger';
          const icon = b.kind === 'clean' ? '✓' : '⚠';
          return `<span class="badge ${cls}">${icon} ${esc(b.label)}</span>`;
        }).join(' ')
      : '';

    const studentBlockHtml = isReal ? `
      <div style="margin:10px 0 12px;">
        <div style="font-size:1.2rem;font-weight:800;">${esc(session.student.firstName)} ${esc(session.student.lastName)}</div>
        <div style="font-size:0.94rem;color:var(--text-secondary);">ชั้น/ห้อง: <strong>${esc(session.student.classroom)}</strong> · เลขที่: <strong class="math-font">${session.student.number}</strong></div>
      </div>
    ` : `
      <div style="margin:10px 0 12px;">
        <div style="font-size:1.08rem;font-weight:800;">ผู้ทดลองสอบ เลขที่ <span class="math-font">${session.student.number}</span></div>
        <div style="font-size:0.86rem;color:var(--text-muted);">โหมดทดลองสอบไม่ได้เก็บชื่อ–นามสกุล และไม่ใช่คะแนนเก็บ</div>
      </div>
    `;

    let integritySectionHtml = '';
    if (isReal) {
      const incidentRows = (session.incidents || []).map(inc => {
        const typeLabel = inc.type === 'hidden' ? 'ออกจากหน้า/สลับแท็บ (hidden)'
          : inc.type === 'focus-only' ? 'หน้าต่างหลุดโฟกัส (focus-only)'
            : inc.type === 'resume' ? 'รีเฟรช / เปิดหน้าสอบใหม่ (resume)'
              : 'ออกจากโหมดเต็มหน้าจอ';
        const durText = inc.durationMs > 0
          ? `${inc.estimated ? 'ประมาณ ' : ''}${E.formatDurationThai(inc.durationMs)}`
          : 'ช่วงสั้น (< 1 วินาที)';
        return `
          <div class="timeline-item">
            <div><strong>${esc(inc.incidentId)}</strong> · ${esc(typeLabel)}</div>
            <div class="math-font" style="color:var(--text-secondary);">
              ${esc(E.formatThaiTime(inc.startAt))} → ${inc.endAt ? esc(E.formatThaiTime(inc.endAt)) : 'ปิดเมื่อส่ง'} (${esc(durText)})
            </div>
          </div>
        `;
      }).join('');

      const flagRows = (session.flags || []).map(fl => `
        <div class="timeline-item">
          <div><span class="badge badge-danger">${esc(fl.code)}</span> ${esc(fl.detail)}</div>
          <div class="math-font" style="color:var(--text-muted);">${esc(E.formatThaiTime(fl.at))}</div>
        </div>
      `).join('');

      integritySectionHtml = `
        <section class="card integrity-card">
          <div class="example-head">
            <h2 class="section-title" style="margin:0;font-size:1.08rem;">บันทึกเหตุการณ์การสอบ (สำหรับครูพิจารณา)</h2>
            <div class="btn-row">${integBadgesHtml}</div>
          </div>

          <div class="integrity-stats">
            <div class="stat-tile"><div class="stat-num">${integ.hiddenCount}</div><div class="stat-lbl">ออกจากหน้า (hidden)</div></div>
            <div class="stat-tile"><div class="stat-num">${integ.focusOnlyCount}</div><div class="stat-lbl">หลุดโฟกัส (focus-only)</div></div>
            <div class="stat-tile"><div class="stat-num">${integ.resumeCount}</div><div class="stat-lbl">รีเฟรช/เปิดใหม่ (resume)</div></div>
            <div class="stat-tile"><div class="stat-num" style="font-size:1rem;">${esc(E.formatDurationThai(integ.awayMs))}</div><div class="stat-lbl">เวลาออกจากหน้ารวม</div></div>
          </div>

          <p style="margin:0;font-size:0.85rem;color:var(--text-muted);">
            หมายเหตุ: สัญญาณออกจากหน้าหรือ focus-only เป็นข้อมูลประกอบให้ครูพิจารณาเท่านั้น ไม่ใช่หลักฐานยืนยันการใช้ AI และระบบไม่ได้หักคะแนนอัตโนมัติ
          </p>

          ${incidentRows ? `
            <details>
              <summary style="cursor:pointer;font-weight:700;font-size:0.9rem;">ดูไทม์ไลน์เหตุการณ์ทั้งหมด (${session.incidents.length} รายการ)</summary>
              <div class="timeline-list" style="margin-top:8px;">${incidentRows}</div>
            </details>
          ` : ''}

          ${flagRows ? `
            <div>
              <div style="font-size:0.86rem;font-weight:700;color:var(--danger);margin-bottom:6px;">ธงทางเทคนิค (Technical Flags)</div>
              <div class="timeline-list">${flagRows}</div>
            </div>
          ` : ''}
        </section>
      `;
    }

    const itemsHtml = session.questions.map((q, idx) => {
      const item = res.items[idx];
      const sol = P.solveQuestion(q);
      const isExpanded = appState.resultExpanded[q.id] !== false;

      const numBadge = item.numericStatus === 'correct'
        ? '<span class="badge badge-success">✓ ค่าตัวเลขถูก</span>'
        : item.numericStatus === 'unanswered'
          ? '<span class="badge badge-neutral">— ไม่ได้กรอกตัวเลข</span>'
          : '<span class="badge badge-danger">✕ ค่าตัวเลขผิด</span>';

      const unitBadge = item.unitStatus === 'correct'
        ? '<span class="badge badge-success">✓ หน่วยถูก</span>'
        : item.unitStatus === 'unselected'
          ? '<span class="badge badge-neutral">— ไม่ได้เลือกหน่วย</span>'
          : '<span class="badge badge-danger">✕ หน่วยผิด</span>';

      const studentAnsDisplay = (item.rawValue.trim() ? item.rawValue.trim() : 'ไม่ได้ตอบ')
        + (item.unit ? ` ${item.unit}` : ' (ไม่ได้เลือกหน่วย)');

      const correctLatex = item.needsRoundingNote
        ? `${item.expectedRound2Text}\\text{ ${item.expectedUnit}} \\;(\\text{ค่าแม่นยำ } ${item.expectedExactText}\\text{ ${item.expectedUnit}})`
        : `${item.expectedRound2Text}\\text{ ${item.expectedUnit}}`;

      return `
        <article class="card result-item-card">
          <div class="result-item-head">
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
              <span class="badge badge-blue">ข้อที่ ${idx + 1} (${esc(q.templateId)})</span>
              <span class="badge badge-sky">โจทย์ฝึกแนว A-Level</span>
              <span class="badge ${item.isCorrect ? 'badge-success' : 'badge-danger'}">
                ${item.isCorrect ? '✓ ได้คะแนนเต็ม' : '✕ 0 คะแนน'} · ${P.formatHalfPoints(item.earnedHalf)} / ${P.formatHalfPoints(item.pointsHalf)} คะแนน
              </span>
            </div>
            <button type="button" class="btn btn-ghost btn-sm no-print" data-toggle-res-sol="${esc(q.id)}">
              ${isExpanded ? '▲ ซ่อนเฉลย' : '▼ แสดงเฉลยละเอียด'}
            </button>
          </div>

          <p class="problem-text">${renderRichText(q.problemRich, q.problemText)}</p>

          <div class="answer-compare-grid">
            <div class="compare-box">
              <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;margin-bottom:4px;">คำตอบที่ผู้สอบส่ง</div>
              <div class="math-font" style="font-size:1.05rem;font-weight:800;margin-bottom:6px;">${esc(studentAnsDisplay)}</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">${numBadge} ${unitBadge}</div>
            </div>
            <div class="compare-box">
              <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;margin-bottom:4px;">คำตอบที่ถูกต้อง</div>
              <div style="font-size:1.1rem;font-weight:800;color:var(--success);margin-bottom:6px;">${renderLatex(correctLatex, `${item.expectedExactText} ${item.expectedUnit}`)}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">เกณฑ์ตรวจ: ทศนิยม 2 ตำแหน่ง (±0.05) และเลือกหน่วยตรงตามที่โจทย์สั่งทั้งคู่</div>
            </div>
          </div>

          ${isExpanded ? buildSolutionHtml(q, sol, { mode: 'all', idPrefix: `res-${idx}`, allowStepToggle: false }) : ''}
        </article>
      `;
    }).join('');

    const bottomControlsHtml = isReal ? `
      <section class="card teacher-zone no-print">
        <details>
          <summary style="cursor:pointer;font-weight:800;font-size:0.94rem;color:var(--text-secondary);">
            🔒 สำหรับครูคุมสอบ: เริ่มรอบใหม่ / ล้างข้อมูลบนอุปกรณ์นี้ (หลังตรวจและบันทึกคะแนนเรียบร้อยแล้วเท่านั้น)
          </summary>
          <div style="margin-top:12px;">
            <p style="margin:0 0 10px;font-size:0.86rem;color:var(--text-muted);">
              ใช้เมื่อครูได้ตรวจคะแนนและพิมพ์/ดาวน์โหลดหลักฐานของนักเรียนคนปัจจุบันเสร็จแล้ว หรือเมื่อต้องใช้อุปกรณ์ร่วมกันหลายคน
              (หมายเหตุ: แอปแบบ static ไม่มีการยืนยันตัวตนสิทธิ์ครูจริง ขั้นตอนนี้เป็นการป้องกันการเผลอกดรีเซ็ตเท่านั้น โดยจะเก็บ Session ID เดิมไว้ในบันทึกประวัติเครื่อง)
            </p>
            <div class="btn-row">
              <button type="button" class="btn btn-danger btn-sm" id="teacher-new-round-btn">เริ่มรอบใหม่โดยครู (ล้างผลสอบปัจจุบัน)</button>
              <button type="button" class="btn btn-ghost btn-sm" id="result-back-home-btn">กลับหน้าหลัก (ผลสอบนี้จะยังคงถูกเก็บไว้)</button>
            </div>
          </div>
        </details>
      </section>
    ` : `
      <div class="btn-row no-print" style="justify-content:center;padding:8px 0;">
        <button type="button" class="btn btn-primary" id="practice-retry-btn">🔄 ทดลองสอบชุดใหม่ (สุ่มตัวเลขใหม่)</button>
        <button type="button" class="btn btn-secondary" id="practice-to-learn-btn">📘 กลับไปทบทวนโหมดเรียน</button>
        <button type="button" class="btn btn-ghost" id="result-back-home-btn">← กลับหน้าหลัก</button>
      </div>
    `;

    const isPerfect = res.scoreHalf === res.maxHalf;
    const gifInfo = CEL ? CEL.pickGif(appState.celebrateGifIndex) : null;
    const celebrateBannerHtml = isPerfect && gifInfo ? `
      <section class="card celebrate-banner no-print" id="perfect-celebrate-card">
        <span class="badge badge-warn" style="font-size:0.9rem;padding:6px 14px;">🎉 เมี๊ยว!! คะแนนเต็ม 10 / 10 สุดยอดมาก!! 🐾</span>
        <div class="celebrate-gif-frame">
          <img
            id="res-celebrate-gif"
            class="celebrate-gif-img"
            src="${esc(gifInfo.url)}"
            alt="GIF แมวเต้นฉลองคะแนนเต็ม 10 คะแนน"
            onerror="this.onerror=null;this.src='${esc(CEL.FALLBACK_IMAGE)}';this.classList.add('is-fallback-dance');"
          >
        </div>
        <div id="res-celebrate-caption" style="font-weight:800;font-size:1rem;color:var(--accent);">${esc(gifInfo.caption)}</div>
        <div class="btn-row" style="justify-content:center;">
          <button type="button" class="btn btn-primary btn-sm" id="res-replay-celebrate-btn">🎵 เล่นเพลงและโปรยพลุอีกครั้ง</button>
          <button type="button" class="btn btn-secondary btn-sm" id="res-next-gif-btn">🐱 เปลี่ยน GIF แมวเต้น</button>
          <button type="button" class="btn btn-ghost btn-sm" id="res-stop-music-btn">🔇 ปิดเสียง</button>
        </div>
      </section>
    ` : `
      <div class="cat-buddy-strip no-print" style="margin-bottom:0;">
        <img src="assets/cat-study.jpg" alt="น้องแมวส้มอ้วนให้กำลังใจ" class="cat-buddy-thumb" loading="lazy">
        <div>
          <strong style="color:var(--accent);font-size:0.96rem;">${res.scoreHalf >= 14 ? 'เก่งมากเลยเมี๊ยว! อีกนิดเดียวก็เต็ม 10 แล้ว 🐾' : 'ไม่เป็นไรนะเมี๊ยว! ค่อย ๆ ดูเฉลยทีละขั้นแล้วลองฝึกใหม่ได้เสมอ 🐱🧡'}</strong>
          <div style="font-size:0.85rem;color:var(--text-secondary);">ถ้าสอบได้คะแนนเต็ม 10 / 10 น้องแมวส้มจะออกมาเต้นฉลองพร้อมเสียงเพลงให้ดูเลยนะ!</div>
        </div>
      </div>
    `;

    mainEl.innerHTML = `
      <div class="result-shell">
        <section class="card result-hero ${isReal ? 'is-real' : ''}">
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
            ${modeBadgeHtml}
            ${saveStatusBadge}
          </div>

          <div class="result-hero-grid">
            <div>
              ${studentBlockHtml}
              <div class="score-display-box">
                <div>
                  <div style="font-size:0.84rem;color:var(--text-muted);font-weight:700;">คะแนนรวม</div>
                  <div class="score-big">${esc(res.scoreDisplay)} <span style="font-size:1.15rem;color:var(--text-secondary);">/ ${esc(res.maxDisplay)} คะแนน</span></div>
                </div>
                <div style="text-align:right;">
                  <div class="badge ${res.correctCount === res.totalCount ? 'badge-success' : 'badge-blue'}">ถูก ${res.correctCount} / ${res.totalCount} ข้อ</div>
                  <div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;">
                    ${res.items.map((it, i) => `Q${i + 1}: ${P.formatHalfPoints(it.earnedHalf)}`).join(' · ')}
                  </div>
                </div>
              </div>
              ${isReal ? `
                <div class="start-time-callout">
                  <div>
                    <div class="start-time-lbl">เวลาเริ่มสอบ (เทียบกับเวลาเริ่มคาบ)</div>
                    <div class="start-time-val math-font">${esc(E.formatThaiTime(session.startedAt))}</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="start-time-lbl">${session.roomCode ? 'รหัสคาบสอบ' : 'เวลาที่ใช้'}</div>
                    <div class="start-time-val math-font">${session.roomCode ? esc(session.roomCode) : esc(E.formatDurationThai(durationMs))}</div>
                  </div>
                </div>
                <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${integBadgesHtml}</div>
              ` : ''}
            </div>

            <div>
              <div class="meta-kv-grid">
                <div class="meta-kv"><span class="meta-k">วันที่เริ่มสอบ</span><span class="meta-v">${esc(E.formatThaiDate(session.startedAt))}</span></div>
                <div class="meta-kv"><span class="meta-k">เวลาเริ่มสอบ</span><span class="meta-v math-font">${esc(E.formatThaiTime(session.startedAt))}</span></div>
                <div class="meta-kv"><span class="meta-k">${delayedFinalize ? 'สิ้นสุดตามกำหนดเวลา' : 'สิ้นสุดการสอบ'}</span><span class="meta-v math-font">${esc(E.formatThaiDateTime(session.endedAt))}</span></div>
                ${delayedFinalize ? `<div class="meta-kv"><span class="meta-k">เวลาประมวลผลและบันทึกผล</span><span class="meta-v math-font">${esc(E.formatThaiDateTime(session.finalizedAt))}</span></div>` : ''}
                <div class="meta-kv"><span class="meta-k">เวลาที่ใช้</span><span class="meta-v">${esc(E.formatDurationThai(durationMs))} / 15 นาที</span></div>
                <div class="meta-kv"><span class="meta-k">สิ้นสุดโดย</span><span class="meta-v">${session.submitReason === 'timeout' ? 'หมดเวลา (ส่งอัตโนมัติ)' : 'นักเรียนกดส่ง'}</span></div>
                <div class="meta-kv"><span class="meta-k">Session ID</span><span class="meta-v math-font">${esc(session.sessionId)}</span></div>
                <div class="meta-kv"><span class="meta-k">แหล่งเวลา</span><span class="meta-v">${hasClockAnomaly ? '⚠ นาฬิกาอุปกรณ์ (พบความผิดปกติเวลา)' : 'นาฬิกาอุปกรณ์ (ไม่ใช่เวลาจากเซิร์ฟเวอร์)'}</span></div>
              </div>
            </div>
          </div>

          <div class="btn-row no-print" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);">
            ${isReal ? '<button type="button" class="btn btn-primary btn-sm" id="res-teacher-view-btn">👩‍🏫 แสดงผลให้ครูตรวจ</button>' : ''}
            <button type="button" class="btn btn-secondary btn-sm" id="res-print-btn">🖨 พิมพ์ / บันทึก PDF</button>
            <button type="button" class="btn btn-secondary btn-sm" id="res-export-json-btn">⬇ ดาวน์โหลดผลสอบ JSON</button>
            <button type="button" class="btn btn-ghost btn-sm" id="res-copy-btn">📋 คัดลอกสรุปคะแนน</button>
          </div>
        </section>

        ${celebrateBannerHtml}

        ${integritySectionHtml}

        <section>
          <h2 class="section-title" style="margin-bottom:12px;">ผลคะแนนรายข้อและเฉลยละเอียดทุกข้อ</h2>
          <div style="display:flex;flex-direction:column;gap:14px;">${itemsHtml}</div>
        </section>

        ${bottomControlsHtml}
      </div>
    `;

    const teacherBtn = document.getElementById('res-teacher-view-btn');
    if (teacherBtn) teacherBtn.addEventListener('click', () => openTeacherCompactModal(session));
    document.getElementById('res-print-btn').addEventListener('click', () => window.print());
    document.getElementById('res-export-json-btn').addEventListener('click', () => {
      const { filename } = E.exportResult(session);
      showBanner({
        id: 'export-ok',
        kind: 'info',
        text: `ดาวน์โหลดไฟล์ ${filename} เรียบร้อยแล้ว (ไฟล์นี้สร้างจากเครื่องผู้สอบ เป็นหลักฐานประกอบไม่ใช่ใบรับรองจากเซิร์ฟเวอร์)`,
        dismissible: true
      });
    });

    document.getElementById('res-copy-btn').addEventListener('click', () => {
      const summary = E.buildSummaryText(session);
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(summary).then(() => {
          showBanner({ id: 'copy-ok', kind: 'info', text: 'คัดลอกสรุปคะแนนไปยังคลิปบอร์ดแล้ว', dismissible: true });
        }).catch(() => openCopyFallbackModal(summary));
      } else {
        openCopyFallbackModal(summary);
      }
    });

    mainEl.querySelectorAll('[data-toggle-res-sol]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-toggle-res-sol');
        appState.resultExpanded[qid] = !(appState.resultExpanded[qid] !== false);
        renderResult(session);
      });
    });

    const backHomeBtn = document.getElementById('result-back-home-btn');
    if (backHomeBtn) backHomeBtn.addEventListener('click', () => navigate('HOME'));
    const retryBtn = document.getElementById('practice-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => navigate('PRACTICE_SETUP'));
    const toLearnBtn = document.getElementById('practice-to-learn-btn');
    if (toLearnBtn) toLearnBtn.addEventListener('click', () => navigate('LEARN'));
    const teacherNewRoundBtn = document.getElementById('teacher-new-round-btn');
    if (teacherNewRoundBtn) teacherNewRoundBtn.addEventListener('click', () => openTeacherNewRoundModal(session));

    const replayCelBtn = document.getElementById('res-replay-celebrate-btn');
    if (replayCelBtn && CEL) {
      replayCelBtn.addEventListener('click', () => {
        CEL.launchConfetti();
        CEL.playVictorySong();
      });
    }
    const nextGifBtn = document.getElementById('res-next-gif-btn');
    if (nextGifBtn && CEL) {
      nextGifBtn.addEventListener('click', () => {
        appState.celebrateGifIndex = (appState.celebrateGifIndex + 1) % CEL.DANCING_CAT_GIFS.length;
        const nextG = CEL.pickGif(appState.celebrateGifIndex);
        const img = document.getElementById('res-celebrate-gif');
        const cap = document.getElementById('res-celebrate-caption');
        if (img) {
          img.classList.remove('is-fallback-dance');
          img.src = nextG.url;
        }
        if (cap) cap.textContent = nextG.caption;
        CEL.launchConfetti();
      });
    }
    const stopMusicBtn = document.getElementById('res-stop-music-btn');
    if (stopMusicBtn && CEL) {
      stopMusicBtn.addEventListener('click', () => CEL.stopVictorySong());
    }
  }

  function openPerfectScoreModal(session) {
    if (!CEL) return;
    const gifInfo = CEL.pickGif(appState.celebrateGifIndex);
    openModal({
      title: '🎉 ยินดีด้วยเมี๊ยว! คะแนนเต็ม 10 / 10!! 🐱✨',
      bodyHtml: `
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div class="celebrate-gif-frame">
            <img
              id="modal-celebrate-gif"
              class="celebrate-gif-img"
              src="${esc(gifInfo.url)}"
              alt="GIF แมวเต้นฉลองคะแนนเต็ม 10 คะแนน"
              onerror="this.onerror=null;this.src='${esc(CEL.FALLBACK_IMAGE)}';this.classList.add('is-fallback-dance');"
            >
          </div>
          <div style="font-size:1.15rem;font-weight:800;color:var(--accent);">${esc(gifInfo.caption)}</div>
          <p style="margin:0;color:var(--text-secondary);">
            ${session.mode === 'real'
              ? `เก่งสุด ๆ เลย <strong>${esc(session.student.firstName)} ${esc(session.student.lastName)}</strong>! เก็บเต็ม 10 / 10 คะแนนเรียบร้อย กดปิดเพื่อแสดงหน้าผลสอบให้ครูตรวจได้เลยนะ 🐾`
              : 'ตอบถูกทั้ง 3 ข้อ เต็ม 10 / 10 คะแนน! พร้อมลุยสนามสอบจริงแล้วเมี๊ยว 🐾'}
          </p>
        </div>
      `,
      buttons: [
        {
          label: '🎵 เล่นเพลงอีกครั้ง',
          variant: 'btn-secondary',
          onClick: () => {
            CEL.launchConfetti();
            CEL.playVictorySong();
          }
        },
        {
          label: session.mode === 'real' ? 'ดูหน้าผลสอบให้ครูตรวจ 🐾' : 'ดูเฉลยละเอียด 🐾',
          variant: 'btn-primary',
          onClick: () => closeModal()
        }
      ],
      onClose: () => {
        if (CEL) CEL.stopVictorySong();
      }
    });
  }

  function openTeacherCompactModal(session) {
    const res = session.result;
    const integ = res.integritySummary;
    const durationMs = Math.max(0, Math.min(P.DURATION_MS, (session.endedAt || session.deadlineAt) - session.startedAt));
    const itemSummaryHtml = res.items.map((it, idx) => `
      <div class="meta-kv">
        <span class="meta-k">ข้อ ${idx + 1} (${esc(it.templateId)}) — ตอบ: ${esc(it.rawValue || '—')} ${esc(it.unit || '')}</span>
        <span class="meta-v">${it.isCorrect ? '✓' : '✕'} ${P.formatHalfPoints(it.earnedHalf)} / ${P.formatHalfPoints(it.pointsHalf)}</span>
      </div>
    `).join('');

    openModal({
      title: 'หน้าสรุปผลการสอบจริงสำหรับครูตรวจ',
      wide: true,
      bodyHtml: `
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;">
          <div>
            <span class="badge badge-danger">ผลการสอบจริง</span>
            <h3 style="margin:6px 0 2px;font-size:1.3rem;">${esc(session.student.firstName)} ${esc(session.student.lastName)}</h3>
            <div style="color:var(--text-secondary);">ชั้น <strong>${esc(session.student.classroom)}</strong> · เลขที่ <strong class="math-font">${session.student.number}</strong></div>
          </div>
          <div style="text-align:right;padding:12px 18px;border-radius:14px;background:var(--accent-soft);border:1.5px solid rgba(255,148,66,0.42);">
            <div style="font-size:0.8rem;color:var(--text-secondary);font-weight:700;">คะแนนที่ได้</div>
            <div class="score-big" style="font-size:2.1rem;">${esc(res.scoreDisplay)} / ${esc(res.maxDisplay)}</div>
          </div>
        </div>

        <div class="meta-kv-grid" style="margin-bottom:12px;">
          <div class="meta-kv"><span class="meta-k">Session ID</span><span class="meta-v math-font">${esc(session.sessionId)}</span></div>
          ${session.roomCode ? `<div class="meta-kv"><span class="meta-k">รหัสคาบสอบ</span><span class="meta-v math-font" style="color:var(--accent);">${esc(session.roomCode)}</span></div>` : ''}
          <div class="meta-kv"><span class="meta-k">เริ่มสอบ (เทียบเวลาเริ่มคาบ)</span><span class="meta-v math-font" style="color:var(--accent);">${esc(E.formatThaiDateTime(session.startedAt))}</span></div>
          <div class="meta-kv"><span class="meta-k">สิ้นสุดสอบ</span><span class="meta-v math-font">${esc(E.formatThaiDateTime(session.endedAt))}</span></div>
          <div class="meta-kv"><span class="meta-k">เวลาที่ใช้ / วิธีส่ง</span><span class="meta-v">${esc(E.formatDurationThai(durationMs))} · ${session.submitReason === 'timeout' ? 'หมดเวลา' : 'กดส่ง'}</span></div>
          <div class="meta-kv"><span class="meta-k">เหตุการณ์ออกจากหน้า</span><span class="meta-v">hidden: ${integ.hiddenCount} · focus-only: ${integ.focusOnlyCount} · resume: ${integ.resumeCount} · รวม ${esc(E.formatDurationThai(integ.awayMs))}</span></div>
          <div class="meta-kv"><span class="meta-k">สถานะการบันทึก / แหล่งเวลา</span><span class="meta-v">${session.storageError ? '⚠ storageError' : '✓ บันทึกแล้ว'} · นาฬิกาอุปกรณ์</span></div>
        </div>

        <div style="font-weight:700;font-size:0.88rem;margin-bottom:6px;">คะแนนแยกรายข้อ</div>
        <div class="meta-kv-grid">${itemSummaryHtml}</div>
      `,
      buttons: [
        { label: 'พิมพ์ / PDF', variant: 'btn-secondary', onClick: () => { closeModal(); window.print(); } },
        { label: 'ปิดหน้าต่าง', variant: 'btn-primary', onClick: closeModal }
      ]
    });
  }

  function openCopyFallbackModal(summaryText) {
    openModal({
      title: 'คัดลอกสรุปคะแนน',
      bodyHtml: `
        <p style="margin:0 0 8px;">กรุณาเลือกข้อความด้านล่างเพื่อคัดลอก:</p>
        <textarea id="copy-fallback-ta" class="text-input math-font" rows="10" readonly style="font-size:0.84rem;">${esc(summaryText)}</textarea>
      `,
      buttons: [{ label: 'ปิด', variant: 'btn-primary', onClick: closeModal }]
    });
    const ta = document.getElementById('copy-fallback-ta');
    if (ta) { ta.focus(); ta.select(); }
  }

  function openTeacherNewRoundModal(session) {
    openModal({
      title: 'ยืนยันเริ่มรอบใหม่โดยครูคุมสอบ',
      bodyHtml: `
        <div class="alert-banner warn" style="margin:0 0 12px;">
          <div>การดำเนินการนี้จะล้างผลการสอบปัจจุบันของ <strong>${esc(session.student.firstName)} ${esc(session.student.lastName)}</strong> (Session <span class="math-font">${esc(session.sessionId)}</span>) ออกจากหน้าหลักของเบราว์เซอร์นี้ เพื่อเปิดให้ลงทะเบียนสอบรอบใหม่</div>
        </div>
        <p style="font-size:0.86rem;color:var(--text-secondary);margin:0 0 12px;">
          ระบบจะเก็บเฉพาะรหัส Session ID และเวลาสิ้นสุดเดิมไว้ในประวัติเครื่อง (ไม่เก็บชื่อ) กรุณาตรวจสอบว่าครูได้บันทึกคะแนนหรือดาวน์โหลดไฟล์ JSON ของรอบเดิมเรียบร้อยแล้ว
        </p>
        <label class="checkbox-row">
          <input type="checkbox" id="teacher-confirm-chk">
          <span style="font-size:0.9rem;">ยืนยันว่าครูคุมสอบได้ตรวจและเก็บผลสอบของรอบเดิมเรียบร้อยแล้ว</span>
        </label>
      `,
      buttons: [
        { label: 'ยกเลิก', variant: 'btn-secondary', onClick: closeModal },
        {
          id: 'teacher-confirm-go',
          label: 'ล้างผลเดิมและเริ่มรอบใหม่',
          variant: 'btn-danger',
          disabled: true,
          onClick: () => {
            E.appendRealHistorySummary({
              sessionId: session.sessionId,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              submitReason: session.submitReason,
              scoreHalf: session.result ? session.result.scoreHalf : null,
              clearedAt: Date.now(),
              action: 'new_round_by_teacher'
            });
            E.clearSession('real');
            appState.session = null;
            closeModal();
            navigate('REAL_SETUP');
          }
        }
      ]
    });

    const chk = document.getElementById('teacher-confirm-chk');
    const goBtn = document.getElementById('teacher-confirm-go');
    if (chk && goBtn) chk.addEventListener('change', () => { goBtn.disabled = !chk.checked; });
  }

  /* ------------------------------------------------------------------------
     VIEW 7: CORRUPTED REAL SESSION ALERT
     ------------------------------------------------------------------------ */
  function renderCorruptedReal() {
    mainEl.innerHTML = `
      <section class="card" style="max-width:680px;margin:20px auto;">
        <span class="badge badge-danger" style="margin-bottom:10px;">⚠ ตรวจพบข้อมูลสอบจริงเสียหาย</span>
        <h1 class="section-title">ไม่สามารถอ่านข้อมูลการสอบจริงที่บันทึกไว้ได้</h1>
        <p class="section-subtitle">
          ระบบตรวจพบข้อมูลในพื้นที่จัดเก็บของเบราว์เซอร์ที่ไม่สมบูรณ์หรือเสียหาย เพื่อความโปร่งใส ระบบจะไม่สร้างคะแนนใหม่หรือล้างข้อมูลโดยอัตโนมัติ กรุณาแจ้งครูคุมสอบให้ตรวจสอบก่อนดำเนินการต่อ
        </p>
        <div class="card-inset" style="margin-bottom:16px;font-size:0.88rem;color:var(--danger);">
          รายละเอียดข้อผิดพลาด: ${esc(appState.corruptedRealError || 'Malformed session record')}
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary" id="corrupted-back-home">← กลับหน้าหลัก</button>
          <button type="button" class="btn btn-danger" id="corrupted-clear-btn">สำหรับครู: ล้างข้อมูลที่เสียหายเพื่อเริ่มใหม่</button>
        </div>
      </section>
    `;

    document.getElementById('corrupted-back-home').addEventListener('click', () => navigate('HOME'));
    document.getElementById('corrupted-clear-btn').addEventListener('click', () => {
      openModal({
        title: 'ยืนยันล้างข้อมูลสอบที่เสียหาย?',
        bodyHtml: '<p>กรุณาให้ครูคุมสอบรับทราบก่อนล้างข้อมูลที่เสียหายออกจากเบราว์เซอร์นี้</p>',
        buttons: [
          { label: 'ยกเลิก', variant: 'btn-secondary', onClick: closeModal },
          {
            label: 'ยืนยันล้างข้อมูล',
            variant: 'btn-danger',
            onClick: () => {
              E.appendRealHistorySummary({
                sessionId: 'CORRUPTED-RECORD',
                startedAt: null,
                endedAt: null,
                submitReason: 'corrupted_clear',
                scoreHalf: null,
                clearedAt: Date.now(),
                action: 'clear_corrupted_by_teacher'
              });
              E.clearSession('real');
              appState.corruptedRealError = null;
              closeModal();
              navigate('HOME');
            }
          }
        ]
      });
    });
  }

  /* ------------------------------------------------------------------------
     Teacher Read-Only Realtime Statistics Dashboard (Bottom-Left Key Icon)
     ------------------------------------------------------------------------ */
  function stopDashboardTimer() {
    if (appState.dashboardTimer) {
      clearInterval(appState.dashboardTimer);
      appState.dashboardTimer = null;
    }
  }

  function openTeacherPinModal() {
    if (appState.dashboardUnlocked) {
      openTeacherDashboardModal();
      return;
    }
    openModal({
      title: 'เข้าสู่ Dashboard สถิติสำหรับครู (Read-Only)',
      bodyHtml: `
        <p style="margin:0 0 12px;color:var(--text-secondary);">
          หน้านี้แสดงเฉพาะข้อมูลสถิติการใช้งานแบบไม่ระบุตัวตน (อ่านอย่างเดียว ไม่สามารถแก้ไขหรือลบข้อมูลได้)
        </p>
        <form id="teacher-pin-form" novalidate>
          <div class="field-group" style="margin-bottom:0;">
            <label class="field-label" for="teacher-pin-input">รหัสผ่านเข้าดูสถิติ</label>
            <input type="password" id="teacher-pin-input" class="text-input math-font" placeholder="กรอกรหัสผ่าน" autocomplete="off" required>
            <span class="field-error hidden" id="teacher-pin-err">รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง</span>
          </div>
        </form>
      `,
      buttons: [
        { label: 'ยกเลิก', variant: 'btn-secondary', onClick: closeModal },
        {
          label: 'เข้าดู Dashboard',
          variant: 'btn-primary',
          onClick: () => submitTeacherPin()
        }
      ]
    });

    const form = document.getElementById('teacher-pin-form');
    const pinInput = document.getElementById('teacher-pin-input');
    if (pinInput) setTimeout(() => pinInput.focus(), 30);
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        submitTeacherPin();
      });
    }
  }

  function submitTeacherPin() {
    const pinInput = document.getElementById('teacher-pin-input');
    const errEl = document.getElementById('teacher-pin-err');
    if (!pinInput || !ST) return;
    if (ST.verifyPin(pinInput.value)) {
      appState.dashboardUnlocked = true;
      closeModal();
      openTeacherDashboardModal();
    } else {
      if (errEl) errEl.classList.remove('hidden');
      pinInput.select();
    }
  }

  async function refreshDashboardContent() {
    if (!ST) return;
    const data = await ST.fetchDashboardData();
    appState.dashboardLastData = data;
    renderDashboardBody();
  }

  function renderDashboardBody() {
    const container = document.getElementById('teacher-dash-root');
    if (!container || !ST) return;
    const data = appState.dashboardLastData || {
      ok: true,
      source: 'local_cache',
      fetchedAt: 'กำลังโหลด...',
      buckets: ST.loadLocalBuckets(),
      note: null
    };

    const currentUrl = ST.getConfiguredApiUrl();
    const configHtml = !ST.STATS_API_URL ? `
      <details class="card-inset" style="margin-top:12px;">
        <summary style="cursor:pointer;font-weight:700;font-size:0.86rem;color:var(--text-secondary);">
          ⚙ ตั้งค่าลิงก์ Google Apps Script Web App URL (สำหรับทดสอบบนเครื่องนี้ หรือวางถาวรใน js/stats.js)
        </summary>
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <input type="url" id="dash-api-url-input" class="text-input" style="flex:1 1 260px;min-height:42px;font-size:0.88rem;" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(currentUrl)}">
          <button type="button" class="btn btn-primary btn-sm" id="dash-save-url-btn">เชื่อมต่อ URL นี้</button>
        </div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
          สำหรับการ deploy ให้ทุกคนส่งข้อมูลเข้า Google Sheet อัตโนมัติ ให้นำ Web App URL ไปวางที่ตัวแปร <code>STATS_API_URL</code> ในไฟล์ <code>js/stats.js</code>
        </div>
      </details>
    ` : '';

    container.innerHTML = ST.renderDashboardHtml({
      data,
      filterMode: appState.dashboardFilter,
      autoRefresh: appState.dashboardAutoRefresh
    }) + configHtml;

    const refreshBtn = document.getElementById('dash-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'กำลังโหลด...';
        refreshDashboardContent();
      });
    }

    const autoChk = document.getElementById('dash-auto-refresh');
    if (autoChk) {
      autoChk.addEventListener('change', () => {
        appState.dashboardAutoRefresh = autoChk.checked;
        scheduleDashboardAutoRefresh();
      });
    }

    container.querySelectorAll('[data-dash-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        appState.dashboardFilter = btn.getAttribute('data-dash-filter');
        renderDashboardBody();
      });
    });

    const saveUrlBtn = document.getElementById('dash-save-url-btn');
    const urlInput = document.getElementById('dash-api-url-input');
    if (saveUrlBtn && urlInput) {
      saveUrlBtn.addEventListener('click', () => {
        try { localStorage.setItem(ST.STORAGE_KEYS.CUSTOM_API_URL, urlInput.value.trim()); } catch (_) {}
        refreshDashboardContent();
      });
    }
  }

  function scheduleDashboardAutoRefresh() {
    stopDashboardTimer();
    if (appState.dashboardAutoRefresh && !modalBackdropEl.classList.contains('hidden')) {
      appState.dashboardTimer = setInterval(() => {
        if (!modalBackdropEl.classList.contains('hidden') && document.getElementById('teacher-dash-root')) {
          refreshDashboardContent();
        } else {
          stopDashboardTimer();
        }
      }, 15000);
    }
  }

  function openTeacherDashboardModal() {
    openModal({
      title: '📊 Teacher Analytics Dashboard — สถิติการฝึกและสอบ (Realtime · Read-Only)',
      dashboard: true,
      bodyHtml: '<div id="teacher-dash-root"><p style="color:var(--text-muted);">กำลังดึงข้อมูลสถิติ...</p></div>',
      buttons: [
        { label: 'ปิด Dashboard', variant: 'btn-primary', onClick: closeModal }
      ],
      onClose: () => stopDashboardTimer()
    });
    renderDashboardBody();
    refreshDashboardContent();
    scheduleDashboardAutoRefresh();
  }

  if (teacherKeyBtnEl) {
    teacherKeyBtnEl.addEventListener('click', () => {
      if (appState.view === 'REAL_ACTIVE') return;
      openTeacherPinModal();
    });
  }

  /* ------------------------------------------------------------------------
     App Boot
     ------------------------------------------------------------------------ */
  function bootstrap() {
    applyTheme(getTheme());
    const realState = E.loadSession('real');

    if (realState.status === 'corrupted') {
      appState.corruptedRealError = realState.error;
      navigate('CORRUPTED_REAL');
      return;
    }

    if (realState.status === 'ok' && realState.session) {
      if (realState.session.status === 'active') {
        resumeExistingSession(realState.session);
        return;
      }
      if (realState.session.status === 'finished') {
        appState.session = realState.session;
        navigate('REAL_RESULT');
        return;
      }
    }

    navigate('HOME');
  }

  bootstrap();
})();
