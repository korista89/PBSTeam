/**
 * 경은PBST 시트 운영 — 사이트를 쓸 수 없을 때 담당자(운영 시트 편집자)가 시트만으로 운영한다.
 * 운영 시트(***[정본] 26경은PBST) [확장 프로그램 → Apps Script]에 이 파일 하나만 붙여 넣는다.
 * 예전 cico_auto_dropdowns.gs(월별 탭 드롭다운)는 지운다(onEdit 이름이 겹친다).
 * 붙여 넣은 뒤 소유자가 메뉴 [PBST → 처음 설정(한 번)]을 한 번 누른다(열 때 새로 고침 설정).
 *
 * 사이트와 같은 원본 표(CICO_설정·CICO_기록·CICO_달력·Log_Main·Approvals)에 바로 읽고 쓴다(양쪽 모두 즉시 반영).
 * 아래 보기 탭(CICO 입력·위기행동 보고서·학생 요약·차트)은 원본 표로 다시 만드는 사본이라, 시트를 열 때와
 * [PBST → 지금 새로 고침]에서 새로 만든다. 사이트가 API로 쓴 변경은 Apps Script를 깨우지 못하고,
 * 개인 계정 자동 실행은 하루 90분 한도라 주기 실행은 두지 않는다.
 * 담임 수기 자료를 담당자가 입력하고, 차트 탭을 캡처해 담임에게 보낸다.
 *
 * 탭
 *  - CICO 입력: 이번 달 전체 학생. 날짜 칸에 입력하면 바로 저장·수행률 계산(분포도 학생은 교시마다 한 줄)
 *  - 위기행동 보고서: 보고서 칸 작성, 결재 체크(담당자·교감·학교장)
 *  - 학생 요약: 학생별 단계·이번 달 행동 건수·최근 30일 위기행동·결재 대기·CICO 수행률(읽기용)
 *  - 차트: 학생을 고르면 CICO 일별·주별·월별 차트와 분포도 표, 아래에 학교 전체 행동 통계(Big 5·월별)
 *  - 행동 기록 입력은 지금처럼 구글 폼(Log_Main에 쌓임)
 */

var TAB = { SET: 'CICO_설정', REC: 'CICO_기록', CAL: 'CICO_달력', INPUT: 'CICO 입력', SUMMARY: '학생 요약',
  REPORT: '위기행동 보고서', CHART: '차트', LOG: 'Log_Main', APPROVALS: 'Approvals', TIER: 'TierStatus', HOLIDAY: '날짜 관리' };
var SET_HEADERS = ['학년도', '월', '번호', '학급', '학생코드', '목표', '학생명', 'Tier2', 'Tier3', '목표행동', '목표행동 유형',
  '척도', '기록방식', '입력 기준(베이스라인)', '목표 달성 기준', '수행/발생률', '목표 달성 여부', '교사메모', '입력자', '팀 협의 내용', '차월 대상여부'];
var REC_HEADERS = ['학년도', '날짜', '학생코드', '목표', '교시', '값', '입력자', '수정시각'];
var SCATTER = '분포도';
var DAY = '하루';  // 입력표에서 일별 기록 줄의 교시 칸 표시
var APPROVAL_STEPS = ['담당자확인', '교감확인', '학교장확인', '학교장보고요청'];
var FINAL_STEPS = ['담당자확인', '교감확인', '학교장확인'];
var INPUT_FIXED = ['번호', '학급', '학생명(코드)', '목표행동', '척도', '기록방식', '교시'];
var INPUT_TAIL = ['수행/발생률', '목표 달성 여부', '_설정행'];
var ACTION_HEADER = '방어 및 보호를 위한 제지 / 개별학생교육지원 / 본인·타인 상해 발생 여부';
var NO_REPORT_ACTIONS = ['', 'X - 보고서 작성 불필요', 'X(보고서 작성 불필요)'];
// 위기행동 보고서 탭에서 고칠 수 있는 Log_Main 열(사이트 보고서 화면과 같은 칸)
var REPORT_EDIT = ['발생 시 지도교사', 'A_배경_선행사건', 'B_나타난_위기행동', 'C_후속결과', '1차_경위', '1차_관찰기록',
  '1차_개별학생교육지원_시간', '1차_개별학생교육지원_장소', '1차_개별학생교육지원_교사', '2차_경위', '2차_관찰기록',
  '부상자_치료_시간', '부상자_치료_내용', '관리자_보고_시간', '관리자_보고_내용', '학부모_알림_시간', '학부모_알림_내용',
  '학생_상담_시간', '학생_상담_내용', '학부모_상담_시간', '학부모_상담_내용', '긴급회의_시간', '긴급회의_내용'];
var REPORT_FIXED = ['_Log_ID', '발생일', '학급', '학생', '상태', '조치 유형', '담당자확인', '교감확인', '학교장확인'];

// ───────────────────────── 순수 계산(사이트 코드와 같은 규칙) ─────────────────────────

function schoolYear_(d) { return d.getMonth() + 1 >= 3 ? d.getFullYear() : d.getFullYear() - 1; }

function fullDate_(sy, mmdd) { return (Number(mmdd.slice(0, 2)) >= 3 ? sy : sy + 1) + '-' + mmdd; }

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** 분포도기록지 칸 순서: 초등은 3교시 뒤, 중·고·전공과는 4교시 뒤가 점심. */
function periodSlots_(className) {
  return String(className || '').indexOf('초등') >= 0
    ? ['1교시', '2교시', '3교시', '점심', '4교시', '5교시', '6교시', '7교시']
    : ['1교시', '2교시', '3교시', '4교시', '점심', '5교시', '6교시', '7교시'];
}

/** 평일에서 휴일(YYYY-MM-DD 또는 MM-DD)을 뺀 MM-DD 목록. */
function businessDays_(year, month, holidays) {
  var set = {};
  (holidays || []).forEach(function (h) {
    h = String(h).trim();
    if (h.length === 10) set[h] = true; else if (h.length === 5) set[year + '-' + h] = true;
  });
  var out = [];
  for (var d = new Date(year, month - 1, 1); d.getMonth() === month - 1; d.setDate(d.getDate() + 1)) {
    var dow = d.getDay();
    var key = year + '-' + pad2_(month) + '-' + pad2_(d.getDate());
    if (dow !== 0 && dow !== 6 && !set[key]) out.push(pad2_(month) + '-' + pad2_(d.getDate()));
  }
  return out;
}

/** 파이썬 float()처럼 문자열 전체가 숫자일 때만 숫자(아니면 NaN). */
function strictNum_(v) {
  var t = String(v).trim();
  return t === '' ? NaN : Number(t);
}

/** 파이썬 str.replace처럼 각 글자를 모두 지운다. */
function strip_(v, words) {
  var t = String(v);
  words.forEach(function (w) { t = t.split(w).join(''); });
  return t;
}

function cleanNum_(v) {
  var n = strictNum_(strip_(v, ['점', '회', '분']));
  return isNaN(n) ? 0 : n;
}

/** 수행/발생률과 달성 여부. student = {days:{MM-DD:값}, 척도, 목표행동 유형, 목표 달성 기준, 입력 기준, 기록방식, periods}. */
function calcRate_(s) {
  var days = s.days || {};
  // 파이썬 dict.get(키, 기본값)처럼 열이 없을 때만 기본값(빈칸은 빈칸 그대로)
  var dflt = function (k, v) { return s[k] === undefined ? v : String(s[k]); };
  var scale = dflt('척도', 'O/X(발생)');
  var type = dflt('목표행동 유형', '증가 목표행동');
  var goal = dflt('목표 달성 기준', '80% 이상');
  var labels = Object.keys(days);
  var vals = [], recordedDays = 0;
  var periods = s['기록방식'] === SCATTER ? (s.periods || {}) : null;
  if (periods) {
    scale = 'O/X(발생)';
    labels.forEach(function (d) {
      var p = periods[d] || {};
      var v = Object.keys(p).map(function (k) { return String(p[k]).trim(); }).filter(function (x) { return x === 'O' || x === 'X'; });
      vals = vals.concat(v);
      if (v.length) recordedDays++;
    });
  } else {
    labels.forEach(function (d) {
      var v = String(days[d]).trim();
      if (v && v !== '-' && v !== '·') vals.push(v);
    });
  }
  if (!vals.length) return { rate: '', achieved: '', rateNum: null, inputDays: 0, totalDays: labels.length };
  var sum = function () { return vals.reduce(function (a, v) { return a + cleanNum_(v); }, 0); };
  var n = vals.length, rate = null;
  if (scale === 'O/X(발생)') rate = vals.filter(function (v) { return v.toUpperCase() === 'O'; }).length / n * 100;
  else if (scale === '0점/1점/2점') rate = sum() / (n * 2) * 100;
  else if (scale === '0~5') rate = sum() / (n * 5) * 100;
  else if (scale === '0~7교시') rate = sum() / (n * 7) * 100;
  else if (scale === '1~100회' || scale === '1~100분') {
    var avg = sum() / n;
    if (type === '감소 목표행동') {
      var bl = strictNum_(strip_(s['입력 기준'] === undefined ? 0 : s['입력 기준'], ['회', '분']));
      if (isNaN(bl)) bl = 100;
      rate = bl > 0 ? avg / bl * 100 : avg;
    } else rate = avg;
  } else rate = sum() / n;
  if (rate !== null && type === '감소 목표행동') rate = Math.max(0, Math.min(100, 100 - rate));
  var achieved = '';
  var g = strictNum_(strip_(goal, ['%', '이상', '이하']));
  if (rate !== null && goal && !isNaN(g)) achieved = rate >= (goal.indexOf('이하') >= 0 ? 100 - g : g) ? 'O' : 'X';
  return { rate: rate === null ? '' : pyRound_(rate) + '%', achieved: achieved, rateNum: rate,
    inputDays: periods ? recordedDays : n, totalDays: labels.length };
}

/** 파이썬 round()와 같은 반올림(짝수 쪽). */
function pyRound_(x) {
  var f = Math.floor(x);
  if (x - f === 0.5) return f % 2 === 0 ? f : f + 1;  // 정확히 .5일 때만 짝수 쪽
  return Math.round(x);
}

/** 표(2차원 배열) → 객체 목록. _row는 시트 행 번호. */
function toObjects_(values) {
  var h = values[0] || [];
  return values.slice(1).map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j] === undefined ? '' : String(r[j]); });
    return o;
  });
}

/** 기록 색인: '날짜|학생코드|목표|교시' → 기록 객체. 같은 열쇠는 뒤의 것이 이긴다. */
function recordIndex_(records, sy) {
  var out = {};
  records.forEach(function (r) {
    if (r['학년도'] === String(sy)) out[[r['날짜'], r['학생코드'], r['목표'] || '1', r['교시']].join('|')] = r;
  });
  return out;
}

/** 한 학생(설정 줄)의 days·periods를 기록에서 모은다. */
function studentData_(srow, dates, sy, idx) {
  var code = srow['학생코드'], goal = srow['목표'] || '1';
  var s = { '척도': srow['척도'], '목표행동 유형': srow['목표행동 유형'], '목표 달성 기준': srow['목표 달성 기준'],
    '입력 기준': srow['입력 기준(베이스라인)'], '기록방식': srow['기록방식'], days: {}, periods: {} };
  dates.forEach(function (d) {
    var full = fullDate_(sy, d);
    var day = idx[[full, code, goal, ''].join('|')];
    s.days[d] = day ? day['값'] : '';
    periodSlots_(srow['학급']).forEach(function (p) {
      var r = idx[[full, code, goal, p].join('|')];
      if (r && r['값'] !== '') { s.periods[d] = s.periods[d] || {}; s.periods[d][p] = r['값']; }
    });
  });
  if (s['기록방식'] === SCATTER) {  // 하루 칸은 교시 요약(O가 하나라도 있으면 O)
    dates.forEach(function (d) {
      var p = s.periods[d] || {}, v = Object.keys(p).map(function (k) { return p[k]; });
      s.days[d] = v.indexOf('O') >= 0 ? 'O' : (v.length ? 'X' : '');
    });
  }
  return s;
}

/** CICO 입력표 줄 만들기. 일별 학생은 한 줄, 분포도 학생은 교시마다 한 줄. */
function buildInputRows_(setRows, dates, sy, idx) {
  var rows = [INPUT_FIXED.concat(dates, INPUT_TAIL)];
  setRows.forEach(function (sr) {
    var s = studentData_(sr, dates, sy, idx), calc = calcRate_(s);
    var name = sr['학생코드'] ? sr['학생명'] + '(' + sr['학생코드'] + ')' : sr['학생명'];
    var lines = sr['기록방식'] === SCATTER ? periodSlots_(sr['학급']) : [DAY];
    lines.forEach(function (p, i) {
      var cells = dates.map(function (d) { return p === DAY ? s.days[d] : ((s.periods[d] || {})[p] || ''); });
      rows.push([i ? '' : sr['번호'], i ? '' : sr['학급'], name, i ? '' : sr['목표행동'], i ? '' : sr['척도'],
        sr['기록방식'] === SCATTER ? '분포도기록지' : '일별', p].concat(cells, [i ? '' : calc.rate, i ? '' : calc.achieved, sr._row]));
    });
  });
  return rows;
}

/** 결재 상태: {Log_ID: {단계: true}} (취소 반영). */
function approvalStates_(approvals) {
  var st = {};
  approvals.forEach(function (r) {
    var id = String(r['Log_ID'] || '').trim(), step = String(r['Step'] || '').trim();
    if (!id || APPROVAL_STEPS.indexOf(step) < 0) return;
    st[id] = st[id] || {};
    if (String(r['Action']).trim() === '취소') delete st[id][step]; else st[id][step] = true;
  });
  return st;
}

function isFullySigned_(steps) { return FINAL_STEPS.every(function (s) { return steps && steps[s]; }); }

/** '2026. 10. 1' · '2026-10-01' · Date → 'YYYY-MM-DD' */
function normDate_(v) {
  if (v instanceof Date) return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  var m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]) : '';
}


/** 보고서 탭 줄: 조치가 있는(보고서 대상) 기록, 최근 것부터. */
function reportRows_(logs, approvals, sy, editCols, tier) {
  var st = approvalStates_(approvals), cls = {};
  (tier || []).forEach(function (t) { cls[t['학생코드']] = t['학급']; cls[t['학생이름']] = cls[t['학생이름']] || t['학급']; });
  var classOf = function (r) {
    var m = String(r['학생명'] || '').match(/\((\d+)\)/);
    return r['학급'] || cls[String(r['학생코드'] || '').trim()] || (m && cls[m[1]]) || cls[String(r['학생명'] || '').trim()] || '';
  };
  var start = sy + '-03-01';
  var rows = logs.filter(function (r) {
    return r['Status'] !== 'Deleted' && r['Log_ID'] && NO_REPORT_ACTIONS.indexOf(String(r[ACTION_HEADER] || '').trim()) < 0
      && normDate_(r['행동발생날짜']) >= start;
  }).sort(function (a, b) { return normDate_(b['행동발생날짜']) < normDate_(a['행동발생날짜']) ? -1 : 1; });
  return [REPORT_FIXED.concat(editCols)].concat(rows.map(function (r) {
    var s = st[r['Log_ID']] || {};
    return [r['Log_ID'], normDate_(r['행동발생날짜']), classOf(r), r['학생명'] || '', r['Status'] || '', r[ACTION_HEADER] || '',
      !!s['담당자확인'], !!s['교감확인'], !!s['학교장확인']].concat(editCols.map(function (h) { return r[h] || ''; }));
  }));
}

/** 이번 달 CICO가 없으면 만들 행(TierStatus Tier2(CICO)=O)과 기록일. 사이트 '시트 생성'과 같은 기본값. */
function newMonthRows_(tier, sy, month) {
  return tier.filter(function (s) { return s['Tier2(CICO)'] === 'O'; }).map(function (s, i) {
    var o = { '학년도': sy, '월': month, '번호': i + 1, '학급': s['학급'], '학생코드': s['학생코드'], '목표': 1, '학생명': s['학생이름'],
      'Tier2': 'O', 'Tier3': 'X', '목표행동': '', '목표행동 유형': '증가 목표행동', '척도': 'O/X(발생)', '목표 달성 기준': '80% 이상',
      '수행/발생률': '-', '목표 달성 여부': '-' };
    return SET_HEADERS.map(function (h) { return o[h] === undefined ? '' : String(o[h]); });
  });
}


/** 열 이름이 prefix로 시작하는 값(구글 폼 긴 머리글 대응). */
function field_(r, prefix) {
  for (var k in r) if (k.indexOf(prefix) === 0) return String(r[k] || '').trim();
  return '';
}

function topCounts_(map, n) {
  return Object.keys(map).map(function (k) { return [k, map[k]]; })
    .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); }).slice(0, n);
}

/** 학교 전체 행동 통계(학년도 누적): 월별·장소·시간대·행동유형·요일·학생·기능. */
function behaviorStats_(logs, sy) {
  var start = sy + '-03-01', end = (sy + 1) + '-02-31';
  var months = {}, c = { place: {}, time: {}, type: {}, weekday: {}, student: {}, func: {} };
  var order = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  order.forEach(function (m) { months[m] = 0; });
  var wd = ['일', '월', '화', '수', '목', '금', '토'];
  var add = function (map, v) { if (v) map[v] = (map[v] || 0) + 1; };
  logs.forEach(function (r) {
    var d = normDate_(r['행동발생날짜']);
    if (r['Status'] === 'Deleted' || !d || d < start || d > end) return;
    months[Number(d.slice(5, 7))]++;
    add(c.place, field_(r, '행동 발생 장소'));
    field_(r, '시간대').split(',').forEach(function (t) { add(c.time, t.trim()); });
    add(c.type, field_(r, '행동 유형'));
    add(c.weekday, wd[new Date(d + 'T00:00:00').getDay()] + '요일');
    add(c.student, String(r['학생명'] || '').trim());
    add(c.func, field_(r, '기능'));
  });
  return {
    months: order.map(function (m) { return [m + '월', months[m]]; }),
    place: topCounts_(c.place, 12), time: topCounts_(c.time, 12), type: topCounts_(c.type, 12),
    weekday: ['월', '화', '수', '목', '금'].map(function (x) { return [x + '요일', c.weekday[x + '요일'] || 0]; }),
    student: topCounts_(c.student, 12), func: topCounts_(c.func, 12)
  };
}

/** 학생 한 목표의 차트 자료: 이번 달 일별 값, 주별·월별 수행률, 분포도 표. */
function studentChart_(setAll, calRows, idx, sy, code, goal, upto) {
  var dates = function (m) {
    var cal = calRows.filter(function (r) { return r['학년도'] === String(sy) && r['월'] === String(m); })[0];
    return cal ? String(cal['기록일']).split(',').map(function (x) { return x.trim(); }).filter(String) : [];
  };
  var rowFor = function (m) {
    return setAll.filter(function (r) { return r['학년도'] === String(sy) && r['월'] === String(m) && r['학생코드'] === code && (r['목표'] || '1') === goal; })[0];
  };
  var order = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2], out = { daily: [], weekly: [], monthly: [], scatter: null };
  order.slice(0, order.indexOf(upto) + 1).forEach(function (m) {
    var sr = rowFor(m);
    if (!sr) return;
    var c = calcRate_(studentData_(sr, dates(m), sy, idx));
    out.monthly.push([m + '월', c.rateNum === null ? '' : Math.round(c.rateNum * 10) / 10]);
  });
  var sr = rowFor(upto);
  if (!sr) return out;
  var ds = dates(upto), s = studentData_(sr, ds, sy, idx), scatter = sr['기록방식'] === SCATTER;
  out.daily = ds.map(function (d) {
    if (scatter) {
      var p = s.periods[d] || {}, v = Object.keys(p).map(function (k) { return p[k]; });
      return [d, v.length ? v.filter(function (x) { return x === 'O'; }).length : ''];
    }
    var v = String(s.days[d] || '').trim();
    if (!v || v === '-' || v === '·') return [d, ''];
    return [d, v.toUpperCase() === 'O' ? 1 : v.toUpperCase() === 'X' ? 0 : cleanNum_(v)];
  });
  for (var i = 0; i < ds.length; i += 5) {
    var sub = {};
    ds.slice(i, i + 5).forEach(function (d) { sub[d] = s.days[d]; });
    var c = calcRate_(Object.assign({}, s, { days: sub }));
    if (c.rateNum !== null) out.weekly.push(['W' + (i / 5 + 1), Math.round(c.rateNum * 10) / 10]);
  }
  if (scatter) {
    var slots = periodSlots_(sr['학급']);
    out.scatter = [[''].concat(ds)].concat(slots.map(function (p) {
      return [p].concat(ds.map(function (d) { return (s.periods[d] || {})[p] || ''; }));
    }));
  }
  out.label = sr['척도'] === 'O/X(발생)' || scatter ? (scatter ? '발생한 교시 수' : 'O=1, X=0') : sr['척도'];
  return out;
}

// ───────────────────────── 시트 읽고 쓰기 ─────────────────────────

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  var sh = ss_().getSheetByName(name);
  if (!sh && headers) { sh = ss_().insertSheet(name); sh.getRange(1, 1, 1, headers.length).setValues([headers]); }
  return sh;
}

function read_(name) {
  var sh = ss_().getSheetByName(name);
  return sh ? toObjects_(sh.getDataRange().getDisplayValues()) : [];
}

function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }

function who_() { return Session.getActiveUser().getEmail() || '시트'; }

function holidays_() {
  var sh = ss_().getSheetByName(TAB.HOLIDAY);
  if (!sh) return [];
  return sh.getRange('A3:A').getDisplayValues().map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v && v.charAt(0) !== '※'; });
}

function monthDates_(sy, month) {
  var cal = read_(TAB.CAL).filter(function (r) { return r['학년도'] === String(sy) && r['월'] === String(month); })[0];
  return cal ? String(cal['기록일']).split(',').map(function (x) { return x.trim(); }).filter(String) : [];
}

function monthSettings_(sy, month) {
  return read_(TAB.SET).filter(function (r) { return r['학년도'] === String(sy) && r['월'] === String(month); });
}

function current_() { var d = new Date(); return { sy: schoolYear_(d), month: d.getMonth() + 1 }; }

/** 기록 저장: items = [[YYYY-MM-DD, 학생코드, 목표, 교시, 값]]. 있으면 고치고 없으면 붙인다. */
function upsertRecords_(sy, items) {
  if (!items.length) return;
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(TAB.REC, REC_HEADERS);
    var idx = recordIndex_(toObjects_(sh.getDataRange().getDisplayValues()), sy);
    var stamp = now_(), by = who_(), appends = [];
    items.forEach(function (it) {
      var hit = idx[[it[0], it[1], it[2] || '1', it[3]].join('|')];
      if (hit) sh.getRange(hit._row, 6, 1, 3).setValues([[it[4], by, stamp]]);
      else if (it[4] !== '') appends.push([String(sy), it[0], it[1], String(it[2] || '1'), it[3], it[4], by, stamp]);
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, REC_HEADERS.length).setNumberFormat('@').setValues(appends);
  } finally { lock.releaseLock(); }
}

/** 설정 줄의 수행률·달성 여부를 다시 계산해 CICO_설정에 적는다. */
function recalcSetting_(setRow, sy, month) {
  var setSh = ss_().getSheetByName(TAB.SET);
  var hdr = setSh.getRange(1, 1, 1, setSh.getLastColumn()).getDisplayValues()[0];
  var vals = setSh.getRange(setRow, 1, 1, hdr.length).getDisplayValues()[0];
  var sr = { _row: setRow };
  hdr.forEach(function (h, i) { sr[h] = vals[i]; });
  var calc = calcRate_(studentData_(sr, monthDates_(sy, month), sy, recordIndex_(read_(TAB.REC), sy)));
  setSh.getRange(setRow, hdr.indexOf('수행/발생률') + 1, 1, 2).setValues([[calc.rate, calc.achieved]]);
  return calc;
}

// ───────────────────────── 메뉴·자동 실행 ─────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('PBST')
    .addItem('지금 새로 고침(CICO 입력·보고서·요약)', 'refreshAll')
    .addItem('CICO 입력표: 다른 달 보기', 'menuCicoPick')
    .addItem('위기행동 보고서 문서 만들기(고른 행)', 'menuReportDoc')
    .addSeparator()
    .addItem('처음 설정(한 번, 소유자)', 'setup')
    .addToUi();
}

/** 소유자가 한 번: 시트를 열 때마다 보기 탭을 새로 만드는 실행을 건다(단순 onOpen은 30초 제한이라 설치형으로). */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshAll') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshAll').forSpreadsheet(ss_()).onOpen().create();
  refreshAll();
  SpreadsheetApp.getUi().alert('설정을 마쳤습니다. 시트를 열 때마다 보기 탭(CICO 입력·보고서·요약·차트)을 새로 만들고, 새 달이면 CICO를 준비합니다.\n사이트 입력을 바로 보려면 [PBST → 지금 새로 고침]을 누르세요.');
}

/** 시트를 열 때(그리고 메뉴에서): 새 달 준비 → 보기 탭을 원본 표와 맞춘다. */
function refreshAll() {
  var c = current_();
  ensureMonth_(c.sy, c.month);
  var meta = JSON.parse(PropertiesService.getDocumentProperties().getProperty('cico:view') || 'null');
  if (!meta || meta.sy !== c.sy || meta.month !== c.month) meta = { sy: c.sy, month: c.month };
  refreshCico_(meta.sy, meta.month);
  refreshReport_(c.sy);
  refreshSummary_(c.sy, c.month);
  refreshCharts_(c.sy, c.month);
}

function menuCicoPick() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('CICO 입력표', '몇 월을 볼까요? (1~12, 비우면 이번 달)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var c = current_(), m = parseInt(r.getResponseText(), 10) || c.month;
  if (!(m >= 1 && m <= 12)) return ui.alert('1~12 사이 숫자를 넣어 주세요.');
  refreshCico_(c.sy, m, true);
  ss_().getSheetByName(TAB.INPUT).activate();
}

/** 이번 달 CICO가 없으면 TierStatus로 만든다(사이트 '시트 생성'과 같음). */
function ensureMonth_(sy, month) {
  if (monthDates_(sy, month).length || monthSettings_(sy, month).length) return;
  var rows = newMonthRows_(read_(TAB.TIER), sy, month);
  if (!rows.length) return;
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    if (monthDates_(sy, month).length) return;  // 다른 실행이 방금 만들었으면 그만
    var setSh = sheet_(TAB.SET, SET_HEADERS);
    setSh.getRange(setSh.getLastRow() + 1, 1, rows.length, SET_HEADERS.length).setNumberFormat('@').setValues(rows);
    var calSh = sheet_(TAB.CAL, ['학년도', '월', '기록일', '배치']);
    calSh.getRange(calSh.getLastRow() + 1, 1, 1, 4).setNumberFormat('@')
      .setValues([[String(sy), String(month), businessDays_(month >= 3 ? sy : sy + 1, month, holidays_()).join(','), '']]);
  } finally { lock.releaseLock(); }
}

// ───────────────────────── CICO 입력 탭 ─────────────────────────

/** 표가 같은 모양이면 바뀐 칸만, 학생·날짜가 바뀌었으면 탭 전체를 다시 쓴다. */
function refreshCico_(sy, month, force) {
  var setRows = monthSettings_(sy, month).filter(function (r) { return r['Tier2'].toUpperCase() === 'O'; });
  var dates = monthDates_(sy, month);
  var rows = buildInputRows_(setRows, dates, sy, recordIndex_(read_(TAB.REC), sy));
  var sh = ss_().getSheetByName(TAB.INPUT) || ss_().insertSheet(TAB.INPUT, 1);
  var props = PropertiesService.getDocumentProperties();
  var meta = JSON.parse(props.getProperty('cico:view') || 'null');
  var w = rows[0].length;
  var old = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues() : [];
  var sameShape = !force && meta && meta.sy === sy && meta.month === month && old.length === rows.length && old[0].length === w &&
    old.every(function (r, i) { return r[w - 1] === String(rows[i][w - 1]) && r[INPUT_FIXED.length - 1] === String(rows[i][INPUT_FIXED.length - 1]); });
  if (sameShape) {
    rows.forEach(function (r, i) {
      r.forEach(function (v, j) { if (String(v) !== old[i][j]) sh.getRange(i + 2, j + 1).setValue(String(v)); });
    });
    return;
  }
  sh.clear();
  sh.getRange(1, 1).setValue(sy + '학년도 ' + month + '월 CICO 입력 — 날짜 칸에만 입력하세요. 입력하면 바로 저장되고 사이트에도 보입니다.').setFontWeight('bold');
  if (!dates.length) { sh.getRange(2, 1).setValue(month + '월 CICO가 아직 없습니다.'); props.setProperty('cico:view', JSON.stringify({ sy: sy, month: month })); return; }
  sh.getRange(2, 1, rows.length, w).setNumberFormat('@').setValues(rows);
  var nF = INPUT_FIXED.length, nD = dates.length;
  sh.getRange(2, 1, 1, w).setFontWeight('bold').setBackground('#e2e8f0');
  if (rows.length > 1) {
    sh.getRange(3, 1, rows.length - 1, nF).setBackground('#f1f5f9');
    sh.getRange(3, nF + nD + 1, rows.length - 1, 2).setBackground('#f1f5f9');
    var byRow = {};
    setRows.forEach(function (r) { byRow[r._row] = r; });
    for (var i = 1; i < rows.length; i++) {
      var scale = rows[i][nF - 1] !== DAY ? 'O/X(발생)' : (byRow[rows[i][w - 1]] || {})['척도'];
      var opts = scale === 'O/X(발생)' ? ['O', 'X'] : scale === '0점/1점/2점' ? ['0점', '1점', '2점']
        : scale === '0~5' ? ['0', '1', '2', '3', '4', '5'] : scale === '0~7교시' ? ['0', '1', '2', '3', '4', '5', '6', '7'] : null;
      if (opts) sh.getRange(i + 2, nF + 1, 1, nD).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(opts, true).setAllowInvalid(false).build());
      if (rows[i][nF - 1] === '점심') sh.getRange(i + 2, nF + 1, 1, nD).setBackground('#fff7ed');
    }
  }
  sh.getRange(2, nF + 1, rows.length, nD).setHorizontalAlignment('center');
  sh.hideColumns(w);
  sh.setFrozenRows(2); sh.setFrozenColumns(nF);
  props.setProperty('cico:view', JSON.stringify({ sy: sy, month: month }));
}

function saveCico_(sh, range) {
  var meta = JSON.parse(PropertiesService.getDocumentProperties().getProperty('cico:view') || 'null');
  if (!meta) return;
  var hdr = sh.getRange(2, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var nF = INPUT_FIXED.length, dates = hdr.slice(nF, hdr.length - INPUT_TAIL.length), w = hdr.length;
  var setRows = {};
  monthSettings_(meta.sy, meta.month).forEach(function (r) { setRows[r._row] = r; });
  var items = [], touched = {};
  for (var r = Math.max(range.getRow(), 3); r < range.getRow() + range.getNumRows(); r++) {
    var line = sh.getRange(r, 1, 1, w).getDisplayValues()[0];
    var sr = setRows[Number(line[w - 1])];
    if (!sr) continue;
    for (var c = Math.max(range.getColumn(), nF + 1); c < range.getColumn() + range.getNumColumns() && c <= nF + dates.length; c++) {
      items.push([fullDate_(meta.sy, dates[c - nF - 1]), sr['학생코드'], sr['목표'] || '1', line[nF - 1] === DAY ? '' : line[nF - 1],
        String(line[c - 1]).trim()]);
      touched[sr._row] = r;
    }
  }
  if (!items.length) return;
  upsertRecords_(meta.sy, items);
  Object.keys(touched).forEach(function (setRow) {
    var calc = recalcSetting_(Number(setRow), meta.sy, meta.month);
    var first = touched[setRow];
    while (first > 3 && sh.getRange(first - 1, w).getDisplayValue() === String(setRow)) first--;
    sh.getRange(first, nF + dates.length + 1, 1, 2).setValues([[calc.rate, calc.achieved]]);
  });
}

// ───────────────────────── 위기행동 보고서 탭 ─────────────────────────

function logHeaders_() {
  var sh = ss_().getSheetByName(TAB.LOG);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
}

function refreshReport_(sy) {
  var editCols = REPORT_EDIT.filter(function (h) { return logHeaders_().indexOf(h) >= 0; });
  var rows = reportRows_(read_(TAB.LOG), read_(TAB.APPROVALS), sy, editCols, read_(TAB.TIER));
  var sh = ss_().getSheetByName(TAB.REPORT) || ss_().insertSheet(TAB.REPORT, 2);
  var w = rows[0].length;
  var old = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues() : [];
  var same = old.length === rows.length && old[0] && old[0].length === w &&
    old.every(function (r, i) { return r.join('\u0001') === rows[i].join('\u0001'); });
  if (same) return;
  sh.clear();
  sh.getRange(1, 1).setValue('위기행동 보고서 — 흰 칸을 고치거나 결재 칸을 체크하면 바로 Log_Main·Approvals에 저장됩니다.').setFontWeight('bold');
  sh.getRange(2, 1, rows.length, w).setValues(rows);
  sh.getRange(2, 1, 1, w).setFontWeight('bold').setBackground('#e2e8f0');
  if (rows.length > 1) {
    sh.getRange(3, 1, rows.length - 1, 6).setBackground('#f1f5f9');
    sh.getRange(3, 7, rows.length - 1, 3).insertCheckboxes();
    sh.getRange(3, 10, rows.length - 1, w - 9).setWrap(true).setVerticalAlignment('top');
  }
  sh.hideColumns(1);
  sh.setFrozenRows(2); sh.setFrozenColumns(4);
}

function saveReport_(sh, range) {
  var hdr = sh.getRange(2, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var logSh = ss_().getSheetByName(TAB.LOG), lh = logHeaders_();
  var ids = logSh.getRange(2, lh.indexOf('Log_ID') + 1, Math.max(logSh.getLastRow() - 1, 1), 1).getDisplayValues().map(function (r) { return r[0]; });
  for (var r = Math.max(range.getRow(), 3); r < range.getRow() + range.getNumRows(); r++) {
    var line = sh.getRange(r, 1, 1, hdr.length).getValues()[0];
    var logRow = ids.indexOf(String(line[0])) + 2;
    if (logRow < 2) continue;
    for (var c = range.getColumn(); c < range.getColumn() + range.getNumColumns(); c++) {
      var h = hdr[c - 1];
      if (REPORT_EDIT.indexOf(h) >= 0) logSh.getRange(logRow, lh.indexOf(h) + 1).setValue(line[c - 1]);
      else if (FINAL_STEPS.indexOf(h) >= 0) sign_(String(line[0]), h, line[c - 1] !== true, logRow, lh);
    }
  }
}

/** 결재 한 단계 확인/취소(사이트 /sign 과 같은 규칙). */
function sign_(logId, step, cancel, logRow, lh) {
  sheet_(TAB.APPROVALS, ['Log_ID', 'Step', 'Action', 'By', 'At', 'Memo'])
    .appendRow([logId, step, cancel ? '취소' : '확인', who_(), now_(), '시트에서 처리']);
  var complete = isFullySigned_(approvalStates_(read_(TAB.APPROVALS))[logId]);
  var logSh = ss_().getSheetByName(TAB.LOG);
  var status = logSh.getRange(logRow, lh.indexOf('Status') + 1).getDisplayValue();
  var isReport = NO_REPORT_ACTIONS.indexOf(String(logSh.getRange(logRow, lh.indexOf(ACTION_HEADER) + 1).getDisplayValue()).trim()) < 0;
  var meta = lh.indexOf('Approval_Meta') + 1;
  if (complete && status !== 'Approved') {
    logSh.getRange(logRow, lh.indexOf('Status') + 1).setValue('Approved');
    if (meta) logSh.getRange(logRow, meta).setValue('Approved by ' + who_() + ' (3단계 확인 완료, 시트) on ' + now_());
  } else if (!complete && isReport && status === 'Approved') {
    logSh.getRange(logRow, lh.indexOf('Status') + 1).setValue('Pending');
    if (meta) logSh.getRange(logRow, meta).setValue('Reopened by ' + who_() + ' (' + step + ' 취소, 시트) on ' + now_());
  }
}

function menuReportDoc() {
  var sh = ss_().getActiveSheet(), ui = SpreadsheetApp.getUi();
  var r = sh.getActiveRange().getRow();
  var id = sh.getName() === TAB.REPORT && r >= 3 ? sh.getRange(r, 1).getDisplayValue() : '';
  if (!id) return ui.alert('위기행동 보고서 탭에서 보고서 행을 하나 고른 뒤 실행하세요.');
  var rec = read_(TAB.LOG).filter(function (x) { return x['Log_ID'] === id; })[0];
  var lh = logHeaders_(), skip = ['Log_ID', 'Status', 'Approval_Meta', 'Source', '타임스탬프'];
  var doc = DocumentApp.create('위기행동 발생 보고서 — ' + rec['학생명'] + ' ' + normDate_(rec['행동발생날짜']));
  var body = doc.getBody();
  body.appendParagraph('위기행동 발생 보고서').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('기록번호: ' + id + '   상태: ' + rec['Status']);
  var rows = lh.filter(function (h, i) { return h && skip.indexOf(h) < 0 && lh.indexOf(h) === i && String(rec[h] || '').trim(); })
    .map(function (h) { return [h, String(rec[h])]; });
  var table = body.appendTable(rows);
  for (var i = 0; i < table.getNumRows(); i++) table.getRow(i).getCell(0).setBackgroundColor('#f1f5f9').setWidth(150);
  var st = approvalStates_(read_(TAB.APPROVALS))[id] || {};
  body.appendParagraph('결재: ' + FINAL_STEPS.map(function (s) { return s + (st[s] ? ' ✔' : ' ☐'); }).join('   '));
  body.appendParagraph('\n담임교사:                    (서명)').setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  doc.saveAndClose();
  var parent = DriveApp.getFileById(ss_().getId()).getParents();
  if (parent.hasNext()) DriveApp.getFileById(doc.getId()).moveTo(parent.next());
  ui.showModalDialog(HtmlService.createHtmlOutput('<p>보고서 문서를 만들었습니다. 열어서 [파일 → 인쇄] 또는 [다운로드 → PDF]로 쓰세요.</p><p><a href="' +
    doc.getUrl() + '" target="_blank">보고서 열기</a></p>').setWidth(360).setHeight(120), '위기행동 보고서');
}

// ───────────────────────── 학생 요약 탭 ─────────────────────────

function refreshSummary_(sy, month) {
  var today = new Date(), ym = today.getFullYear() + '-' + pad2_(month);
  var since = normDate_(new Date(today.getTime() - 30 * 86400000));
  var logs = read_(TAB.LOG).filter(function (r) { return r['Status'] !== 'Deleted'; });
  var setRows = monthSettings_(sy, month), dates = monthDates_(sy, month), idx = recordIndex_(read_(TAB.REC), sy);
  var out = [['학급', '학생코드', '학생', '재학', 'Tier1', 'Tier2(CICO)', 'Tier2(SST)', 'Tier3', 'Tier3+',
    '이번 달 행동 기록', '최근 30일 위기행동', '결재 대기', 'CICO 목표행동', 'CICO 수행률', 'CICO 달성']];
  read_(TAB.TIER).forEach(function (s) {
    var code = s['학생코드'];
    if (!code) return;
    var mine = logs.filter(function (r) {
      return String(r['학생코드'] || '') === code || String(r['학생명'] || '').indexOf('(' + code + ')') >= 0 || String(r['학생명'] || '') === s['학생이름'];
    });
    var crisis = mine.filter(function (r) { return normDate_(r['행동발생날짜']) >= since && NO_REPORT_ACTIONS.indexOf(String(r[ACTION_HEADER] || '').trim()) < 0; });
    var cico = setRows.filter(function (r) { return r['학생코드'] === code && r['Tier2'].toUpperCase() === 'O'; });
    var calcs = cico.map(function (r) { return calcRate_(studentData_(r, dates, sy, idx)); });
    out.push([s['학급'], code, s['학생이름'], s['재학여부'], s['Tier1'], s['Tier2(CICO)'], s['Tier2(SST)'], s['Tier3'], s['Tier3+'],
      mine.filter(function (r) { return normDate_(r['행동발생날짜']).slice(0, 7) === ym; }).length, crisis.length,
      mine.filter(function (r) { return r['Status'] === 'Pending'; }).length,
      cico.map(function (r) { return r['목표행동']; }).join(' / '),
      calcs.map(function (c) { return c.rate || '-'; }).join(' / '), calcs.map(function (c) { return c.achieved || '-'; }).join(' / ')]);
  });
  var sh = ss_().getSheetByName(TAB.SUMMARY) || ss_().insertSheet(TAB.SUMMARY, 3);
  sh.clear();
  sh.getRange(1, 1).setValue('학생 요약 — ' + now_() + ' 기준(시트를 열 때·[지금 새로 고침] 때 새로 만듦). 읽기용입니다.').setFontWeight('bold');
  sh.getRange(2, 1, out.length, out[0].length).setValues(out);
  sh.getRange(2, 1, 1, out[0].length).setFontWeight('bold').setBackground('#e2e8f0');
  sh.setFrozenRows(2);
}


// ───────────────────────── 차트 탭 ─────────────────────────

var CHART_PICK = 'B3';
var DATA_COL = 27;  // 차트용 자료는 AA열부터(화면 오른쪽 밖)

function chartSheet_() {
  var sh = ss_().getSheetByName(TAB.CHART);
  if (!sh) {
    sh = ss_().insertSheet(TAB.CHART, 0);
    sh.getRange('A1').setValue('PBST 차트 — 학생을 고르면 위쪽 차트가 바뀝니다. 캡처해서 담임에게 보내세요.').setFontWeight('bold');
    sh.getRange('A3').setValue('학생 선택').setFontWeight('bold');
    sh.getRange('A22').setValue('분포도기록지(교시별, 분포도 학생만)').setFontWeight('bold');
    sh.getRange('A34').setValue('학교 전체 행동 통계(이번 학년도 누적)').setFontWeight('bold');
    sh.setColumnWidth(2, 260);
  }
  return sh;
}

/** 자료 칸(rows×2)을 비우고 쓴다. */
function putBlock_(sh, row, col, header, rows, height) {
  sh.getRange(row, col, height + 1, 2).clearContent();
  sh.getRange(row, col, 1, 2).setValues([header]);
  if (rows.length) sh.getRange(row + 1, col, rows.length, 2).setValues(rows);
}

/** 이름표(key)로 차트를 한 번만 만들고, 다음부터는 제목만 바꾼다. */
function chart_(sh, key, type, range, anchorRow, anchorCol, title) {
  var props = PropertiesService.getDocumentProperties();
  var id = props.getProperty('chart:' + key);
  var found = sh.getCharts().filter(function (c) { return String(c.getChartId()) === id; })[0];
  if (found) { sh.updateChart(found.modify().setOption('title', title).build()); return; }
  var c = sh.newChart().setChartType(type).addRange(range).setPosition(anchorRow, anchorCol, 0, 0)
    .setOption('title', title).setOption('width', 470).setOption('height', 280).setOption('legend', { position: 'none' })
    .setNumHeaders(1).build();
  sh.insertChart(c);
  var made = sh.getCharts()[sh.getCharts().length - 1];
  props.setProperty('chart:' + key, String(made.getChartId()));
}

function refreshCharts_(sy, month) {
  refreshStudentChart_(sy, month);
  var sh = chartSheet_(), st = behaviorStats_(read_(TAB.LOG), sy), C = Charts.ChartType;
  var blocks = [['month', '월별 행동 기록', st.months, C.COLUMN, 36, 1], ['place', '장소별', st.place, C.BAR, 36, 7],
    ['time', '시간대별', st.time, C.BAR, 36, 13], ['type', '행동 유형별', st.type, C.BAR, 52, 1],
    ['weekday', '요일별', st.weekday, C.COLUMN, 52, 7], ['student', '학생별(상위 12)', st.student, C.BAR, 52, 13],
    ['func', '기능별', st.func, C.BAR, 68, 1]];
  blocks.forEach(function (b, i) {
    var col = DATA_COL + 6 + i * 3;
    putBlock_(sh, 36, col, [b[1], '건수'], b[2], 12);
    chart_(sh, b[0], b[3], sh.getRange(36, col, 13, 2), b[4], b[5], b[1] + ' (' + sy + '학년도)');
  });
}

function refreshStudentChart_(sy, month) {
  var sh = chartSheet_();
  var setAll = read_(TAB.SET), calRows = read_(TAB.CAL), idx = recordIndex_(read_(TAB.REC), sy);
  var cur = setAll.filter(function (r) { return r['학년도'] === String(sy) && r['월'] === String(month) && r['Tier2'].toUpperCase() === 'O'; });
  var labels = cur.map(function (r) { return r['학생명'] + '(' + r['학생코드'] + ') #' + (r['목표'] || '1') + ' ' + r['목표행동']; });
  var pick = sh.getRange(CHART_PICK).getDisplayValue();
  if (!labels.length) { sh.getRange(CHART_PICK).setValue(month + '월 CICO 학생이 없습니다'); return; }
  if (labels.indexOf(pick) < 0) { pick = labels[0]; sh.getRange(CHART_PICK).setValue(pick); }
  sh.getRange(CHART_PICK).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(labels, true).build());
  var sr = cur[labels.indexOf(pick)];
  var d = studentChart_(setAll, calRows, idx, sy, sr['학생코드'], sr['목표'] || '1', month);
  var name = sr['학생명'] + ' · ' + (sr['목표행동'] || '목표행동 미입력');
  putBlock_(sh, 5, DATA_COL, ['날짜', d.label || '값'], d.daily, 31);
  putBlock_(sh, 5, DATA_COL + 2, ['주', '수행률(%)'], d.weekly, 6);
  putBlock_(sh, 5, DATA_COL + 4, ['월', '수행률(%)'], d.monthly, 12);
  var C = Charts.ChartType;
  chart_(sh, 'daily', C.COLUMN, sh.getRange(5, DATA_COL, 32, 2), 5, 1, month + '월 일별 — ' + name + ' (' + (d.label || '') + ')');
  chart_(sh, 'weekly', C.LINE, sh.getRange(5, DATA_COL + 2, 7, 2), 5, 7, month + '월 주별 수행률 — ' + name);
  chart_(sh, 'monthly', C.LINE, sh.getRange(5, DATA_COL + 4, 13, 2), 5, 13, '월별 수행률 — ' + name);
  var grid = sh.getRange(23, 1, 9, 24);
  grid.clearContent(); grid.setBackground(null);
  if (d.scatter) {
    sh.getRange(23, 1, d.scatter.length, d.scatter[0].length).setValues(d.scatter).setHorizontalAlignment('center');
    for (var i = 1; i < d.scatter.length; i++) for (var j = 1; j < d.scatter[0].length; j++) {
      var v = d.scatter[i][j];
      if (v) sh.getRange(23 + i, 1 + j).setBackground(v === 'O' ? '#fdba74' : '#e2e8f0');
    }
  } else sh.getRange(23, 1).setValue('이 학생은 일별 기록 방식입니다.');
}

// ───────────────────────── 고친 칸 저장(누가 고쳐도) ─────────────────────────

function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet(), name = sh.getName();
  if (name === TAB.INPUT) saveCico_(sh, e.range);
  else if (name === TAB.REPORT) saveReport_(sh, e.range);
  else if (name === TAB.CHART && e.range.getA1Notation() === CHART_PICK) { var c = current_(); refreshStudentChart_(c.sy, c.month); }
}

if (typeof module !== 'undefined') {  // 로컬 시험(node)용
  module.exports = { calcRate_: calcRate_, businessDays_: businessDays_, periodSlots_: periodSlots_, buildInputRows_: buildInputRows_,
    recordIndex_: recordIndex_, studentData_: studentData_, toObjects_: toObjects_, approvalStates_: approvalStates_,
    isFullySigned_: isFullySigned_, normDate_: normDate_, fullDate_: fullDate_, schoolYear_: schoolYear_,
    reportRows_: reportRows_, newMonthRows_: newMonthRows_, behaviorStats_: behaviorStats_, studentChart_: studentChart_ };
}
