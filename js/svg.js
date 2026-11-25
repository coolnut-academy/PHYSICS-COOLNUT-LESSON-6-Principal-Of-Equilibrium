/* ==========================================================================
   Moment Lab — Responsive Inline SVG Diagram Renderer & Interactive Lab SVG
   Supports cm, m, and mixed m+cm labels with Sarabun Thai + Latin italic math
   variables and real SVG subscripts.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root.__ML_BOOT__ && root.__ML_BOOT__.Physics);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.__ML_BOOT__ = root.__ML_BOOT__ || {};
    root.__ML_BOOT__.Svg = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PhysicsArg) {
  'use strict';

  function getPhysics() {
    if (PhysicsArg) return PhysicsArg;
    if (typeof globalThis !== 'undefined' && globalThis.__ML_BOOT__ && globalThis.__ML_BOOT__.Physics) {
      return globalThis.__ML_BOOT__.Physics;
    }
    if (typeof require === 'function') {
      return require('./physics.js');
    }
    throw new Error('Physics module not loaded');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Italic Latin physics variable span
  function vSpan(ch) {
    return `<tspan class="svg-var">${esc(ch)}</tspan>`;
  }

  // Proper SVG subscript span (resets baseline cleanly after)
  function subSpan(text, isThai) {
    const cls = isThai ? 'svg-thai-sub' : 'svg-sub';
    return `<tspan class="${cls}" dy="3" font-size="8.5">${esc(text)}</tspan><tspan dy="-3">&#8203;</tspan>`;
  }

  // Format force label F₁..F₄ with italic Latin F + proper subscript digit
  function svgForceLabel(label) {
    const m = String(label || 'F').match(/^F([₁₂₃₄1-4])?$/);
    if (!m) return esc(label);
    const map = { '₁': '1', '₂': '2', '₃': '3', '₄': '4' };
    const digit = m[1] ? (map[m[1]] || m[1]) : '';
    return digit ? `${vSpan('F')}${subSpan(digit, false)}` : vSpan('F');
  }

  /**
   * Pick a deterministic non-spoiler placeholder position (in cm) for an unknown
   * force position x when showSolution === false.
   * NEVER calls solveQuestion or inspects the true answer.
   */
  function getPlaceholderPosition(question) {
    const L = question.lengthCm;
    const p = question.pivotCm;
    const occupied = new Set([p]);
    for (const l of question.loads) {
      if (!l.unknown && typeof l.xCm === 'number') {
        occupied.add(l.xCm);
      }
    }
    const candidates = [0.72, 0.66, 0.78, 0.62, 0.32, 0.25];
    for (const frac of candidates) {
      const cand = Math.round(L * frac * 10) / 10;
      let tooClose = false;
      for (const ox of occupied) {
        if (Math.abs(cand - ox) < L * 0.09) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose && cand > L * 0.08 && cand < L * 0.92) {
        return cand;
      }
    }
    return Math.round(L * 0.72 * 10) / 10;
  }

  function assignLabelLanes(items, minGapPx) {
    const sorted = items.slice().sort((a, b) => a.px - b.px);
    const laneEnds = [];
    for (const it of sorted) {
      let placed = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (it.px - laneEnds[i] >= minGapPx) {
          placed = i;
          laneEnds[i] = it.px;
          break;
        }
      }
      if (placed === -1) {
        placed = laneEnds.length;
        laneEnds.push(it.px);
      }
      it.lane = placed;
    }
    return sorted;
  }

  function renderQuestionSvg(question, opts = {}) {
    const P = getPhysics();
    const showSolution = Boolean(opts.showSolution);
    const sol = showSolution ? P.solveQuestion(question) : null;

    const L = question.lengthCm;
    const p = question.pivotCm;
    const isMass = question.unknown.type === 'mass';
    const rodU = question.rodDisplayUnit || 'cm';
    const pivU = question.pivotDisplayUnit || 'cm';
    const cu = question.calcUnit || (question.unknown.expectedUnit === 'm' ? 'm' : 'cm');

    const W = 720;
    const padL = 68;
    const padR = 68;
    const barW = W - padL - padR;
    const xToPx = cm => padL + (cm / L) * barW;

    const H = showSolution ? 386 : (isMass ? 290 : 280);
    const rodY = showSolution ? (isMass ? 130 : 190) : (isMass ? 98 : 144);
    const rodH = 14;
    const pivotPx = xToPx(p);

    const parts = [];
    const uid = esc(question.id || 'q').replace(/[^a-zA-Z0-9_-]/g, '_') + (showSolution ? '_sol' : '_prob');

    const lenDisp = P.formatDistValue(L, rodU);
    const pivDisp = P.formatDistValue(p, pivU);

    const titleText = showSolution
      ? `แผนภาพเฉลยสมดุลต่อการหมุน แท่งยาว ${lenDisp} ${rodU} จุดหมุน ${pivDisp} ${pivU}`
      : `แผนภาพโจทย์สมดุลต่อการหมุน แท่งยาว ${lenDisp} ${rodU} จุดหมุน ${pivDisp} ${pivU}`;
    const descText = question.problemText || titleText;

    parts.push(`<svg class="physics-svg ${showSolution ? 'is-solution' : 'is-problem'}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t_${uid} d_${uid}" xmlns="http://www.w3.org/2000/svg">`);
    parts.push(`<title id="t_${uid}">${esc(titleText)}</title>`);
    parts.push(`<desc id="d_${uid}">${esc(descText)}</desc>`);

    parts.push(`
      <defs>
        <marker id="arr_accent_${uid}" viewBox="0 0 10 10" refX="5" refY="8.5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 1 1 L 5 9 L 9 1 Z" fill="var(--svg-force)"/>
        </marker>
        <marker id="arr_unk_${uid}" viewBox="0 0 10 10" refX="5" refY="8.5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 1 1 L 5 9 L 9 1 Z" fill="var(--svg-unknown)"/>
        </marker>
        <marker id="arr_ccw_${uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 1 2 L 9 5 L 1 8 Z" fill="var(--svg-ccw)"/>
        </marker>
        <marker id="arr_cw_${uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 1 2 L 9 5 L 1 8 Z" fill="var(--svg-cw)"/>
        </marker>
        <marker id="arr_rod_${uid}" viewBox="0 0 10 10" refX="5" refY="8.5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 1 1 L 5 9 L 9 1 Z" fill="var(--svg-cm)"/>
        </marker>
      </defs>
    `);

    // Card backdrop
    parts.push(`<rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="14" fill="var(--svg-bg)" stroke="var(--svg-border)" stroke-width="1"/>`);

    // Top Length Dimension Bracket
    const dimTopY = 26;
    parts.push(`<g class="svg-dim-length">`);
    parts.push(`<line x1="${padL}" y1="${dimTopY}" x2="${padL + barW}" y2="${dimTopY}" stroke="var(--svg-muted)" stroke-width="1.25" stroke-dasharray="4 3"/>`);
    parts.push(`<line x1="${padL}" y1="${dimTopY - 5}" x2="${padL}" y2="${dimTopY + 5}" stroke="var(--svg-muted)" stroke-width="1.4"/>`);
    parts.push(`<line x1="${padL + barW}" y1="${dimTopY - 5}" x2="${padL + barW}" y2="${dimTopY + 5}" stroke="var(--svg-muted)" stroke-width="1.4"/>`);
    const rodMassNote = question.rod && question.rod.massGrams
      ? ` · มวลแท่ง ${P.formatMassKg(question.rod.massGrams)} kg`
      : ' · ไม่ทราบมวลแท่ง';
    const lenPlainCount = `L = ${lenDisp} ${rodU}${rodMassNote}`.length;
    const lenPillW = Math.min(360, Math.max(170, lenPlainCount * 7.6 + 28));
    parts.push(`<rect x="${W / 2 - lenPillW / 2}" y="${dimTopY - 12}" width="${lenPillW}" height="24" rx="12" fill="var(--svg-pill-bg)" stroke="var(--svg-border)" stroke-width="1"/>`);
    parts.push(`<text x="${W / 2}" y="${dimTopY + 4}" text-anchor="middle" fill="var(--svg-text-sub)" class="svg-thai" font-size="12" font-weight="600">${vSpan('L')} = ${esc(lenDisp)} ${esc(rodU)}${esc(rodMassNote)}</text>`);
    parts.push(`</g>`);

    // Solution Mode: Dedicated Rotation Band
    if (showSolution) {
      const arcY = 62;
      const ccwX = Math.max(padL + 74, Math.min(pivotPx - 66, (padL + pivotPx) / 2));
      parts.push(`<g class="svg-rot-ccw">`);
      parts.push(`<path d="M ${ccwX + 20} ${arcY - 2} A 18 18 0 0 0 ${ccwX - 16} ${arcY + 6}" fill="none" stroke="var(--svg-ccw)" stroke-width="2.2" marker-end="url(#arr_ccw_${uid})"/>`);
      parts.push(`<text x="${ccwX}" y="${arcY - 8}" text-anchor="middle" fill="var(--svg-ccw)" class="svg-thai" font-size="12" font-weight="700">↺ ทวนเข็ม (CCW)</text>`);
      parts.push(`</g>`);

      const cwX = Math.min(padL + barW - 74, Math.max(pivotPx + 66, (pivotPx + padL + barW) / 2));
      parts.push(`<g class="svg-rot-cw">`);
      parts.push(`<path d="M ${cwX - 20} ${arcY - 2} A 18 18 0 0 1 ${cwX + 16} ${arcY + 6}" fill="none" stroke="var(--svg-cw)" stroke-width="2.2" marker-end="url(#arr_cw_${uid})"/>`);
      parts.push(`<text x="${cwX}" y="${arcY - 8}" text-anchor="middle" fill="var(--svg-cw)" class="svg-thai" font-size="12" font-weight="700">↻ ตามเข็ม (CW)</text>`);
      parts.push(`</g>`);
    }

    // Rod
    parts.push(`<g class="svg-rod">`);
    parts.push(`<rect x="${padL}" y="${rodY}" width="${barW}" height="${rodH}" rx="4" fill="var(--svg-rod-fill)" stroke="var(--svg-rod-stroke)" stroke-width="1.6"/>`);
    for (let i = 0; i <= 10; i++) {
      const tx = padL + (i / 10) * barW;
      const major = (i === 0 || i === 5 || i === 10);
      parts.push(`<line x1="${tx}" y1="${rodY}" x2="${tx}" y2="${rodY + (major ? 8 : 5)}" stroke="var(--svg-rod-tick)" stroke-width="${major ? 1.4 : 1}"/>`);
    }
    parts.push(`</g>`);

    // Pivot Fulcrum
    const triTopY = rodY + rodH;
    const triBaseY = triTopY + 26;
    const pivLabelVal = showSolution ? `${P.formatDistValue(p, cu)} ${cu}` : `${pivDisp} ${pivU}`;
    parts.push(`<g class="svg-pivot">`);
    parts.push(`<polygon points="${pivotPx},${triTopY} ${pivotPx - 15},${triBaseY} ${pivotPx + 15},${triBaseY}" fill="var(--svg-pivot-fill)" stroke="var(--svg-pivot-stroke)" stroke-width="1.8" stroke-linejoin="round"/>`);
    parts.push(`<line x1="${pivotPx - 24}" y1="${triBaseY + 2}" x2="${pivotPx + 24}" y2="${triBaseY + 2}" stroke="var(--svg-pivot-stroke)" stroke-width="2.2" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${pivotPx}" cy="${rodY + rodH / 2}" r="3.5" fill="var(--svg-pivot-stroke)"/>`);
    parts.push(`<text x="${pivotPx}" y="${triBaseY + 18}" text-anchor="middle" fill="var(--svg-pivot-text)" class="svg-thai" font-size="11.5" font-weight="700">จุดหมุน (${esc(pivLabelVal)})</text>`);
    parts.push(`</g>`);

    // Position Scale Ticks (Respect each load's given unit in problem view, calcUnit in solution view)
    const tickMap = new Map();
    const addTick = (cm, label, kind) => {
      const key = String(Math.round(cm * 100) / 100);
      if (!tickMap.has(key)) {
        tickMap.set(key, { cm, px: xToPx(cm), label, kind });
      }
    };
    const scaleU = showSolution ? cu : rodU;
    addTick(0, '0', 'end');
    addTick(L, `${P.formatDistValue(L, scaleU)} ${scaleU}`, 'end');
    addTick(p, `${P.formatDistValue(p, showSolution ? cu : pivU)} ${showSolution ? cu : pivU}`, 'pivot');
    for (const l of question.loads) {
      if (!l.unknown && typeof l.xCm === 'number') {
        const u = showSolution ? cu : (l.posUnit || rodU);
        const showUnitSuffix = u !== scaleU || u === 'm';
        addTick(l.xCm, showUnitSuffix ? `${P.formatDistValue(l.xCm, u)} ${u}` : `${P.formatDistValue(l.xCm, u)}`, 'load');
      } else if (l.kind === 'mass' && typeof l.xCm === 'number') {
        const u = showSolution ? cu : (l.posUnit || rodU);
        const showUnitSuffix = u !== scaleU || u === 'm';
        addTick(l.xCm, showUnitSuffix ? `${P.formatDistValue(l.xCm, u)} ${u}` : `${P.formatDistValue(l.xCm, u)}`, 'unknown');
      }
    }
    if (showSolution) {
      addTick(sol.xCm, `${P.formatNumberCompact(sol.xCmCalcFrac)} ${cu}`, 'cm');
      if (question.unknown.type === 'position') {
        addTick(sol.answerCmValue, `${sol.answerRound2Text} ${cu}`, 'solved');
      }
    }

    const tickList = assignLabelLanes(Array.from(tickMap.values()), 48);
    const tickBaseY = isMass ? rodY - 8 : rodY + rodH + 15;
    parts.push(`<g class="svg-scale-ticks">`);
    for (const tk of tickList) {
      if (!isMass && tk.kind === 'pivot') continue;
      const yOffset = isMass ? -(tk.lane * 14) : (tk.lane * 13);
      const yPos = tickBaseY + yOffset;
      const tickColor = tk.kind === 'solved' ? 'var(--svg-unknown)'
        : tk.kind === 'cm' ? 'var(--svg-cm)'
          : tk.kind === 'pivot' ? 'var(--svg-pivot-text)' : 'var(--svg-text-sub)';
      parts.push(`<line x1="${tk.px}" y1="${isMass ? rodY : rodY + rodH}" x2="${tk.px}" y2="${isMass ? rodY - 4 : rodY + rodH + 4}" stroke="${tickColor}" stroke-width="1.3"/>`);
      parts.push(`<text x="${tk.px}" y="${yPos}" text-anchor="middle" fill="${tickColor}" class="svg-num" font-size="11" font-weight="${tk.kind === 'solved' || tk.kind === 'pivot' ? '700' : '600'}">${esc(tk.label)}</text>`);
    }
    parts.push(`</g>`);

    // ----------------------------------------------------------------------
    // MASS LOADS
    // ----------------------------------------------------------------------
    if (isMass) {
      const massRenderItems = question.loads.map(l => ({
        load: l,
        px: xToPx(l.xCm),
        xCm: l.xCm
      }));
      assignLabelLanes(massRenderItems, 86);

      for (const item of massRenderItems) {
        const l = item.load;
        const px = item.px;
        const isUnk = Boolean(l.unknown);
        const stringLen = 30 + item.lane * 22;
        const boxW = isUnk ? 76 : (l.param ? 82 : 68);
        const boxH = l.param ? 36 : 30;
        const boxY = rodY + rodH + stringLen;
        const clampedBoxX = Math.max(14, Math.min(W - 14 - boxW, px - boxW / 2));
        const textCenterX = clampedBoxX + boxW / 2;

        const strokeCol = isUnk ? 'var(--svg-unknown)' : 'var(--svg-mass-stroke)';
        const fillCol = isUnk ? 'var(--svg-unknown-soft)' : 'var(--svg-mass-fill)';
        const textCol = isUnk ? 'var(--svg-unknown)' : 'var(--svg-text)';

        parts.push(`<g class="svg-mass-load">`);
        parts.push(`<circle cx="${px}" cy="${rodY + rodH}" r="3" fill="${strokeCol}"/>`);
        parts.push(`<line x1="${px}" y1="${rodY + rodH}" x2="${px}" y2="${boxY}" stroke="${strokeCol}" stroke-width="2" ${isUnk && !showSolution ? 'stroke-dasharray="4 3"' : ''}/>`);
        parts.push(`<rect x="${clampedBoxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="7" fill="${fillCol}" stroke="${strokeCol}" stroke-width="1.8"/>`);

        if (isUnk) {
          const valMarkup = showSolution
            ? `${vSpan('m')} = ${esc(sol.answerExactText)} kg`
            : `${vSpan('m')} = ? kg`;
          parts.push(`<text x="${textCenterX}" y="${boxY + 19}" text-anchor="middle" fill="${textCol}" class="svg-num" font-size="12" font-weight="700">${valMarkup}</text>`);
        } else if (l.param) {
          parts.push(`<text x="${textCenterX}" y="${boxY + 15}" text-anchor="middle" fill="${textCol}" class="svg-num" font-size="11.5" font-weight="700">${l.massGrams} g</text>`);
          const paramHtml = esc(l.param.exprText).replace(/n/g, vSpan('n'));
          parts.push(`<text x="${textCenterX}" y="${boxY + 29}" text-anchor="middle" fill="var(--svg-text-sub)" class="svg-num" font-size="10">(${paramHtml})</text>`);
        } else {
          parts.push(`<text x="${textCenterX}" y="${boxY + 19}" text-anchor="middle" fill="${textCol}" class="svg-num" font-size="12" font-weight="700">${P.formatMassKg(l.massGrams)} kg</text>`);
        }
        parts.push(`</g>`);
      }

      if (showSolution && question.rod && question.rod.massGrams) {
        const cmPx = xToPx(sol.xCm);
        const arrowEndY = rodY + rodH + 62;
        const pillW = 98;
        const clampedCmX = Math.max(14 + pillW / 2, Math.min(W - 14 - pillW / 2, cmPx));
        parts.push(`<g class="svg-rod-cm">`);
        parts.push(`<circle cx="${cmPx}" cy="${rodY + rodH / 2}" r="4.5" fill="var(--svg-cm)"/>`);
        parts.push(`<line x1="${cmPx}" y1="${rodY + rodH + 2}" x2="${cmPx}" y2="${arrowEndY}" stroke="var(--svg-cm)" stroke-width="2.4" marker-end="url(#arr_rod_${uid})"/>`);
        parts.push(`<rect x="${clampedCmX - pillW / 2}" y="${arrowEndY + 5}" width="${pillW}" height="24" rx="7" fill="var(--svg-cm-soft)" stroke="var(--svg-cm)" stroke-width="1.2"/>`);
        parts.push(`<text x="${clampedCmX}" y="${arrowEndY + 21}" text-anchor="middle" fill="var(--svg-cm)" class="svg-num" font-size="11.5" font-weight="700">${vSpan('W')}${subSpan('แท่ง', true)} (${P.formatMassKg(question.rod.massGrams)}${vSpan('g')})</text>`);
        parts.push(`</g>`);
      }
    } else {
      // --------------------------------------------------------------------
      // FORCE LOADS
      // --------------------------------------------------------------------
      const placeholderCm = showSolution ? null : getPlaceholderPosition(question);
      const forceRenderItems = question.loads.map(l => {
        const isUnk = Boolean(l.unknown);
        const drawCm = isUnk ? (showSolution ? sol.answerCmValue : placeholderCm) : l.xCm;
        return { load: l, isUnk, drawCm, px: xToPx(drawCm) };
      });
      assignLabelLanes(forceRenderItems, 82);

      for (const item of forceRenderItems) {
        const l = item.load;
        const px = item.px;
        const isUnk = item.isUnk;
        const arrowLen = 44 + item.lane * 24;
        const topY = rodY - arrowLen;
        const strokeCol = isUnk ? 'var(--svg-unknown)' : 'var(--svg-force)';
        const markerId = isUnk ? `arr_unk_${uid}` : `arr_accent_${uid}`;

        parts.push(`<g class="svg-force-load">`);
        parts.push(`<line x1="${px}" y1="${topY}" x2="${px}" y2="${rodY - 3}" stroke="${strokeCol}" stroke-width="2.6" ${isUnk && !showSolution ? 'stroke-dasharray="5 3"' : ''} marker-end="url(#${markerId})"/>`);

        const mainPlain = `${l.label} = ${l.forceN} N`;
        const mainHtml = `${svgForceLabel(l.label)} = ${l.forceN} N`;

        let subPlain = '';
        let subHtml = '';
        if (isUnk) {
          if (showSolution) {
            subPlain = `x = ${sol.answerRound2Text} ${cu}`;
            subHtml = `${vSpan('x')} = ${esc(sol.answerRound2Text)} ${esc(cu)}`;
          } else {
            subPlain = 'x = ? (ตำแหน่งสมมติ)';
            subHtml = `${vSpan('x')} = ? (ตำแหน่งสมมติ)`;
          }
        } else if (l.param) {
          subPlain = `(${l.param.exprText})`;
          subHtml = `(${esc(l.param.exprText).replace(/n/g, vSpan('n'))})`;
        }

        const pillW = Math.max(82, mainPlain.length * 7.6 + 18, subPlain.length * 6.8 + 18);
        const pillH = subPlain ? 36 : 24;
        const pillY = topY - pillH - 4;
        const clampedX = Math.max(14 + pillW / 2, Math.min(W - 14 - pillW / 2, px));

        parts.push(`<rect x="${clampedX - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="7" fill="${isUnk ? 'var(--svg-unknown-soft)' : 'var(--svg-force-soft)'}" stroke="${strokeCol}" stroke-width="1.4"/>`);
        parts.push(`<text x="${clampedX}" y="${pillY + (subPlain ? 15 : 16)}" text-anchor="middle" fill="${strokeCol}" class="svg-num" font-size="11.5" font-weight="700">${mainHtml}</text>`);
        if (subPlain) {
          parts.push(`<text x="${clampedX}" y="${pillY + 29}" text-anchor="middle" fill="${isUnk ? 'var(--svg-unknown)' : 'var(--svg-text-sub)'}" class="svg-thai" font-size="10.2" font-weight="600">${subHtml}</text>`);
        }
        parts.push(`</g>`);
      }

      if (showSolution && sol.rodPassesPivot) {
        const cmPx = xToPx(sol.xCm);
        const xCmVal = P.formatNumberCompact(sol.xCmCalcFrac);
        const badgeW = 248;
        const clampedCm = Math.max(14 + badgeW / 2, Math.min(W - 14 - badgeW / 2, cmPx));
        parts.push(`<g class="svg-zero-moment">`);
        parts.push(`<circle cx="${cmPx}" cy="${rodY + rodH / 2}" r="4.5" fill="var(--svg-cm)"/>`);
        parts.push(`<rect x="${clampedCm - badgeW / 2}" y="${triBaseY + 26}" width="${badgeW}" height="24" rx="12" fill="var(--svg-cm-soft)" stroke="var(--svg-cm)" stroke-width="1.1"/>`);
        parts.push(`<text x="${clampedCm}" y="${triBaseY + 42}" text-anchor="middle" fill="var(--svg-cm)" class="svg-thai" font-size="11" font-weight="600">${vSpan('W')}${subSpan('แท่ง', true)} ณ ${vSpan('x')}${subSpan('cm', false)} = ${esc(xCmVal)} ${esc(cu)} (${vSpan('d')} = 0 → ${vSpan('M')} = 0)</text>`);
        parts.push(`</g>`);
      }

      if (!showSolution) {
        const noteY = H - 22;
        parts.push(`<g class="svg-disclaimer">`);
        parts.push(`<rect x="${W / 2 - 205}" y="${noteY - 14}" width="410" height="22" rx="11" fill="var(--svg-warn-soft)" stroke="var(--svg-warn)" stroke-width="1"/>`);
        parts.push(`<text x="${W / 2}" y="${noteY + 1}" text-anchor="middle" fill="var(--svg-warn-text)" class="svg-thai" font-size="11.2" font-weight="600">หมายเหตุ: ตำแหน่ง ${vSpan('x')} ในภาพเป็นเพียงภาพประกอบ ไม่ใช่ค่าจริง</text>`);
        parts.push(`</g>`);
      }
    }

    // Solution Mode: Moment Arm Dimension Brackets in calcUnit (m or cm)
    if (showSolution) {
      const activeItems = sol.forceItems.filter(it => it.includedInEquation);
      const ccwArms = activeItems.filter(it => it.direction === 'ccw').sort((a, b) => a.distanceCm - b.distanceCm);
      const cwArms = activeItems.filter(it => it.direction === 'cw').sort((a, b) => a.distanceCm - b.distanceCm);

      const baseArmY = isMass ? 298 : 310;
      const tierStep = 26;

      const drawArmBracket = (item, tierIdx, side) => {
        const y = baseArmY + tierIdx * tierStep;
        const x1 = pivotPx;
        const x2 = xToPx(item.xCm);
        const col = side === 'ccw' ? 'var(--svg-ccw)' : 'var(--svg-cw)';
        const midX = (x1 + x2) / 2;
        const dStr = P.formatFracClean(item.distanceCalcFrac, { minDec: cu === 'm' ? 2 : 0, maxDec: 2 });
        const dirIcon = side === 'ccw' ? '↺' : '↻';
        const plainLen = `${dirIcon} d = ${dStr} ${cu}`.length;
        const lw = Math.max(82, plainLen * 7.1 + 14);
        const clampedMid = Math.max(14 + lw / 2, Math.min(W - 14 - lw / 2, midX));

        parts.push(`<g class="svg-arm-bracket">`);
        parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="1.8"/>`);
        parts.push(`<line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="${col}" stroke-width="1.6"/>`);
        parts.push(`<line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="${col}" stroke-width="1.6"/>`);
        parts.push(`<rect x="${clampedMid - lw / 2}" y="${y - 10}" width="${lw}" height="20" rx="10" fill="var(--svg-bg)" stroke="${col}" stroke-width="1.1"/>`);
        parts.push(`<text x="${clampedMid}" y="${y + 4}" text-anchor="middle" fill="${col}" class="svg-num" font-size="11" font-weight="700">${dirIcon} ${vSpan('d')} = ${esc(dStr)} ${esc(cu)}</text>`);
        parts.push(`</g>`);
      };

      ccwArms.forEach((it, idx) => drawArmBracket(it, idx, 'ccw'));
      cwArms.forEach((it, idx) => drawArmBracket(it, idx, 'cw'));
    }

    parts.push(`</svg>`);
    return parts.join('');
  }

  /* ------------------------------------------------------------------------
     Interactive Mini-Demo SVG (Shows both cm and m simultaneously!)
     ------------------------------------------------------------------------ */
  function renderInteractiveDemoSvg({ lengthCm = 100, pivotCm = 50, forceXCm = 20, forceN = 10 }) {
    const W = 680;
    const H = 248;
    const padL = 56;
    const padR = 56;
    const barW = W - padL - padR;
    const xToPx = cm => padL + (cm / lengthCm) * barW;

    const rodY = 124;
    const rodH = 14;
    const pivotPx = xToPx(pivotCm);
    const forcePx = xToPx(forceXCm);
    const dCm = Math.abs(forceXCm - pivotCm);
    const dM = (dCm / 100).toFixed(2);
    const dir = forceXCm === pivotCm ? 'zero' : (forceXCm < pivotCm ? 'ccw' : 'cw');
    const dirCol = dir === 'ccw' ? 'var(--svg-ccw)' : dir === 'cw' ? 'var(--svg-cw)' : 'var(--svg-cm)';
    const dirLabel = dir === 'ccw'
      ? '↺ โมเมนต์ทวนเข็มนาฬิกา (CCW)'
      : dir === 'cw'
        ? '↻ โมเมนต์ตามเข็มนาฬิกา (CW)'
        : '• แนวแรงผ่านจุดหมุน → โมเมนต์ = 0';

    const parts = [];
    parts.push(`<svg class="physics-svg demo-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="แผนภาพโต้ตอบแขนโมเมนต์และทิศการหมุน" xmlns="http://www.w3.org/2000/svg">`);
    parts.push(`
      <defs>
        <marker id="demo_arr_f" viewBox="0 0 10 10" refX="5" refY="8.5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 1 1 L 5 9 L 9 1 Z" fill="${dirCol}"/>
        </marker>
      </defs>
    `);
    parts.push(`<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="14" fill="var(--svg-bg)" stroke="var(--svg-border)" stroke-width="1"/>`);

    parts.push(`<rect x="${W / 2 - 150}" y="18" width="300" height="26" rx="13" fill="var(--svg-pill-bg)" stroke="${dirCol}" stroke-width="1.3"/>`);
    parts.push(`<text x="${W / 2}" y="35" text-anchor="middle" fill="${dirCol}" class="svg-thai" font-size="12" font-weight="700">${esc(dirLabel)}</text>`);

    parts.push(`<rect x="${padL}" y="${rodY}" width="${barW}" height="${rodH}" rx="4" fill="var(--svg-rod-fill)" stroke="var(--svg-rod-stroke)" stroke-width="1.6"/>`);
    for (let cm = 0; cm <= lengthCm; cm += 10) {
      const tx = xToPx(cm);
      const isMajor = cm % 20 === 0;
      parts.push(`<line x1="${tx}" y1="${rodY}" x2="${tx}" y2="${rodY + (isMajor ? 8 : 5)}" stroke="var(--svg-rod-tick)" stroke-width="1.2"/>`);
      if (isMajor) {
        parts.push(`<text x="${tx}" y="${rodY + rodH + 14}" text-anchor="middle" fill="var(--svg-text-sub)" class="svg-num" font-size="10">${cm} cm</text>`);
      }
    }

    const triTopY = rodY + rodH;
    const triBaseY = triTopY + 26;
    parts.push(`<polygon points="${pivotPx},${triTopY} ${pivotPx - 14},${triBaseY} ${pivotPx + 14},${triBaseY}" fill="var(--svg-pivot-fill)" stroke="var(--svg-pivot-stroke)" stroke-width="1.8"/>`);
    parts.push(`<line x1="${pivotPx - 22}" y1="${triBaseY + 2}" x2="${pivotPx + 22}" y2="${triBaseY + 2}" stroke="var(--svg-pivot-stroke)" stroke-width="2"/>`);
    parts.push(`<text x="${pivotPx}" y="${triBaseY + 18}" text-anchor="middle" fill="var(--svg-pivot-text)" class="svg-thai" font-size="11.2" font-weight="700">จุดหมุน (${pivotCm} cm / ${(pivotCm / 100).toFixed(2)} m)</text>`);

    const arrTop = 68;
    parts.push(`<line x1="${forcePx}" y1="${arrTop}" x2="${forcePx}" y2="${rodY - 3}" stroke="${dirCol}" stroke-width="3" marker-end="url(#demo_arr_f)"/>`);
    const fW = 192;
    const fX = Math.max(16 + fW / 2, Math.min(W - 16 - fW / 2, forcePx));
    parts.push(`<rect x="${fX - fW / 2}" y="${arrTop - 24}" width="${fW}" height="24" rx="7" fill="var(--svg-pill-bg)" stroke="${dirCol}" stroke-width="1.3"/>`);
    parts.push(`<text x="${fX}" y="${arrTop - 8}" text-anchor="middle" fill="${dirCol}" class="svg-num" font-size="11.5" font-weight="700">${vSpan('F')} = ${forceN} N (${vSpan('x')} = ${forceXCm} cm)</text>`);

    const armY = H - 24;
    if (dCm > 0) {
      parts.push(`<line x1="${pivotPx}" y1="${armY}" x2="${forcePx}" y2="${armY}" stroke="${dirCol}" stroke-width="2.2"/>`);
      parts.push(`<line x1="${pivotPx}" y1="${armY - 5}" x2="${pivotPx}" y2="${armY + 5}" stroke="${dirCol}" stroke-width="2"/>`);
      parts.push(`<line x1="${forcePx}" y1="${armY - 5}" x2="${forcePx}" y2="${armY + 5}" stroke="${dirCol}" stroke-width="2"/>`);
      const midX = Math.max(110, Math.min(W - 110, (pivotPx + forcePx) / 2));
      parts.push(`<rect x="${midX - 92}" y="${armY - 11}" width="184" height="22" rx="11" fill="var(--svg-bg)" stroke="${dirCol}" stroke-width="1.2"/>`);
      parts.push(`<text x="${midX}" y="${armY + 4}" text-anchor="middle" fill="${dirCol}" class="svg-num" font-size="11" font-weight="700">${vSpan('d')} = ${dCm} cm (${dM} m)</text>`);
    } else {
      parts.push(`<text x="${W / 2}" y="${armY + 4}" text-anchor="middle" fill="var(--svg-cm)" class="svg-num" font-size="11.5" font-weight="700">${vSpan('d')} = |${forceXCm} − ${pivotCm}| = 0 → ${vSpan('M')} = ${forceN} × 0 = 0 N·m</text>`);
    }

    parts.push(`</svg>`);
    return parts.join('');
  }

  return {
    renderQuestionSvg,
    renderInteractiveDemoSvg,
    getPlaceholderPosition
  };
});
