// 棚卸し管理PWAアプリケーション - 完全版
// IndexedDB設定
const DB_NAME = 'inventoryDB';
const DB_VERSION = 1;
const INVENTORY_STORE = 'inventory';
const PRODUCT_STORE = 'products';
const STOCK_STORE = 'stock';
let db = null;

// グローバル変数
let qrScanner = null;
let torchOn = false;
let productMaster = [];
let stockData = [];
let centerNames = [];
let beepSound = null;

// -------------------------
// データベース操作
// -------------------------
// IndexedDBを開く
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 在庫データストア
      if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
        db.createObjectStore(INVENTORY_STORE, { keyPath: 'id', autoIncrement: true });
      }
      
      // 商品マスタストア
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
        const productStore = db.createObjectStore(PRODUCT_STORE, { keyPath: 'code' });
        productStore.createIndex('name', 'name', { unique: false });
      }
      
      // 在庫データストア
      if (!db.objectStoreNames.contains(STOCK_STORE)) {
        const stockStore = db.createObjectStore(STOCK_STORE, { keyPath: 'id', autoIncrement: true });
        stockStore.createIndex('center', 'center', { unique: false });
        stockStore.createIndex('code', 'code', { unique: false });
      }
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('IndexedDB接続成功');
      resolve(db);
    };
    
    request.onerror = (event) => {
      console.error('IndexedDB接続エラー:', event.target.error);
      reject('データベース接続に失敗しました');
    };
  });
}

// 在庫データを追加
async function addInventory(item) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([INVENTORY_STORE], 'readwrite');
      const store = transaction.objectStore(INVENTORY_STORE);
      const request = store.add(item);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('データの追加に失敗しました');
      
      transaction.oncomplete = () => console.log('トランザクション完了: addInventory');
    } catch (error) {
      reject(`データ追加エラー: ${error.message}`);
    }
  });
}

// 在庫データをすべて取得
async function getAllInventory() {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([INVENTORY_STORE], 'readonly');
      const store = transaction.objectStore(INVENTORY_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('データの取得に失敗しました');
    } catch (error) {
      reject(`データ取得エラー: ${error.message}`);
    }
  });
}

// 在庫データを更新
async function updateInventory(id, updates) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([INVENTORY_STORE], 'readwrite');
      const store = transaction.objectStore(INVENTORY_STORE);
      const request = store.get(id);
      
      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          reject('更新対象のデータが見つかりません');
          return;
        }
        
        // データ更新
        Object.assign(data, updates);
        const updateRequest = store.put(data);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject('データの更新に失敗しました');
      };
      
      request.onerror = () => reject('データの取得に失敗しました');
    } catch (error) {
      reject(`データ更新エラー: ${error.message}`);
    }
  });
}

// 在庫データを削除
async function deleteInventory(id) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([INVENTORY_STORE], 'readwrite');
      const store = transaction.objectStore(INVENTORY_STORE);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject('データの削除に失敗しました');
    } catch (error) {
      reject(`データ削除エラー: ${error.message}`);
    }
  });
}

// 在庫データをすべて削除
async function clearAllInventory() {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([INVENTORY_STORE], 'readwrite');
      const store = transaction.objectStore(INVENTORY_STORE);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject('データの削除に失敗しました');
    } catch (error) {
      reject(`データ一括削除エラー: ${error.message}`);
    }
  });
}

// 商品コードから商品を検索
async function findProductByCode(code) {
  if (!code) return null;
  
  // メモリ内の商品マスタから検索
  const product = productMaster.find(p => p.code === code || p.janCode === code);
  if (product) return product;
  
  // データベースから検索
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([PRODUCT_STORE], 'readonly');
      const store = transaction.objectStore(PRODUCT_STORE);
      const request = store.get(code);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        console.error('商品検索エラー:', request.error);
        resolve(null);
      };
    } catch (error) {
      console.error('商品検索処理エラー:', error);
      resolve(null);
    }
  });
}

// 商品マスタの一括挿入
async function bulkInsertProducts(products) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([PRODUCT_STORE], 'readwrite');
      const store = transaction.objectStore(PRODUCT_STORE);
      let completed = 0;
      let errors = 0;
      
      products.forEach(product => {
        try {
          // 商品コードを正規化
          const code = String(product.code || product['商品コード'] || product['コード'] || '').trim();
          if (!code) {
            errors++;
            completed++;
            return;
          }
          
          // 商品データを整形
          const productData = {
            code: code,
            name: product.name || product['商品名'] || '',
            janCode: product.janCode || product['JANコード'] || '',
            unit: product.unit || product['単位'] || '個',
            price: parseFloat(product.price || product['価格'] || 0)
          };
          
          const request = store.put(productData);
          request.onsuccess = () => {
            completed++;
            if (completed === products.length) {
              productMaster = products; // メモリにも保持
              resolve({ total: products.length, success: completed - errors, errors });
            }
          };
          
          request.onerror = () => {
            errors++;
            completed++;
            if (completed === products.length) {
              resolve({ total: products.length, success: completed - errors, errors });
            }
          };
        } catch (error) {
          errors++;
          completed++;
          if (completed === products.length) {
            resolve({ total: products.length, success: completed - errors, errors });
          }
        }
      });
      
      transaction.oncomplete = () => console.log('トランザクション完了: bulkInsertProducts');
      transaction.onerror = () => {
        reject('商品マスタの取り込みに失敗しました');
      };
    } catch (error) {
      reject(`商品マスタ一括挿入エラー: ${error.message}`);
    }
  });
}

// 在庫データの一括挿入
async function bulkInsertStock(stocks) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STOCK_STORE], 'readwrite');
      const store = transaction.objectStore(STOCK_STORE);
      let completed = 0;
      let errors = 0;
      
      // データの正規化と処理
      stocks.forEach(stock => {
        try {
          // 商品コードと倉庫名の抽出
          const code = String(stock.code || stock.product_code || stock['商品コード'] || stock['コード'] || '').trim();
          const center = String(stock.center || stock.warehouse || stock['センター名'] || stock['倉庫名'] || '').trim();
          
          if (!code) {
            errors++;
            completed++;
            return;
          }
          
          // 在庫データの整形
          const stockData = {
            code: code,
            center: center,
            quantity: parseNumber(stock.quantity || stock.current_stock || stock['在庫数量'] || 0),
            lot: sanitizeLotNumber(stock.lot || stock.lot_no || stock['ロットNo.'] || ''),
            shelf: stock.shelf || stock.shelf_location || stock['棚番号'] || '',
            expiration: parseDate(stock.expiration || stock.expiration_date || stock['賞味期限'])
          };
          
          const request = store.put(stockData);
          request.onsuccess = () => {
            completed++;
            if (completed === stocks.length) {
              stockData = stocks; // メモリにも保持
              resolve({ total: stocks.length, success: completed - errors, errors });
            }
          };
          
          request.onerror = () => {
            errors++;
            completed++;
            if (completed === stocks.length) {
              resolve({ total: stocks.length, success: completed - errors, errors });
            }
          };
        } catch (error) {
          errors++;
          completed++;
          if (completed === stocks.length) {
            resolve({ total: stocks.length, success: completed - errors, errors });
          }
        }
      });
      
      transaction.oncomplete = () => console.log('トランザクション完了: bulkInsertStock');
      transaction.onerror = () => {
        reject('在庫データの取り込みに失敗しました');
      };
    } catch (error) {
      reject(`在庫データ一括挿入エラー: ${error.message}`);
    }
  });
}

// -------------------------
// ユーティリティ関数
// -------------------------
// 日付文字列を解析してDate型に変換
function parseDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  
  // 文字列化
  const dateStr = String(value).split(',')[0].trim();
  
  // 空文字列チェック
  if (!dateStr) return null;
  
  // YYYY-MM-DD形式をチェック
  const isoMatch = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    return new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10)
    );
  }
  
  // YYYYMMDD形式をチェック
  const compactMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return new Date(
      parseInt(compactMatch[1], 10),
      parseInt(compactMatch[2], 10) - 1,
      parseInt(compactMatch[3], 10)
    );
  }
  
  // その他の形式は標準パーサーで試行
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// 数値文字列を解析して数値に変換
function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  // カンマ、通貨記号、単位を除去
  const num = Number(String(value).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

// ロット番号の正規化
function sanitizeLotNumber(value) {
  if (!value) return '';
  
  // 特殊文字除去と長さ制限
  return String(value)
    .replace(/[^a-zA-Z0-9-]/g, '')
    .substring(0, 20);
}

// 現在の日時から一意のファイル名を生成
function generateFileName(extension) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `inventory_${year}${month}${day}_${hours}${minutes}${seconds}.${extension}`;
}

// Blobからファイルをダウンロード
function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  
  // クリーンアップ
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// ビープ音を再生
function playBeep() {
  try {
    if (!beepSound) {
      beepSound = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
      beepSound.volume = 0.5;
    }
    beepSound.play();
  } catch (error) {
    console.warn('ビープ音再生エラー:', error);
  }
}

// 成功メッセージを表示
function showSuccess(message, duration = 3000) {
  showToast(message, 'success', duration);
}

// エラーメッセージを表示
function showError(message, duration = 3000) {
  showToast(message, 'error', duration);
}

// トースト通知を表示
function showToast(message, type = 'info', duration = 3000) {
  // 既存のトーストを削除
  const existingToast = document.getElementById('toast');
  if (existingToast) {
    document.body.removeChild(existingToast);
  }
  
  // トースト要素を作成
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // スタイル設定
  toast.style.position = 'fixed';
  toast.style.top = '10%';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '4px';
  toast.style.color = '#fff';
  toast.style.zIndex = '10000';
  toast.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  toast.style.textAlign = 'center';
  toast.style.minWidth = '200px';
  toast.style.maxWidth = '80%';
  
  // タイプによって色を変更
  switch (type) {
    case 'success':
      toast.style.backgroundColor = '#4CAF50';
      break;
    case 'error':
      toast.style.backgroundColor = '#F44336';
      break;
    case 'warning':
      toast.style.backgroundColor = '#FF9800';
      break;
    default:
      toast.style.backgroundColor = '#2196F3';
  }
  
  // 表示
  document.body.appendChild(toast);
  
  // 自動消去
  setTimeout(() => {
    if (document.body.contains(toast)) {
      document.body.removeChild(toast);
    }
  }, duration);
}

// -------------------------
// QRコード読み取り機能
// -------------------------
// QRコードスキャンを開始
function startQRScan() {
  const qrReader = document.getElementById('qr-reader');
  if (!qrReader) return;
  
  // 表示
  qrReader.style.display = 'block';
  document.getElementById('torch-btn').style.display = 'block';
  
  // スキャナー初期化
  qrScanner = new Html5Qrcode('qr-reader');
  const config = {
    fps: 10,
    qrbox: 250,
    aspectRatio: 1.0
  };
  
  qrScanner.start(
    { facingMode: 'environment' },
    config,
    onQRCodeSuccess,
    onQRCodeError
  )
  .then(() => {
    // Torch機能の初期化
    initTorch();
  })
  .catch(error => {
    console.error('QRスキャン開始エラー:', error);
    showError('カメラの起動に失敗しました');
    stopQRScan();
  });
}

// QRコードスキャンを停止
function stopQRScan() {
  if (qrScanner) {
    qrScanner.stop()
      .then(() => {
        console.log('QRスキャン停止');
        qrScanner = null;
        torchOn = false;
        document.getElementById('qr-reader').style.display = 'none';
        document.getElementById('torch-btn').style.display = 'none';
      })
      .catch(error => {
        console.error('QRスキャン停止エラー:', error);
      });
  }
}

// QRコード読み取り成功時の処理
function onQRCodeSuccess(decodedText) {
  console.log('QRコード読み取り成功:', decodedText);
  
  // ビープ音再生
  playBeep();
  
  // 商品コード欄に設定
  document.getElementById('product-code').value = decodedText;
  
  // 商品名検索
  findProductByCode(decodedText)
    .then(product => {
      if (product) {
        document.getElementById('product-name').value = product.name || '';
      } else {
        document.getElementById('product-name').value = '';
      }
    });
  
  // QRスキャナー停止
  stopQRScan();
}

// QRコード読み取りエラー時の処理
function onQRCodeError(error) {
  // 通常のスキャン中のエラーは無視（頻繁に発生するため）
  // console.error('QRコード読み取りエラー:', error);
}

// トーチ機能の初期化
function initTorch() {
  try {
    setTimeout(() => {
      if (qrScanner) {
        const cameraCapabilities = qrScanner.getRunningTrackCameraCapabilities();
        if (cameraCapabilities && typeof cameraCapabilities.torchFeature === 'function') {
          const torchFeature = cameraCapabilities.torchFeature();
          if (torchFeature && torchFeature.isSupported()) {
            // トーチ機能が利用可能な場合はボタンを表示
            document.getElementById('torch-btn').style.display = 'block';
          } else {
            document.getElementById('torch-btn').style.display = 'none';
          }
        } else {
          document.getElementById('torch-btn').style.display = 'none';
        }
      }
    }, 1000);
  } catch (error) {
    console.warn('トーチ機能初期化エラー:', error);
    document.getElementById('torch-btn').style.display = 'none';
  }
}

// トーチの切り替え
function toggleTorch() {
  if (!qrScanner) return;
  
  try {
    const cameraCapabilities = qrScanner.getRunningTrackCameraCapabilities();
    if (cameraCapabilities && typeof cameraCapabilities.torchFeature === 'function') {
      const torchFeature = cameraCapabilities.torchFeature();
      if (torchFeature && torchFeature.isSupported()) {
        torchOn = !torchOn;
        torchFeature.apply(torchOn);
        
        // ボタンの見た目を更新
        const torchBtn = document.getElementById('torch-btn');
        if (torchOn) {
          torchBtn.classList.add('active');
          torchBtn.textContent = '🔦 ON';
        } else {
          torchBtn.classList.remove('active');
          torchBtn.textContent = '🔦 OFF';
        }
      }
    }
  } catch (error) {
    console.error('トーチ切り替えエラー:', error);
    showError('ライト機能を利用できません');
  }
}

// -------------------------
// データ入出力機能
// -------------------------
// 商品マスタの取り込み
function importProductMaster(file) {
  if (!file) return;
  
  // ファイル形式チェック
  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    showError('Excel形式のファイルを選択してください');
    return;
  }
  
  // ローディング表示
  showLoading('商品マスタを取り込み中...');
  
  // ファイル読み込み
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Excelデータの解析
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // 商品マスタに取り込み
      bulkInsertProducts(jsonData)
        .then(result => {
          hideLoading();
          showSuccess(`商品マスタを取り込みました（${result.success}件成功、${result.errors}件エラー）`);
        })
        .catch(error => {
          hideLoading();
          showError('商品マスタの取り込みに失敗しました: ' + error);
        });
    } catch (error) {
      hideLoading();
      console.error('商品マスタ処理エラー:', error);
      showError('商品マスタの処理に失敗しました');
    }
  };
  
  reader.onerror = function() {
    hideLoading();
    showError('ファイルの読み込みに失敗しました');
  };
  
  reader.readAsArrayBuffer(file);
}

// 在庫データの取り込み
function importStockData(file) {
  if (!file) return;
  
  // ファイル形式チェック
  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    showError('Excel形式のファイルを選択してください');
    return;
  }
  
  // ローディング表示
  showLoading('在庫データを取り込み中...');
  
  // ファイル読み込み
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Excelデータの解析
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,  // 日付型を自動検出
        dateNF: 'yyyy-mm-dd'  // 日付フォーマット指定
      });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // センター名を抽出
      const centers = [...new Set(
        jsonData
          .map(item => item['センター名'] || item['倉庫名'] || item.center || item.warehouse)
          .filter(Boolean)
      )];
      
      if (centers.length > 0) {
        centerNames = [...new Set([...centerNames, ...centers])];
        updateCenterList();
        
        // 設定に保存
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        settings.centerNames = centerNames;
        localStorage.setItem('settings', JSON.stringify(settings));
      }
      
      // 在庫データに取り込み
      bulkInsertStock(jsonData)
        .then(result => {
          hideLoading();
          showSuccess(`在庫データを取り込みました（${result.success}件成功、${result.errors}件エラー）`);
        })
        .catch(error => {
          hideLoading();
          showError('在庫データの取り込みに失敗しました: ' + error);
        });
    } catch (error) {
      hideLoading();
      console.error('在庫データ処理エラー:', error);
      showError('在庫データの処理に失敗しました');
    }
  };
  
  reader.onerror = function() {
    hideLoading();
    showError('ファイルの読み込みに失敗しました');
  };
  
  reader.readAsArrayBuffer(file);
}

// データ出力
function exportData() {
  // 設定から出力形式を取得
  const settings = JSON.parse(localStorage.getItem('settings') || '{}');
  const format = document.getElementById('export-format').value || settings.outputFormat || 'csv';
  
  if (format === 'csv') {
    exportCSV();
  } else {
    exportExcel();
  }
}

// データをCSV形式で出力
function exportCSV() {
  // ローディング表示
  showLoading('データを出力中...');
  
  // 在庫データを取得
  getAllInventory()
    .then(data => {
      if (data.length === 0) {
        hideLoading();
        showError('出力するデータがありません');
        return;
      }
      
      // CSVヘッダー
      let csv = 'コード,商品名,数量,単位,ロット,棚番号,センター名,担当者,登録日時\n';
      
      // データ行の追加
      data.forEach(item => {
        const row = [
          item.code || '',
          `"${(item.name || '').replace(/"/g, '""')}"`,
          item.quantity || 0,
          item.unit || '個',
          item.lot || '',
          item.shelf || '',
          item.center || '',
          item.user || '',
          item.timestamp || ''
        ];
        csv += row.join(',') + '\n';
      });
      
      // BOM付きUTF-8に変換
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
      
      // ダウンロード
      downloadFile(blob, generateFileName('csv'));
      hideLoading();
      showSuccess('CSVファイルをダウンロードしました');
    })
    .catch(error => {
      hideLoading();
      console.error('CSV出力エラー:', error);
      showError('データの出力に失敗しました');
    });
}

// データをExcel形式で出力
function exportExcel() {
  // ローディング表示
  showLoading('データを出力中...');
  
  // 在庫データを取得
  getAllInventory()
    .then(data => {
      if (data.length === 0) {
        hideLoading();
        showError('出力するデータがありません');
        return;
      }
      
      // 出力用データの整形
      const exportData = data.map(item => ({
        'コード': item.code || '',
        '商品名': item.name || '',
        '数量': item.quantity || 0,
        '単位': item.unit || '個',
        'ロット': item.lot || '',
        '棚番号': item.shelf || '',
        'センター名': item.center || '',
        '担当者': item.user || '',
        '登録日時': item.timestamp || ''
      }));
      
      // Excelワークブックの作成
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '棚卸しデータ');
      
      // Excelファイルの生成
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // ダウンロード
      downloadFile(blob, generateFileName('xlsx'));
      hideLoading();
      showSuccess('Excelファイルをダウンロードしました');
    })
    .catch(error => {
      hideLoading();
      console.error('Excel出力エラー:', error);
      showError('データの出力に失敗しました');
    });
}

// ローディング表示
function showLoading(message) {
  // 既存のローディングを削除
  hideLoading();
  
  // ローディング要素を作成
  const loading = document.createElement('div');
  loading.id = 'loading-overlay';
  loading.style.position = 'fixed';
  loading.style.top = '0';
  loading.style.left = '0';
  loading.style.width = '100%';
  loading.style.height = '100%';
  loading.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  loading.style.display = 'flex';
  loading.style.alignItems = 'center';
  loading.style.justifyContent = 'center';
  loading.style.zIndex = '9999';
  
  const content = document.createElement('div');
  content.style.backgroundColor = '#fff';
  content.style.padding = '20px';
  content.style.borderRadius = '5px';
  content.style.textAlign = 'center';
  
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.style.border = '4px solid #f3f3f3';
  spinner.style.borderTop = '4px solid #3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '30px';
  spinner.style.height = '30px';
  spinner.style.margin = '0 auto 10px';
  spinner.style.animation = 'spin 1s linear infinite';
  
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
  
  const text = document.createElement('div');
  text.textContent = message || 'Loading...';
  
  document.head.appendChild(style);
  content.appendChild(spinner);
  content.appendChild(text);
  loading.appendChild(content);
  document.body.appendChild(loading);
}

// ローディング非表示
function hideLoading() {
  const loading = document.getElementById('loading-overlay');
  if (loading) {
    document.body.removeChild(loading);
  }
}

// -------------------------
// 画面操作機能
// -------------------------
// 画面切り替え
function showScreen(screenId) {
  // すべての画面を非表示
  document.querySelectorAll('.screen').forEach(screen => {
    screen.style.display = 'none';
  });
  
  // 指定した画面を表示
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.style.display = 'block';
    
    // 画面に応じた初期化処理
    switch (screenId) {
      case 'inventory-section':
        // フォームリセット
        document.getElementById('inventory-form').reset();
        document.getElementById('product-name').value = '';
        break;
      case 'edit-section':
        // 編集リスト表示
        loadEditList();
        break;
      case 'settings-section':
        // 設定読み込み
        loadSettings();
        break;
    }
  }
}

// 編集リストの読み込み
function loadEditList() {
  const editList = document.getElementById('edit-list');
  if (!editList) return;
  
  // ローディング表示
  editList.innerHTML = '<div class="loading">データを読み込み中...</div>';
  
  // 在庫データを取得
  getAllInventory()
    .then(data => {
      if (data.length === 0) {
        editList.innerHTML = '<div class="empty-message">データがありません</div>';
        return;
      }
      
      // 一覧を表示
      editList.innerHTML = '';
      
      data.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'data-item';
        itemDiv.dataset.id = item.id;
        
        itemDiv.innerHTML = `
          <div class="data-item-header">
            <span class="data-item-code">${item.code || ''}</span>
            <span class="data-item-timestamp">${formatDate(item.timestamp)}</span>
          </div>
          <div class="data-item-name">${item.name || '(商品名なし)'}</div>
          <div class="data-item-details">
            数量: ${item.quantity || 0} ${item.unit || '個'} | 
            ロット: ${item.lot || '-'} | 
            棚番号: ${item.shelf || '-'}
          </div>
        `;
        
        // クリックイベント
        itemDiv.addEventListener('click', () => {
          openEditModal(item);
        });
        
        editList.appendChild(itemDiv);
      });
    })
    .catch(error => {
      console.error('編集リスト取得エラー:', error);
      editList.innerHTML = '<div class="error-message">データの読み込みに失敗しました</div>';
    });
}

// 日付のフォーマット
function formatDate(dateString) {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

// 編集モーダルを開く
function openEditModal(item) {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  
  // データを設定
  document.getElementById('edit-code').value = item.code || '';
  document.getElementById('edit-name').value = item.name || '';
  document.getElementById('edit-quantity').value = item.quantity || 1;
  document.getElementById('edit-unit').value = item.unit || '個';
  document.getElementById('edit-lot').value = item.lot || '';
  document.getElementById('edit-shelf').value = item.shelf || '';
  
  // 現在の編集対象IDを設定
  modal.dataset.editId = item.id;
  
  // モーダル表示
  modal.classList.add('show');
  
  // イベントリスナー設定
  document.getElementById('save-edit-btn').onclick = saveEdit;
  document.getElementById('delete-edit-btn').onclick = deleteEdit;
  document.getElementById('cancel-edit-btn').onclick = closeEditModal;
}

// 編集モーダルを閉じる
function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// 編集内容を保存
function saveEdit() {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  
  const id = parseInt(modal.dataset.editId, 10);
  if (isNaN(id)) {
    showError('編集対象が見つかりません');
    return;
  }
  
  // 更新データを作成
  const updates = {
    name: document.getElementById('edit-name').value,
    quantity: parseInt(document.getElementById('edit-quantity').value, 10) || 1,
    unit: document.getElementById('edit-unit').value,
    lot: document.getElementById('edit-lot').value,
    shelf: document.getElementById('edit-shelf').value
  };
  
  // データ更新
  updateInventory(id, updates)
    .then(() => {
      closeEditModal();
      showSuccess('データを更新しました');
      loadEditList();
    })
    .catch(error => {
      console.error('データ更新エラー:', error);
      showError('データの更新に失敗しました');
    });
}

// 編集中のデータを削除
function deleteEdit() {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;
  
  const id = parseInt(modal.dataset.editId, 10);
  if (isNaN(id)) {
    showError('削除対象が見つかりません');
    return;
  }
  
  // 確認
  if (!confirm('このデータを削除してもよろしいですか？')) {
    return;
  }
  
  // データ削除
  deleteInventory(id)
    .then(() => {
      closeEditModal();
      showSuccess('データを削除しました');
      loadEditList();
    })
    .catch(error => {
      console.error('データ削除エラー:', error);
      showError('データの削除に失敗しました');
    });
}

// 全データ削除確認
function confirmClearAllData() {
  if (confirm('すべてのデータを削除します。この操作は元に戻せません。よろしいですか？')) {
    clearAllData();
  }
}

// 全データ削除
function clearAllData() {
  // ローディング表示
  showLoading('データを削除中...');
  
  // 在庫データをすべて削除
  clearAllInventory()
    .then(() => {
      hideLoading();
      showSuccess('すべてのデータを削除しました');
      
      // 編集画面を表示中の場合は再読み込み
      if (document.getElementById('edit-section').style.display === 'block') {
        loadEditList();
      }
    })
    .catch(error => {
      hideLoading();
      console.error('データ削除エラー:', error);
      showError('データの削除に失敗しました');
    });
}

// 設定の読み込み
function loadSettings() {
  // localStorage から設定を取得
  const settings = JSON.parse(localStorage.getItem('settings') || '{}');
  
  // フォームに設定
  document.getElementById('setting-name').value = settings.name || '';
  document.getElementById('setting-center').value = settings.center || '';
  document.getElementById('setting-code-type').value = settings.codeType || 'QR';
  document.getElementById('setting-output-format').value = settings.outputFormat || 'csv';
  
  // センターリストを更新
  updateCenterList();
}

// 設定の保存
function saveSettings() {
  // フォームから設定を取得
  const settings = {
    name: document.getElementById('setting-name').value,
    center: document.getElementById('setting-center').value,
    codeType: document.getElementById('setting-code-type').value,
    outputFormat: document.getElementById('setting-output-format').value,
    centerNames: centerNames
  };
  
  // localStorage に保存
  localStorage.setItem('settings', JSON.stringify(settings));
  
  showSuccess('設定を保存しました');
}

// センターリストの更新
function updateCenterList() {
  const datalist = document.getElementById('center-list');
  if (!datalist) return;
  
  // リストをクリア
  datalist.innerHTML = '';
  
  // センター名を追加
  centerNames.forEach(center => {
    if (!center) return;
    
    const option = document.createElement('option');
    option.value = center;
    datalist.appendChild(option);
  });
}

// -------------------------
// イベントリスナー初期化
// -------------------------
// DOMロード時の初期化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // IndexedDBを開く
    await openDB();
    
    // 設定読み込み
    const settings = JSON.parse(localStorage.getItem('settings') || '{}');
    centerNames = settings.centerNames || [];
    
    // フォームイベントリスナー
    const inventoryForm = document.getElementById('inventory-form');
    if (inventoryForm) {
      inventoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
          // 入力データを取得
          const code = document.getElementById('product-code').value.trim();
          const name = document.getElementById('product-name').value.trim();
          const quantity = parseInt(document.getElementById('quantity').value, 10) || 1;
          const unit = document.getElementById('unit').value;
          const lot = document.getElementById('lot').value.trim();
          const shelf = document.getElementById('shelf').value.trim();
          
          // バリデーション
          if (!code) {
            showError('商品コードを入力してください');
            return;
          }
          
          // 在庫データを作成
          const inventoryData = {
            code,
            name,
            quantity,
            unit,
            lot,
            shelf,
            center: settings.center || '',
            user: settings.name || '',
            timestamp: new Date().toISOString()
          };
          
          // データを追加
          await addInventory(inventoryData);
          
          // 成功メッセージ
          showSuccess('商品を登録しました');
          
          // フォームリセット（商品コードのみクリア）
          document.getElementById('product-code').value = '';
          document.getElementById('product-name').value = '';
          document.getElementById('product-code').focus();
        } catch (error) {
          console.error('登録エラー:', error);
          showError('登録に失敗しました');
        }
      });
    }
    
    // ファイル入力イベントリスナー
    const importMaster = document.getElementById('import-master');
    if (importMaster) {
      importMaster.addEventListener('change', (e) => {
        importProductMaster(e.target.files[0]);
      });
    }
    
    const importStock = document.getElementById('import-stock');
    if (importStock) {
      importStock.addEventListener('change', (e) => {
        importStockData(e.target.files[0]);
      });
    }
    
    // エクスポートボタン
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportData);
    }
    
    // 設定フォーム
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings();
      });
    }
    
    // URL内のクエリパラメータをチェックして初期画面を設定
    const urlParams = new URLSearchParams(window.location.search);
    const screenParam = urlParams.get('screen');
    if (screenParam) {
      const screenId = screenParam + '-section';
      if (document.getElementById(screenId)) {
        showScreen(screenId);
      }
    }
    
    console.log('アプリケーション初期化完了');
  } catch (error) {
    console.error('初期化エラー:', error);
    showError('アプリケーションの初期化に失敗しました');
  }
});

// Service Workerの登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('Service Worker登録成功:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker登録失敗:', error);
      });
  });
}
