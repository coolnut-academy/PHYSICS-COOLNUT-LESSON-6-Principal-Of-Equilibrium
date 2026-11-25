/* ==========================================================================
   Moment Lab — Pure Physics Engine, Question Generator, Solver & Grader
   Supports cm, m, and mixed m+cm distances with exact BigInt rational math
   and structured KaTeX LaTeX step-by-step solutions.
   Zero DOM dependencies. Works in Browser (window.MomentLab.Physics) & Node.js
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MomentLab = root.MomentLab || {};
  root.MomentLab.Physics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const APP_VERSION = '1.1';
  const SCHEMA_VERSION = 1;
  const DURATION_MS = 15 * 60 * 1000;
  const G_VALUE = 9.8;
  const UNITS = ['kg', 'g', 'cm', 'm', 'N', 'N·m'];
  const SLOT_POINTS_HALF = [5, 5, 10]; // 2.5 + 2.5 + 5.0 = 10.0
  const MAX_POINTS_HALF = 20;

  const THAI_DIGITS = {
    '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
    '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
  };

  /* ------------------------------------------------------------------------
     Exact BigInt Rational Arithmetic (Frac)
     ------------------------------------------------------------------------ */
  function absBig(a) {
    return a < 0n ? -a : a;
  }

  function gcdBig(a, b) {
    a = absBig(a);
    b = absBig(b);
    while (b !== 0n) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a === 0n ? 1n : a;
  }

  function frac(num, den = 1n) {
    const n = typeof num === 'bigint' ? num : BigInt(Math.round(num));
    const d = typeof den === 'bigint' ? den : BigInt(Math.round(den));
    if (d === 0n) throw new Error('Division by zero in Frac');
    const sign = d < 0n ? -1n : 1n;
    const rn = n * sign;
    const rd = d * sign;
    const g = gcdBig(rn, rd);
    return { num: rn / g, den: rd / g };
  }

  function fracFromDecimalStr(str) {
    const clean = str.trim();
    const neg = clean.startsWith('-');
    const body = neg ? clean.slice(1) : clean;
    const parts = body.split('.');
    const intPart = parts[0] || '0';
    const decPart = parts[1] || '';
    const scale = 10n ** BigInt(decPart.length);
    const num = BigInt(intPart + decPart) * (neg ? -1n : 1n);
    return frac(num, scale);
  }

  function fracAdd(a, b) {
    return frac(a.num * b.den + b.num * a.den, a.den * b.den);
  }

  function fracSub(a, b) {
    return frac(a.num * b.den - b.num * a.den, a.den * b.den);
  }

  function fracMul(a, b) {
    return frac(a.num * b.num, a.den * b.den);
  }

  function fracDiv(a, b) {
    if (b.num === 0n) throw new Error('Division by zero in fracDiv');
    return frac(a.num * b.den, a.den * b.num);
  }

  function fracCmp(a, b) {
    const left = a.num * b.den;
    const right = b.num * a.den;
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function fracEq(a, b) {
    return a.num === b.num && a.den === b.den;
  }

  function fracToNumber(f) {
    return Number(f.num) / Number(f.den);
  }

  function terminatingDecimals(f) {
    let d = f.den;
    let c2 = 0;
    let c5 = 0;
    while (d % 2n === 0n) { d /= 2n; c2++; }
    while (d % 5n === 0n) { d /= 5n; c5++; }
    if (d !== 1n) return null;
    return Math.max(c2, c5);
  }

  function roundFracHalfUp(f, k) {
    const scale = 10n ** BigInt(k);
    const neg = f.num < 0n;
    const absN = absBig(f.num);
    const roundedInt = (absN * scale * 2n + f.den) / (2n * f.den);
    return frac(neg ? -roundedInt : roundedInt, scale);
  }

  function formatFracFixed(f, k) {
    const scale = 10n ** BigInt(k);
    const neg = f.num < 0n;
    const absN = absBig(f.num);
    const roundedInt = (absN * scale * 2n + f.den) / (2n * f.den);
    const str = roundedInt.toString().padStart(k + 1, '0');
    const sign = neg && roundedInt !== 0n ? '-' : '';
    if (k === 0) return sign + str;
    const intPart = str.slice(0, str.length - k);
    const decPart = str.slice(str.length - k);
    return sign + intPart + '.' + decPart;
  }

  function formatFracClean(f, opts = {}) {
    const minDec = opts.minDec || 0;
    const maxDec = opts.maxDec || 4;
    const term = terminatingDecimals(f);
    if (term !== null && term <= maxDec) {
      const k = Math.max(minDec, term);
      let s = formatFracFixed(f, k);
      if (term < k) return s;
      if (s.includes('.') && minDec < k) {
        s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        if (minDec > 0) {
          const idx = s.indexOf('.');
          if (idx === -1) {
            s += '.' + '0'.repeat(minDec);
          } else {
            const cur = s.length - idx - 1;
            if (cur < minDec) s += '0'.repeat(minDec - cur);
          }
        }
      }
      return s;
    }
    return formatFracFixed(f, opts.fallbackDec || 2);
  }

  function formatMassKg(grams) {
    const f = frac(grams, 1000);
    const term = terminatingDecimals(f);
    if (term !== null && term <= 2) {
      return formatFracFixed(f, 2);
    }
    return formatFracClean(f, { minDec: 2, maxDec: 3 });
  }

  function formatNumberCompact(f) {
    const term = terminatingDecimals(f);
    if (term !== null && term <= 4) {
      return formatFracClean(f, { minDec: 0, maxDec: 4 });
    }
    return formatFracFixed(f, 2);
  }

  /**
   * Format a centimeter coordinate in either 'cm' or 'm' cleanly.
   */
  function formatDistValue(cmVal, unit) {
    if (unit === 'm') {
      const f = frac(cmVal, 100);
      if (f.num === 0n) return '0';
      return formatFracClean(f, { minDec: 2, maxDec: 3 });
    }
    return formatFracClean(frac(cmVal, 1), { minDec: 0, maxDec: 2 });
  }

  function formatDistFracInUnit(cmFrac, unit) {
    const valFrac = unit === 'm' ? fracDiv(cmFrac, frac(100, 1)) : cmFrac;
    if (unit === 'm') {
      return formatFracClean(valFrac, { minDec: 2, maxDec: 4 });
    }
    return formatFracClean(valFrac, { minDec: 0, maxDec: 4 });
  }

  function labelToLatex(label) {
    if (!label) return 'F';
    return String(label)
      .replace(/F₁/g, 'F_1')
      .replace(/F₂/g, 'F_2')
      .replace(/F₃/g, 'F_3')
      .replace(/F₄/g, 'F_4');
  }

  /* ------------------------------------------------------------------------
     Normalization & Student Number Validation
     ------------------------------------------------------------------------ */
  function normalizeThaiNumerals(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[๐-๙]/g, ch => THAI_DIGITS[ch] || ch);
  }

  function validateStudentNo(raw) {
    if (raw === null || raw === undefined) {
      return { valid: false, value: null, error: 'กรุณากรอกเลขที่ (1–41)' };
    }
    const str = normalizeThaiNumerals(String(raw)).trim();
    if (!str) {
      return { valid: false, value: null, error: 'กรุณากรอกเลขที่ (1–41)' };
    }
    if (!/^\d+$/.test(str)) {
      return { valid: false, value: null, error: 'เลขที่ต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 41 เท่านั้น' };
    }
    const n = parseInt(str, 10);
    if (!Number.isSafeInteger(n) || n < 1 || n > 41) {
      return { valid: false, value: null, error: 'เลขที่ต้องอยู่ระหว่าง 1 ถึง 41' };
    }
    return { valid: true, value: n, error: null };
  }

  /* ------------------------------------------------------------------------
     Seeded PRNG (FNV-1a + Mulberry32) & Crypto Seed Generator
     ------------------------------------------------------------------------ */
  function hashSeedString(seedStr) {
    let h = 2166136261 >>> 0;
    const s = String(seedStr);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function createSeededRng(seed) {
    let state = typeof seed === 'number' ? (seed >>> 0) : hashSeedString(seed);
    if (state === 0) state = 0x9e3779b9;
    return {
      next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      pick(arr) {
        const idx = Math.floor(this.next() * arr.length);
        return arr[Math.min(idx, arr.length - 1)];
      },
      int(min, maxInclusive) {
        return min + Math.floor(this.next() * (maxInclusive - min + 1));
      }
    };
  }

  function generateRandomSeed() {
    let usedCrypto = false;
    const bytes = new Uint8Array(12);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
      usedCrypto = true;
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { seed: hex, usedCrypto };
  }

  function generateSessionId(mode) {
    const prefix = mode === 'real' ? 'R' : 'P';
    const { seed, usedCrypto } = generateRandomSeed();
    return {
      sessionId: `${prefix}-${seed.slice(0, 12)}`,
      seed,
      usedCrypto
    };
  }

  /* ------------------------------------------------------------------------
     Template Definitions & Parameter Pools (Blueprint §5 & §7.3)
     ------------------------------------------------------------------------ */
  const TEMPLATE_META = {
    M1: {
      id: 'M1', learnIndex: 1, kind: 'mass', arms: 4, pointsHalf: 10,
      badge: 'โจทย์ประยุกต์ 4 แขน (หามวล)',
      learnBadge: 'ตัวอย่างที่ 1 · โจทย์ประยุกต์ค่าคงที่',
      personalizedInLearn: false
    },
    F1: {
      id: 'F1', learnIndex: 2, kind: 'position', arms: 4, pointsHalf: 10,
      badge: 'โจทย์ประยุกต์ 4 แขน (หาตำแหน่งแรง)',
      learnBadge: 'ตัวอย่างที่ 2 · โจทย์ประยุกต์ค่าคงที่',
      personalizedInLearn: false
    },
    M2: {
      id: 'M2', learnIndex: 3, kind: 'mass', arms: 4, pointsHalf: 10,
      badge: 'โจทย์ประยุกต์ 4 แขน (หามวล)',
      learnBadge: 'ตัวอย่างที่ 3 · ใช้เลขที่ n (4 แขน)',
      personalizedInLearn: true
    },
    F2: {
      id: 'F2', learnIndex: 4, kind: 'position', arms: 4, pointsHalf: 10,
      badge: 'โจทย์ประยุกต์ 4 แขน (หาตำแหน่งแรง)',
      learnBadge: 'ตัวอย่างที่ 4 · ใช้เลขที่ n (4 แขน)',
      personalizedInLearn: true
    },
    MA: {
      id: 'MA', learnIndex: 5, kind: 'mass', arms: 3, pointsHalf: 5,
      badge: 'โจทย์ฝึกแนว A-Level (3 แขน · หามวล)',
      learnBadge: 'ตัวอย่างที่ 5 · ต้นแบบแนว A-Level (หามวล)',
      personalizedInLearn: false
    },
    FA: {
      id: 'FA', learnIndex: 6, kind: 'position', arms: 3, pointsHalf: 5,
      badge: 'โจทย์ฝึกแนว A-Level (3 แขน · หาตำแหน่งแรง)',
      learnBadge: 'ตัวอย่างที่ 6 · ต้นแบบแนว A-Level (หาตำแหน่งแรง)',
      personalizedInLearn: false
    }
  };

  const GENERATOR_POOLS = {
    MA: {
      layout: [
        { id: 'A', L: 100, p: 40, xKnown: 80, xUnk: 20 },
        { id: 'B', L: 100, p: 60, xKnown: 20, xUnk: 80 }, // mirrored
        { id: 'C', L: 100, p: 35, xKnown: 85, xUnk: 10 },
        { id: 'D', L: 100, p: 65, xKnown: 15, xUnk: 90 }, // mirrored
        { id: 'E', L: 100, p: 40, xKnown: 90, xUnk: 15 },
        { id: 'F', L: 100, p: 60, xKnown: 10, xUnk: 85 }  // mirrored
      ],
      R: [180, 200, 240, 280, 300, 340, 360, 400, 440, 480],
      B: [90, 110, 130, 150, 170, 190, 210, 230, 250, 270]
    },
    FA: {
      layout: [
        { id: 'A', L: 20, p: 10, x1: 0, x2: 4 },         // unk on RIGHT
        { id: 'B', L: 20, p: 10, x1: 20, x2: 16 },       // mirrored: unk on LEFT
        { id: 'C', L: 30, p: 15, x1: 0, x2: 6 },         // unk on RIGHT
        { id: 'D', L: 30, p: 15, x1: 30, x2: 24 },       // mirrored: unk on LEFT
        { id: 'E', L: 40, p: 20, x1: 0, x2: 8 },         // unk on RIGHT
        { id: 'F', L: 40, p: 20, x1: 40, x2: 32 }        // mirrored: unk on LEFT
      ],
      F1: [3, 4, 5, 6, 7, 8],
      A: [1, 2, 3, 4, 5, 6, 7, 8],
      F3: [40, 45, 50, 55, 60]
    },
    M1: {
      layout: [
        { id: 'A', L: 100, p: 40, xP: 10, xUnk: 20, xQ: 80 },
        { id: 'B', L: 100, p: 60, xP: 90, xUnk: 80, xQ: 20 }, // mirrored
        { id: 'C', L: 100, p: 40, xP: 5, xUnk: 15, xQ: 85 },
        { id: 'D', L: 100, p: 60, xP: 95, xUnk: 85, xQ: 15 }  // mirrored
      ],
      R: [200, 240, 280, 300, 340, 380, 400, 440],
      P: [50, 80, 100, 120, 150],
      B: [160, 180, 200, 220, 240, 260, 280, 300]
    },
    F1: {
      layout: [
        { id: 'A', L: 40, p: 20, x1: 0, x2: 10, x3: 40 },
        { id: 'B', L: 40, p: 20, x1: 40, x2: 30, x3: 0 },  // mirrored: unk on LEFT
        { id: 'C', L: 50, p: 25, x1: 0, x2: 10, x3: 50 },
        { id: 'D', L: 50, p: 25, x1: 50, x2: 40, x3: 0 }   // mirrored: unk on LEFT
      ],
      F1: [5, 6, 7, 8, 9, 10],
      A: [2, 3, 4, 5, 6, 7, 8],
      F3: [2, 3, 4],
      F4: [40, 45, 50, 55, 60]
    },
    M2: {
      layout: [
        { id: 'A', L: 100, p: 60, xP: 20, xQ: 80, xUnk: 100 },
        { id: 'B', L: 100, p: 40, xP: 80, xQ: 20, xUnk: 0 },   // mirrored
        { id: 'C', L: 100, p: 60, xP: 15, xQ: 75, xUnk: 95 },
        { id: 'D', L: 100, p: 40, xP: 85, xQ: 25, xUnk: 5 }    // mirrored
      ],
      R: [300, 340, 380, 400, 440, 480, 500],
      B: [120, 140, 160, 180, 200, 220, 240, 260],
      Q: [80, 100, 120, 150, 180, 200]
    },
    F2: {
      layout: [
        { id: 'A', L: 60, p: 30, x1: 0, x2: 20, x3: 60 },
        { id: 'B', L: 60, p: 30, x1: 60, x2: 40, x3: 0 },  // mirrored: unk on LEFT
        { id: 'C', L: 80, p: 40, x1: 0, x2: 25, x3: 80 },
        { id: 'D', L: 80, p: 40, x1: 80, x2: 55, x3: 0 }   // mirrored: unk on LEFT
      ],
      F1: [8, 9, 10, 11, 12, 13],
      A: [3, 4, 5, 6, 7, 8, 9],
      F3: [3, 4, 5],
      F4: [40, 45, 50, 55, 60]
    }
  };

  /* ------------------------------------------------------------------------
     Apply Distance Unit Style ('cm' | 'm' | 'mixed_cm' | 'mixed_m')
     - For mass templates: keeps L = 100 cm (= 1.00 m), changes presentation & calcUnit
     - For position templates:
       * 'cm' / 'mixed_cm': original cm length (20/40/60 cm), expectedUnit = 'cm'
       * 'm' / 'mixed_m': 10x beam length (2.00/4.00/6.00 m = 200/400/600 cm), expectedUnit = 'm'
         (guarantees unique 2-decimal answers across all n = 1..41!)
     ------------------------------------------------------------------------ */
  function applyDistanceSystem(q, distanceSystem) {
    const sys = distanceSystem || 'cm';
    q.distanceSystem = sys;

    if (q.unknown.type === 'mass') {
      if (sys === 'm') {
        q.rodDisplayUnit = 'm';
        q.pivotDisplayUnit = 'm';
        q.calcUnit = 'm';
        q.loads.forEach(l => { l.posUnit = 'm'; });
      } else if (sys === 'mixed_m') {
        q.rodDisplayUnit = 'm';
        q.pivotDisplayUnit = 'm';
        q.calcUnit = 'm';
        q.loads.forEach((l, idx) => {
          l.posUnit = idx === 0 ? 'cm' : 'm';
        });
      } else if (sys === 'mixed_cm') {
        q.rodDisplayUnit = 'm';
        q.pivotDisplayUnit = 'cm';
        q.calcUnit = 'cm';
        q.loads.forEach((l, idx) => {
          l.posUnit = idx === q.loads.length - 1 ? 'm' : 'cm';
        });
      } else {
        q.rodDisplayUnit = 'cm';
        q.pivotDisplayUnit = 'cm';
        q.calcUnit = 'cm';
        q.loads.forEach(l => { l.posUnit = 'cm'; });
      }
      return q;
    }

    // Position templates
    const isMeterScale = (sys === 'm' || sys === 'mixed_m');
    if (isMeterScale) {
      // Scale to realistic multi-meter beam (2.0 m / 4.0 m / 6.0 m)
      q.lengthCm *= 10;
      q.pivotCm *= 10;
      q.loads.forEach(l => {
        if (typeof l.xCm === 'number') l.xCm *= 10;
      });
      q.unknown.expectedUnit = 'm';
      q.calcUnit = 'm';
      q.rodDisplayUnit = 'm';
      q.pivotDisplayUnit = 'm';
      q.loads.forEach((l, idx) => {
        if (l.unknown) {
          l.posUnit = 'm';
        } else if (sys === 'mixed_m' && idx === 1) {
          // F2 position given in cm (e.g., 40 cm on a 2.00 m beam) so student converts cm -> m!
          l.posUnit = 'cm';
        } else {
          l.posUnit = 'm';
        }
      });
    } else {
      q.unknown.expectedUnit = 'cm';
      q.calcUnit = 'cm';
      if (sys === 'mixed_cm') {
        q.rodDisplayUnit = 'm';
        q.pivotDisplayUnit = 'm';
        q.loads.forEach(l => {
          l.posUnit = 'cm';
        });
      } else {
        q.rodDisplayUnit = 'cm';
        q.pivotDisplayUnit = 'cm';
        q.loads.forEach(l => {
          l.posUnit = 'cm';
        });
      }
    }
    return q;
  }

  /* ------------------------------------------------------------------------
     Original 6 Learn Examples (Blueprint §5.1 – §5.6) + Optional Unit Practice
     ------------------------------------------------------------------------ */
  function getLearnQuestion(templateId, studentNo = 1, distanceSystem = 'cm') {
    const v = validateStudentNo(studentNo);
    const n = v.valid ? v.value : 1;
    let q;

    switch (templateId) {
      case 'M1':
        q = {
          id: `LEARN-M1-${distanceSystem}`,
          templateId: 'M1',
          variantId: `LEARN-M1-FIXED-${distanceSystem}`,
          sourceType: 'learn',
          pointsHalf: 10,
          studentNo: null,
          lengthCm: 100,
          pivotCm: 40,
          rod: { uniform: true, massGrams: 300 },
          loads: [
            { id: 'P1', label: 'P₁', kind: 'mass', xCm: 10, massGrams: 100, displayUnit: 'kg' },
            { id: 'P2', label: 'm', kind: 'mass', xCm: 20, massGrams: null, unknown: 'mass' },
            { id: 'P3', label: 'P₂', kind: 'mass', xCm: 80, massGrams: 200, displayUnit: 'kg' }
          ],
          unknown: { type: 'mass', loadId: 'P2', symbol: 'm', expectedUnit: 'kg' },
          originalChoices: null
        };
        break;

      case 'F1':
        q = {
          id: `LEARN-F1-${distanceSystem}`,
          templateId: 'F1',
          variantId: `LEARN-F1-FIXED-${distanceSystem}`,
          sourceType: 'learn',
          pointsHalf: 10,
          studentNo: null,
          lengthCm: 40,
          pivotCm: 20,
          rod: { uniform: true, massGrams: null },
          loads: [
            { id: 'F1', label: 'F₁', kind: 'force', xCm: 0, forceN: 6 },
            { id: 'F2', label: 'F₂', kind: 'force', xCm: 10, forceN: 4 },
            { id: 'F3', label: 'F₃', kind: 'force', xCm: 40, forceN: 3 },
            { id: 'F4', label: 'F₄', kind: 'force', xCm: null, forceN: 10, unknown: 'position' }
          ],
          unknown: { type: 'position', loadId: 'F4', symbol: 'x', expectedUnit: 'cm' },
          originalChoices: null
        };
        break;

      case 'M2': {
        const pGrams = 100 + 10 * n;
        q = {
          id: `LEARN-M2-N${n}-${distanceSystem}`,
          templateId: 'M2',
          variantId: `LEARN-M2-FIXED-N${n}-${distanceSystem}`,
          sourceType: 'learn',
          pointsHalf: 10,
          studentNo: n,
          lengthCm: 100,
          pivotCm: 60,
          rod: { uniform: true, massGrams: 400 },
          loads: [
            {
              id: 'P1',
              label: 'P₁',
              kind: 'mass',
              xCm: 20,
              massGrams: pGrams,
              displayUnit: 'g',
              param: { base: 100, coefficient: 10, variable: 'n', unit: 'g', exprText: '100 + 10n' }
            },
            { id: 'P2', label: 'P₂', kind: 'mass', xCm: 80, massGrams: 100, displayUnit: 'kg' },
            { id: 'P3', label: 'm', kind: 'mass', xCm: 100, massGrams: null, unknown: 'mass' }
          ],
          unknown: { type: 'mass', loadId: 'P3', symbol: 'm', expectedUnit: 'kg' },
          originalChoices: null
        };
        break;
      }

      case 'F2': {
        const f2N = n + 4;
        q = {
          id: `LEARN-F2-N${n}-${distanceSystem}`,
          templateId: 'F2',
          variantId: `LEARN-F2-FIXED-N${n}-${distanceSystem}`,
          sourceType: 'learn',
          pointsHalf: 10,
          studentNo: n,
          lengthCm: 60,
          pivotCm: 30,
          rod: { uniform: true, massGrams: null },
          loads: [
            { id: 'F1', label: 'F₁', kind: 'force', xCm: 0, forceN: 10 },
            {
              id: 'F2',
              label: 'F₂',
              kind: 'force',
              xCm: 20,
              forceN: f2N,
              param: { base: 4, coefficient: 1, variable: 'n', unit: 'N', exprText: 'n + 4', orderVarFirst: true }
            },
            { id: 'F3', label: 'F₃', kind: 'force', xCm: 60, forceN: 4 },
            { id: 'F4', label: 'F₄', kind: 'force', xCm: null, forceN: 25, unknown: 'position' }
          ],
          unknown: { type: 'position', loadId: 'F4', symbol: 'x', expectedUnit: 'cm' },
          originalChoices: null
        };
        break;
      }

      case 'MA':
        q = {
          id: `LEARN-MA-${distanceSystem}`,
          templateId: 'MA',
          variantId: `LEARN-MA-FIXED-${distanceSystem}`,
          sourceType: 'learn',
          pointsHalf: 5,
          studentNo: null,
          lengthCm: 100,
          pivotCm: 40,
          rod: { uniform: true, massGrams: 200 },
          loads: [
            { id: 'P1', label: 'P₁', kind: 'mass', xCm: 80, massGrams: 300, displayUnit: 'kg' },
            { id: 'P2', label: 'm', kind: 'mass', xCm: 20, massGrams: null, unknown: 'mass' }
          ],
          unknown: { type: 'mass', loadId: 'P2', symbol: 'm', expectedUnit: 'kg' },
          originalChoices: distanceSystem === 'cm' ? ['0.30 kg', '0.40 kg', '0.50 kg', '0.60 kg', '0.70 kg'] : null,
          originalCorrectChoice: distanceSystem === 'cm' ? 5 : null
        };
        break;

      case 'FA':
        q = {
          id: `LEARN-FA-${distanceSystem}`,
          templateId: 'FA',
          variantId: `LEARN-FA-FIXED-${distanceSystem}`,
          sourceType: 'learn',
          pointsHalf: 5,
          studentNo: null,
          lengthCm: 20,
          pivotCm: 10,
          rod: { uniform: true, massGrams: null },
          loads: [
            { id: 'F1', label: 'F₁', kind: 'force', xCm: 0, forceN: 5 },
            { id: 'F2', label: 'F₂', kind: 'force', xCm: 4, forceN: 3 },
            { id: 'F3', label: 'F₃', kind: 'force', xCm: null, forceN: 8, unknown: 'position' }
          ],
          unknown: { type: 'position', loadId: 'F3', symbol: 'x', expectedUnit: 'cm' },
          originalChoices: distanceSystem === 'cm' ? ['8.5 cm', '10.0 cm', '16.5 cm', '17.8 cm', '18.5 cm'] : null,
          originalCorrectChoice: distanceSystem === 'cm' ? 5 : null
        };
        break;

      default:
        throw new Error(`Unknown templateId: ${templateId}`);
    }

    applyDistanceSystem(q, distanceSystem);
    return attachProblemText(q);
  }

  /* ------------------------------------------------------------------------
     Build Question From Explicit Parameters (Supports Default & Varied Layouts)
     ------------------------------------------------------------------------ */
  function buildQuestionFromParams(templateId, n, params, slotId, distanceSystem = 'cm') {
    const v = validateStudentNo(n);
    if (!v.valid) throw new Error(v.error);
    const numN = v.value;
    const ds = distanceSystem || 'cm';

    let q;
    switch (templateId) {
      case 'MA': {
        const lay = params.layout || GENERATOR_POOLS.MA.layout[0];
        const { R, B } = params;
        const pGrams = B + 10 * numN;
        q = {
          id: slotId || `MA-${lay.id}-R${R}-B${B}-N${numN}-${ds}`,
          templateId: 'MA',
          variantId: `MA:L=${lay.id},R=${R},B=${B},U=${ds}`,
          sourceType: 'generated',
          pointsHalf: 5,
          studentNo: numN,
          lengthCm: lay.L,
          pivotCm: lay.p,
          rod: { uniform: true, massGrams: R },
          loads: [
            {
              id: 'P1',
              label: 'P₁',
              kind: 'mass',
              xCm: lay.xKnown,
              massGrams: pGrams,
              displayUnit: 'g',
              param: { base: B, coefficient: 10, variable: 'n', unit: 'g', exprText: `${B} + 10n` }
            },
            { id: 'P2', label: 'm', kind: 'mass', xCm: lay.xUnk, massGrams: null, unknown: 'mass' }
          ],
          unknown: { type: 'mass', loadId: 'P2', symbol: 'm', expectedUnit: 'kg' }
        };
        break;
      }

      case 'FA': {
        const lay = params.layout || GENERATOR_POOLS.FA.layout[0];
        const { F1, A, F3 } = params;
        const f2 = A + numN;
        q = {
          id: slotId || `FA-${lay.id}-F1_${F1}-A${A}-F3_${F3}-N${numN}-${ds}`,
          templateId: 'FA',
          variantId: `FA:L=${lay.id},F1=${F1},A=${A},F3=${F3},U=${ds}`,
          sourceType: 'generated',
          pointsHalf: 5,
          studentNo: numN,
          lengthCm: lay.L,
          pivotCm: lay.p,
          rod: { uniform: true, massGrams: null },
          loads: [
            { id: 'F1', label: 'F₁', kind: 'force', xCm: lay.x1, forceN: F1 },
            {
              id: 'F2',
              label: 'F₂',
              kind: 'force',
              xCm: lay.x2,
              forceN: f2,
              param: { base: A, coefficient: 1, variable: 'n', unit: 'N', exprText: `${A} + n` }
            },
            { id: 'F3', label: 'F₃', kind: 'force', xCm: null, forceN: F3, unknown: 'position' }
          ],
          unknown: { type: 'position', loadId: 'F3', symbol: 'x', expectedUnit: 'cm' }
        };
        break;
      }

      case 'M1': {
        const lay = params.layout || GENERATOR_POOLS.M1.layout[0];
        const { R, P, B } = params;
        const qGrams = B + 10 * numN;
        q = {
          id: slotId || `M1-${lay.id}-R${R}-P${P}-B${B}-N${numN}-${ds}`,
          templateId: 'M1',
          variantId: `M1:L=${lay.id},R=${R},P=${P},B=${B},U=${ds}`,
          sourceType: 'generated',
          pointsHalf: 10,
          studentNo: numN,
          lengthCm: lay.L,
          pivotCm: lay.p,
          rod: { uniform: true, massGrams: R },
          loads: [
            { id: 'P1', label: 'P₁', kind: 'mass', xCm: lay.xP, massGrams: P, displayUnit: 'kg' },
            { id: 'P2', label: 'm', kind: 'mass', xCm: lay.xUnk, massGrams: null, unknown: 'mass' },
            {
              id: 'P3',
              label: 'P₂',
              kind: 'mass',
              xCm: lay.xQ,
              massGrams: qGrams,
              displayUnit: 'g',
              param: { base: B, coefficient: 10, variable: 'n', unit: 'g', exprText: `${B} + 10n` }
            }
          ],
          unknown: { type: 'mass', loadId: 'P2', symbol: 'm', expectedUnit: 'kg' }
        };
        break;
      }

      case 'F1': {
        const lay = params.layout || GENERATOR_POOLS.F1.layout[0];
        const { F1, A, F3, F4 } = params;
        const f2 = A + numN;
        q = {
          id: slotId || `F1-${lay.id}-F1_${F1}-A${A}-F3_${F3}-F4_${F4}-N${numN}-${ds}`,
          templateId: 'F1',
          variantId: `F1:L=${lay.id},F1=${F1},A=${A},F3=${F3},F4=${F4},U=${ds}`,
          sourceType: 'generated',
          pointsHalf: 10,
          studentNo: numN,
          lengthCm: lay.L,
          pivotCm: lay.p,
          rod: { uniform: true, massGrams: null },
          loads: [
            { id: 'F1', label: 'F₁', kind: 'force', xCm: lay.x1, forceN: F1 },
            {
              id: 'F2',
              label: 'F₂',
              kind: 'force',
              xCm: lay.x2,
              forceN: f2,
              param: { base: A, coefficient: 1, variable: 'n', unit: 'N', exprText: `${A} + n` }
            },
            { id: 'F3', label: 'F₃', kind: 'force', xCm: lay.x3, forceN: F3 },
            { id: 'F4', label: 'F₄', kind: 'force', xCm: null, forceN: F4, unknown: 'position' }
          ],
          unknown: { type: 'position', loadId: 'F4', symbol: 'x', expectedUnit: 'cm' }
        };
        break;
      }

      case 'M2': {
        const lay = params.layout || GENERATOR_POOLS.M2.layout[0];
        const { R, B, Q } = params;
        const pGrams = B + 10 * numN;
        q = {
          id: slotId || `M2-${lay.id}-R${R}-B${B}-Q${Q}-N${numN}-${ds}`,
          templateId: 'M2',
          variantId: `M2:L=${lay.id},R=${R},B=${B},Q=${Q},U=${ds}`,
          sourceType: 'generated',
          pointsHalf: 10,
          studentNo: numN,
          lengthCm: lay.L,
          pivotCm: lay.p,
          rod: { uniform: true, massGrams: R },
          loads: [
            {
              id: 'P1',
              label: 'P₁',
              kind: 'mass',
              xCm: lay.xP,
              massGrams: pGrams,
              displayUnit: 'g',
              param: { base: B, coefficient: 10, variable: 'n', unit: 'g', exprText: `${B} + 10n` }
            },
            { id: 'P2', label: 'P₂', kind: 'mass', xCm: lay.xQ, massGrams: Q, displayUnit: 'kg' },
            { id: 'P3', label: 'm', kind: 'mass', xCm: lay.xUnk, massGrams: null, unknown: 'mass' }
          ],
          unknown: { type: 'mass', loadId: 'P3', symbol: 'm', expectedUnit: 'kg' }
        };
        break;
      }

      case 'F2': {
        const lay = params.layout || GENERATOR_POOLS.F2.layout[0];
        const { F1, A, F3, F4 } = params;
        const f2 = A + numN;
        q = {
          id: slotId || `F2-${lay.id}-F1_${F1}-A${A}-F3_${F3}-F4_${F4}-N${numN}-${ds}`,
          templateId: 'F2',
          variantId: `F2:L=${lay.id},F1=${F1},A=${A},F3=${F3},F4=${F4},U=${ds}`,
          sourceType: 'generated',
          pointsHalf: 10,
          studentNo: numN,
          lengthCm: lay.L,
          pivotCm: lay.p,
          rod: { uniform: true, massGrams: null },
          loads: [
            { id: 'F1', label: 'F₁', kind: 'force', xCm: lay.x1, forceN: F1 },
            {
              id: 'F2',
              label: 'F₂',
              kind: 'force',
              xCm: lay.x2,
              forceN: f2,
              param: { base: A, coefficient: 1, variable: 'n', unit: 'N', exprText: `${A} + n` }
            },
            { id: 'F3', label: 'F₃', kind: 'force', xCm: lay.x3, forceN: F3 },
            { id: 'F4', label: 'F₄', kind: 'force', xCm: null, forceN: F4, unknown: 'position' }
          ],
          unknown: { type: 'position', loadId: 'F4', symbol: 'x', expectedUnit: 'cm' }
        };
        break;
      }

      default:
        throw new Error(`Unknown templateId: ${templateId}`);
    }

    applyDistanceSystem(q, ds);
    return attachProblemText(q);
  }

  /* ------------------------------------------------------------------------
     Problem Text Composer (Plain + Rich with $...$ inline KaTeX math)
     ------------------------------------------------------------------------ */
  function distUnitThai(unit) {
    return unit === 'm' ? 'เมตร' : 'เซนติเมตร';
  }

  function formatLoadRich(load, studentNo) {
    const u = load.posUnit || 'cm';
    const xDisp = formatDistValue(load.xCm, u);
    const posStr = `$x = ${xDisp}\\text{ ${u}}$`;
    const posPlain = `${xDisp} ${distUnitThai(u)}`;

    if (load.kind === 'mass') {
      if (load.param) {
        return {
          rich: `วัตถุมวล $(${load.param.exprText})\\text{ g}$ (สำหรับเลขที่ $n = ${studentNo}$ เท่ากับ $${load.massGrams}\\text{ g}$) ที่ตำแหน่ง ${posStr}`,
          plain: `วัตถุมวล (${load.param.exprText}) กรัม (สำหรับเลขที่ n = ${studentNo} เท่ากับ ${load.massGrams} กรัม) ที่ตำแหน่ง ${posPlain}`
        };
      }
      const kgStr = formatMassKg(load.massGrams);
      return {
        rich: `วัตถุมวล $${kgStr}\\text{ kg}$ ที่ตำแหน่ง ${posStr}`,
        plain: `วัตถุมวล ${kgStr} กิโลกรัม ที่ตำแหน่ง ${posPlain}`
      };
    } else {
      const fTex = labelToLatex(load.label);
      if (load.param) {
        return {
          rich: `แรง $${fTex} = (${load.param.exprText})\\text{ N}$ (สำหรับเลขที่ $n = ${studentNo}$ เท่ากับ $${load.forceN}\\text{ N}$) กดลงที่ตำแหน่ง ${posStr}`,
          plain: `แรง ${load.label} = (${load.param.exprText}) N (สำหรับเลขที่ n = ${studentNo} เท่ากับ ${load.forceN} N) กดลงที่ตำแหน่ง ${posPlain}`
        };
      }
      return {
        rich: `แรง $${fTex} = ${load.forceN}\\text{ N}$ กดลงที่ตำแหน่ง ${posStr}`,
        plain: `แรง ${load.label} = ${load.forceN} N กดลงที่ตำแหน่ง ${posPlain}`
      };
    }
  }

  function attachProblemText(q) {
    const knownLoads = q.loads.filter(l => !l.unknown);
    const unkLoad = q.loads.find(l => l.id === q.unknown.loadId);
    const n = q.studentNo;
    const lenU = q.rodDisplayUnit || 'cm';
    const pivU = q.pivotDisplayUnit || 'cm';
    const lenDisp = formatDistValue(q.lengthCm, lenU);
    const pivDisp = formatDistValue(q.pivotCm, pivU);

    const formattedLoads = knownLoads.map(l => formatLoadRich(l, n));
    const joinThai = arr => arr.length === 1 ? arr[0] : `${arr.slice(0, -1).join(', ')} และ${arr[arr.length - 1]}`;
    const loadsRich = joinThai(formattedLoads.map(f => f.rich));
    const loadsPlain = joinThai(formattedLoads.map(f => f.plain));

    if (q.unknown.type === 'mass') {
      const rodKg = formatMassKg(q.rod.massGrams);
      const unkU = unkLoad.posUnit || 'cm';
      const unkXDisp = formatDistValue(unkLoad.xCm, unkU);
      const rodName = q.lengthCm === 100 ? 'ไม้เมตรสม่ำเสมอ' : 'แท่งไม้สม่ำเสมอ';

      q.problemRich = `${rodName}ยาว $${lenDisp}\\text{ ${lenU}}$ มวล $${rodKg}\\text{ kg}$ มีจุดหมุนที่ตำแหน่ง $x = ${pivDisp}\\text{ ${pivU}}$ แขวน${loadsRich} จงหามวล $m$ (เป็นกิโลกรัม, $\\text{kg}$) ของวัตถุที่ต้องแขวนที่ตำแหน่ง $x = ${unkXDisp}\\text{ ${unkU}}$ เพื่อให้สมดุลต่อการหมุน`;
      q.problemText = `${rodName}ยาว ${lenDisp} ${distUnitThai(lenU)} มวล ${rodKg} กิโลกรัม มีจุดหมุนที่ตำแหน่ง ${pivDisp} ${distUnitThai(pivU)} แขวน${loadsPlain} จงหามวล m (เป็นกิโลกรัม, kg) ของวัตถุที่ต้องแขวนที่ตำแหน่ง ${unkXDisp} ${distUnitThai(unkU)} เพื่อให้สมดุลต่อการหมุน`;
    } else {
      const fTex = labelToLatex(unkLoad.label);
      const expU = q.unknown.expectedUnit || 'cm';
      const beamName = q.lengthCm >= 200 ? 'คานไม้สม่ำเสมอ' : 'แท่งไม้สม่ำเสมอ';

      q.problemRich = `${beamName}ยาว $${lenDisp}\\text{ ${lenU}}$ ไม่ทราบมวล วางบนลิ่มที่ตำแหน่งกึ่งกลาง $x = ${pivDisp}\\text{ ${pivU}}$ มี${loadsRich} จงหาตำแหน่ง $x$ (เป็น${distUnitThai(expU)}, $\\text{${expU}}$) ที่ต้องออกแรง $${fTex} = ${unkLoad.forceN}\\text{ N}$ กดลงเพื่อให้สมดุลต่อการหมุน`;
      q.problemText = `${beamName}ยาว ${lenDisp} ${distUnitThai(lenU)} ไม่ทราบมวล วางบนลิ่มที่ตำแหน่งกึ่งกลาง x = ${pivDisp} ${distUnitThai(pivU)} มี${loadsPlain} จงหาตำแหน่ง x (เป็น${distUnitThai(expU)}, ${expU}) ที่ต้องออกแรง ${unkLoad.label} = ${unkLoad.forceN} N กดลงเพื่อให้สมดุลต่อการหมุน`;
    }
    return q;
  }

  /* ------------------------------------------------------------------------
     Question Generator & Enumeration
     ------------------------------------------------------------------------ */
  function enumerateTemplateVariants(templateId, includeAllLayouts = false) {
    const pool = GENERATOR_POOLS[templateId];
    const layouts = includeAllLayouts ? pool.layout : [pool.layout[0]];
    const variants = [];
    if (templateId === 'MA') {
      for (const layout of layouts) for (const R of pool.R) for (const B of pool.B) variants.push({ layout, R, B });
    } else if (templateId === 'FA') {
      for (const layout of layouts) for (const F1 of pool.F1) for (const A of pool.A) for (const F3 of pool.F3) variants.push({ layout, F1, A, F3 });
    } else if (templateId === 'M1') {
      for (const layout of layouts) for (const R of pool.R) for (const P of pool.P) for (const B of pool.B) variants.push({ layout, R, P, B });
    } else if (templateId === 'F1') {
      for (const layout of layouts) for (const F1 of pool.F1) for (const A of pool.A) for (const F3 of pool.F3) for (const F4 of pool.F4) {
        variants.push({ layout, F1, A, F3, F4 });
      }
    } else if (templateId === 'M2') {
      for (const layout of layouts) for (const R of pool.R) for (const B of pool.B) for (const Q of pool.Q) variants.push({ layout, R, B, Q });
    } else if (templateId === 'F2') {
      for (const layout of layouts) for (const F1 of pool.F1) for (const A of pool.A) for (const F3 of pool.F3) for (const F4 of pool.F4) {
        variants.push({ layout, F1, A, F3, F4 });
      }
    } else {
      throw new Error(`Unknown templateId: ${templateId}`);
    }
    return variants;
  }

  function generateQuestion(templateId, n, rng, slotId, distanceSystem) {
    const pool = GENERATOR_POOLS[templateId];
    if (!pool) throw new Error(`No generator pool for ${templateId}`);
    const params = {};
    for (const key of Object.keys(pool)) {
      params[key] = rng.pick(pool[key]);
    }
    const ds = distanceSystem || rng.pick(['cm', 'm', 'mixed_cm', 'mixed_m']);
    return buildQuestionFromParams(templateId, n, params, slotId, ds);
  }

  /* ------------------------------------------------------------------------
     Pure Physics Solver (Exact Rational Arithmetic, Supports cm & m)
     ------------------------------------------------------------------------ */
  function solveQuestion(question) {
    const calcUnit = question.calcUnit || (question.unknown.expectedUnit === 'm' ? 'm' : 'cm');
    const unitScaleDiv = calcUnit === 'm' ? frac(100, 1) : frac(1, 1);
    const toCalcFrac = cmFrac => fracDiv(cmFrac, unitScaleDiv);

    const Lcm = frac(question.lengthCm, 1);
    const pcm = frac(question.pivotCm, 1);
    const xCmCm = fracDiv(Lcm, frac(2, 1));
    const rodPassesPivot = fracEq(xCmCm, pcm);

    const forceItems = [];

    // 1. Pivot reaction force (zero moment)
    forceItems.push({
      id: 'R_PIVOT',
      name: 'แรงปฏิกิริยาที่จุดหมุน',
      nameLatex: 'N_{\\text{จุดหมุน}}',
      kind: 'reaction',
      xCmFrac: pcm,
      xCm: question.pivotCm,
      xCalcFrac: toCalcFrac(pcm),
      distanceCmFrac: frac(0, 1),
      distanceCalcFrac: frac(0, 1),
      distanceCm: 0,
      direction: 'zero',
      includedInEquation: false
    });

    // 2. Rod weight at x_cm = L/2
    const rodKnownMass = question.rod && typeof question.rod.massGrams === 'number' && question.rod.massGrams > 0;
    const rodDistCmFrac = frac(Math.abs(fracToNumber(xCmCm) * 2 - question.pivotCm * 2), 2);
    const rodDistCalcFrac = toCalcFrac(rodDistCmFrac);
    const rodDir = rodPassesPivot ? 'zero' : (fracCmp(xCmCm, pcm) < 0 ? 'ccw' : 'cw');

    if (rodKnownMass && !rodPassesPivot) {
      const mKg = frac(question.rod.massGrams, 1000);
      forceItems.push({
        id: 'ROD_W',
        name: 'น้ำหนักแท่งไม้',
        nameLatex: 'W_{\\text{แท่ง}}',
        kind: 'rod',
        xCmFrac: xCmCm,
        xCm: fracToNumber(xCmCm),
        xCalcFrac: toCalcFrac(xCmCm),
        massGrams: question.rod.massGrams,
        massKgFrac: mKg,
        distanceCmFrac: rodDistCmFrac,
        distanceCalcFrac: rodDistCalcFrac,
        distanceCm: fracToNumber(rodDistCmFrac),
        direction: rodDir,
        momentNoGCalcFrac: fracMul(mKg, rodDistCalcFrac),
        includedInEquation: true
      });
    } else {
      forceItems.push({
        id: 'ROD_W',
        name: 'น้ำหนักแท่งไม้',
        nameLatex: 'W_{\\text{แท่ง}}',
        kind: 'rod',
        xCmFrac: xCmCm,
        xCm: fracToNumber(xCmCm),
        xCalcFrac: toCalcFrac(xCmCm),
        massGrams: rodKnownMass ? question.rod.massGrams : null,
        distanceCmFrac: frac(0, 1),
        distanceCalcFrac: frac(0, 1),
        distanceCm: 0,
        direction: 'zero',
        includedInEquation: false
      });
    }

    // 3. Known external loads
    let unknownLoad = null;
    for (const load of question.loads) {
      if (load.unknown) {
        unknownLoad = load;
        continue;
      }
      const lxCm = frac(load.xCm, 1);
      const dCm = frac(Math.abs(load.xCm - question.pivotCm), 1);
      const dCalc = toCalcFrac(dCm);
      const dir = load.xCm === question.pivotCm ? 'zero' : (load.xCm < question.pivotCm ? 'ccw' : 'cw');

      if (load.kind === 'mass') {
        const mKg = frac(load.massGrams, 1000);
        forceItems.push({
          id: load.id,
          name: `วัตถุมวล ${formatMassKg(load.massGrams)} kg`,
          nameLatex: `m_{${load.id.replace(/\D/g, '') || '1'}} = ${formatMassKg(load.massGrams)}\\text{ kg}`,
          kind: 'mass',
          xCmFrac: lxCm,
          xCm: load.xCm,
          xCalcFrac: toCalcFrac(lxCm),
          posUnit: load.posUnit || calcUnit,
          massGrams: load.massGrams,
          massKgFrac: mKg,
          param: load.param || null,
          distanceCmFrac: dCm,
          distanceCalcFrac: dCalc,
          distanceCm: Math.abs(load.xCm - question.pivotCm),
          direction: dir,
          momentNoGCalcFrac: fracMul(mKg, dCalc),
          includedInEquation: dir !== 'zero'
        });
      } else {
        const fN = frac(load.forceN, 1);
        forceItems.push({
          id: load.id,
          name: `แรง ${load.label}`,
          nameLatex: labelToLatex(load.label),
          kind: 'force',
          label: load.label,
          xCmFrac: lxCm,
          xCm: load.xCm,
          xCalcFrac: toCalcFrac(lxCm),
          posUnit: load.posUnit || calcUnit,
          forceN: load.forceN,
          forceNFrac: fN,
          param: load.param || null,
          distanceCmFrac: dCm,
          distanceCalcFrac: dCalc,
          distanceCm: Math.abs(load.xCm - question.pivotCm),
          direction: dir,
          momentCalcFrac: fracMul(fN, dCalc), // N·cm or N·m
          includedInEquation: dir !== 'zero'
        });
      }
    }

    if (!unknownLoad) throw new Error('Question has no unknown load');

    // 4. Solve
    if (question.unknown.type === 'mass') {
      const unkXCm = frac(unknownLoad.xCm, 1);
      const unkDCm = frac(Math.abs(unknownLoad.xCm - question.pivotCm), 1);
      if (unkDCm.num === 0n) throw new Error('Unknown mass sits on pivot');
      const unkDCalc = toCalcFrac(unkDCm);
      const unkDir = unknownLoad.xCm < question.pivotCm ? 'ccw' : 'cw';

      let knownCcw = frac(0, 1);
      let knownCw = frac(0, 1);
      for (const item of forceItems) {
        if (!item.includedInEquation) continue;
        if (item.direction === 'ccw') knownCcw = fracAdd(knownCcw, item.momentNoGCalcFrac);
        if (item.direction === 'cw') knownCw = fracAdd(knownCw, item.momentNoGCalcFrac);
      }

      const oppositeSum = unkDir === 'ccw' ? knownCw : knownCcw;
      const sameSideSum = unkDir === 'ccw' ? knownCcw : knownCw;
      const neededCalc = fracSub(oppositeSum, sameSideSum);
      const answerFrac = fracDiv(neededCalc, unkDCalc); // kg (unit-independent!)
      const answerGramsFrac = fracMul(answerFrac, frac(1000, 1));
      const unkMoment = fracMul(answerFrac, unkDCalc);

      forceItems.push({
        id: unknownLoad.id,
        name: 'วัตถุมวล m (หาค่า)',
        nameLatex: 'm',
        kind: 'mass',
        isUnknown: true,
        xCmFrac: unkXCm,
        xCm: unknownLoad.xCm,
        xCalcFrac: toCalcFrac(unkXCm),
        posUnit: unknownLoad.posUnit || calcUnit,
        massKgFrac: answerFrac,
        distanceCmFrac: unkDCm,
        distanceCalcFrac: unkDCalc,
        distanceCm: Math.abs(unknownLoad.xCm - question.pivotCm),
        direction: unkDir,
        momentNoGCalcFrac: unkMoment,
        includedInEquation: true
      });

      const totalCcw = unkDir === 'ccw' ? fracAdd(knownCcw, unkMoment) : knownCcw;
      const totalCw = unkDir === 'cw' ? fracAdd(knownCw, unkMoment) : knownCw;
      const round2Frac = roundFracHalfUp(answerFrac, 2);

      return {
        type: 'mass',
        calcUnit,
        momentUnit: calcUnit === 'm' ? 'N·m' : 'N·cm',
        momentUnitLatex: calcUnit === 'm' ? '\\text{N}\\cdot\\text{m}' : '\\text{N}\\cdot\\text{cm}',
        expectedUnit: 'kg',
        answerFrac,
        answerValue: fracToNumber(answerFrac),
        answerExactText: formatFracClean(answerFrac, { minDec: 2, maxDec: 4 }),
        answerRound2Frac: round2Frac,
        answerRound2Text: formatFracFixed(round2Frac, 2),
        needsRoundingNote: !fracEq(answerFrac, round2Frac),
        answerGramsFrac,
        xCmFrac: xCmCm,
        xCmCalcFrac: toCalcFrac(xCmCm),
        xCm: fracToNumber(xCmCm),
        pivotCalcFrac: toCalcFrac(pcm),
        lengthCalcFrac: toCalcFrac(Lcm),
        rodPassesPivot,
        unknownSide: unkDir,
        unknownDistanceFrac: unkDCalc,
        unknownDistanceCmFrac: unkDCm,
        unknownDistanceCm: fracToNumber(unkDCm),
        knownCcwFrac: knownCcw,
        knownCwFrac: knownCw,
        neededMomentFrac: neededCalc,
        verifyCcwFrac: totalCcw,
        verifyCwFrac: totalCw,
        balancedExact: fracEq(totalCcw, totalCw),
        activeArmCount: forceItems.filter(it => it.includedInEquation).length,
        forceItems
      };
    } else {
      const unkF = frac(unknownLoad.forceN, 1);
      if (unkF.num <= 0n) throw new Error('Unknown force must be positive');

      let knownCcw = frac(0, 1);
      let knownCw = frac(0, 1);
      for (const item of forceItems) {
        if (!item.includedInEquation) continue;
        if (item.direction === 'ccw') knownCcw = fracAdd(knownCcw, item.momentCalcFrac);
        if (item.direction === 'cw') knownCw = fracAdd(knownCw, item.momentCalcFrac);
      }

      const cmp = fracCmp(knownCcw, knownCw);
      if (cmp === 0) throw new Error('Known moments already balance');

      const unkDir = cmp > 0 ? 'cw' : 'ccw';
      const neededCalc = cmp > 0 ? fracSub(knownCcw, knownCw) : fracSub(knownCw, knownCcw);
      const unkDCalc = fracDiv(neededCalc, unkF);
      const unkDCm = fracMul(unkDCalc, unitScaleDiv);
      const pCalc = toCalcFrac(pcm);
      const answerCalcFrac = unkDir === 'cw' ? fracAdd(pCalc, unkDCalc) : fracSub(pCalc, unkDCalc);
      const answerCmFrac = fracMul(answerCalcFrac, unitScaleDiv);

      const unkMoment = fracMul(unkF, unkDCalc);
      forceItems.push({
        id: unknownLoad.id,
        name: `แรง ${unknownLoad.label} (หาตำแหน่ง x)`,
        nameLatex: labelToLatex(unknownLoad.label),
        kind: 'force',
        label: unknownLoad.label,
        isUnknown: true,
        xCmFrac: answerCmFrac,
        xCm: fracToNumber(answerCmFrac),
        xCalcFrac: answerCalcFrac,
        posUnit: calcUnit,
        forceN: unknownLoad.forceN,
        forceNFrac: unkF,
        distanceCmFrac: unkDCm,
        distanceCalcFrac: unkDCalc,
        distanceCm: fracToNumber(unkDCm),
        direction: unkDir,
        momentCalcFrac: unkMoment,
        includedInEquation: true
      });

      const totalCcw = unkDir === 'ccw' ? fracAdd(knownCcw, unkMoment) : knownCcw;
      const totalCw = unkDir === 'cw' ? fracAdd(knownCw, unkMoment) : knownCw;
      const round2Frac = roundFracHalfUp(answerCalcFrac, 2);
      const expectedUnit = question.unknown.expectedUnit || calcUnit;

      return {
        type: 'position',
        calcUnit,
        momentUnit: calcUnit === 'm' ? 'N·m' : 'N·cm',
        momentUnitLatex: calcUnit === 'm' ? '\\text{N}\\cdot\\text{m}' : '\\text{N}\\cdot\\text{cm}',
        expectedUnit,
        answerFrac: answerCalcFrac,
        answerCmFrac,
        answerCmValue: fracToNumber(answerCmFrac),
        answerValue: fracToNumber(answerCalcFrac),
        answerExactText: formatFracClean(answerCalcFrac, { minDec: expectedUnit === 'm' ? 2 : 0, maxDec: 4 }),
        answerRound2Frac: round2Frac,
        answerRound2Text: formatFracFixed(round2Frac, 2),
        needsRoundingNote: !fracEq(answerCalcFrac, round2Frac),
        isTerminating: terminatingDecimals(answerCalcFrac) !== null,
        xCmFrac: xCmCm,
        xCmCalcFrac: toCalcFrac(xCmCm),
        xCm: fracToNumber(xCmCm),
        pivotCalcFrac: pCalc,
        lengthCalcFrac: toCalcFrac(Lcm),
        rodPassesPivot,
        unknownSide: unkDir,
        unknownDistanceFrac: unkDCalc,
        unknownDistanceCmFrac: unkDCm,
        unknownDistanceCm: fracToNumber(unkDCm),
        knownCcwFrac: knownCcw,
        knownCwFrac: knownCw,
        neededMomentFrac: neededCalc,
        verifyCcwFrac: totalCcw,
        verifyCwFrac: totalCw,
        balancedExact: fracEq(totalCcw, totalCw),
        activeArmCount: forceItems.filter(it => it.includedInEquation).length,
        forceItems
      };
    }
  }

  /* ------------------------------------------------------------------------
     Validation (Blueprint §7.4)
     ------------------------------------------------------------------------ */
  function validateQuestion(question) {
    const errors = [];
    if (!question || typeof question !== 'object') {
      return { valid: false, errors: ['Question object missing'], solution: null };
    }
    if (question.studentNo !== null && question.studentNo !== undefined) {
      const vn = validateStudentNo(question.studentNo);
      if (!vn.valid) errors.push(`Invalid studentNo: ${question.studentNo}`);
    }
    if (!(question.lengthCm > 0)) errors.push('L must be > 0');
    if (!(question.pivotCm > 0 && question.pivotCm < question.lengthCm)) {
      errors.push('Pivot must be strictly inside (0, L)');
    }
    if (question.rod && question.rod.massGrams !== null && !(question.rod.massGrams > 0)) {
      errors.push('Rod mass must be positive when specified');
    }

    const knownPositions = [];
    for (const l of question.loads || []) {
      if (l.kind === 'mass') {
        if (!l.unknown && !(l.massGrams > 0)) errors.push(`Load ${l.id} mass must be > 0`);
        if (!(l.xCm >= 0 && l.xCm <= question.lengthCm)) errors.push(`Load ${l.id} x out of [0, L]`);
        if (l.xCm === question.pivotCm) errors.push(`Load ${l.id} sits at pivot`);
        knownPositions.push(l.xCm);
      } else if (l.kind === 'force') {
        if (!(l.forceN > 0)) errors.push(`Load ${l.id} force must be > 0`);
        if (!l.unknown) {
          if (!(l.xCm >= 0 && l.xCm <= question.lengthCm)) errors.push(`Load ${l.id} x out of [0, L]`);
          if (l.xCm === question.pivotCm) errors.push(`Load ${l.id} sits at pivot`);
          knownPositions.push(l.xCm);
        }
      }
    }

    const posSet = new Set(knownPositions);
    if (posSet.size !== knownPositions.length) errors.push('Duplicate known load positions');

    let solution = null;
    try {
      solution = solveQuestion(question);
    } catch (e) {
      errors.push(`Solver failed: ${e.message}`);
      return { valid: false, errors, solution: null };
    }

    const meta = TEMPLATE_META[question.templateId];
    if (meta && solution.activeArmCount !== meta.arms) {
      errors.push(`Expected ${meta.arms} nonzero arms, got ${solution.activeArmCount}`);
    }
    if (solution.neededMomentFrac.num <= 0n) {
      errors.push('Compensating moment must be > 0');
    }

    if (question.unknown.type === 'mass') {
      if (solution.answerFrac.num <= 0n) errors.push('Solved mass must be positive');
      if (question.sourceType === 'generated' && solution.answerValue < 0.12) {
        errors.push(`Generated mass too small (${solution.answerValue})`);
      }
      if (!solution.rodPassesPivot && posSet.has(solution.xCm)) errors.push('Rod CM collides with load position');
    } else {
      const xCmVal = solution.answerCmValue;
      const minMargin = question.sourceType === 'generated' ? question.lengthCm * 0.04 : 0;
      if (!(xCmVal > minMargin && xCmVal < question.lengthCm - minMargin)) {
        errors.push(`Solved position xCm=${xCmVal} out of safe bounds (${minMargin}, ${question.lengthCm - minMargin})`);
      }
      if (Math.abs(xCmVal - question.pivotCm) < (question.sourceType === 'generated' ? question.lengthCm * 0.05 : 1e-9)) {
        errors.push('Solved position too close to pivot');
      }
      for (const kp of knownPositions) {
        if (Math.abs(xCmVal - kp) < (question.sourceType === 'generated' ? question.lengthCm * 0.04 : 1e-9)) {
          errors.push(`Solved position collides with known load at ${kp}`);
        }
      }
    }

    const ccwNum = fracToNumber(solution.verifyCcwFrac);
    const cwNum = fracToNumber(solution.verifyCwFrac);
    const tol = 1e-8 * Math.max(1, ccwNum, cwNum);
    if (!solution.balancedExact || Math.abs(ccwNum - cwNum) > tol) {
      errors.push(`Moments not balanced: CCW=${ccwNum}, CW=${cwNum}`);
    }

    return { valid: errors.length === 0, errors, solution };
  }

  /* ------------------------------------------------------------------------
     Exam Generator — Guarantees Both m and cm Appear Across Every 3-Q Exam!
     ------------------------------------------------------------------------ */
  function getQuestionFingerprint(question, solution) {
    const sol = solution || solveQuestion(question);
    return {
      variant: `${question.templateId}|${question.variantId}|n=${question.studentNo}`,
      answer: `${question.templateId}|${sol.answerRound2Text}|${sol.expectedUnit}`
    };
  }

  function questionUsesUnit(q, unit) {
    if (q.rodDisplayUnit === unit || q.pivotDisplayUnit === unit || q.unknown.expectedUnit === unit) return true;
    return (q.loads || []).some(l => l.posUnit === unit);
  }

  function generateExam({ mode, studentNo, seed, lastFingerprints }) {
    const vn = validateStudentNo(studentNo);
    if (!vn.valid) throw new Error(vn.error);
    const n = vn.value;
    const rng = createSeededRng(`${seed}:${mode}:${n}`);

    // Support both legacy 3-element array and expanded multi-attempt history array
    const prevRaw = Array.isArray(lastFingerprints) ? lastFingerprints : [];
    const blockedVariants = new Set();
    const blockedAnswers = new Set();
    for (const item of prevRaw) {
      if (item && typeof item === 'object') {
        if (item.variant) blockedVariants.add(item.variant);
        if (item.answer) blockedAnswers.add(item.answer);
      }
    }

    const allDistSystems = ['cm', 'm', 'mixed_cm', 'mixed_m'];
    const q1Sys = rng.pick(allDistSystems);
    const q2SysPool = q1Sys === 'cm'
      ? ['m', 'mixed_m', 'mixed_cm']
      : q1Sys === 'm'
        ? ['cm', 'mixed_cm', 'mixed_m']
        : allDistSystems;
    const q2Sys = rng.pick(q2SysPool);
    const q3Sys = rng.pick(allDistSystems);

    const slotConfigs = [
      { slotIndex: 0, slotLabel: 'Q1', pool: ['MA'], pointsHalf: 5, distSys: q1Sys },
      { slotIndex: 1, slotLabel: 'Q2', pool: ['FA'], pointsHalf: 5, distSys: q2Sys },
      { slotIndex: 2, slotLabel: 'Q3', pool: ['M1', 'F1', 'M2', 'F2'], pointsHalf: 10, distSys: q3Sys }
    ];

    const questions = [];
    const fingerprints = [];

    for (const cfg of slotConfigs) {
      let chosen = null;
      let chosenFp = null;

      for (let attempt = 0; attempt < 120; attempt++) {
        const tplId = rng.pick(cfg.pool);
        const sys = attempt < 60 ? cfg.distSys : rng.pick(allDistSystems);
        const q = generateQuestion(tplId, n, rng, `${cfg.slotLabel}-${tplId}-N${n}-${attempt}`, sys);
        q.pointsHalf = cfg.pointsHalf;
        const check = validateQuestion(q);
        if (!check.valid) continue;
        const fp = getQuestionFingerprint(q, check.solution);
        // Avoid repeating recent variants AND avoid repeating recent answers!
        if (blockedVariants.has(fp.variant) || blockedAnswers.has(fp.answer)) continue;
        chosen = q;
        chosenFp = fp;
        blockedVariants.add(fp.variant);
        blockedAnswers.add(fp.answer);
        break;
      }

      if (!chosen) {
        outer: for (const tplId of cfg.pool) {
          const variants = enumerateTemplateVariants(tplId, true);
          for (let vi = 0; vi < variants.length; vi++) {
            const q = buildQuestionFromParams(tplId, n, variants[vi], `${cfg.slotLabel}-${tplId}-FB${vi}`, cfg.distSys);
            q.pointsHalf = cfg.pointsHalf;
            const check = validateQuestion(q);
            if (!check.valid) continue;
            const fp = getQuestionFingerprint(q, check.solution);
            if (!blockedVariants.has(fp.variant) && !blockedAnswers.has(fp.answer)) {
              chosen = q;
              chosenFp = fp;
              blockedVariants.add(fp.variant);
              blockedAnswers.add(fp.answer);
              break outer;
            }
          }
        }
      }

      if (!chosen) {
        const tplId = cfg.pool[0];
        const variants = enumerateTemplateVariants(tplId, true);
        for (let vi = 0; vi < variants.length; vi++) {
          const cand = buildQuestionFromParams(tplId, n, variants[vi], `${cfg.slotLabel}-${tplId}-SAFE`, cfg.distSys);
          cand.pointsHalf = cfg.pointsHalf;
          const check = validateQuestion(cand);
          if (check.valid) {
            chosen = cand;
            chosenFp = getQuestionFingerprint(cand, check.solution);
            break;
          }
        }
        if (!chosen) throw new Error(`Failed to generate valid question for ${cfg.slotLabel}`);
      }

      chosen.slotIndex = cfg.slotIndex;
      chosen.slotLabel = cfg.slotLabel;
      questions.push(chosen);
      fingerprints.push(chosenFp);
    }

    return { questions, fingerprints };
  }

  /* ------------------------------------------------------------------------
     Detailed KaTeX LaTeX Step-by-Step Solution Builder (Blueprint §6)
     Every equation has BOTH clean `latex` (Latin variables, real fractions,
     Thai inside \text{...}) AND readable plaintext `expr` fallback.
     ------------------------------------------------------------------------ */
  function buildSolutionSteps(question, solutionArg) {
    const sol = solutionArg || solveQuestion(question);
    const steps = [];
    const cu = sol.calcUnit; // 'cm' or 'm'
    const pCalcStr = formatNumberCompact(sol.pivotCalcFrac);
    const LCalcStr = formatNumberCompact(sol.lengthCalcFrac);
    const xCmCalcStr = formatNumberCompact(sol.xCmCalcFrac);
    const unkLoad = question.loads.find(l => l.id === question.unknown.loadId);
    const paramLoads = question.loads.filter(l => l.param);

    // ----------------------------------------------------------------------
    // STEP 1: แปลโจทย์ และแทนค่าเลขที่ n
    // ----------------------------------------------------------------------
    const step1Eqs = [];
    const lenDisp = formatDistValue(question.lengthCm, question.rodDisplayUnit || 'cm');
    const pivDisp = formatDistValue(question.pivotCm, question.pivotDisplayUnit || 'cm');

    step1Eqs.push({
      latex: `L = ${lenDisp}\\text{ ${question.rodDisplayUnit || 'cm'}}, \\quad x_{\\text{pivot}} = ${pivDisp}\\text{ ${question.pivotDisplayUnit || 'cm'}}`,
      expr: `L = ${lenDisp} ${question.rodDisplayUnit || 'cm'}, x_pivot = ${pivDisp} ${question.pivotDisplayUnit || 'cm'}`,
      note: 'ความยาวแท่งไม้และตำแหน่งจุดหมุนที่โจทย์กำหนด'
    });

    if (question.rod && question.rod.massGrams !== null) {
      const mRod = formatMassKg(question.rod.massGrams);
      step1Eqs.push({
        latex: `m_{\\text{แท่ง}} = ${mRod}\\text{ kg}`,
        expr: `m_แท่ง = ${mRod} kg`,
        note: 'มวลแท่งไม้สม่ำเสมอ (มีน้ำหนักกระทำที่กึ่งกลางแท่ง)'
      });
    } else {
      step1Eqs.push({
        latex: `m_{\\text{แท่ง}} = \\text{ไม่ทราบค่า (แท่งสม่ำเสมอ)}`,
        expr: 'มวลแท่งไม้ = ไม่ทราบค่า (แท่งสม่ำเสมอ)',
        note: 'จุดศูนย์กลางมวลอยู่ที่กึ่งกลางแท่ง'
      });
    }

    if (paramLoads.length > 0 && question.studentNo !== null) {
      const n = question.studentNo;
      for (const pl of paramLoads) {
        const pm = pl.param;
        const posDisp = formatDistValue(pl.xCm, pl.posUnit || cu);
        if (pl.kind === 'mass') {
          const termVal = pm.coefficient * n;
          step1Eqs.push({
            latex: `n = ${n}`,
            expr: `n = ${n}`,
            note: 'เลขที่นักเรียนที่นำมาแทนค่า'
          });
          step1Eqs.push({
            latex: `m_{\\text{ที่ } ${posDisp}\\text{ ${pl.posUnit || cu}}} = ${pm.base} + ${pm.coefficient}n\\text{ g}`,
            expr: `มวลที่ ${posDisp} ${pl.posUnit || cu} = ${pm.base} + ${pm.coefficient}n g`,
            note: 'สูตรมวลตามโจทย์'
          });
          step1Eqs.push({
            latex: `= ${pm.base} + ${pm.coefficient}(${n}) = ${pm.base} + ${termVal} = ${pl.massGrams}\\text{ g}`,
            expr: `= ${pm.base} + ${pm.coefficient}(${n}) = ${pm.base} + ${termVal} = ${pl.massGrams} g`,
            note: `แทน n = ${n} แล้วคำนวณทีละขั้น`
          });
        } else {
          const fTex = labelToLatex(pl.label);
          const exprLatex = pm.orderVarFirst ? `n + ${pm.base}` : `${pm.base} + n`;
          const subLatex = pm.orderVarFirst ? `${n} + ${pm.base}` : `${pm.base} + ${n}`;
          step1Eqs.push({
            latex: `n = ${n}`,
            expr: `n = ${n}`,
            note: 'เลขที่นักเรียนที่นำมาแทนค่า'
          });
          step1Eqs.push({
            latex: `${fTex} = ${exprLatex} = ${subLatex} = ${pl.forceN}\\text{ N}`,
            expr: `${pl.label} = ${exprLatex} = ${subLatex} = ${pl.forceN} N`,
            note: `แทน n = ${n} เพื่อหาขนาดแรง`
          });
        }
      }
    }

    if (question.unknown.type === 'mass') {
      const unkPosDisp = formatDistValue(unkLoad.xCm, unkLoad.posUnit || cu);
      step1Eqs.push({
        latex: `\\text{ต้องการหา: } m\\text{ (หน่วย kg) ที่ } x = ${unkPosDisp}\\text{ ${unkLoad.posUnit || cu}}`,
        expr: `ต้องการหา: m (kg) ที่ x = ${unkPosDisp} ${unkLoad.posUnit || cu}`,
        note: 'เป้าหมายและหน่วยคำตอบที่โจทย์สั่ง'
      });
    } else {
      const fTex = labelToLatex(unkLoad.label);
      step1Eqs.push({
        latex: `\\text{ต้องการหา: ตำแหน่ง } x\\text{ (หน่วย ${sol.expectedUnit}) ของแรง } ${fTex} = ${unkLoad.forceN}\\text{ N}`,
        expr: `ต้องการหา: ตำแหน่ง x (${sol.expectedUnit}) ของแรง ${unkLoad.label} = ${unkLoad.forceN} N`,
        note: 'เป้าหมายและหน่วยคำตอบที่โจทย์สั่ง'
      });
    }

    steps.push({
      id: 'step-1-parse',
      heading: 'ขั้นที่ 1: วิเคราะห์ข้อมูลโจทย์' + (paramLoads.length ? ` และแทนค่าเลขที่ n = ${question.studentNo}` : ''),
      explanation: paramLoads.length
        ? `ระบุค่าที่โจทย์กำหนด สิ่งที่ต้องหา และแทนค่าเลขที่ $n = ${question.studentNo}$ ลงในสูตรของโจทย์ก่อนเริ่มคำนวณ`
        : 'ระบุค่าที่โจทย์กำหนดทุกตัวและสิ่งที่ต้องหาพร้อมหน่วยให้ชัดเจน',
      equations: step1Eqs
    });

    // ----------------------------------------------------------------------
    // STEP 2: แปลงหน่วย (กรัม -> กิโลกรัม และแปลงระยะ m <-> cm ให้สอดคล้องกัน)
    // ----------------------------------------------------------------------
    const gramLoads = question.loads.filter(l => l.kind === 'mass' && l.displayUnit === 'g');
    const step2Eqs = [];

    for (const gl of gramLoads) {
      const kgText = formatMassKg(gl.massGrams);
      step2Eqs.push({
        latex: `${gl.massGrams}\\text{ g} = \\frac{${gl.massGrams}}{1000}\\text{ kg} = ${kgText}\\text{ kg}`,
        expr: `${gl.massGrams} g = ${gl.massGrams} / 1000 kg = ${kgText} kg`,
        note: 'แปลงมวลจากกรัม (g) เป็นกิโลกรัม (kg) โดยหารด้วย 1000'
      });
    }

    // Distance conversions whenever any given position/length/pivot differs from calcUnit
    const distConversions = [];
    const addDistConv = (descLatex, descPlain, cmVal, fromUnit) => {
      if (fromUnit === cu) return;
      const fromDisp = formatDistValue(cmVal, fromUnit);
      const toDisp = formatDistValue(cmVal, cu);
      if (fromUnit === 'm' && cu === 'cm') {
        distConversions.push({
          latex: `${descLatex} = ${fromDisp}\\text{ m} = ${fromDisp} \\times 100\\text{ cm} = ${toDisp}\\text{ cm}`,
          expr: `${descPlain} = ${fromDisp} m = ${fromDisp} × 100 cm = ${toDisp} cm`,
          note: 'แปลงเมตร (m) เป็นเซนติเมตร (cm) โดยคูณ 100'
        });
      } else if (fromUnit === 'cm' && cu === 'm') {
        distConversions.push({
          latex: `${descLatex} = ${fromDisp}\\text{ cm} = \\frac{${fromDisp}}{100}\\text{ m} = ${toDisp}\\text{ m}`,
          expr: `${descPlain} = ${fromDisp} cm = ${fromDisp} / 100 m = ${toDisp} m`,
          note: 'แปลงเซนติเมตร (cm) เป็นเมตร (m) โดยหาร 100'
        });
      }
    };

    addDistConv('L', 'ความยาว L', question.lengthCm, question.rodDisplayUnit || 'cm');
    addDistConv('x_{\\text{pivot}}', 'จุดหมุน', question.pivotCm, question.pivotDisplayUnit || 'cm');
    for (const l of question.loads) {
      if (typeof l.xCm === 'number' && l.posUnit && l.posUnit !== cu) {
        const lbl = l.kind === 'force' ? `x_{${labelToLatex(l.label)}}` : (l.unknown ? 'x_m' : `x_{${l.id}}`);
        addDistConv(lbl, `ตำแหน่ง ${l.label}`, l.xCm, l.posUnit);
      }
    }
    step2Eqs.push(...distConversions);

    if (cu === 'm') {
      step2Eqs.push({
        latex: `\\text{ใช้ระยะในหน่วย SI (m) ตลอดทั้งสมการ} \\;\\Rightarrow\\; \\text{หน่วยโมเมนต์คือ } \\text{N}\\cdot\\text{m}`,
        expr: 'ใช้ระยะในหน่วย m ตลอดทั้งสมการ -> หน่วยโมเมนต์คือ N·m',
        note: 'ทุกแขนโมเมนต์อยู่ในหน่วยเมตร (m) ตรงกันทั้งหมด'
      });
    } else {
      step2Eqs.push({
        latex: `\\text{ใช้ระยะในหน่วย cm ทั้งสองข้างของสมการ} \\;\\Rightarrow\\; \\text{หน่วยระหว่างทำคือ } \\text{N}\\cdot\\text{cm}`,
        expr: 'ใช้ระยะในหน่วย cm ทั้งสองข้างของสมการ -> หน่วยระหว่างทำคือ N·cm',
        note: 'ตัวคูณ 1/100 (แปลง cm → m) มีทั้งสองข้างจึงตัดกันได้'
      });
    }

    steps.push({
      id: 'step-2-units',
      heading: 'ขั้นที่ 2: ตรวจสอบและแปลงหน่วยให้สอดคล้องกัน',
      explanation: (gramLoads.length > 0 || distConversions.length > 0)
        ? `แปลงหน่วยมวลและ/หรือระยะทาง ($1\\text{ m} = 100\\text{ cm}$, $1\\text{ kg} = 1000\\text{ g}$) ให้เป็นหน่วยเดียวกันทั้งหมด (ระยะใช้หน่วย $\\text{${cu}}$) ก่อนตั้งสมการ`
        : `ตรวจสอบหน่วยของทุกปริมาณให้สอดคล้องกัน โดยใช้ระยะในหน่วย $\\text{${cu}}$ ตลอดทั้งสมการ`,
      equations: step2Eqs
    });

    // ----------------------------------------------------------------------
    // STEP 3: จุดหมุน จุดศูนย์กลางมวล และแรงโมเมนต์ศูนย์
    // ----------------------------------------------------------------------
    const step3Eqs = [
      {
        latex: `x_{\\text{pivot}} = ${pCalcStr}\\text{ ${cu}}`,
        expr: `x_pivot = ${pCalcStr} ${cu}`,
        note: 'ตำแหน่งจุดหมุนอ้างอิง'
      },
      {
        latex: `x_{\\text{cm}} = \\frac{L}{2} = \\frac{${LCalcStr}}{2} = ${xCmCalcStr}\\text{ ${cu}}`,
        expr: `x_cm = L / 2 = ${LCalcStr} / 2 = ${xCmCalcStr} ${cu}`,
        note: 'จุดศูนย์กลางมวลของแท่งไม้สม่ำเสมออยู่กึ่งกลางแท่ง'
      },
      {
        latex: `d_{\\text{ปฏิกิริยา}} = \\left|${pCalcStr} - ${pCalcStr}\\right| = 0\\text{ ${cu}} \\;\\Rightarrow\\; M_{\\text{ปฏิกิริยา}} = N \\times 0 = 0`,
        expr: `d_ปฏิกิริยา = |${pCalcStr} - ${pCalcStr}| = 0 ${cu} -> M = 0`,
        note: 'แนวแรงปฏิกิริยาผ่านจุดหมุนจึงไม่เกิดโมเมนต์'
      }
    ];

    if (sol.rodPassesPivot) {
      step3Eqs.push({
        latex: `d_{\\text{แท่ง}} = \\left|${xCmCalcStr} - ${pCalcStr}\\right| = 0\\text{ ${cu}} \\;\\Rightarrow\\; M_{\\text{แท่ง}} = W_{\\text{แท่ง}} \\times 0 = 0`,
        expr: `d_แท่ง = |${xCmCalcStr} - ${pCalcStr}| = 0 ${cu} -> M_แท่ง = W × 0 = 0`,
        note: 'น้ำหนักแท่งผ่านจุดหมุนพอดี จึงไม่เกิดโมเมนต์และไม่ต้องทราบมวลแท่ง'
      });
    } else {
      const rodSub = fracCmp(sol.xCmCalcFrac, sol.pivotCalcFrac) < 0
        ? `${pCalcStr} - ${xCmCalcStr}`
        : `${xCmCalcStr} - ${pCalcStr}`;
      const rodDStr = formatNumberCompact(sol.forceItems.find(it => it.id === 'ROD_W').distanceCalcFrac);
      const dirTh = fracCmp(sol.xCmCalcFrac, sol.pivotCalcFrac) < 0 ? 'ทวนเข็ม' : 'ตามเข็ม';
      step3Eqs.push({
        latex: `d_{\\text{แท่ง}} = ${rodSub} = ${rodDStr}\\text{ ${cu}} \\;(\\text{${dirTh}})`,
        expr: `d_แท่ง = ${rodSub} = ${rodDStr} ${cu} (${dirTh})`,
        note: `จุดศูนย์กลางมวลอยู่ด้าน${dirTh === 'ทวนเข็ม' ? 'ซ้าย' : 'ขวา'}ของจุดหมุน จึงเกิดโมเมนต์${dirTh}`
      });
    }

    steps.push({
      id: 'step-3-pivot-cm',
      heading: 'ขั้นที่ 3: หาจุดหมุน จุดศูนย์กลางมวล และแรงที่ให้โมเมนต์ศูนย์',
      explanation: sol.rodPassesPivot
        ? `จุดศูนย์กลางมวล $x_{\\text{cm}} = ${xCmCalcStr}\\text{ ${cu}}$ ตรงกับจุดหมุนพอดี ทั้งแรงปฏิกิริยาและน้ำหนักแท่งไม้จึงมีแขนโมเมนต์เป็น $0$`
        : `จุดศูนย์กลางมวล $x_{\\text{cm}} = ${xCmCalcStr}\\text{ ${cu}}$ ไม่ตรงกับจุดหมุน จึงต้องคิดโมเมนต์ของน้ำหนักแท่งไม้ด้วย ส่วนแรงปฏิกิริยาผ่านจุดหมุนจึงไม่เกิดโมเมนต์`,
      equations: step3Eqs
    });

    // ----------------------------------------------------------------------
    // STEP 4: ตารางแรงทั้งหมดและคำนวณแขนโมเมนต์ทีละแรง
    // ----------------------------------------------------------------------
    const tableRows = [];
    const step4Eqs = [];

    for (const item of sol.forceItems) {
      if (item.kind === 'reaction') {
        tableRows.push({
          name: 'แรงปฏิกิริยาที่จุดหมุน',
          positionLatex: `${pCalcStr}\\text{ ${cu}}`,
          magnitudeLatex: 'N_{\\text{รองรับ}}',
          armCalcLatex: `\\left|${pCalcStr} - ${pCalcStr}\\right| = 0\\text{ ${cu}}`,
          direction: 'ไม่เกิดโมเมนต์ (0)',
          termLatex: '0'
        });
        continue;
      }

      if (item.kind === 'rod') {
        if (!item.includedInEquation) {
          tableRows.push({
            name: 'น้ำหนักแท่งไม้',
            positionLatex: `${xCmCalcStr}\\text{ ${cu}}`,
            magnitudeLatex: 'W_{\\text{แท่ง}}',
            armCalcLatex: `\\left|${xCmCalcStr} - ${pCalcStr}\\right| = 0\\text{ ${cu}}`,
            direction: 'ไม่เกิดโมเมนต์ (0)',
            termLatex: 'W_{\\text{แท่ง}} \\times 0 = 0'
          });
        } else {
          const mStr = formatMassKg(item.massGrams);
          const subStr = fracCmp(item.xCalcFrac, sol.pivotCalcFrac) < 0 ? `${pCalcStr} - ${xCmCalcStr}` : `${xCmCalcStr} - ${pCalcStr}`;
          const dStr = formatNumberCompact(item.distanceCalcFrac);
          const dirTh = item.direction === 'ccw' ? 'ทวนเข็ม' : 'ตามเข็ม';
          tableRows.push({
            name: 'น้ำหนักแท่งไม้',
            positionLatex: `${xCmCalcStr}\\text{ ${cu}}`,
            magnitudeLatex: `${mStr}g\\text{ N}`,
            armCalcLatex: `${subStr} = ${dStr}\\text{ ${cu}}`,
            direction: dirTh,
            termLatex: `(${mStr}g)(${dStr})`
          });
          step4Eqs.push({
            latex: `d_{\\text{แท่ง}} = ${subStr} = ${dStr}\\text{ ${cu}} \\;(\\text{${dirTh}})`,
            expr: `d_แท่ง = ${subStr} = ${dStr} ${cu} (${dirTh})`,
            note: 'ระยะตั้งฉากจากจุดหมุนถึงจุดศูนย์กลางมวล'
          });
        }
        continue;
      }

      if (item.kind === 'mass') {
        const xStr = formatNumberCompact(item.xCalcFrac);
        const subStr = fracCmp(item.xCalcFrac, sol.pivotCalcFrac) < 0 ? `${pCalcStr} - ${xStr}` : `${xStr} - ${pCalcStr}`;
        const dStr = formatNumberCompact(item.distanceCalcFrac);
        const dirTh = item.direction === 'ccw' ? 'ทวนเข็ม' : 'ตามเข็ม';
        if (item.isUnknown) {
          tableRows.push({
            name: 'วัตถุมวล m (หาค่า)',
            positionLatex: `${xStr}\\text{ ${cu}}`,
            magnitudeLatex: 'mg\\text{ N}',
            armCalcLatex: `${subStr} = ${dStr}\\text{ ${cu}}`,
            direction: dirTh,
            termLatex: `(mg)(${dStr})`
          });
          step4Eqs.push({
            latex: `d_m = ${subStr} = ${dStr}\\text{ ${cu}} \\;(\\text{${dirTh}})`,
            expr: `d_m = ${subStr} = ${dStr} ${cu} (${dirTh})`,
            note: 'แขนโมเมนต์ของวัตถุมวล m'
          });
        } else {
          const mStr = formatMassKg(item.massGrams);
          tableRows.push({
            name: `วัตถุมวล ${mStr} kg`,
            positionLatex: `${xStr}\\text{ ${cu}}`,
            magnitudeLatex: `${mStr}g\\text{ N}`,
            armCalcLatex: `${subStr} = ${dStr}\\text{ ${cu}}`,
            direction: dirTh,
            termLatex: `(${mStr}g)(${dStr})`
          });
          step4Eqs.push({
            latex: `d_{${mStr}\\text{ kg}} = ${subStr} = ${dStr}\\text{ ${cu}} \\;(\\text{${dirTh}})`,
            expr: `ระยะวัตถุ ${mStr} kg = ${subStr} = ${dStr} ${cu} (${dirTh})`,
            note: 'แขนโมเมนต์คำนวณจาก d = |x − x_pivot|'
          });
        }
      } else if (item.kind === 'force') {
        const fTex = labelToLatex(item.label);
        if (item.isUnknown) {
          const armExpr = sol.unknownSide === 'cw' ? `x - ${pCalcStr}` : `${pCalcStr} - x`;
          const dirTh = sol.unknownSide === 'cw' ? 'ตามเข็ม (พิสูจน์ในขั้นที่ 5)' : 'ทวนเข็ม (พิสูจน์ในขั้นที่ 5)';
          tableRows.push({
            name: `แรง ${item.label} (หาตำแหน่ง)`,
            positionLatex: `x\\text{ ${cu}}`,
            magnitudeLatex: `${item.forceN}\\text{ N}`,
            armCalcLatex: `${armExpr}\\text{ ${cu}}`,
            direction: dirTh,
            termLatex: `${item.forceN}(${armExpr})`
          });
        } else {
          const xStr = formatNumberCompact(item.xCalcFrac);
          const subStr = fracCmp(item.xCalcFrac, sol.pivotCalcFrac) < 0 ? `${pCalcStr} - ${xStr}` : `${xStr} - ${pCalcStr}`;
          const dStr = formatNumberCompact(item.distanceCalcFrac);
          const dirTh = item.direction === 'ccw' ? 'ทวนเข็ม' : 'ตามเข็ม';
          tableRows.push({
            name: `แรง ${item.label}`,
            positionLatex: `${xStr}\\text{ ${cu}}`,
            magnitudeLatex: `${item.forceN}\\text{ N}`,
            armCalcLatex: `${subStr} = ${dStr}\\text{ ${cu}}`,
            direction: dirTh,
            termLatex: `${item.forceN}(${dStr})`
          });
          step4Eqs.push({
            latex: `d_{${fTex}} = ${subStr} = ${dStr}\\text{ ${cu}} \\;(\\text{${dirTh}})`,
            expr: `ระยะ ${item.label} = ${subStr} = ${dStr} ${cu} (${dirTh})`,
            note: 'แรงกดลงด้านซ้าย → ทวนเข็ม, ด้านขวา → ตามเข็ม'
          });
        }
      }
    }

    steps.push({
      id: 'step-4-forces',
      heading: 'ขั้นที่ 4: จำแนกแรง หาแขนโมเมนต์ และทิศการหมุนของทุกแรง',
      explanation: `คำนวณแขนโมเมนต์จาก $d = \\left|x - x_{\\text{pivot}}\\right|$ ในหน่วย $\\text{${cu}}$ โดยแรงชี้ลงด้านซ้ายจุดหมุนให้โมเมนต์ทวนเข็ม และด้านขวาจุดหมุนให้โมเมนต์ตามเข็ม`,
      tableRows,
      equations: step4Eqs
    });

    // ----------------------------------------------------------------------
    // STEP 5 (Position problems): พิสูจน์ด้านของแรงไม่ทราบตำแหน่ง
    // ----------------------------------------------------------------------
    if (question.unknown.type === 'position') {
      const knownCcwItems = sol.forceItems.filter(it => it.includedInEquation && !it.isUnknown && it.direction === 'ccw');
      const knownCwItems = sol.forceItems.filter(it => it.includedInEquation && !it.isUnknown && it.direction === 'cw');
      const step5Eqs = [];
      const mU = sol.momentUnitLatex;
      const fUnkTex = labelToLatex(unkLoad.label);

      if (knownCcwItems.length > 0) {
        const exprTerms = knownCcwItems.map(it => `${it.forceN}(${formatNumberCompact(it.distanceCalcFrac)})`).join(' + ');
        const prodTerms = knownCcwItems.map(it => formatNumberCompact(it.momentCalcFrac)).join(' + ');
        step5Eqs.push({
          latex: `\\sum M_{\\text{ทวน, ทราบ}} = ${exprTerms}`,
          expr: `ΣMทวนที่ทราบ = ${exprTerms}`,
          note: 'รวมโมเมนต์ของแรงที่ทราบฝั่งทวนเข็ม'
        });
        if (knownCcwItems.length > 1) {
          step5Eqs.push({
            latex: `= ${prodTerms} = ${formatNumberCompact(sol.knownCcwFrac)}\\ ${mU}`,
            expr: `= ${prodTerms} = ${formatNumberCompact(sol.knownCcwFrac)} ${sol.momentUnit}`,
            note: 'คูณและรวมผลฝั่งทวนเข็ม'
          });
        } else {
          step5Eqs.push({
            latex: `= ${formatNumberCompact(sol.knownCcwFrac)}\\ ${mU}`,
            expr: `= ${formatNumberCompact(sol.knownCcwFrac)} ${sol.momentUnit}`,
            note: 'ผลรวมโมเมนต์ทวนเข็มที่ทราบ'
          });
        }
      } else {
        step5Eqs.push({
          latex: `\\sum M_{\\text{ทวน, ทราบ}} = 0\\ ${mU}`,
          expr: `ΣMทวนที่ทราบ = 0 ${sol.momentUnit}`,
          note: 'ไม่มีแรงที่ทราบทางซ้ายของจุดหมุน'
        });
      }

      if (knownCwItems.length > 0) {
        const exprTerms = knownCwItems.map(it => `${it.forceN}(${formatNumberCompact(it.distanceCalcFrac)})`).join(' + ');
        const prodTerms = knownCwItems.map(it => formatNumberCompact(it.momentCalcFrac)).join(' + ');
        step5Eqs.push({
          latex: `\\sum M_{\\text{ตาม, ทราบ}} = ${exprTerms} = ${knownCwItems.length > 1 ? prodTerms + ' = ' : ''}${formatNumberCompact(sol.knownCwFrac)}\\ ${mU}`,
          expr: `ΣMตามที่ทราบ = ${exprTerms} = ${formatNumberCompact(sol.knownCwFrac)} ${sol.momentUnit}`,
          note: 'ผลรวมโมเมนต์ตามเข็มที่ทราบ'
        });
      } else {
        step5Eqs.push({
          latex: `\\sum M_{\\text{ตาม, ทราบ}} = 0\\ ${mU}`,
          expr: `ΣMตามที่ทราบ = 0 ${sol.momentUnit}`,
          note: 'ไม่มีแรงที่ทราบทางขวาของจุดหมุน'
        });
      }

      const ccwStr = formatNumberCompact(sol.knownCcwFrac);
      const cwStr = formatNumberCompact(sol.knownCwFrac);
      const armExpr = sol.unknownSide === 'cw' ? `x - ${pCalcStr}` : `${pCalcStr} - x`;
      if (sol.unknownSide === 'cw') {
        step5Eqs.push({
          latex: `${ccwStr} > ${cwStr} \\;\\Rightarrow\\; \\text{ต้องวาง } ${fUnkTex} \\text{ ด้านขวาของจุดหมุน } (x > ${pCalcStr}\\text{ ${cu}})`,
          expr: `${ccwStr} > ${cwStr} -> วาง ${unkLoad.label} ด้านขวาของจุดหมุน (x > ${pCalcStr} ${cu})`,
          note: 'เพื่อเพิ่มโมเมนต์ตามเข็มให้สมดุล'
        });
      } else {
        step5Eqs.push({
          latex: `${cwStr} > ${ccwStr} \\;\\Rightarrow\\; \\text{ต้องวาง } ${fUnkTex} \\text{ ด้านซ้ายของจุดหมุน } (x < ${pCalcStr}\\text{ ${cu}})`,
          expr: `${cwStr} > ${ccwStr} -> วาง ${unkLoad.label} ด้านซ้ายของจุดหมุน (x < ${pCalcStr} ${cu})`,
          note: 'เพื่อเพิ่มโมเมนต์ทวนเข็มให้สมดุล'
        });
      }
      step5Eqs.push({
        latex: `d_{${fUnkTex}} = ${armExpr}\\text{ ${cu}}`,
        expr: `d_${unkLoad.label} = ${armExpr} ${cu}`,
        note: `แขนโมเมนต์ของแรง ${unkLoad.label}`
      });

      steps.push({
        id: 'step-5-side',
        heading: `ขั้นที่ 5: วิเคราะห์ด้านที่ต้องวางแรง ${unkLoad.label} จากโมเมนต์ที่ทราบ`,
        explanation: 'เปรียบเทียบผลรวมโมเมนต์ของแรงที่ทราบทั้งสองฝั่งก่อน เพื่อสรุปด้านที่ต้องออกแรงโดยไม่เดาจากภาพ',
        equations: step5Eqs
      });
    }

    // ----------------------------------------------------------------------
    // STEP 6 (or 5): ตั้งสมการสมดุลและแก้สมการทีละการดำเนินการด้วย KaTeX
    // ----------------------------------------------------------------------
    const eqStepNum = question.unknown.type === 'position' ? 6 : 5;
    const eqLines = [];

    if (question.unknown.type === 'mass') {
      const ccwItems = sol.forceItems.filter(it => it.includedInEquation && it.direction === 'ccw');
      const cwItems = sol.forceItems.filter(it => it.includedInEquation && it.direction === 'cw');

      const fmtWithG = it => it.isUnknown
        ? `(mg)(${formatNumberCompact(it.distanceCalcFrac)})`
        : `(${formatMassKg(it.massGrams)}g)(${formatNumberCompact(it.distanceCalcFrac)})`;

      const fmtFactoredG = it => it.isUnknown
        ? `${formatNumberCompact(it.distanceCalcFrac)}m`
        : `${formatMassKg(it.massGrams)} \\times ${formatNumberCompact(it.distanceCalcFrac)}`;

      const fmtProd = it => it.isUnknown
        ? `${formatNumberCompact(it.distanceCalcFrac)}m`
        : formatNumberCompact(it.momentNoGCalcFrac);

      const leftWithG = ccwItems.map(fmtWithG).join(' + ');
      const rightWithG = cwItems.map(fmtWithG).join(' + ');
      const leftFact = ccwItems.map(fmtFactoredG).join(' + ');
      const rightFact = cwItems.map(fmtFactoredG).join(' + ');
      const leftProd = ccwItems.map(fmtProd).join(' + ');
      const rightProd = cwItems.map(fmtProd).join(' + ');

      eqLines.push({
        latex: '\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}',
        expr: 'ΣMทวน = ΣMตาม',
        note: 'หลักสมดุลต่อการหมุน'
      });
      eqLines.push({
        latex: `${leftWithG} = ${rightWithG}`,
        expr: `${leftWithG} = ${rightWithG}`,
        note: 'แทนพจน์โมเมนต์ของทุกแรงด้วย W = mg'
      });
      eqLines.push({
        latex: `g\\left(${leftFact}\\right) = g\\left(${rightFact}\\right)`,
        expr: `g(${leftFact.replace(/\\times/g, '×')}) = g(${rightFact.replace(/\\times/g, '×')})`,
        note: 'ดึงตัวร่วม g ออกทั้งสองข้างของสมการ'
      });
      eqLines.push({
        latex: `\\frac{g\\left(${leftFact}\\right)}{g} = \\frac{g\\left(${rightFact}\\right)}{g}`,
        expr: `[g(...)] / g = [g(...)] / g`,
        note: 'หารทั้งสองข้างด้วย g (เนื่องจาก g = 9.8 m/s² ≠ 0)'
      });
      eqLines.push({
        latex: `${leftFact} = ${rightFact}`,
        expr: `${leftFact.replace(/\\times/g, '×')} = ${rightFact.replace(/\\times/g, '×')}`,
        note: 'ตัด g ทั้งสองข้างออก'
      });
      eqLines.push({
        latex: `${leftProd} = ${rightProd}`,
        expr: `${leftProd} = ${rightProd}`,
        note: 'คูณตัวเลขในแต่ละพจน์'
      });

      const unkCoefStr = formatNumberCompact(sol.unknownDistanceFrac);
      const unkTermStr = `${unkCoefStr}m`;
      const sameSideKnown = sol.unknownSide === 'ccw' ? sol.knownCcwFrac : sol.knownCwFrac;
      const oppSideKnown = sol.unknownSide === 'ccw' ? sol.knownCwFrac : sol.knownCcwFrac;
      const sameKnownStr = formatNumberCompact(sameSideKnown);
      const oppKnownStr = formatNumberCompact(oppSideKnown);
      const neededStr = formatNumberCompact(sol.neededMomentFrac);

      const ccwKnownCount = ccwItems.filter(it => !it.isUnknown).length;
      const cwKnownCount = cwItems.filter(it => !it.isUnknown).length;
      if (ccwKnownCount > 1 || cwKnownCount > 1) {
        const leftComb = sol.unknownSide === 'ccw'
          ? (sameSideKnown.num > 0n ? `${sameKnownStr} + ${unkTermStr}` : unkTermStr)
          : oppKnownStr;
        const rightComb = sol.unknownSide === 'cw'
          ? (sameSideKnown.num > 0n ? `${sameKnownStr} + ${unkTermStr}` : unkTermStr)
          : oppKnownStr;
        eqLines.push({
          latex: `${leftComb} = ${rightComb}`,
          expr: `${leftComb} = ${rightComb}`,
          note: 'รวมพจน์ตัวเลขในแต่ละข้าง'
        });
      }

      if (sameSideKnown.num > 0n) {
        if (sol.unknownSide === 'ccw') {
          eqLines.push({
            latex: `${sameKnownStr} + ${unkTermStr} - ${sameKnownStr} = ${oppKnownStr} - ${sameKnownStr}`,
            expr: `${sameKnownStr} + ${unkTermStr} − ${sameKnownStr} = ${oppKnownStr} − ${sameKnownStr}`,
            note: `ลบ ${sameKnownStr} ออกจากทั้งสองข้าง`
          });
          eqLines.push({
            latex: `${unkTermStr} = ${neededStr}`,
            expr: `${unkTermStr} = ${neededStr}`,
            note: 'เหลือเฉพาะพจน์ตัวแปร m'
          });
        } else {
          eqLines.push({
            latex: `${oppKnownStr} - ${sameKnownStr} = ${sameKnownStr} + ${unkTermStr} - ${sameKnownStr}`,
            expr: `${oppKnownStr} − ${sameKnownStr} = ${sameKnownStr} + ${unkTermStr} − ${sameKnownStr}`,
            note: `ลบ ${sameKnownStr} ออกจากทั้งสองข้าง`
          });
          eqLines.push({
            latex: `${neededStr} = ${unkTermStr}`,
            expr: `${neededStr} = ${unkTermStr}`,
            note: 'เหลือเฉพาะพจน์ตัวแปร m'
          });
        }
      }

      if (sol.unknownSide === 'ccw') {
        eqLines.push({
          latex: `\\frac{${unkTermStr}}{${unkCoefStr}} = \\frac{${neededStr}}{${unkCoefStr}}`,
          expr: `${unkTermStr} / ${unkCoefStr} = ${neededStr} / ${unkCoefStr}`,
          note: `หารทั้งสองข้างด้วย ${unkCoefStr}`
        });
        eqLines.push({
          latex: `m = ${sol.answerExactText}\\text{ kg}`,
          expr: `m = ${sol.answerExactText} kg`,
          note: 'ได้ค่ามวล m แม่นยำพร้อมหน่วย'
        });
      } else {
        eqLines.push({
          latex: `\\frac{${neededStr}}{${unkCoefStr}} = \\frac{${unkTermStr}}{${unkCoefStr}}`,
          expr: `${neededStr} / ${unkCoefStr} = ${unkTermStr} / ${unkCoefStr}`,
          note: `หารทั้งสองข้างด้วย ${unkCoefStr}`
        });
        eqLines.push({
          latex: `${sol.answerExactText} = m \\;\\Rightarrow\\; m = ${sol.answerExactText}\\text{ kg}`,
          expr: `${sol.answerExactText} = m -> m = ${sol.answerExactText} kg`,
          note: 'ได้ค่ามวล m แม่นยำพร้อมหน่วย'
        });
      }

      if (sol.needsRoundingNote) {
        eqLines.push({
          latex: `m \\approx ${sol.answerRound2Text}\\text{ kg}`,
          expr: `m ≈ ${sol.answerRound2Text} kg`,
          note: 'ค่าเมื่อปัดเป็นทศนิยม 2 ตำแหน่ง (ระบบยอมรับทั้งค่าแม่นยำและค่าปัด 2 ตำแหน่ง)'
        });
      }
    } else {
      const ccwKnown = sol.forceItems.filter(it => it.includedInEquation && !it.isUnknown && it.direction === 'ccw');
      const cwKnown = sol.forceItems.filter(it => it.includedInEquation && !it.isUnknown && it.direction === 'cw');
      const armExpr = sol.unknownSide === 'cw' ? `x - ${pCalcStr}` : `${pCalcStr} - x`;
      const unkTerm = `${unkLoad.forceN}(${armExpr})`;

      const ccwSub = ccwKnown.map(it => `${it.forceN}(${formatNumberCompact(it.distanceCalcFrac)})`);
      const cwSub = cwKnown.map(it => `${it.forceN}(${formatNumberCompact(it.distanceCalcFrac)})`);
      if (sol.unknownSide === 'ccw') ccwSub.push(unkTerm);
      else cwSub.push(unkTerm);

      const ccwProd = ccwKnown.map(it => formatNumberCompact(it.momentCalcFrac));
      const cwProd = cwKnown.map(it => formatNumberCompact(it.momentCalcFrac));
      if (sol.unknownSide === 'ccw') ccwProd.push(unkTerm);
      else cwProd.push(unkTerm);

      const oppKnown = sol.unknownSide === 'cw' ? sol.knownCcwFrac : sol.knownCwFrac;
      const sameKnown = sol.unknownSide === 'cw' ? sol.knownCwFrac : sol.knownCcwFrac;
      const oppStr = formatNumberCompact(oppKnown);
      const sameStr = formatNumberCompact(sameKnown);
      const neededStr = formatNumberCompact(sol.neededMomentFrac);
      const distTerm = terminatingDecimals(sol.unknownDistanceFrac);
      const distIsClean = distTerm !== null && distTerm <= 4;
      const distCleanStr = formatFracClean(sol.unknownDistanceFrac, { minDec: 0, maxDec: 4 });
      const distFracLatex = `\\frac{${sol.unknownDistanceFrac.num}}{${sol.unknownDistanceFrac.den}}`;

      eqLines.push({
        latex: '\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}',
        expr: 'ΣMทวน = ΣMตาม',
        note: 'หลักสมดุลต่อการหมุน'
      });
      eqLines.push({
        latex: `${ccwSub.join(' + ')} = ${cwSub.join(' + ')}`,
        expr: `${ccwSub.join(' + ')} = ${cwSub.join(' + ')}`,
        note: 'แทนค่าแรงและแขนโมเมนต์ทุกแรงลงในสมการ'
      });
      eqLines.push({
        latex: `${ccwProd.join(' + ')} = ${cwProd.join(' + ')}`,
        expr: `${ccwProd.join(' + ')} = ${cwProd.join(' + ')}`,
        note: 'คูณแรงกับแขนโมเมนต์ของแรงที่ทราบค่า'
      });

      if (ccwKnown.length > 1 || cwKnown.length > 1) {
        const leftComb = sol.unknownSide === 'cw'
          ? oppStr
          : (sameKnown.num > 0n ? `${sameStr} + ${unkTerm}` : unkTerm);
        const rightComb = sol.unknownSide === 'cw'
          ? (sameKnown.num > 0n ? `${sameStr} + ${unkTerm}` : unkTerm)
          : oppStr;
        eqLines.push({
          latex: `${leftComb} = ${rightComb}`,
          expr: `${leftComb} = ${rightComb}`,
          note: 'รวมพจน์โมเมนต์ของแรงที่ทราบ'
        });
      }

      if (sameKnown.num > 0n) {
        if (sol.unknownSide === 'cw') {
          eqLines.push({
            latex: `${oppStr} - ${sameStr} = ${sameStr} + ${unkTerm} - ${sameStr}`,
            expr: `${oppStr} − ${sameStr} = ${sameStr} + ${unkTerm} − ${sameStr}`,
            note: `ลบ ${sameStr} ออกจากทั้งสองข้าง`
          });
          eqLines.push({
            latex: `${neededStr} = ${unkTerm}`,
            expr: `${neededStr} = ${unkTerm}`,
            note: 'เหลือเฉพาะพจน์ของแรงที่ไม่ทราบตำแหน่ง'
          });
        } else {
          eqLines.push({
            latex: `${sameStr} + ${unkTerm} - ${sameStr} = ${oppStr} - ${sameStr}`,
            expr: `${sameStr} + ${unkTerm} − ${sameStr} = ${oppStr} − ${sameStr}`,
            note: `ลบ ${sameStr} ออกจากทั้งสองข้าง`
          });
          eqLines.push({
            latex: `${unkTerm} = ${neededStr}`,
            expr: `${unkTerm} = ${neededStr}`,
            note: 'เหลือเฉพาะพจน์ของแรงที่ไม่ทราบตำแหน่ง'
          });
        }
      }

      const fVal = unkLoad.forceN;
      if (sol.unknownSide === 'cw') {
        eqLines.push({
          latex: `\\frac{${neededStr}}{${fVal}} = \\frac{${unkTerm}}{${fVal}}`,
          expr: `${neededStr} / ${fVal} = ${unkTerm} / ${fVal}`,
          note: `หารทั้งสองข้างด้วย ${fVal}`
        });
        eqLines.push({
          latex: distIsClean
            ? `${distCleanStr} = ${armExpr}`
            : `${distFracLatex} \\;(\\approx ${formatFracFixed(sol.unknownDistanceFrac, 4)}) = ${armExpr}`,
          expr: distIsClean ? `${distCleanStr} = ${armExpr}` : `${sol.unknownDistanceFrac.num}/${sol.unknownDistanceFrac.den} = ${armExpr}`,
          note: `ได้ระยะห่างจากจุดหมุน (หน่วย ${cu})`
        });
        eqLines.push({
          latex: distIsClean
            ? `${distCleanStr} + ${pCalcStr} = x - ${pCalcStr} + ${pCalcStr}`
            : `${distFracLatex} + ${pCalcStr} = x - ${pCalcStr} + ${pCalcStr}`,
          expr: `${distIsClean ? distCleanStr : sol.unknownDistanceFrac.num + '/' + sol.unknownDistanceFrac.den} + ${pCalcStr} = x - ${pCalcStr} + ${pCalcStr}`,
          note: `บวก ${pCalcStr} ทั้งสองข้างเพื่อหาตำแหน่ง x`
        });
        if (distIsClean) {
          eqLines.push({
            latex: `${sol.answerExactText} = x \\;\\Rightarrow\\; x = ${sol.answerExactText}\\text{ ${cu}}`,
            expr: `x = ${sol.answerExactText} ${cu}`,
            note: 'ได้ตำแหน่ง x แม่นยำพร้อมหน่วย'
          });
        } else {
          eqLines.push({
            latex: `x = \\frac{${sol.answerFrac.num}}{${sol.answerFrac.den}} \\approx ${formatFracFixed(sol.answerFrac, 4)}\\text{ ${cu}}`,
            expr: `x = ${sol.answerFrac.num}/${sol.answerFrac.den} ≈ ${formatFracFixed(sol.answerFrac, 4)} ${cu}`,
            note: 'คำนวณแบบไม่ปัดระหว่างทาง'
          });
          eqLines.push({
            latex: `x \\approx ${sol.answerRound2Text}\\text{ ${cu}}`,
            expr: `x ≈ ${sol.answerRound2Text} ${cu}`,
            note: 'คำตอบเมื่อปัดเป็นทศนิยม 2 ตำแหน่ง'
          });
        }
      } else {
        eqLines.push({
          latex: `\\frac{${unkTerm}}{${fVal}} = \\frac{${neededStr}}{${fVal}}`,
          expr: `${unkTerm} / ${fVal} = ${neededStr} / ${fVal}`,
          note: `หารทั้งสองข้างด้วย ${fVal}`
        });
        eqLines.push({
          latex: distIsClean
            ? `${armExpr} = ${distCleanStr}`
            : `${armExpr} = ${distFracLatex} \\;(\\approx ${formatFracFixed(sol.unknownDistanceFrac, 4)})`,
          expr: distIsClean ? `${armExpr} = ${distCleanStr}` : `${armExpr} = ${sol.unknownDistanceFrac.num}/${sol.unknownDistanceFrac.den}`,
          note: `ได้ระยะห่างจากจุดหมุน (หน่วย ${cu})`
        });
        eqLines.push({
          latex: distIsClean
            ? `${pCalcStr} - ${distCleanStr} = x`
            : `${pCalcStr} - ${distFracLatex} = x`,
          expr: `x = ${pCalcStr} - ${distIsClean ? distCleanStr : sol.unknownDistanceFrac.num + '/' + sol.unknownDistanceFrac.den}`,
          note: 'ย้ายข้างสมการเพื่อหาตำแหน่ง x'
        });
        if (distIsClean) {
          eqLines.push({
            latex: `x = ${sol.answerExactText}\\text{ ${cu}}`,
            expr: `x = ${sol.answerExactText} ${cu}`,
            note: 'ได้ตำแหน่ง x แม่นยำพร้อมหน่วย'
          });
        } else {
          eqLines.push({
            latex: `x = \\frac{${sol.answerFrac.num}}{${sol.answerFrac.den}} \\approx ${formatFracFixed(sol.answerFrac, 4)}\\text{ ${cu}}`,
            expr: `x = ${sol.answerFrac.num}/${sol.answerFrac.den} ≈ ${formatFracFixed(sol.answerFrac, 4)} ${cu}`,
            note: 'คำนวณแบบไม่ปัดระหว่างทาง'
          });
          eqLines.push({
            latex: `x \\approx ${sol.answerRound2Text}\\text{ ${cu}}`,
            expr: `x ≈ ${sol.answerRound2Text} ${cu}`,
            note: 'คำตอบเมื่อปัดเป็นทศนิยม 2 ตำแหน่ง'
          });
        }
      }
    }

    steps.push({
      id: `step-${eqStepNum}-solve`,
      heading: `ขั้นที่ ${eqStepNum}: ตั้งสมการสมดุลต่อการหมุนและแก้สมการทีละขั้น`,
      explanation: 'ใช้สมการหลัก $\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}$ และแสดงการเปลี่ยนรูปทีละ 1 ขั้นตอนต่อบรรทัด',
      equations: eqLines
    });

    // ----------------------------------------------------------------------
    // FINAL STEP: ตรวจคำตอบกลับทั้งสองฝั่ง
    // ----------------------------------------------------------------------
    const verifyStepNum = eqStepNum + 1;
    const verifyEqs = [];

    if (question.unknown.type === 'mass') {
      const ccwItems = sol.forceItems.filter(it => it.includedInEquation && it.direction === 'ccw');
      const cwItems = sol.forceItems.filter(it => it.includedInEquation && it.direction === 'cw');

      const fmtVerifyTerm = it => `${it.isUnknown ? sol.answerExactText : formatMassKg(it.massGrams)} \\times ${formatNumberCompact(it.distanceCalcFrac)}`;
      const fmtVerifyProd = it => formatNumberCompact(it.momentNoGCalcFrac);

      verifyEqs.push({
        latex: `\\text{ฝั่งทวนเข็ม (หลังหาร } g\\text{)} = ${ccwItems.map(fmtVerifyTerm).join(' + ')} = ${ccwItems.map(fmtVerifyProd).join(' + ')} = ${formatNumberCompact(sol.verifyCcwFrac)}`,
        expr: `ฝั่งทวนเข็ม = ${formatNumberCompact(sol.verifyCcwFrac)}`,
        note: `แทน m = ${sol.answerExactText} kg กลับลงสมการ`
      });
      verifyEqs.push({
        latex: `\\text{ฝั่งตามเข็ม (หลังหาร } g\\text{)} = ${cwItems.map(fmtVerifyTerm).join(' + ')} = ${cwItems.map(fmtVerifyProd).join(' + ')} = ${formatNumberCompact(sol.verifyCwFrac)}`,
        expr: `ฝั่งตามเข็ม = ${formatNumberCompact(sol.verifyCwFrac)}`,
        note: 'คำนวณฝั่งตามเข็มเทียบกัน'
      });
      verifyEqs.push({
        latex: `${formatNumberCompact(sol.verifyCcwFrac)} = ${formatNumberCompact(sol.verifyCwFrac)} \\quad \\text{และ} \\quad m = ${sol.answerExactText}\\text{ kg} > 0`,
        expr: `${formatNumberCompact(sol.verifyCcwFrac)} = ${formatNumberCompact(sol.verifyCwFrac)} และ m > 0`,
        note: 'โมเมนต์ทั้งสองฝั่งเท่ากันและมวลเป็นบวก สมดุลถูกต้อง ✓'
      });
    } else {
      const ccwItems = sol.forceItems.filter(it => it.includedInEquation && it.direction === 'ccw');
      const cwItems = sol.forceItems.filter(it => it.includedInEquation && it.direction === 'cw');
      const ansDispLatex = sol.isTerminating && terminatingDecimals(sol.answerFrac) <= 4
        ? sol.answerExactText
        : `\\frac{${sol.answerFrac.num}}{${sol.answerFrac.den}}`;

      const fmtVerifyTerm = it => {
        if (it.isUnknown) {
          const armSub = sol.unknownSide === 'cw' ? `(${ansDispLatex} - ${pCalcStr})` : `(${pCalcStr} - ${ansDispLatex})`;
          return `${it.forceN} \\times ${armSub}`;
        }
        return `${it.forceN} \\times ${formatNumberCompact(it.distanceCalcFrac)}`;
      };
      const fmtVerifyProd = it => formatNumberCompact(it.momentCalcFrac);
      const mU = sol.momentUnitLatex;

      verifyEqs.push({
        latex: `\\sum M_{\\text{ทวน}} = ${ccwItems.map(fmtVerifyTerm).join(' + ')} = ${ccwItems.map(fmtVerifyProd).join(' + ')} = ${formatNumberCompact(sol.verifyCcwFrac)}\\ ${mU}`,
        expr: `ΣMทวน = ${formatNumberCompact(sol.verifyCcwFrac)} ${sol.momentUnit}`,
        note: 'แทนค่า x กลับลงฝั่งทวนเข็ม'
      });
      verifyEqs.push({
        latex: `\\sum M_{\\text{ตาม}} = ${cwItems.map(fmtVerifyTerm).join(' + ')} = ${cwItems.map(fmtVerifyProd).join(' + ')} = ${formatNumberCompact(sol.verifyCwFrac)}\\ ${mU}`,
        expr: `ΣMตาม = ${formatNumberCompact(sol.verifyCwFrac)} ${sol.momentUnit}`,
        note: 'แทนค่า x กลับลงฝั่งตามเข็ม'
      });
      verifyEqs.push({
        latex: `${formatNumberCompact(sol.verifyCcwFrac)}\\ ${mU} = ${formatNumberCompact(sol.verifyCwFrac)}\\ ${mU} \\quad \\text{และ} \\quad 0 < ${sol.answerRound2Text} < ${LCalcStr}\\text{ ${cu}}`,
        expr: `${formatNumberCompact(sol.verifyCcwFrac)} = ${formatNumberCompact(sol.verifyCwFrac)} และ 0 < ${sol.answerRound2Text} < ${LCalcStr} ${cu}`,
        note: 'ตำแหน่งอยู่บนแท่งไม้จริงและโมเมนต์สมดุลถูกต้อง ✓'
      });
    }

    steps.push({
      id: `step-${verifyStepNum}-verify`,
      heading: `ขั้นที่ ${verifyStepNum}: สรุปคำตอบและตรวจคำตอบกลับ`,
      explanation: 'แทนค่าคำตอบกลับลงทั้งสองข้างของสมการเพื่อยืนยันว่า $\\sum M_{\\text{ทวน}} = \\sum M_{\\text{ตาม}}$ และตรวจสอบความสมเหตุสมผลทางฟิสิกส์',
      equations: verifyEqs,
      finalAnswer: {
        exactText: sol.answerExactText,
        round2Text: sol.answerRound2Text,
        needsRoundingNote: sol.needsRoundingNote,
        unit: sol.expectedUnit,
        latex: sol.needsRoundingNote
          ? `${question.unknown.symbol} = ${sol.answerExactText}\\text{ ${sol.expectedUnit}} \\;(\\approx ${sol.answerRound2Text}\\text{ ${sol.expectedUnit}})`
          : `${question.unknown.symbol} = ${sol.answerExactText}\\text{ ${sol.expectedUnit}}`,
        originalCorrectChoice: question.originalCorrectChoice || null
      }
    });

    return steps;
  }

  /* ------------------------------------------------------------------------
     Answer Parser & Exact Rational Grader (Blueprint §9.2)
     ------------------------------------------------------------------------ */
  function parseNumericAnswer(raw) {
    if (raw === null || raw === undefined) {
      return { status: 'empty', valid: false, frac: null, decimals: 0, normalized: '' };
    }
    const normalized = normalizeThaiNumerals(String(raw)).trim();
    if (!normalized) {
      return { status: 'empty', valid: false, frac: null, decimals: 0, normalized: '' };
    }
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
      return { status: 'invalid', valid: false, frac: null, decimals: 0, normalized };
    }
    const dotIdx = normalized.indexOf('.');
    const decimals = dotIdx === -1 ? 0 : normalized.length - dotIdx - 1;
    if (normalized.length > 32) {
      return { status: 'invalid', valid: false, frac: null, decimals, normalized };
    }
    try {
      const f = fracFromDecimalStr(normalized);
      return { status: 'valid', valid: true, frac: f, decimals, normalized };
    } catch (_) {
      return { status: 'invalid', valid: false, frac: null, decimals: 0, normalized };
    }
  }

  const ANSWER_TOLERANCE_FRAC = frac(5, 100); // ±0.05 tolerance per teacher specification

  function fracAbsDiff(a, b) {
    const d = fracSub(a, b);
    return frac(absBig(d.num), d.den);
  }

  function gradeAnswer(question, answer) {
    const sol = solveQuestion(question);
    const rawValue = answer && typeof answer.rawValue === 'string' ? answer.rawValue : '';
    const unit = answer && typeof answer.unit === 'string' ? answer.unit.trim() : '';

    const parsed = parseNumericAnswer(rawValue);
    let numericStatus = 'unanswered';
    let numericCorrect = false;

    if (parsed.status === 'empty') {
      numericStatus = 'unanswered';
    } else if (!parsed.valid) {
      numericStatus = 'wrong';
    } else {
      const exp = sol.answerFrac;
      const round2 = sol.answerRound2Frac;
      const diffExact = fracAbsDiff(parsed.frac, exp);
      const diffRound2 = fracAbsDiff(parsed.frac, round2);
      // Accept exact match, 2-decimal rounded match, or within ±0.05 (exact BigInt rational check)
      numericCorrect =
        fracCmp(diffExact, ANSWER_TOLERANCE_FRAC) <= 0 ||
        fracCmp(diffRound2, ANSWER_TOLERANCE_FRAC) <= 0;
      numericStatus = numericCorrect ? 'correct' : 'wrong';
    }

    let unitStatus = 'unselected';
    let unitCorrect = false;
    if (!unit) {
      unitStatus = 'unselected';
    } else if (unit === sol.expectedUnit) {
      unitStatus = 'correct';
      unitCorrect = true;
    } else {
      unitStatus = 'wrong';
    }

    const pointsHalf = question.pointsHalf || TEMPLATE_META[question.templateId].pointsHalf;
    const isCorrect = numericCorrect && unitCorrect;
    const earnedHalf = isCorrect ? pointsHalf : 0;

    return {
      questionId: question.id,
      templateId: question.templateId,
      rawValue,
      normalizedValue: parsed.normalized,
      unit,
      expectedUnit: sol.expectedUnit,
      expectedValue: sol.answerValue,
      expectedExactText: sol.answerExactText,
      expectedRound2Text: sol.answerRound2Text,
      needsRoundingNote: sol.needsRoundingNote,
      numericCorrect,
      numericStatus,
      unitCorrect,
      unitStatus,
      isCorrect,
      pointsHalf,
      earnedHalf
    };
  }

  function gradeExam(session) {
    const items = [];
    let scoreHalf = 0;
    let maxHalf = 0;
    let correctCount = 0;

    for (const q of session.questions) {
      const ans = (session.answers && session.answers[q.id]) || { rawValue: '', unit: '' };
      const graded = gradeAnswer(q, ans);
      items.push(graded);
      scoreHalf += graded.earnedHalf;
      maxHalf += graded.pointsHalf;
      if (graded.isCorrect) correctCount++;
    }

    return {
      scoreHalf,
      maxHalf,
      scoreDisplay: formatHalfPoints(scoreHalf),
      maxDisplay: formatHalfPoints(maxHalf),
      correctCount,
      totalCount: session.questions.length,
      items
    };
  }

  function formatHalfPoints(halfPts) {
    if (halfPts % 2 === 0) return String(halfPts / 2);
    return (halfPts / 2).toFixed(1);
  }

  /* ------------------------------------------------------------------------
     Oracle Formulas from Blueprint §7.3 (Supports both cm and 10x m-beam)
     ------------------------------------------------------------------------ */
  function oracleFormula(templateId, params, n, distanceSystem = 'cm') {
    const isMeterPos = (distanceSystem === 'm' || distanceSystem === 'mixed_m');
    switch (templateId) {
      case 'MA':
        return fracDiv(frac(10 * params.R + 40 * (params.B + 10 * n), 20), frac(1000, 1));
      case 'FA': {
        const xCm = fracAdd(frac(10, 1), frac(10 * params.F1 + 6 * (params.A + n), params.F3));
        return isMeterPos ? fracDiv(xCm, frac(10, 1)) : xCm;
      }
      case 'M1':
        return fracDiv(frac(10 * params.R + 40 * (params.B + 10 * n) - 30 * params.P, 20), frac(1000, 1));
      case 'F1': {
        const xCm = fracAdd(frac(20, 1), frac(20 * params.F1 + 10 * (params.A + n) - 20 * params.F3, params.F4));
        return isMeterPos ? fracDiv(xCm, frac(10, 1)) : xCm;
      }
      case 'M2':
        return fracDiv(frac(40 * (params.B + 10 * n) + 10 * params.R - 20 * params.Q, 40), frac(1000, 1));
      case 'F2': {
        const xCm = fracAdd(frac(30, 1), frac(30 * params.F1 + 10 * (params.A + n) - 30 * params.F3, params.F4));
        return isMeterPos ? fracDiv(xCm, frac(10, 1)) : xCm;
      }
      default:
        throw new Error(`Unknown templateId: ${templateId}`);
    }
  }

  return {
    APP_VERSION,
    SCHEMA_VERSION,
    DURATION_MS,
    G_VALUE,
    UNITS,
    SLOT_POINTS_HALF,
    MAX_POINTS_HALF,
    TEMPLATE_META,
    GENERATOR_POOLS,
    frac,
    fracFromDecimalStr,
    fracAdd,
    fracSub,
    fracMul,
    fracDiv,
    fracCmp,
    fracEq,
    fracToNumber,
    roundFracHalfUp,
    formatFracFixed,
    formatFracClean,
    formatMassKg,
    formatNumberCompact,
    formatDistValue,
    formatDistFracInUnit,
    formatHalfPoints,
    terminatingDecimals,
    labelToLatex,
    questionUsesUnit,
    normalizeThaiNumerals,
    validateStudentNo,
    createSeededRng,
    generateRandomSeed,
    generateSessionId,
    getLearnQuestion,
    enumerateTemplateVariants,
    buildQuestionFromParams,
    generateQuestion,
    validateQuestion,
    solveQuestion,
    buildSolutionSteps,
    generateExam,
    getQuestionFingerprint,
    parseNumericAnswer,
    gradeAnswer,
    gradeExam,
    oracleFormula
  };
});
