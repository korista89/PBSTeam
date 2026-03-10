/**
 * CICO 월별 리포트 시트 전용 트리거
 * H열(척도)이 변경되면 해당 행의 Q~AK열 드롭다운을 자동으로 업데이트합니다.
 */
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const sheetName = sheet.getName();
  
  // "월"로 끝나는 시트(예: 3월, 4월)에서만 작동
  if (!sheetName.endsWith("월")) return;
  
  const row = range.getRow();
  const col = range.getColumn();
  
  // 척도 컬럼 (H열 = 8번)
  if (col === 8 && row > 1) {
    const scale = range.getValue();
    updateDailyDropdowns(sheet, row, scale);
  }
}

function updateDailyDropdowns(sheet, row, scale) {
  // Q열(17번)부터 AK열(37번)까지
  const targetRange = sheet.getRange(row, 17, 1, 21);
  const rule = getValidationRule(scale);
  
  if (rule) {
    targetRange.setDataValidation(rule);
  } else {
    targetRange.clearDataValidations();
  }
}

function getValidationRule(scale) {
  let options = [];
  
  if (scale === "O/X(발생)") {
    options = ["O", "X"];
  } else if (scale === "0점/1점/2점") {
    options = ["0점", "1점", "2점"];
  } else if (scale === "0~5") {
    options = ["0", "1", "2", "3", "4", "5"];
  } else if (scale === "0~7교시") {
    options = ["0", "1", "2", "3", "4", "5", "6", "7"];
  } else if (scale === "1~100회") {
    for (let i = 1; i <= 100; i++) options.push(i + "회");
  } else if (scale === "1~100분") {
    for (let i = 1; i <= 100; i++) options.push(i + "분");
  } else {
    return null;
  }
  
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .build();
}
