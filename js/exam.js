/* ==========================================================================
   Moment Lab — Storage Adapter, Timer Engine, Incident Monitor,
   Multi-Tab Coordination, Exam State Machine & Export Helpers
   ========================================================================== */
(function (root, factory) {
  const api = factory(root.MomentLab && root.MomentLab.Physics);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MomentLab = root.MomentLab || {};
  root.MomentLab.Exam = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PhysicsArg) {
  'use strict';

  function getPhysics() {
    if (PhysicsArg) return PhysicsArg;
    if (typeof globalThis !== 'undefined' && globalThis.MomentLab && globalThis.MomentLab.Physics) {
      return globalThis.MomentLab.Physics;
    }
    if (typeof require === 'function') {
      return require('./physics.js');
    }
    throw new Error('Physics module not loaded');
  }

  const STORAGE_KEYS = {
    REAL_SESSION: 'momentlab.v1.real.session',
    PRACTICE_SESSION: 'momentlab.v1.practice.session',
    PRACTICE_FINGERPRINTS: 'momentlab.v1.practice.lastFingerprints',
    REAL_HISTORY: 'momentlab.v1.real.historySummary',
    REAL_LOCK: 'momentlab.v1.real.activeTabLock',
    THEME: 'momentlab.v1.theme'
  };

  // In-memory fallback for practice mode when localStorage is unavailable
  const memoryStore = {
    practiceSession: null,
    practiceFingerprints: null
  };

  /* ------------------------------------------------------------------------
     Thai / ICT Timestamp Formatting (Blueprint §11.2)
     ------------------------------------------------------------------------ */
  function formatThaiDate(ms) {
    const d = new Date(ms);
    try {
      return new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        calendar: 'buddhist',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(d);
    } catch (_) {
      const bkk = new Date(ms + 7 * 3600 * 1000);
      return `${bkk.getUTCDate()}/${bkk.getUTCMonth() + 1}/${bkk.getUTCFullYear() + 543}`;
    }
  }

  function formatThaiTime(ms) {
    const d = new Date(ms);
    try {
      const s = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(d);
      return `${s} น. (ICT)`;
    } catch (_) {
      const bkk = new Date(ms + 7 * 3600 * 1000);
      const hh = String(bkk.getUTCHours()).padStart(2, '0');
      const mm = String(bkk.getUTCMinutes()).padStart(2, '0');
      const ss = String(bkk.getUTCSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss} น. (ICT)`;
    }
  }

  function formatThaiDateTime(ms) {
    return `${formatThaiDate(ms)} ${formatThaiTime(ms)}`;
  }

  function formatDurationThai(ms) {
    const P = getPhysics();
    const clamped = Math.max(0, Math.min(P.DURATION_MS, Math.round(ms)));
    const totalSec = Math.floor(clamped / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min} นาที ${sec} วินาที`;
  }

  function formatCountdown(ms) {
    const clamped = Math.max(0, ms);
    const totalSec = Math.ceil(clamped / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------------------
     Storage Adapter & Schema Validator (Blueprint §10.1 & §14.3)
     ------------------------------------------------------------------------ */
  function testStorageAvailability() {
    try {
      if (typeof localStorage === 'undefined') {
        return { available: false, error: 'เบราว์เซอร์ไม่รองรับ localStorage' };
      }
      const probeKey = 'momentlab.v1.__probe__';
      const probeVal = String(Date.now());
      localStorage.setItem(probeKey, probeVal);
      const readBack = localStorage.getItem(probeKey);
      localStorage.removeItem(probeKey);
      if (readBack !== probeVal) {
        return { available: false, error: 'อ่านค่ากลับจาก localStorage ไม่ตรงกับที่บันทึก' };
      }
      return { available: true, error: null };
    } catch (err) {
      return { available: false, error: err && err.message ? err.message : 'ไม่สามารถเข้าถึงพื้นที่จัดเก็บข้อมูลได้' };
    }
  }

  function validateSessionSchema(obj, expectedMode) {
    const P = getPhysics();
    if (!obj || typeof obj !== 'object') return { valid: false, reason: 'ข้อมูล session ไม่ใช่อ็อบเจกต์' };
    if (obj.schemaVersion !== P.SCHEMA_VERSION) return { valid: false, reason: `schemaVersion ไม่รองรับ (${obj.schemaVersion})` };
    if (expectedMode && obj.mode !== expectedMode) return { valid: false, reason: 'โหมดของ session ไม่ตรงกัน' };
    if (obj.status !== 'active' && obj.status !== 'finished') return { valid: false, reason: 'สถานะ session ไม่ถูกต้อง' };
    if (typeof obj.sessionId !== 'string' || !obj.sessionId) return { valid: false, reason: 'ไม่พบ Session ID' };
    if (!Number.isFinite(obj.startedAt) || !Number.isFinite(obj.deadlineAt) || obj.deadlineAt <= obj.startedAt) {
      return { valid: false, reason: 'ข้อมูลเวลาเริ่ม/สิ้นสุดไม่ถูกต้อง' };
    }
    if (!Array.isArray(obj.questions) || obj.questions.length !== 3) {
      return { valid: false, reason: 'จำนวนข้อสอบไม่ครบ 3 ข้อ' };
    }
    for (const q of obj.questions) {
      if (!q || !q.id || !q.templateId || !Array.isArray(q.loads) || !q.unknown) {
        return { valid: false, reason: 'โครงสร้างข้อสอบเสียหาย' };
      }
    }
    if (obj.mode === 'real') {
      if (!obj.student || typeof obj.student.firstName !== 'string' || typeof obj.student.lastName !== 'string' || !P.validateStudentNo(obj.student.number).valid) {
        return { valid: false, reason: 'ข้อมูลผู้สอบไม่สมบูรณ์' };
      }
    }
    if (obj.status === 'finished') {
      if (!obj.result || typeof obj.result.scoreHalf !== 'number' || !Array.isArray(obj.result.items)) {
        return { valid: false, reason: 'ข้อมูลผลสอบไม่สมบูรณ์' };
      }
    }
    return { valid: true, reason: null };
  }

  function getSessionKey(mode) {
    return mode === 'real' ? STORAGE_KEYS.REAL_SESSION : STORAGE_KEYS.PRACTICE_SESSION;
  }

  function loadSession(mode) {
    const key = getSessionKey(mode);
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw === null) {
        if (mode === 'practice' && memoryStore.practiceSession) {
          return { status: 'ok', session: memoryStore.practiceSession, source: 'memory' };
        }
        return { status: 'empty', session: null, error: null };
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        return { status: 'corrupted', session: null, error: 'ไม่สามารถแปลงข้อมูล JSON ที่บันทึกไว้ได้ (ข้อมูลเสียหาย)', raw };
      }
      const check = validateSessionSchema(parsed, mode);
      if (!check.valid) {
        return { status: 'corrupted', session: null, error: `ข้อมูลที่บันทึกไว้ไม่สมบูรณ์: ${check.reason}`, raw };
      }
      return { status: 'ok', session: parsed, source: 'localStorage' };
    } catch (err) {
      if (mode === 'practice' && memoryStore.practiceSession) {
        return { status: 'ok', session: memoryStore.practiceSession, source: 'memory' };
      }
      return { status: 'error', session: null, error: err && err.message ? err.message : 'ไม่สามารถอ่านพื้นที่จัดเก็บได้' };
    }
  }

  function saveSession(session) {
    const key = getSessionKey(session.mode);
    session.revision = (Number.isInteger(session.revision) ? session.revision : 0) + 1;
    const serialized = JSON.stringify(session);

    try {
      if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable');
      localStorage.setItem(key, serialized);
      // Read-back verification (Blueprint §14.3)
      const verifyRaw = localStorage.getItem(key);
      if (!verifyRaw) throw new Error('Read-back verification failed: empty');
      const verifyObj = JSON.parse(verifyRaw);
      if (verifyObj.revision !== session.revision || verifyObj.status !== session.status || verifyObj.sessionId !== session.sessionId) {
        throw new Error('Read-back verification mismatch');
      }
      return { ok: true, persisted: true, error: null };
    } catch (err) {
      const msg = err && err.message ? err.message : 'ไม่สามารถบันทึกข้อมูลลง localStorage ได้';
      if (session.mode === 'practice') {
        memoryStore.practiceSession = JSON.parse(serialized);
        return { ok: true, persisted: false, error: msg };
      }
      // Real exam: flag storageError immediately
      session.storageError = true;
      addTechnicalFlag(session, 'storage_write_failed', `บันทึกข้อมูลลงเบราว์เซอร์ไม่สำเร็จ: ${msg}`, Date.now());
      return { ok: false, persisted: false, error: msg };
    }
  }

  function clearSession(mode) {
    const key = getSessionKey(mode);
    if (mode === 'practice') memoryStore.practiceSession = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function loadLastPracticeFingerprints() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEYS.PRACTICE_FINGERPRINTS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (_) { /* ignore */ }
    return memoryStore.practiceFingerprints || [];
  }

  function saveLastPracticeFingerprints(newFps) {
    // Retain up to 10 recent exam attempts (30 fingerprints) to prevent answer memorization
    const existing = loadLastPracticeFingerprints();
    const combined = existing.concat(Array.isArray(newFps) ? newFps : []).slice(-30);
    memoryStore.practiceFingerprints = combined;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.PRACTICE_FINGERPRINTS, JSON.stringify(combined));
      }
    } catch (_) { /* ignore */ }
  }

  function appendRealHistorySummary(entry) {
    try {
      if (typeof localStorage === 'undefined') return;
      let list = [];
      const raw = localStorage.getItem(STORAGE_KEYS.REAL_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
      // Never store student names in history metadata (Blueprint §14.3)
      list.push({
        sessionId: entry.sessionId,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        submitReason: entry.submitReason,
        scoreHalf: entry.scoreHalf,
        clearedAt: entry.clearedAt,
        action: entry.action || 'new_round_by_teacher'
      });
      if (list.length > 30) list = list.slice(list.length - 30);
      localStorage.setItem(STORAGE_KEYS.REAL_HISTORY, JSON.stringify(list));
    } catch (_) { /* ignore */ }
  }

  function loadRealHistorySummary() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(STORAGE_KEYS.REAL_HISTORY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  /* ------------------------------------------------------------------------
     Technical Flags Helper
     ------------------------------------------------------------------------ */
  function addTechnicalFlag(session, code, detail, atMs) {
    if (!Array.isArray(session.flags)) session.flags = [];
    // Prevent flooding identical repeated flag within 3s
    const last = session.flags[session.flags.length - 1];
    if (last && last.code === code && Math.abs((atMs || Date.now()) - last.at) < 3000) {
      return;
    }
    session.flags.push({
      code,
      detail,
      at: atMs || Date.now()
    });
    if (session.flags.length > 60) {
      session.flags = session.flags.slice(session.flags.length - 60);
    }
  }

  /* ------------------------------------------------------------------------
     Monotonic Clock + Absolute Deadline Timer Engine (Blueprint §11.1)
     ------------------------------------------------------------------------ */
  function createClockAnchor(nowMs) {
    const perfNow = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : null;
    return {
      anchorWall: nowMs || Date.now(),
      anchorPerf: perfNow
    };
  }

  function getEffectiveNow(session, clockAnchor, customWallNow, customPerfNow) {
    const wallNow = typeof customWallNow === 'number' ? customWallNow : Date.now();
    const lastEff = Number.isFinite(session.lastEffectiveNow) ? session.lastEffectiveNow : session.startedAt;
    let monoEstimate = wallNow;

    if (clockAnchor && clockAnchor.anchorPerf !== null) {
      const perfNow = typeof customPerfNow === 'number'
        ? customPerfNow
        : ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : clockAnchor.anchorPerf);
      const elapsed = Math.max(0, perfNow - clockAnchor.anchorPerf);
      monoEstimate = Math.round(clockAnchor.anchorWall + elapsed);

      const drift = wallNow - monoEstimate;
      if (Math.abs(drift) > 5000) {
        const dir = drift < 0 ? 'backward' : 'forward';
        const sec = (Math.abs(drift) / 1000).toFixed(1);
        addTechnicalFlag(
          session,
          'clock_anomaly',
          dir === 'backward'
            ? `ตรวจพบนาฬิกาอุปกรณ์ย้อนกลับ ~${sec} วินาทีระหว่างสอบ (ใช้เวลาต่อเนื่องเพื่อไม่เพิ่มเวลา)`
            : `ตรวจพบนาฬิกาอุปกรณ์กระโดดไปข้างหน้า ~${sec} วินาทีระหว่างสอบ`,
          Math.max(wallNow, monoEstimate, lastEff)
        );
        // Re-anchor monotonic baseline to max so we don't log the same jump on every tick
        clockAnchor.anchorWall = Math.max(wallNow, monoEstimate, lastEff);
        clockAnchor.anchorPerf = perfNow;
      }
    }

    const effectiveNow = Math.max(wallNow, monoEstimate, lastEff);
    session.lastEffectiveNow = effectiveNow;
    return effectiveNow;
  }

  /* ------------------------------------------------------------------------
     Incident Recording & Merging (Blueprint §12.1)
     ------------------------------------------------------------------------ */
  const BLUR_MERGE_WINDOW_MS = 1500;

  function pushRawSignal(session, signalName, atMs) {
    if (!Array.isArray(session.rawSignals)) session.rawSignals = [];
    session.rawSignals.push({ signal: signalName, at: atMs });
    if (session.rawSignals.length > 80) {
      session.rawSignals = session.rawSignals.slice(session.rawSignals.length - 80);
    }
  }

  function getOpenIncident(session) {
    if (!Array.isArray(session.incidents) || session.incidents.length === 0) return null;
    const last = session.incidents[session.incidents.length - 1];
    return last && last.endAt === null ? last : null;
  }

  function recordIncident(session, signal, atMs, extra = {}) {
    if (!session || session.mode !== 'real' || session.status !== 'active') return { banner: false, changed: false };
    const now = typeof atMs === 'number' ? atMs : Date.now();
    if (!Array.isArray(session.incidents)) session.incidents = [];

    pushRawSignal(session, signal, now);

    const open = getOpenIncident(session);
    let banner = false;
    let changed = false;

    if (signal === 'visibility_hidden' || signal === 'pagehide') {
      if (open) {
        // Upgrade blur -> hidden if same exit event (Blueprint §12.1)
        if (!open.signals.includes(signal)) open.signals.push(signal);
        if (open.type === 'focus-only') {
          open.type = 'hidden';
          open.confidence = 'high';
        }
        changed = true;
      } else {
        // Also check if a recently closed blur ended within a tiny window? No, blur would still be open until focus.
        session.incidents.push({
          incidentId: `INC-${session.incidents.length + 1}`,
          type: 'hidden',
          confidence: 'high',
          startAt: now,
          endAt: null,
          durationMs: 0,
          estimated: false,
          signals: [signal]
        });
        changed = true;
      }
    } else if (signal === 'blur') {
      if (open) {
        if (!open.signals.includes('blur')) open.signals.push('blur');
        changed = true;
      } else {
        session.incidents.push({
          incidentId: `INC-${session.incidents.length + 1}`,
          type: 'focus-only',
          confidence: 'medium',
          startAt: now,
          endAt: null,
          durationMs: 0,
          estimated: false,
          signals: ['blur']
        });
        changed = true;
      }
    } else if (signal === 'visibility_visible' || signal === 'pageshow') {
      if (open && open.type === 'hidden') {
        open.endAt = Math.max(open.startAt, now);
        open.durationMs = open.endAt - open.startAt;
        if (!open.signals.includes(signal)) open.signals.push(signal);
        banner = true;
        changed = true;
      } else if (open && open.type === 'focus-only' && now - open.startAt > BLUR_MERGE_WINDOW_MS) {
        open.endAt = Math.max(open.startAt, now);
        open.durationMs = open.endAt - open.startAt;
        if (!open.signals.includes(signal)) open.signals.push(signal);
        changed = true;
      }
    } else if (signal === 'focus') {
      if (open) {
        open.endAt = Math.max(open.startAt, now);
        open.durationMs = open.endAt - open.startAt;
        if (!open.signals.includes('focus')) open.signals.push('focus');
        if (open.type === 'hidden') banner = true;
        changed = true;
      }
    } else if (signal === 'resume') {
      const gapStart = extra.lastSeenAt || session.lastSeenAt || session.startedAt;
      const clampedStart = Math.max(session.startedAt, Math.min(gapStart, now));
      // If there was an open incident before reload/close, close it as estimated at now
      if (open) {
        open.endAt = Math.max(open.startAt, now);
        open.durationMs = open.endAt - open.startAt;
        open.estimated = true;
        if (!open.signals.includes('resume')) open.signals.push('resume');
      }
      session.incidents.push({
        incidentId: `INC-${session.incidents.length + 1}`,
        type: 'resume',
        confidence: 'info',
        startAt: clampedStart,
        endAt: now,
        durationMs: Math.max(0, now - clampedStart),
        estimated: true,
        signals: ['reload_or_resume']
      });
      banner = true;
      changed = true;
    } else if (signal === 'fullscreen_exit') {
      session.incidents.push({
        incidentId: `INC-${session.incidents.length + 1}`,
        type: 'fullscreen-exit',
        confidence: 'low',
        startAt: now,
        endAt: now,
        durationMs: 0,
        estimated: false,
        signals: ['fullscreenchange:exit']
      });
      changed = true;
    }

    session.lastSeenAt = now;
    return { banner, changed };
  }

  function closeOpenIncidentsAt(session, endMs, markEstimated) {
    if (!Array.isArray(session.incidents)) return;
    for (const inc of session.incidents) {
      if (inc.endAt === null) {
        const clampedEnd = Math.max(inc.startAt, Math.min(endMs, session.deadlineAt));
        inc.endAt = clampedEnd;
        inc.durationMs = Math.max(0, clampedEnd - inc.startAt);
        if (markEstimated) inc.estimated = true;
      }
    }
  }

  /**
   * Compute merged non-overlapping awayMs strictly bounded within [startedAt, endedAt]
   * and categorize counts (hiddenCount, focusOnlyCount, resumeCount, flags).
   */
  function computeIntegritySummary(session) {
    const startBound = session.startedAt;
    const endBound = session.endedAt || session.deadlineAt;
    const maxPossible = Math.max(0, endBound - startBound);

    let hiddenCount = 0;
    let focusOnlyCount = 0;
    let resumeCount = 0;
    let fullscreenExitCount = 0;
    const intervals = [];

    for (const inc of session.incidents || []) {
      if (inc.type === 'hidden') hiddenCount++;
      else if (inc.type === 'focus-only') focusOnlyCount++;
      else if (inc.type === 'resume') resumeCount++;
      else if (inc.type === 'fullscreen-exit') fullscreenExitCount++;

      // Only count away intervals for hidden, focus-only, and resume gaps
      if (inc.type === 'hidden' || inc.type === 'focus-only' || inc.type === 'resume') {
        const s = Math.max(startBound, Math.min(inc.startAt, endBound));
        const eRaw = inc.endAt !== null ? inc.endAt : endBound;
        const e = Math.max(s, Math.min(eRaw, endBound));
        if (e > s) intervals.push([s, e]);
      }
    }

    // Merge overlapping intervals so awayMs never double-counts or exceeds duration
    intervals.sort((a, b) => a[0] - b[0]);
    let awayMs = 0;
    let curStart = null;
    let curEnd = null;
    for (const [s, e] of intervals) {
      if (curStart === null) {
        curStart = s;
        curEnd = e;
      } else if (s <= curEnd) {
        curEnd = Math.max(curEnd, e);
      } else {
        awayMs += (curEnd - curStart);
        curStart = s;
        curEnd = e;
      }
    }
    if (curStart !== null) awayMs += (curEnd - curStart);
    awayMs = Math.max(0, Math.min(awayMs, maxPossible));

    const flags = Array.isArray(session.flags) ? session.flags.slice() : [];
    const hasTechLimitation = Boolean(session.storageError) || flags.some(f =>
      f.code === 'clock_anomaly' || f.code === 'storage_write_failed' || f.code === 'concurrent_tab' || f.code === 'crypto_fallback'
    );
    const hasReviewEvents = hiddenCount > 0 || focusOnlyCount > 0 || resumeCount > 0 || fullscreenExitCount > 0;

    const statusBadges = [];
    if (!hasReviewEvents) {
      statusBadges.push({ kind: 'clean', label: 'ไม่พบเหตุการณ์ออกจากหน้าที่ระบบบันทึกได้' });
    } else {
      statusBadges.push({ kind: 'review', label: 'พบเหตุการณ์ที่ครูควรตรวจสอบ' });
    }
    if (hasTechLimitation) {
      statusBadges.push({ kind: 'tech', label: 'มีข้อจำกัดทางเทคนิคในการบันทึก' });
    }

    return {
      hiddenCount,
      focusOnlyCount,
      resumeCount,
      fullscreenExitCount,
      totalReviewEvents: hiddenCount + focusOnlyCount + resumeCount + fullscreenExitCount,
      awayMs,
      flags,
      hasReviewEvents,
      hasTechLimitation,
      statusBadges
    };
  }

  /* ------------------------------------------------------------------------
     Exam Creation & Finalization (Blueprint §9, §10, §11, §14)
     ------------------------------------------------------------------------ */
  function createExamSession(setup) {
    const P = getPhysics();
    const mode = setup.mode === 'real' ? 'real' : 'practice';
    const vn = P.validateStudentNo(setup.studentNo);
    if (!vn.valid) throw new Error(vn.error);

    let student = { firstName: '', lastName: '', classroom: '', number: vn.value };
    if (mode === 'real') {
      const fn = String(setup.firstName || '').trim().slice(0, 60);
      const ln = String(setup.lastName || '').trim().slice(0, 60);
      const cls = String(setup.classroom || '').trim().slice(0, 30);
      if (!fn || !ln || !cls) {
        throw new Error('กรุณากรอกชื่อ นามสกุล และชั้น/ห้องให้ครบถ้วน');
      }
      student = { firstName: fn, lastName: ln, classroom: cls, number: vn.value };
    }

    // Check storage availability BEFORE starting real exam (Blueprint §10.1)
    if (mode === 'real') {
      const storageTest = testStorageAvailability();
      if (!storageTest.available) {
        throw new Error(`ไม่สามารถเริ่มสอบจริงได้ เนื่องจากพื้นที่จัดเก็บในเบราว์เซอร์ไม่พร้อมใช้งาน (${storageTest.error}) กรุณาแจ้งครูคุมสอบ`);
      }
    }

    const { sessionId, seed, usedCrypto } = P.generateSessionId(mode);
    // Avoid repeating recent practice variants/answers even when starting a real exam on the same device
    const lastFps = loadLastPracticeFingerprints();
    const { questions, fingerprints } = P.generateExam({
      mode,
      studentNo: vn.value,
      seed,
      lastFingerprints: lastFps
    });

    if (mode === 'practice') {
      saveLastPracticeFingerprints(fingerprints);
    }

    // Create timestamps ONLY after questions are generated & validated (Blueprint §7.4 & §11.1)
    const startedAt = typeof setup.nowMs === 'number' ? setup.nowMs : Date.now();
    const deadlineAt = startedAt + P.DURATION_MS;

    const answers = {};
    for (const q of questions) {
      answers[q.id] = { rawValue: '', unit: '' };
    }

    const session = {
      schemaVersion: P.SCHEMA_VERSION,
      appVersion: P.APP_VERSION,
      sessionId,
      mode,
      status: 'active',
      revision: 0,
      student,
      seed,
      startedAt,
      deadlineAt,
      lastEffectiveNow: startedAt,
      lastSeenAt: startedAt,
      questions,
      answers,
      activeQuestionIndex: 0,
      incidents: [],
      rawSignals: [],
      flags: [],
      storageError: false,
      submitReason: null,
      endedAt: null,
      finalizedAt: null,
      result: null
    };

    if (!usedCrypto) {
      addTechnicalFlag(session, 'crypto_fallback', 'เบราว์เซอร์ไม่รองรับ crypto.getRandomValues จึงใช้ Math.random แทน', startedAt);
    }

    const saved = saveSession(session);
    if (mode === 'real' && !saved.ok) {
      throw new Error(`ไม่สามารถบันทึกเซสชันสอบจริงได้ (${saved.error}) กรุณาแจ้งครูคุมสอบ`);
    }

    return { session, saved };
  }

  /**
   * Idempotent exam finalizer (Blueprint §11.1).
   * Prevents duplicate submit races between button click and timer expiration.
   */
  function finalizeExam(session, reason, effectiveNowMs) {
    const P = getPhysics();
    if (!session) throw new Error('No session to finalize');
    if (session.status === 'finished' && session.result) {
      return { session, alreadyFinished: true, saved: { ok: !session.storageError, persisted: !session.storageError } };
    }

    const effNow = typeof effectiveNowMs === 'number' ? effectiveNowMs : Math.max(Date.now(), session.lastEffectiveNow || session.startedAt);
    const isTimeout = reason === 'timeout' || effNow >= session.deadlineAt;
    const finalReason = isTimeout ? 'timeout' : 'manual';

    // Freeze timestamps cleanly (Blueprint §11.1)
    const endedAt = isTimeout
      ? session.deadlineAt
      : Math.max(session.startedAt, Math.min(effNow, session.deadlineAt));
    const finalizedAt = Math.max(endedAt, effNow);
    const delayedTimeout = isTimeout && (finalizedAt - endedAt > 2000);

    // Close any open incidents at endedAt
    closeOpenIncidentsAt(session, endedAt, delayedTimeout);

    // Freeze answers & grade
    const graded = P.gradeExam(session);

    session.status = 'finished';
    session.submitReason = finalReason;
    session.endedAt = endedAt;
    session.finalizedAt = finalizedAt;
    session.lastEffectiveNow = finalizedAt;
    session.lastSeenAt = finalizedAt;

    const integritySummary = session.mode === 'real'
      ? computeIntegritySummary(session)
      : { hiddenCount: 0, focusOnlyCount: 0, resumeCount: 0, fullscreenExitCount: 0, totalReviewEvents: 0, awayMs: 0, flags: [], hasReviewEvents: false, hasTechLimitation: false, statusBadges: [] };

    session.result = {
      scoreHalf: graded.scoreHalf,
      maxHalf: graded.maxHalf,
      scoreDisplay: graded.scoreDisplay,
      maxDisplay: graded.maxDisplay,
      correctCount: graded.correctCount,
      totalCount: graded.totalCount,
      items: graded.items,
      integritySummary
    };

    const saved = saveSession(session);
    return { session, alreadyFinished: false, saved };
  }

  /* ------------------------------------------------------------------------
     Multi-Tab Coordination for Real Exam (Blueprint §12.2)
     BroadcastChannel + localStorage heartbeat + storage event
     ------------------------------------------------------------------------ */
  function createTabCoordinator(callbacks) {
    const tabId = `TAB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const CHANNEL_NAME = 'momentlab_v1_real_exam_channel';
    const STALE_MS = 6000;
    let bc = null;
    let hbTimer = null;
    let owningSessionId = null;
    let isLockedOut = false;

    function readLock() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.REAL_LOCK);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    }

    function writeLock(sessionId) {
      try {
        localStorage.setItem(STORAGE_KEYS.REAL_LOCK, JSON.stringify({
          tabId,
          sessionId,
          updatedAt: Date.now()
        }));
      } catch (_) { /* ignore */ }
    }

    function releaseLock() {
      if (hbTimer) {
        clearInterval(hbTimer);
        hbTimer = null;
      }
      const cur = readLock();
      if (cur && cur.tabId === tabId) {
        try { localStorage.removeItem(STORAGE_KEYS.REAL_LOCK); } catch (_) { /* ignore */ }
      }
      if (bc && owningSessionId) {
        try { bc.postMessage({ type: 'RELEASE', tabId, sessionId: owningSessionId }); } catch (_) { /* ignore */ }
      }
      owningSessionId = null;
      isLockedOut = false;
    }

    function acquireForSession(session) {
      if (!session || session.mode !== 'real' || session.status !== 'active') {
        releaseLock();
        return { acquired: true, takeover: false };
      }

      const existing = readLock();
      const now = Date.now();

      if (existing && existing.tabId !== tabId && existing.sessionId === session.sessionId) {
        if (now - existing.updatedAt < STALE_MS) {
          // Another live tab owns this active real exam
          isLockedOut = true;
          if (bc) {
            try { bc.postMessage({ type: 'CONCURRENT_DETECTED', tabId, sessionId: session.sessionId }); } catch (_) { /* ignore */ }
          }
          return { acquired: false, takeover: false };
        }
        // Stale lock -> takeover safely
        owningSessionId = session.sessionId;
        isLockedOut = false;
        writeLock(session.sessionId);
        startHeartbeat();
        return { acquired: true, takeover: true };
      }

      owningSessionId = session.sessionId;
      isLockedOut = false;
      writeLock(session.sessionId);
      startHeartbeat();
      if (bc) {
        try { bc.postMessage({ type: 'CLAIM', tabId, sessionId: session.sessionId }); } catch (_) { /* ignore */ }
      }
      return { acquired: true, takeover: false };
    }

    function startHeartbeat() {
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(() => {
        if (owningSessionId && !isLockedOut) {
          writeLock(owningSessionId);
        }
      }, 2000);
    }

    function handleIncoming(msg) {
      if (!msg || msg.tabId === tabId) return;
      if (msg.type === 'CLAIM' || msg.type === 'PING_OWNER') {
        if (owningSessionId && !isLockedOut && msg.sessionId === owningSessionId) {
          // Respond that we already own this session
          if (bc) {
            try { bc.postMessage({ type: 'OWNER_ALIVE', tabId, sessionId: owningSessionId }); } catch (_) { /* ignore */ }
          }
          if (callbacks && callbacks.onConcurrentAttempt) {
            callbacks.onConcurrentAttempt(msg.sessionId);
          }
        }
      } else if (msg.type === 'OWNER_ALIVE') {
        if (owningSessionId && msg.sessionId === owningSessionId) {
          // Yield to existing owner tab
          if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
          isLockedOut = true;
          if (callbacks && callbacks.onLockedOut) {
            callbacks.onLockedOut(msg.sessionId);
          }
        }
      } else if (msg.type === 'CONCURRENT_DETECTED') {
        if (owningSessionId && !isLockedOut && msg.sessionId === owningSessionId) {
          if (callbacks && callbacks.onConcurrentAttempt) {
            callbacks.onConcurrentAttempt(msg.sessionId);
          }
        }
      } else if (msg.type === 'RELEASE') {
        if (isLockedOut && callbacks && callbacks.onOwnerReleased) {
          callbacks.onOwnerReleased(msg.sessionId);
        }
      }
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = e => handleIncoming(e.data);
      } catch (_) {
        bc = null;
      }
    }

    function onStorageEvent(e) {
      if (e.key === STORAGE_KEYS.REAL_LOCK && owningSessionId && !isLockedOut) {
        const lock = readLock();
        if (lock && lock.tabId !== tabId && lock.sessionId === owningSessionId) {
          if (callbacks && callbacks.onConcurrentAttempt) {
            callbacks.onConcurrentAttempt(owningSessionId);
          }
        }
      } else if (e.key === STORAGE_KEYS.REAL_SESSION && isLockedOut) {
        if (callbacks && callbacks.onExternalSessionUpdate) {
          callbacks.onExternalSessionUpdate();
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', onStorageEvent);
      window.addEventListener('pagehide', releaseLock);
    }

    return {
      tabId,
      acquireForSession,
      releaseLock,
      isLockedOut: () => isLockedOut,
      destroy() {
        releaseLock();
        if (bc) { try { bc.close(); } catch (_) { /* ignore */ } }
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', onStorageEvent);
          window.removeEventListener('pagehide', releaseLock);
        }
      }
    };
  }

  /* ------------------------------------------------------------------------
     Export Payload & Text Summary (Blueprint §13.3)
     ------------------------------------------------------------------------ */
  function buildExportPayload(session) {
    const P = getPhysics();
    const res = session.result;
    const durationMs = Math.max(0, Math.min(P.DURATION_MS, (session.endedAt || session.deadlineAt) - session.startedAt));
    return {
      schemaVersion: session.schemaVersion,
      appVersion: session.appVersion,
      exportedAtIso: new Date().toISOString(),
      disclaimer: 'ข้อมูลนี้สร้างและบันทึกในเบราว์เซอร์ของอุปกรณ์ผู้สอบ ไม่ใช่ใบรับรองจากเซิร์ฟเวอร์ และสามารถแก้ไขได้ภายนอก ครูผู้สอนควรตรวจสอบเทียบกับเวลาและ Session ID ในคาบสอบจริง',
      sessionId: session.sessionId,
      mode: session.mode,
      student: session.student,
      timing: {
        startedAtMs: session.startedAt,
        startedAtIso: new Date(session.startedAt).toISOString(),
        startedAtICT: formatThaiDateTime(session.startedAt),
        deadlineAtMs: session.deadlineAt,
        deadlineAtIso: new Date(session.deadlineAt).toISOString(),
        endedAtMs: session.endedAt,
        endedAtIso: new Date(session.endedAt).toISOString(),
        endedAtICT: formatThaiDateTime(session.endedAt),
        finalizedAtMs: session.finalizedAt,
        finalizedAtIso: new Date(session.finalizedAt).toISOString(),
        finalizedAtICT: formatThaiDateTime(session.finalizedAt),
        durationMs,
        durationText: formatDurationThai(durationMs),
        submitReason: session.submitReason,
        timeSource: 'device_clock_unverified'
      },
      score: {
        scoreHalf: res.scoreHalf,
        maxHalf: res.maxHalf,
        score: res.scoreHalf / 2,
        max: res.maxHalf / 2,
        correctCount: res.correctCount,
        totalCount: res.totalCount
      },
      storageError: Boolean(session.storageError),
      integritySummary: res.integritySummary,
      incidents: session.incidents || [],
      flags: session.flags || [],
      items: res.items,
      questions: session.questions
    };
  }

  function buildSummaryText(session) {
    const P = getPhysics();
    const res = session.result;
    const integ = res.integritySummary;
    const durationMs = Math.max(0, Math.min(P.DURATION_MS, (session.endedAt || session.deadlineAt) - session.startedAt));
    const lines = [
      session.mode === 'real' ? '=== ผลการสอบจริง: Moment Lab (สมดุลต่อการหมุน) ===' : '=== ผลทดลองสอบ (ไม่ใช่คะแนนเก็บ): Moment Lab ===',
      `Session ID: ${session.sessionId}`
    ];
    if (session.mode === 'real') {
      lines.push(`ผู้สอบ: ${session.student.firstName} ${session.student.lastName} | ชั้น: ${session.student.classroom} | เลขที่: ${session.student.number}`);
    } else {
      lines.push(`เลขที่ทดลองสอบ: ${session.student.number}`);
    }
    lines.push(`คะแนน: ${res.scoreDisplay} / ${res.maxDisplay} คะแนน (ถูก ${res.correctCount}/${res.totalCount} ข้อ)`);
    lines.push(`วันที่เริ่มสอบ: ${formatThaiDate(session.startedAt)}`);
    lines.push(`เริ่มสอบ: ${formatThaiTime(session.startedAt)}`);
    lines.push(`สิ้นสุดการสอบ: ${formatThaiDateTime(session.endedAt)}`);
    if (session.finalizedAt && session.finalizedAt - session.endedAt > 2000) {
      lines.push(`ประมวลผลและบันทึกผล: ${formatThaiDateTime(session.finalizedAt)}`);
    }
    lines.push(`เวลาที่ใช้: ${formatDurationThai(durationMs)} / 15 นาที`);
    lines.push(`สิ้นสุดโดย: ${session.submitReason === 'timeout' ? 'หมดเวลา (ส่งอัตโนมัติ)' : 'นักเรียนกดส่ง'}`);
    if (session.mode === 'real') {
      lines.push(`เหตุการณ์ออกจากหน้า: hidden ${integ.hiddenCount} ครั้ง, focus-only ${integ.focusOnlyCount} ครั้ง, resume ${integ.resumeCount} ครั้ง, เวลาออกรวม ~${formatDurationThai(integ.awayMs)}`);
      if (integ.flags.length > 0) {
        lines.push(`หมายเหตุทางเทคนิค: ${integ.flags.map(f => f.code).join(', ')}`);
      }
    }
    lines.push('แหล่งเวลา: นาฬิกาอุปกรณ์ (ไม่ใช่เวลาจากเซิร์ฟเวอร์)');
    lines.push('รายข้อ:');
    res.items.forEach((it, idx) => {
      const ansDisp = (it.rawValue || '—') + (it.unit ? ` ${it.unit}` : ' (ไม่เลือกหน่วย)');
      lines.push(`  ข้อ ${idx + 1} (${it.templateId}): ตอบ ${ansDisp} | เฉลย ${it.expectedExactText} ${it.expectedUnit} | ได้ ${P.formatHalfPoints(it.earnedHalf)}/${P.formatHalfPoints(it.pointsHalf)} คะแนน`);
    });
    return lines.join('\n');
  }

  function exportResult(session) {
    const payload = buildExportPayload(session);
    const json = JSON.stringify(payload, null, 2);
    const filename = `moment-result-${session.sessionId}.json`;
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { filename, payload, json };
  }

  return {
    STORAGE_KEYS,
    formatThaiDate,
    formatThaiTime,
    formatThaiDateTime,
    formatDurationThai,
    formatCountdown,
    testStorageAvailability,
    validateSessionSchema,
    loadSession,
    saveSession,
    clearSession,
    loadLastPracticeFingerprints,
    saveLastPracticeFingerprints,
    appendRealHistorySummary,
    loadRealHistorySummary,
    addTechnicalFlag,
    createClockAnchor,
    getEffectiveNow,
    recordIncident,
    closeOpenIncidentsAt,
    computeIntegritySummary,
    createExamSession,
    finalizeExam,
    createTabCoordinator,
    buildExportPayload,
    buildSummaryText,
    exportResult
  };
});
