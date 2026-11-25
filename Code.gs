/**
 * ============================================================================
 * Moment Lab — Anonymous Statistics Backend (Google Apps Script)
 * เชื่อมต่อกับ Google Sheet ฐานข้อมูลสถิติแบบไม่เก็บข้อมูลส่วนบุคคล (Zero PII)
 *
 * วิธีติดตั้ง (ใช้เวลาไม่เกิน 2 นาที):
 * 1. เปิด Google Sheet:
 *    https://docs.google.com/spreadsheets/d/183KHDFLIMGED-r_QggLYYvwiPqUNgU5gPRH4NvvMrgM/edit
 * 2. ไปที่เมนู ส่วนขยาย (Extensions) -> Apps Script
 * 3. ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดจากไฟล์ Code.gs นี้ลงไป กดบันทึก (Ctrl+S)
 * 4. กด "ทำให้ใช้งานได้" (Deploy) -> "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 *    - เลือกประเภท: เว็บแอป (Web app)
 *    - ดำเนินการในฐานะ (Execute as): ฉัน (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): ทุกคน (Anyone)
 * 5. กด Deploy แล้วอนุญาตสิทธิ์ จากนั้นคัดลอก "Web app URL" (ลงท้ายด้วย /exec)
 * 6. นำ URL ไปวางที่ตัวแปร STATS_API_URL ด้านบนสุดของไฟล์ js/stats.js แล้ว push ขึ้น GitHub Pages
 * ============================================================================
 */

var SPREADSHEET_ID = '183KHDFLIMGED-r_QggLYYvwiPqUNgU5gPRH4NvvMrgM';
var SHEET_ATTEMPTS = 'StatsLog';      // เก็บรายการสถิติแบบไม่ระบุตัวตน (1 แถว/รอบ)
var SHEET_SUMMARY  = 'StatsSummary';  // เก็บตัวเลขสรุปเพื่ออ่านเข้า Dashboard เร็วทันใจ O(1)

var TEMPLATES = ['MA', 'FA', 'M1', 'F1', 'M2', 'F2'];
var DIST_SYSTEMS = ['cm', 'm', 'mixed_cm', 'mixed_m'];
var SIDES = ['cw', 'ccw'];

/**
 * เปิดสเปรดชีตและสร้างหัวตารางอัตโนมัติถ้ายังไม่มี
 */
function getSpreadsheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 1) ชีต StatsLog (Append-only, Zero PII)
  var logSheet = ss.getSheetByName(SHEET_ATTEMPTS);
  if (!logSheet) {
    // หากชีตแรกว่างเปล่าให้เปลี่ยนชื่อใช้งานทันที มิฉะนั้นสร้างชีตใหม่
    var first = ss.getSheets()[0];
    if (first && first.getLastRow() === 0) {
      first.setName(SHEET_ATTEMPTS);
      logSheet = first;
    } else {
      logSheet = ss.insertSheet(SHEET_ATTEMPTS);
    }
  }
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow([
      'timestamp_ict', 'mode', 'score_10', 'correct_count', 'duration_sec',
      'submit_reason', 'is_repeat', 'attempt_index',
      'q1_tpl', 'q1_dist', 'q1_side', 'q1_err',
      'q2_tpl', 'q2_dist', 'q2_side', 'q2_err',
      'q3_tpl', 'q3_dist', 'q3_side', 'q3_err'
    ]);
    logSheet.setFrozenRows(1);
  }

  // 2) ชีต StatsSummary (ตารางสรุปตัวเลขสำหรับ Dashboard Realtime)
  var sumSheet = ss.getSheetByName(SHEET_SUMMARY);
  if (!sumSheet) {
    sumSheet = ss.insertSheet(SHEET_SUMMARY);
  }
  if (sumSheet.getLastRow() === 0) {
    sumSheet.appendRow(['key', 'value_json', 'updated_at']);
    sumSheet.appendRow(['all', JSON.stringify(createEmptyBucket_()), new Date().toISOString()]);
    sumSheet.appendRow(['practice', JSON.stringify(createEmptyBucket_()), new Date().toISOString()]);
    sumSheet.appendRow(['real', JSON.stringify(createEmptyBucket_()), new Date().toISOString()]);
    sumSheet.setFrozenRows(1);
  }

  return { ss: ss, logSheet: logSheet, sumSheet: sumSheet };
}

function createEmptyBucket_() {
  var byTemplate = {};
  for (var i = 0; i < TEMPLATES.length; i++) {
    byTemplate[TEMPLATES[i]] = {
      attempts: 0, correct: 0, wrong: 0,
      wrongNumericOnly: 0, wrongUnitOnly: 0, wrongBoth: 0, unanswered: 0
    };
  }
  var byDist = {};
  for (var j = 0; j < DIST_SYSTEMS.length; j++) {
    byDist[DIST_SYSTEMS[j]] = { attempts: 0, correct: 0, wrong: 0 };
  }
  var bySide = {
    cw: { attempts: 0, correct: 0, wrong: 0 },
    ccw: { attempts: 0, correct: 0, wrong: 0 }
  };
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
    byTemplate: byTemplate,
    byDist: byDist,
    bySide: bySide,
    recent: [] // เก็บ 25 รอบล่าสุดเฉพาะตัวเลขคะแนน/โหมด/เวลา เพื่อวาดกราฟแนวโน้ม Realtime
  };
}

function applyEventToBucket_(bucket, ev, tsIct) {
  bucket.totalAttempts += 1;
  if (ev.isRepeat) bucket.repeatAttempts += 1;
  bucket.scoreSum = Math.round((bucket.scoreSum + ev.score) * 100) / 100;
  bucket.durationSecSum += ev.durationSec;
  if (ev.submitReason === 'timeout') bucket.timeoutCount += 1;
  else bucket.manualCount += 1;

  for (var i = 0; i < ev.items.length; i++) {
    var it = ev.items[i];
    var tpl = bucket.byTemplate[it.templateId];
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

    var ds = bucket.byDist[it.distanceSystem];
    if (ds) {
      ds.attempts += 1;
      if (it.errorType === 'correct') ds.correct += 1;
      else ds.wrong += 1;
    }

    // นับสถิติฝั่งซ้าย (ccw) vs ฝั่งขวา (cw) เฉพาะโจทย์หาตำแหน่งแรง
    if (it.isPosition && bucket.bySide[it.unknownSide]) {
      var sd = bucket.bySide[it.unknownSide];
      sd.attempts += 1;
      if (it.errorType === 'correct') sd.correct += 1;
      else sd.wrong += 1;
    }
  }

  bucket.recent.push({
    t: tsIct,
    m: ev.mode,
    s: ev.score,
    d: ev.durationSec,
    r: ev.isRepeat ? 1 : 0
  });
  if (bucket.recent.length > 25) {
    bucket.recent = bucket.recent.slice(bucket.recent.length - 25);
  }
}

/**
 * รับข้อมูลสถิติแบบไม่ระบุตัวตน (POST text/plain JSON จากเว็บแอป)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    // ตรวจสอบและคัดกรองเฉพาะตัวเลข/หมวดหมู่ (ไม่รับฟิลด์ชื่อหรือข้อมูลส่วนตัวใดๆ)
    var mode = data.mode === 'real' ? 'real' : 'practice';
    var score = Math.max(0, Math.min(10, Number(data.score) || 0));
    var correctCount = Math.max(0, Math.min(3, parseInt(data.correctCount, 10) || 0));
    var durationSec = Math.max(0, Math.min(900, Math.round(Number(data.durationSec) || 0)));
    var submitReason = data.submitReason === 'timeout' ? 'timeout' : 'manual';
    var isRepeat = Boolean(data.isRepeat);
    var attemptIndex = Math.max(1, parseInt(data.attemptIndex, 10) || 1);

    var validErrTypes = {
      correct: true, wrongNumericOnly: true, wrongUnitOnly: true, wrongBoth: true, unanswered: true
    };
    var rawItems = Array.isArray(data.items) ? data.items.slice(0, 3) : [];
    var cleanItems = [];
    for (var i = 0; i < rawItems.length; i++) {
      var r = rawItems[i] || {};
      var tplId = TEMPLATES.indexOf(r.templateId) >= 0 ? r.templateId : 'MA';
      var distSys = DIST_SYSTEMS.indexOf(r.distanceSystem) >= 0 ? r.distanceSystem : 'cm';
      var side = (r.unknownSide === 'ccw' || r.unknownSide === 'cw') ? r.unknownSide : 'cw';
      var errType = validErrTypes[r.errorType] ? r.errorType : 'wrongBoth';
      var isPosition = Boolean(r.isPosition);
      cleanItems.push({
        templateId: tplId,
        distanceSystem: distSys,
        unknownSide: side,
        errorType: errType,
        isPosition: isPosition
      });
    }

    var ev = {
      mode: mode,
      score: score,
      correctCount: correctCount,
      durationSec: durationSec,
      submitReason: submitReason,
      isRepeat: isRepeat,
      attemptIndex: attemptIndex,
      items: cleanItems
    };

    var ctx = getSpreadsheet_();
    var now = new Date();
    var tsIct = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    // 1) บันทึกลง StatsLog (Append 1 แถว รวดเร็ว)
    var q1 = cleanItems[0] || { templateId: '', distanceSystem: '', unknownSide: '', errorType: '' };
    var q2 = cleanItems[1] || { templateId: '', distanceSystem: '', unknownSide: '', errorType: '' };
    var q3 = cleanItems[2] || { templateId: '', distanceSystem: '', unknownSide: '', errorType: '' };
    ctx.logSheet.appendRow([
      tsIct, mode, score, correctCount, durationSec, submitReason, isRepeat ? 1 : 0, attemptIndex,
      q1.templateId, q1.distanceSystem, q1.unknownSide, q1.errorType,
      q2.templateId, q2.distanceSystem, q2.unknownSide, q2.errorType,
      q3.templateId, q3.distanceSystem, q3.unknownSide, q3.errorType
    ]);

    // 2) อัปเดตตารางสรุป StatsSummary (all + mode)
    var sumRange = ctx.sumSheet.getRange(2, 1, 3, 3);
    var rows = sumRange.getValues();
    var nowIso = now.toISOString();
    for (var rIdx = 0; rIdx < rows.length; rIdx++) {
      var key = rows[rIdx][0];
      if (key === 'all' || key === mode) {
        var bucket;
        try {
          bucket = JSON.parse(rows[rIdx][1]);
        } catch (err) {
          bucket = createEmptyBucket_();
        }
        applyEventToBucket_(bucket, ev, tsIct);
        rows[rIdx][1] = JSON.stringify(bucket);
        rows[rIdx][2] = nowIso;
      }
    }
    sumRange.setValues(rows);

    return jsonOutput_({ ok: true, recordedAt: tsIct });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ส่งคืนข้อมูลสถิติสรุปแบบ Read-Only สำหรับ Teacher Dashboard (Realtime GET)
 */
function doGet(e) {
  try {
    var ctx = getSpreadsheet_();
    var rows = ctx.sumSheet.getRange(2, 1, 3, 3).getValues();
    var payload = {
      ok: true,
      source: 'google_sheets',
      fetchedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
      buckets: {}
    };
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i][0];
      try {
        payload.buckets[key] = JSON.parse(rows[i][1]);
      } catch (err) {
        payload.buckets[key] = createEmptyBucket_();
      }
    }
    return jsonOutput_(payload);
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
