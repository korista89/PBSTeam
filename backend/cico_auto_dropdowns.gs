/**
 * CICO 월별 리포트 시트 전용 트리거
 * H열(척도)이 변경되면 해당 행의 Q~AK열 드롭다운을 자동으로 업데이트합니다.
 */
function onEdit(e) {
  // 1. 트리거 객체(e)가 없거나 범위가 없으면 리턴 (에디터에서 직접 '실행' 버튼 클릭 시 오류 방지)
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const sheetName = sheet.getName();
  
  // 2. "월"로 끝나는 시트(예: 3월, 4월)에서만 작동하도록 제한
  if (!sheetName.endsWith("월")) return;
  
  const row = range.getRow();
  const col = range.getColumn();
  
  // 3. 척도 컬럼 (H열 = 8번)이 변경되었고 헤더가 아닌 경우 실행
  if (col === 8 && row > 1) {
    const scale = range.getValue();
    updateDailyDropdowns(sheet, row, scale);
  }
}

/**
 * 특정 행의 입력 범위(세션 컬럼들)에 드롭다운 규칙을 적용하는 함수
 */
function updateDailyDropdowns(sheet, row, scale) {
  const headers = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 50)).getValues()[0];
  let startCol = -1;
  let endCol = -1;
  
  // "1회차" 또는 "1"로 시작하는 세션 컬럼 탐색
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toString();
    if (h.includes("1회차") || h === "1") {
      if (startCol === -1) startCol = i + 1;
    }
    // "수행/발생률" 바로 전 컬럼까지가 세션 범위
    if (h.includes("수행/발생률") || h.includes("수행률")) {
      endCol = i; 
      break;
    }
  }
  
  // 못 찾을 경우 기본값 (v3: 11열~35열)
  if (startCol === -1) startCol = 11;
  if (endCol === -1) endCol = 35;

  const targetRange = sheet.getRange(row, startCol, 1, endCol - startCol + 1);
  const rule = getValidationRule(scale);
  
  if (rule) {
    targetRange.setDataValidation(rule);
  } else {
    targetRange.clearDataValidations();
  }
}

/**
 * 선택된 척도 명칭에 맞는 드롭다운 규칙을 생성합니다.
 */
function getValidationRule(scale) {
  if (!scale) return null;
  
  let options = [];
  
  // H열의 값과 정확히 일치해야 합니다.
  if (scale === "O/X(발생)") {
    options = ["O", "X"];
  } else if (scale === "0점/1점/2점") {
    options = ["0점", "1점", "2점"];
  } else if (scale === "0~5") {
    options = ["0", "1", "2", "3", "4", "5"];
  } else if (scale === "0~7교시") {
    options = ["0", "1", "2", "3", "4", "5", "6", "7"];
  } else if (scale === "1~100회") {
    for (var i = 1; i <= 100; i++) {
      options.push(i + "회");
    }
  } else if (scale === "1~100분") {
    for (var j = 1; j <= 100; j++) {
      options.push(j + "분");
    }
  } else {
    return null;
  }
  
  // 데이터 유효성 검사 규칙 빌드
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false) // 목록에 없는 값 입력 시 경고/차단
    .build();
}

/**
 * [테스트용 함수]
 * 앱스크립트 에디터에서 'onEdit'를 직접 '실행'하면 오류가 납니다.
 * 대신 이 'testScript' 함수를 실행하여 코드가 잘 작동하는지 확인할 수 있습니다.
 */
function testScript() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  
  // 현재 활성화된 시트의 2행을 대상으로 테스트
  console.log("테스트 시작: 현재 시트('" + sheet.getName() + "')의 2행 Q~AK열에 드롭다운을 설정합니다.");
  
  // 1. 0점/1점/2점 테스트
  updateDailyDropdowns(sheet, 2, "0점/1점/2점");
  console.log("1단계 완료: '0점/1점/2점' 드롭다운 설정됨.");
  
  // 2. 1~100회 테스트
  updateDailyDropdowns(sheet, 2, "1~100회");
  console.log("2단계 완료: '1~100회' 드롭다운 설정됨.");
  
  console.log("테스트 결과: 시트의 2행 Q~AK열을 확인해 보세요.");
}
