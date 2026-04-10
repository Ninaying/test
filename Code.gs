// ============================================================
// 木材庫存系統 — Google Apps Script 後端
// ============================================================
// 設定：部署前請替換以下兩個常數
// ============================================================

const SHEET_ID   = "填入您的_GOOGLE_SHEET_ID";   // 從試算表網址取得
const FOLDER_ID  = "填入您的_DRIVE_FOLDER_ID";   // 從雲端硬碟資料夾網址取得

// ------------------------------------------------------------
// doPost — 接收前端所有請求的主要入口
// ------------------------------------------------------------
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;

    if (action === "submitRecord") {
      return submitRecord(payload);
    }
    if (action === "syncBatch") {
      return syncBatch(payload);
    }

    return jsonResponse({ success: false, error: "未知的動作：" + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// doGet — 簡易健康檢查（前端用來測試連線狀態）
function doGet(e) {
  return jsonResponse({ status: "online", timestamp: new Date().toISOString() });
}

// ------------------------------------------------------------
// submitRecord — 寫入單筆記錄
// ------------------------------------------------------------
function submitRecord(payload) {
  const sheet    = getOrCreateSheet();
  const imageUrl = payload.imageBase64 ? saveImageToDrive(payload.imageBase64, payload.imageName) : "";

  const dynamicValues = (payload.dynamicFields || []).map(f => f.key + "：" + f.value).join(" | ");

  sheet.appendRow([
    payload.timestamp   || new Date().toISOString(),
    payload.weight      || "",
    payload.species     || "",
    payload.remarks     || "",
    dynamicValues,
    imageUrl
  ]);

  return jsonResponse({ success: true, imageUrl });
}

// ------------------------------------------------------------
// syncBatch — 批次寫入多筆記錄（離線同步用）
// ------------------------------------------------------------
function syncBatch(payload) {
  const records = payload.records || [];
  const results = [];

  for (const rec of records) {
    try {
      submitRecord(rec);
      results.push({ id: rec.localId, success: true });
    } catch (err) {
      results.push({ id: rec.localId, success: false, error: err.message });
    }
  }

  return jsonResponse({ success: true, results });
}

// ------------------------------------------------------------
// saveImageToDrive — 解碼 base64 並儲存至雲端硬碟資料夾
// ------------------------------------------------------------
function saveImageToDrive(base64Data, fileName) {
  // 若包含 data-URL 前綴（如 "data:image/jpeg;base64,"），先去除
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const bytes       = Utilities.base64Decode(cleanBase64);
  const blob        = Utilities.newBlob(bytes, "image/jpeg", fileName || "photo_" + Date.now() + ".jpg");

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const file   = folder.createFile(blob);

  // 設定為「知道連結的人均可檢視」，確保試算表中的網址可正常存取
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

// ------------------------------------------------------------
// getOrCreateSheet — 尋找或建立「庫存」工作表
// ------------------------------------------------------------
function getOrCreateSheet() {
  const ss        = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = "庫存";
  let   sheet     = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // 寫入標題列
    sheet.appendRow([
      "時間戳記",
      "重量（公斤）",
      "木材樹種",
      "備註",
      "自訂欄位",
      "圖片網址"
    ]);
    // 凍結標題列
    sheet.setFrozenRows(1);
    // 標題列加粗
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
  }

  return sheet;
}

// ------------------------------------------------------------
// 輔助函式 — 回傳 JSON 格式的 ContentService 回應
// ------------------------------------------------------------
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
