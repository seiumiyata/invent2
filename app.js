// ====== 定数・グローバル変数 ======
const STORAGE_KEY = 'inventoryData_v2';
const MASTER_KEY = 'masterData_v2';
const STOCK_KEY = 'stockData_v2';
const SETTINGS_KEY = 'settings_v2';

let masterData = [];
let stockData = [];
let qrReader = null;

// ====== 初期化 ======
window.addEventListener('DOMContentLoaded', () => {
  // マスタ・在庫データ読み込み
  masterData = JSON.parse(localStorage.getItem(MASTER_KEY) || '[]');
  stockData = JSON.parse(localStorage.getItem(STOCK_KEY) || '[]');
  // イベントバインド
  bindMenuEvents();
  // 初期表示
  showPage('menu');
});

// ====== メニュー・画面遷移 ======
function bindMenuEvents() {
  document.querySelectorAll('.menu button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = e.target.textContent.trim();
      switch (page) {
        case '棚卸し': showPage('inventory'); break;
        case 'データ取り込み': showPage('import'); break;
        case 'データ出力': showPage('export'); break;
        case '編集': showPage('edit'); break;
        case '設定': showPage('settings'); break;
      }
    });
  });
}
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('menu').style.display = (page === 'menu') ? '' : 'none';
  if (page !== 'menu') {
    document.getElementById(page).style.display = '';
  }
  if (page === 'inventory') {
    updateLotSelect();
    updateHistory();
    updateProgress();
    clearInventoryForm();
  }
  if (page === 'edit') updateEditList();
  if (page === 'settings') loadSettings();
}

// ====== 棚卸し機能 ======
function registerInventory() {
  const codeInput = document.getElementById('code').value.trim();
  const lot = document.getElementById('lotInput').value.trim() || document.getElementById('lotSelect').value;
  const quantity = parseInt(document.getElementById('quantity').value, 10);
  const unit = document.getElementById('unit').value;
  const userName = localStorage.getItem(SETTINGS_KEY + '_userName') || '';
  const centerName = localStorage.getItem(SETTINGS_KEY + '_centerName') || '';

  if (!codeInput) return showError('inventoryError', '商品コードまたはJANコードを入力してください');
  if (!lot) return showError('inventoryError', 'ロットを入力または選択してください');
  if (!quantity || quantity < 1) return showError('inventoryError', '数量を正しく入力してください');
  if (!unit) return showError('inventoryError', '単位を選択してください');

  // 商品名・JANコード自動表示
  const product = masterData.find(m => m.code === codeInput || m.jan === codeInput);
  const productName = product ? product.name : '未登録商品';
  const code = product ? product.code : codeInput;
  const jan = product ? product.jan : '';

  document.getElementById('productName').value = productName;

  // 在庫データから該当在庫・倉庫名を取得（ロット・コード・センター一致）
  let stockRecord = stockData.find(s =>
    (s.code === code || s.jan === codeInput) &&
    s.lot === lot &&
    (centerName ? s.warehouse === centerName : true)
  );
  const stockQty = stockRecord ? stockRecord.stock : '';
  const warehouse = stockRecord ? stockRecord.warehouse : '';

  // 登録
  const data = loadData();
  data.push({
    code,
    jan,
    productName,
    lot,
    quantity,
    unit,
    userName,
    centerName,
    warehouse,
    stockQty,
    timestamp: new Date().toISOString()
  });
  saveData(data);
  playSound();
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  clearInventoryForm();
  updateHistory();
  updateProgress();
  showError('inventoryError', '登録しました', true);
}
function clearInventoryForm() {
  document.getElementById('code').value = '';
  document.getElementById('productName').value = '';
  document.getElementById('lotInput').value = '';
  document.getElementById('quantity').value = 1;
  document.getElementById('unit').value = '個';
}
function loadData() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function updateHistory() {
  const data = loadData();
  const list = data.slice(-5).reverse();
  const div = document.getElementById('historyList');
  div.innerHTML = list.map(item =>
    `<div class="history-item">
      ${item.productName} (${item.code})<br>
      ロット:${item.lot} 数量:${item.quantity}${item.unit}
      ${item.warehouse ? ` 倉庫:${item.warehouse}` : ''}
      <span style="color:#888;font-size:0.9em;">${item.timestamp.slice(0,16).replace('T',' ')}</span>
    </div>`
  ).join('') || '<div style="color:#888;">履歴はありません</div>';
}
function updateProgress() {
  const data = loadData();
  const total = 100; // 仮の全体件数
  const done = data.length;
  const percent = Math.min(100, Math.round((done / total) * 100));
  document.getElementById('progress').style.width = percent + '%';
}
function updateLotSelect() {
  // ロット選択肢生成（stockDataから取得）
  const lotSel = document.getElementById('lotSelect');
  lotSel.innerHTML = '';
  let lots = Array.from(new Set(stockData.map(s => s.lot))).filter(lot => lot);
  lots.forEach(lot => {
    let opt = document.createElement('option');
    opt.value = lot;
    opt.textContent = lot;
    lotSel.appendChild(opt);
  });
}
function showError(id, msg, success = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.color = success ? '#388e3c' : '#d32f2f';
  setTimeout(() => el.textContent = '', 1500);
}
function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1047; g.gain.value = 0.1;
    o.connect(g).connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 120);
  } catch (e) {}
}

// ====== QRコード読取 ======
function openQrReader() {
  document.getElementById('qrModal').style.display = 'flex';
  if (!qrReader) {
    qrReader = new Html5Qrcode("qr-reader");
  }
  qrReader.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    qrCodeMessage => {
      document.getElementById('code').value = qrCodeMessage;
      closeQrReader();
    },
    errorMsg => {}
  ).catch(err => {
    alert('カメラ起動に失敗しました: ' + err);
    closeQrReader();
  });
}
function closeQrReader() {
  document.getElementById('qrModal').style.display = 'none';
  if (qrReader) qrReader.stop().then(() => {}, () => {});
}

// ====== データ取り込み ======
function importMaster() {
  const file = document.getElementById('masterFile').files[0];
  if (!file) return showError('importError', '商品マスタファイルを選択してください');
  readExcel(file, rows => {
    masterData = rows.map(r => ({
      code: r['商品コード'],   // A列
      name: r['商品名'],       // B列
      jan:  r['JANコード']     // W列
    }));
    localStorage.setItem(MASTER_KEY, JSON.stringify(masterData));
    showError('importError', '商品マスタ取り込み完了', true);
  });
}
function importStock() {
  const file = document.getElementById('stockFile').files[0];
  if (!file) return showError('importError', '在庫データファイルを選択してください');
  readExcel(file, rows => {
    stockData = rows.map(r => ({
      code: r['商品コード'],      // A列
      name: r['商品名称'],        // B列
      stock: r['データ上の在庫'], // C列
      warehouse: r['倉庫名'],     // J列
      lot: r['ロット番号'],       // P列
      jan: r['JANコード']        // W列（在庫データにもJANコード列があれば）
    }));
    localStorage.setItem(STOCK_KEY, JSON.stringify(stockData));
    showError('importError', '在庫データ取り込み完了', true);
  });
}
function readExcel(file, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    callback(rows);
  };
  reader.readAsArrayBuffer(file);
}

// ====== データ出力 ======
function exportData() {
  const format = document.getElementById('exportFormat').value;
  const data = loadData();
  if (data.length === 0) return showError('exportError', '出力データがありません');
  if (format === 'csv') {
    const csv = toCSV(data);
    downloadFile(csv, 'inventory.csv', 'text/csv');
  } else {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '棚卸しデータ');
    XLSX.writeFile(wb, 'inventory.xlsx');
  }
  showError('exportError', '出力しました', true);
}
function toCSV(data) {
  const keys = Object.keys(data[0]);
  return keys.join(',') + '\n' + data.map(row => keys.map(k => `"${row[k] ?? ''}"`).join(',')).join('\n');
}
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ====== 編集 ======
function updateEditList() {
  const data = loadData();
  const div = document.getElementById('editList');
  div.innerHTML = data.map((item, i) =>
    `<label><input type="checkbox" class="editChk" value="${i}">${item.productName} (${item.code}) ロット:${item.lot} 数量:${item.quantity}${item.unit}${item.warehouse ? ' 倉庫:' + item.warehouse : ''}</label>`
  ).join('') || '<div style="color:#888;">データがありません</div>';
}
function deleteSelected() {
  const chks = document.querySelectorAll('.editChk:checked');
  if (!chks.length) return showError('editError', '削除対象を選択してください');
  let data = loadData();
  const idxs = Array.from(chks).map(chk => parseInt(chk.value, 10));
  data = data.filter((_, i) => !idxs.includes(i));
  saveData(data);
  updateEditList();
  showError('editError', '削除しました', true);
}
function deleteAll() {
  if (confirm('全データを削除します。よろしいですか？')) {
    saveData([]);
    updateEditList();
    showError('editError', '全削除しました', true);
  }
}

// ====== 設定 ======
function loadSettings() {
  document.getElementById('userName').value = localStorage.getItem(SETTINGS_KEY + '_userName') || '';
  document.getElementById('centerName').value = localStorage.getItem(SETTINGS_KEY + '_centerName') || '';
  document.getElementById('codeType').value = localStorage.getItem(SETTINGS_KEY + '_codeType') || 'QR';
  document.getElementById('settingExportFormat').value = localStorage.getItem(SETTINGS_KEY + '_exportFormat') || 'csv';
  document.getElementById('settingImportFormat').value = localStorage.getItem(SETTINGS_KEY + '_importFormat') || 'xls';
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY + '_userName', document.getElementById('userName').value);
  localStorage.setItem(SETTINGS_KEY + '_centerName', document.getElementById('centerName').value);
  localStorage.setItem(SETTINGS_KEY + '_codeType', document.getElementById('codeType').value);
  localStorage.setItem(SETTINGS_KEY + '_exportFormat', document.getElementById('settingExportFormat').value);
  localStorage.setItem(SETTINGS_KEY + '_importFormat', document.getElementById('settingImportFormat').value);
  showError('settingsError', '保存しました', true);
}
function clearAllData() {
  if (confirm('全データを消去します。よろしいですか？')) {
    localStorage.clear();
    masterData = [];
    stockData = [];
    showError('settingsError', '全データ消去しました', true);
  }
}
