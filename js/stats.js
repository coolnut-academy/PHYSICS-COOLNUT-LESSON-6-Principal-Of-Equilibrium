/* ==========================================================================
   Moment Lab — Lightweight Anonymous Statistics Tracker & Realtime Dashboard
   Zero PII (collects ONLY numeric/categorical metrics from Practice & Real Exam).
   Non-blocking async sync to Google Sheets Apps Script + Instant SVG Charts.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root.__ML_BOOT__ && root.__ML_BOOT__.Physics);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.__ML_BOOT__ = root.__ML_BOOT__ || {};
    root.__ML_BOOT__.Stats = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PhysicsArg) {
  'use strict';

  /**
   * ========================================================================
   * ตั้งค่าการเชื่อมต่อ Google Apps Script (วาง Web App URL หลัง Deploy Code.gs)
   * ตัวอย่าง: 'https://script.google.com/macros/s/AKfycb.../exec'
   * หากปล่อยว่างไว้ Dashboard จะแสดงข้อมูลสถิติจำลอง/ในเครื่องนี้ไปก่อน
   * ========================================================================
   */
  const STATS_API_URL = 'https://script.google.com/macros/s/AKfycbwh7IeK2h3e0sTqi9lm0WmFBy1G1TzXCQxneTEZkfUCk0wNX0ogtauoZnpUjsj7xCgCag/exec';
  const SPREADSHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/183KHDFLIMGED-r_QggLYYvwiPqUNgU5gPRH4NvvMrgM/edit?gid=0#gid=0';
  const TEACHER_PIN = 'admin1234'; // Read-only statistics dashboard access code

  const STORAGE_KEYS = {
    ATTEMPT_COUNTERS: 'momentlab.v1.stats.attemptCounters',
    LOCAL_BUCKETS: 'momentlab.v1.stats.localBuckets',
    CUSTOM_API_URL: 'momentlab.v1.stats.apiUrl'
  };

  const TEMPLATES = ['MA', 'FA', 'M1', 'F1', 'M2', 'F2'];
  const TEMPLATE_NAMES = {
    MA: 'MA · หามวล 3 แขน (A-Level)',
    FA: 'FA · หาตำแหน่ง 3 แขน (A-Level)',
    M1: 'M1 · หามวล 4 แขน (จุดหมุนซ้าย)',
    F1: 'F1 · หาตำแหน่ง 4 แขน (คานกลาง)',
    M2: 'M2 · หามวล 4 แขน (จุดหมุนขวา)',
    F2: 'F2 · หาตำแหน่ง 4 แขน (คานยาว)'
  };
  const DIST_SYSTEMS = ['cm', 'm', 'mixed_cm', 'mixed_m'];
  const DIST_NAMES = {
    cm: 'หน่วย cm ล้วน',
    m: 'หน่วย m ล้วน',
    mixed_cm: 'ผสม m+cm (ตอบ cm)',
    mixed_m: 'ผสม m+cm (ตอบ m)'
  };

  function getPhysics() {
    if (PhysicsArg) return PhysicsArg;
    if (typeof globalThis !== 'undefined' && globalThis.__ML_BOOT__ && globalThis.__ML_BOOT__.Physics) {
      return globalThis.__ML_BOOT__.Physics;
    }
    if (typeof require === 'function') return require('./physics.js');
    return null;
  }

  function esc(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getConfiguredApiUrl() {
    if (STATS_API_URL && STATS_API_URL.trim()) return STATS_API_URL.trim();
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_API_URL);
        if (saved && saved.trim()) return saved.trim();
      }
    } catch (_) {}
    return '';
  }

  function createEmptyBucket() {
    const byTemplate = {};
    for (const t of TEMPLATES) {
      byTemplate[t] = {
        attempts: 0, correct: 0, wrong: 0,
        wrongNumericOnly: 0, wrongUnitOnly: 0, wrongBoth: 0, unanswered: 0
      };
    }
    const byDist = {};
    for (const d of DIST_SYSTEMS) {
      byDist[d] = { attempts: 0, correct: 0, wrong: 0 };
    }
    return {
      totalAttempts: 0,
      repeatAttempts: 0,
      scoreSum: 0,
      durationSecSum: 0,
      manualCount: 0,
      timeoutCount: 0,
      errorTotals: {
        correct: 0, wrongNumericOnly: 0, wrongUnitOnly: 0, wrongBoth: 0, unanswered: 0
      },
      byTemplate,
      byDist,
      bySide: {
        cw: { attempts: 0, correct: 0, wrong: 0 },
        ccw: { attempts: 0, correct: 0, wrong: 0 }
      },
      recent: []
    };
  }

  function createEmptyStore() {
    return {
      all: createEmptyBucket(),
      practice: createEmptyBucket(),
      real: createEmptyBucket()
    };
  }

  function loadLocalBuckets() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_BUCKETS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.all && parsed.practice && parsed.real) return parsed;
        }
      }
    } catch (_) {}
    return createEmptyStore();
  }

  function saveLocalBuckets(store) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.LOCAL_BUCKETS, JSON.stringify(store));
      }
    } catch (_) {}
  }

  function incrementAttemptCounter(mode) {
    let counters = { practice: 0, real: 0 };
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEYS.ATTEMPT_COUNTERS);
        if (raw) counters = Object.assign(counters, JSON.parse(raw));
      }
    } catch (_) {}
    const key = mode === 'real' ? 'real' : 'practice';
    counters[key] = (parseInt(counters[key], 10) || 0) + 1;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.ATTEMPT_COUNTERS, JSON.stringify(counters));
      }
    } catch (_) {}
    return counters[key];
  }

  function classifyErrorType(item) {
    if (item.isCorrect) return 'correct';
    if (item.numericStatus === 'unanswered' && item.unitStatus === 'unselected') return 'unanswered';
    if (item.numericCorrect && !item.unitCorrect) return 'wrongUnitOnly';
    if (!item.numericCorrect && item.unitCorrect) return 'wrongNumericOnly';
    return 'wrongBoth';
  }

  /**
   * Build strictly anonymous numeric/categorical statistics payload (ZERO PII).
   */
  function buildAnonymousEvent(session, attemptIndex) {
    const P = getPhysics();
    const res = session.result;
    const durationMs = Math.max(0, Math.min(P ? P.DURATION_MS : 900000, (session.endedAt || session.deadlineAt) - session.startedAt));
    const durationSec = Math.round(durationMs / 1000);

    const items = session.questions.map((q, idx) => {
      const graded = res.items[idx];
      let side = 'cw';
      if (P) {
        try {
          side = P.solveQuestion(q).unknownSide || 'cw';
        } catch (_) {}
      }
      return {
        templateId: q.templateId,
        distanceSystem: q.distanceSystem || 'cm',
        unknownSide: side,
        isPosition: q.unknown && q.unknown.type === 'position',
        errorType: classifyErrorType(graded)
      };
    });

    return {
      mode: session.mode === 'real' ? 'real' : 'practice',
      score: Math.round((res.scoreHalf / 2) * 100) / 100,
      correctCount: res.correctCount,
      durationSec,
      submitReason: session.submitReason === 'timeout' ? 'timeout' : 'manual',
      isRepeat: attemptIndex > 1,
      attemptIndex,
      items
    };
  }

  function applyEventToBucket(bucket, ev, tsText) {
    bucket.totalAttempts += 1;
    if (ev.isRepeat) bucket.repeatAttempts += 1;
    bucket.scoreSum = Math.round((bucket.scoreSum + ev.score) * 100) / 100;
    bucket.durationSecSum += ev.durationSec;
    if (ev.submitReason === 'timeout') bucket.timeoutCount += 1;
    else bucket.manualCount += 1;

    for (const it of ev.items) {
      const tpl = bucket.byTemplate[it.templateId];
      if (tpl) {
        tpl.attempts += 1;
        if (it.errorType === 'correct') {
          tpl.correct += 1;
        } else {
          tpl.wrong += 1;
          if (tpl[it.errorType] !== undefined) tpl[it.errorType] += 1;
        }
      }
      if (bucket.errorTotals[it.errorType] !== undefined) {
        bucket.errorTotals[it.errorType] += 1;
      }
      const ds = bucket.byDist[it.distanceSystem];
      if (ds) {
        ds.attempts += 1;
        if (it.errorType === 'correct') ds.correct += 1;
        else ds.wrong += 1;
      }
      if (it.isPosition && bucket.bySide[it.unknownSide]) {
        const sd = bucket.bySide[it.unknownSide];
        sd.attempts += 1;
        if (it.errorType === 'correct') sd.correct += 1;
        else sd.wrong += 1;
      }
    }

    bucket.recent.push({
      t: tsText,
      m: ev.mode,
      s: ev.score,
      d: ev.durationSec,
      r: ev.isRepeat ? 1 : 0
    });
    if (bucket.recent.length > 25) {
      bucket.recent = bucket.recent.slice(bucket.recent.length - 25);
    }
  }

  function formatNowShort() {
    try {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  /**
   * Fire-and-forget anonymous telemetry recorder.
   * Zero UI delay: writes local cache synchronously + posts non-blocking beacon to Google Apps Script.
   */
  function recordExamStats(session) {
    if (!session || !session.result || (session.mode !== 'practice' && session.mode !== 'real')) {
      return null;
    }
    const attemptIndex = incrementAttemptCounter(session.mode);
    const ev = buildAnonymousEvent(session, attemptIndex);
    const ts = formatNowShort();

    // 1) Update instant local mirror cache
    const localStore = loadLocalBuckets();
    applyEventToBucket(localStore.all, ev, ts);
    applyEventToBucket(localStore[ev.mode], ev, ts);
    saveLocalBuckets(localStore);

    // 2) Send non-blocking CORS-simple POST (text/plain) to Google Apps Script if URL configured
    const url = getConfiguredApiUrl();
    if (url && typeof fetch === 'function') {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(ev),
          keepalive: true
        }).catch(() => {});
      } catch (_) {}
    }

    return ev;
  }

  /**
   * Fetch realtime aggregated statistics from Google Sheets Web App (with local fallback).
   */
  async function fetchDashboardData() {
    const url = getConfiguredApiUrl();
    if (!url || typeof fetch !== 'function') {
      return {
        ok: true,
        source: 'local_cache',
        fetchedAt: formatNowShort(),
        buckets: loadLocalBuckets(),
        note: 'ยังไม่ได้ตั้งค่า Google Apps Script Web App URL ใน js/stats.js — แสดงสถิติที่บันทึกไว้ในเบราว์เซอร์เครื่องนี้'
      };
    }

    try {
      const sep = url.includes('?') ? '&' : '?';
      const resp = await fetch(`${url}${sep}_ts=${Date.now()}`, { method: 'GET', cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json || !json.ok || !json.buckets) throw new Error(json && json.error ? json.error : 'Invalid response');
      return {
        ok: true,
        source: 'google_sheets',
        fetchedAt: json.fetchedAt || formatNowShort(),
        buckets: json.buckets,
        note: null
      };
    } catch (err) {
      return {
        ok: false,
        source: 'local_fallback',
        fetchedAt: formatNowShort(),
        buckets: loadLocalBuckets(),
        note: `ไม่สามารถดึงข้อมูลจาก Google Sheets ได้ชั่วคราว (${err.message}) — แสดงข้อมูลในเครื่องแทน`
      };
    }
  }

  function verifyPin(pin) {
    return String(pin || '').trim() === TEACHER_PIN;
  }

  /* ------------------------------------------------------------------------
     Pure Lightweight Inline SVG Dashboard Charts (Zero External Chart Lib)
     ------------------------------------------------------------------------ */
  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  function renderWrongRateChartSvg(bucket) {
    const rows = TEMPLATES.map(id => {
      const d = (bucket.byTemplate && bucket.byTemplate[id]) || { attempts: 0, correct: 0, wrong: 0 };
      const wrongPct = pct(d.wrong, d.attempts);
      return { id, label: TEMPLATE_NAMES[id] || id, attempts: d.attempts, wrong: d.wrong, correct: d.correct, wrongPct };
    }).sort((a, b) => b.wrongPct - a.wrongPct || b.wrong - a.wrong);

    const W = 620;
    const rowH = 44;
    const padT = 14;
    const H = padT + rows.length * rowH + 10;
    const barX = 218;
    const maxBarW = 300;

    const parts = [`<svg class="dash-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟอัตราการตอบผิดแยกตามแม่แบบโจทย์">`];
    rows.forEach((r, idx) => {
      const y = padT + idx * rowH;
      const bw = Math.max(r.wrongPct > 0 ? 4 : 0, (r.wrongPct / 100) * maxBarW);
      const fill = r.wrongPct >= 50 ? 'var(--danger)' : r.wrongPct >= 25 ? 'var(--amber)' : 'var(--accent)';
      parts.push(`<text x="6" y="${y + 16}" fill="var(--text-primary)" font-size="12.5" font-weight="700" class="svg-thai">${esc(r.label)}</text>`);
      parts.push(`<text x="6" y="${y + 32}" fill="var(--text-muted)" font-size="11" class="svg-thai">ทำ ${r.attempts} ข้อ · ถูก ${r.correct} · ผิด ${r.wrong}</text>`);
      parts.push(`<rect x="${barX}" y="${y + 8}" width="${maxBarW}" height="18" rx="9" fill="var(--bg-surface-inset)" stroke="var(--border-subtle)" stroke-width="1"/>`);
      if (bw > 0) {
        parts.push(`<rect x="${barX}" y="${y + 8}" width="${bw.toFixed(1)}" height="18" rx="9" fill="${fill}"/>`);
      }
      parts.push(`<text x="${barX + maxBarW + 10}" y="${y + 21}" fill="var(--text-primary)" font-size="12.5" font-weight="800">${r.attempts ? r.wrongPct.toFixed(1) + '%' : '—'}</text>`);
    });
    parts.push('</svg>');
    return { svg: parts.join(''), sortedRows: rows };
  }

  function renderErrorBreakdownSvg(bucket) {
    const et = bucket.errorTotals || { correct: 0, wrongNumericOnly: 0, wrongUnitOnly: 0, wrongBoth: 0, unanswered: 0 };
    const totalWrong = (et.wrongNumericOnly || 0) + (et.wrongUnitOnly || 0) + (et.wrongBoth || 0) + (et.unanswered || 0);
    const items = [
      { key: 'wrongNumericOnly', label: 'หน่วยถูก แต่คำนวณตัวเลขผิด', count: et.wrongNumericOnly || 0, color: 'var(--amber)' },
      { key: 'wrongUnitOnly', label: 'ตัวเลขถูก แต่เลือกหน่วยผิด', count: et.wrongUnitOnly || 0, color: 'var(--sky)' },
      { key: 'wrongBoth', label: 'ผิดทั้งตัวเลขและหน่วย', count: et.wrongBoth || 0, color: 'var(--danger)' },
      { key: 'unanswered', label: 'ไม่ได้ตอบ / เว้นว่าง', count: et.unanswered || 0, color: 'var(--text-muted)' }
    ];

    const W = 620;
    const rowH = 38;
    const H = 14 + items.length * rowH + 8;
    const barX = 218;
    const maxBarW = 300;

    const parts = [`<svg class="dash-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟสาเหตุการตอบผิด">`];
    items.forEach((it, idx) => {
      const y = 14 + idx * rowH;
      const p = pct(it.count, totalWrong);
      const bw = Math.max(p > 0 ? 4 : 0, (p / 100) * maxBarW);
      parts.push(`<text x="6" y="${y + 18}" fill="var(--text-primary)" font-size="12.5" font-weight="600" class="svg-thai">${esc(it.label)}</text>`);
      parts.push(`<rect x="${barX}" y="${y + 6}" width="${maxBarW}" height="16" rx="8" fill="var(--bg-surface-inset)" stroke="var(--border-subtle)" stroke-width="1"/>`);
      if (bw > 0) {
        parts.push(`<rect x="${barX}" y="${y + 6}" width="${bw.toFixed(1)}" height="16" rx="8" fill="${it.color}"/>`);
      }
      parts.push(`<text x="${barX + maxBarW + 10}" y="${y + 18}" fill="var(--text-primary)" font-size="12" font-weight="700">${it.count} (${totalWrong ? p.toFixed(0) : 0}%)</text>`);
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function renderRecentTrendSvg(bucket) {
    const rec = Array.isArray(bucket.recent) ? bucket.recent : [];
    const W = 620;
    const H = 160;
    const padL = 36;
    const padR = 16;
    const padT = 18;
    const padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const parts = [`<svg class="dash-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟแนวโน้มคะแนนล่าสุด">`];

    // Gridlines at 0, 5, 10
    [0, 5, 10].forEach(val => {
      const y = padT + plotH - (val / 10) * plotH;
      parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border-subtle)" stroke-dasharray="${val === 0 ? '' : '3 3'}"/>`);
      parts.push(`<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${val}</text>`);
    });

    if (rec.length === 0) {
      parts.push(`<text x="${W / 2}" y="${padT + plotH / 2 + 4}" text-anchor="middle" fill="var(--text-muted)" font-size="13" class="svg-thai">ยังไม่มีข้อมูลการส่งข้อสอบ</text>`);
      parts.push('</svg>');
      return parts.join('');
    }

    const stepX = rec.length > 1 ? plotW / (rec.length - 1) : 0;
    const pts = rec.map((r, i) => {
      const x = rec.length === 1 ? padL + plotW / 2 : padL + i * stepX;
      const y = padT + plotH - (Math.max(0, Math.min(10, Number(r.s) || 0)) / 10) * plotH;
      return { x, y, r };
    });

    if (pts.length > 1) {
      const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      parts.push(`<polyline fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" points="${poly}"/>`);
    }

    pts.forEach((p, idx) => {
      const col = p.r.m === 'real' ? 'var(--danger)' : 'var(--sky)';
      parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${col}" stroke="var(--bg-surface)" stroke-width="1.5"><title>${esc(p.r.m === 'real' ? 'สอบจริง' : 'ทดลองสอบ')}: ${p.r.s}/10 (${esc(p.r.t)})</title></circle>`);
      if (idx === 0 || idx === pts.length - 1) {
        parts.push(`<text x="${p.x.toFixed(1)}" y="${H - 8}" text-anchor="${idx === 0 ? 'start' : 'end'}" fill="var(--text-muted)" font-size="10">${esc(String(p.r.t || '').slice(5, 16))}</text>`);
      }
    });

    parts.push('</svg>');
    return parts.join('');
  }

  function renderDashboardHtml({ data, filterMode, autoRefresh }) {
    const buckets = (data && data.buckets) || createEmptyStore();
    const bucket = buckets[filterMode] || createEmptyBucket();
    const allBucket = buckets.all || createEmptyBucket();
    const pracBucket = buckets.practice || createEmptyBucket();
    const realBucket = buckets.real || createEmptyBucket();

    const avgScore = bucket.totalAttempts ? (bucket.scoreSum / bucket.totalAttempts).toFixed(2) : '—';
    const avgDurSec = bucket.totalAttempts ? Math.round(bucket.durationSecSum / bucket.totalAttempts) : 0;
    const avgDurText = bucket.totalAttempts ? `${Math.floor(avgDurSec / 60)} น. ${avgDurSec % 60} วิ.` : '—';
    const repeatPct = pct(bucket.repeatAttempts, bucket.totalAttempts);

    const wrongChart = renderWrongRateChartSvg(bucket);
    const hardest = wrongChart.sortedRows.find(r => r.attempts > 0);
    const hardestText = hardest ? `${hardest.id} (${hardest.wrongPct.toFixed(1)}%)` : 'ยังไม่มีข้อมูล';

    const distRowsHtml = DIST_SYSTEMS.map(ds => {
      const d = (bucket.byDist && bucket.byDist[ds]) || { attempts: 0, correct: 0, wrong: 0 };
      const wp = pct(d.wrong, d.attempts);
      return `
        <div class="meta-kv">
          <span class="meta-k">${esc(DIST_NAMES[ds])}</span>
          <span class="meta-v">${d.attempts} ข้อ · ผิด ${d.wrong} (${d.attempts ? wp.toFixed(1) : 0}%)</span>
        </div>
      `;
    }).join('');

    const sideCw = (bucket.bySide && bucket.bySide.cw) || { attempts: 0, correct: 0, wrong: 0 };
    const sideCcw = (bucket.bySide && bucket.bySide.ccw) || { attempts: 0, correct: 0, wrong: 0 };

    const statusBadge = data.source === 'google_sheets'
      ? '<span class="badge badge-success">● เชื่อมต่อ Google Sheets สด</span>'
      : '<span class="badge badge-warn">● ข้อมูลในเบราว์เซอร์เครื่องนี้ (ยังไม่เชื่อม Sheet URL)</span>';

    return `
      <div class="dash-wrap">
        <div class="dash-toolbar">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
            ${statusBadge}
            <span class="badge badge-neutral">อ่านอย่างเดียว (Read-Only)</span>
            <span style="font-size:0.8rem;color:var(--text-muted);">อัปเดต: ${esc(data.fetchedAt || '—')}</span>
          </div>
          <div class="btn-row">
            <label class="dash-auto-toggle">
              <input type="checkbox" id="dash-auto-refresh" ${autoRefresh ? 'checked' : ''}>
              <span>รีเฟรชอัตโนมัติ 15 วิ</span>
            </label>
            <button type="button" class="btn btn-secondary btn-sm" id="dash-refresh-btn">↻ รีเฟรช</button>
            <a class="btn btn-ghost btn-sm" href="${esc(SPREADSHEET_VIEW_URL)}" target="_blank" rel="noopener noreferrer">เปิด Google Sheet ↗</a>
          </div>
        </div>

        ${data.note ? `<div class="alert-banner info" style="margin:0;"><div>${esc(data.note)}</div></div>` : ''}

        <div class="unit-mode-strip" role="group" aria-label="กรองข้อมูลตามโหมด">
          <span style="font-size:0.84rem;font-weight:700;color:var(--text-muted);margin-right:4px;">มุมมองสถิติ:</span>
          <button type="button" class="unit-mode-pill ${filterMode === 'all' ? 'is-active' : ''}" data-dash-filter="all">ทั้งหมด (${allBucket.totalAttempts})</button>
          <button type="button" class="unit-mode-pill ${filterMode === 'practice' ? 'is-active' : ''}" data-dash-filter="practice">ทดลองสอบ (${pracBucket.totalAttempts})</button>
          <button type="button" class="unit-mode-pill ${filterMode === 'real' ? 'is-active' : ''}" data-dash-filter="real">สอบจริง (${realBucket.totalAttempts})</button>
        </div>

        <!-- 4 KPI Cards -->
        <div class="dash-kpi-grid">
          <div class="stat-tile">
            <div class="stat-lbl">จำนวนครั้งที่ทำ</div>
            <div class="stat-num">${bucket.totalAttempts}</div>
            <div class="stat-lbl">กดส่ง ${bucket.manualCount} · หมดเวลา ${bucket.timeoutCount}</div>
          </div>
          <div class="stat-tile">
            <div class="stat-lbl">อัตราการทำซ้ำ (Repeat)</div>
            <div class="stat-num">${bucket.repeatAttempts} <span style="font-size:0.85rem;color:var(--text-muted);">(${repeatPct.toFixed(0)}%)</span></div>
            <div class="stat-lbl">ครั้งที่ฝึก/ทำตั้งแต่รอบ 2 ขึ้นไป</div>
          </div>
          <div class="stat-tile">
            <div class="stat-lbl">คะแนนเฉลี่ย / เวลาเฉลี่ย</div>
            <div class="stat-num">${esc(avgScore)} <span style="font-size:0.85rem;color:var(--text-muted);">/ 10</span></div>
            <div class="stat-lbl">เวลาเฉลี่ย ${esc(avgDurText)}</div>
          </div>
          <div class="stat-tile">
            <div class="stat-lbl">แบบโจทย์ที่ตอบผิดบ่อยสุด</div>
            <div class="stat-num" style="font-size:1.05rem;color:var(--danger);">${esc(hardestText)}</div>
            <div class="stat-lbl">เรียงตาม % การตอบผิด</div>
          </div>
        </div>

        <!-- Chart 1: Wrong Rate by Template -->
        <section class="card-inset">
          <h3 class="dash-chart-title">1. อัตราการตอบผิด (%) แยกตามแม่แบบโจทย์ 6 แบบ (ผิดบ่อยที่สุดอยู่บนสุด)</h3>
          <div class="dash-svg-wrap">${wrongChart.svg}</div>
        </section>

        <!-- Chart 2: Error Cause Breakdown -->
        <section class="card-inset">
          <h3 class="dash-chart-title">2. จำแนกสาเหตุการตอบผิด (คำนวณผิด vs เลือกหน่วยผิด)</h3>
          <div class="dash-svg-wrap">${renderErrorBreakdownSvg(bucket)}</div>
        </section>

        <!-- Chart 3: Distance Unit System & Mirrored Side Comparison -->
        <div class="form-grid-2">
          <section class="card-inset">
            <h3 class="dash-chart-title">3. อัตราการตอบผิดตามรูปแบบหน่วยระยะ (m / cm)</h3>
            <div class="meta-kv-grid">${distRowsHtml}</div>
          </section>
          <section class="card-inset">
            <h3 class="dash-chart-title">4. โจทย์หาตำแหน่ง: ฝั่งขวา vs ฝั่งซ้ายกลับด้าน</h3>
            <div class="meta-kv-grid">
              <div class="meta-kv">
                <span class="meta-k">คำตอบอยู่ฝั่งขวา (x &gt; จุดหมุน)</span>
                <span class="meta-v">${sideCw.attempts} ข้อ · ผิด ${sideCw.wrong} (${sideCw.attempts ? pct(sideCw.wrong, sideCw.attempts).toFixed(1) : 0}%)</span>
              </div>
              <div class="meta-kv">
                <span class="meta-k">คำตอบอยู่ฝั่งซ้าย (x &lt; จุดหมุน)</span>
                <span class="meta-v">${sideCcw.attempts} ข้อ · ผิด ${sideCcw.wrong} (${sideCcw.attempts ? pct(sideCcw.wrong, sideCcw.attempts).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <p style="margin:10px 0 0;font-size:0.8rem;color:var(--text-muted);">
              * ข้อมูลทั้งหมดเก็บเฉพาะตัวเลขสถิติ ไม่มีการเก็บชื่อ นามสกุล ชั้น หรือเลขที่นักเรียนลงในฐานข้อมูลสถิติ
            </p>
          </section>
        </div>

        <!-- Chart 4: Realtime Recent Scores Trend -->
        <section class="card-inset">
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
            <h3 class="dash-chart-title" style="margin:0;">5. แนวโน้มคะแนน 25 รอบล่าสุด (Realtime)</h3>
            <div style="font-size:0.78rem;color:var(--text-muted);">
              <span style="color:var(--sky);font-weight:700;">● ทดลองสอบ</span> ·
              <span style="color:var(--danger);font-weight:700;">● สอบจริง</span>
            </div>
          </div>
          <div class="dash-svg-wrap">${renderRecentTrendSvg(bucket)}</div>
        </section>
      </div>
    `;
  }

  return {
    STATS_API_URL,
    SPREADSHEET_VIEW_URL,
    TEACHER_PIN,
    STORAGE_KEYS,
    TEMPLATES,
    DIST_SYSTEMS,
    getConfiguredApiUrl,
    createEmptyBucket,
    createEmptyStore,
    loadLocalBuckets,
    buildAnonymousEvent,
    applyEventToBucket,
    recordExamStats,
    fetchDashboardData,
    verifyPin,
    renderDashboardHtml
  };
});
