class InventoryPWA {
  constructor() {
    this.db = null;
    this.centerNames = [];
    this.settings = {
      name: '',
      center: '',
      codeType: 'QR',
      outputFormat: 'csv'
    };
    this.init();
  }

  async init() {
    await this.initDB();
    this.loadSettings();
    this.setupEventListeners();
  }

  // IndexedDBの初期化（バルク挿入対応）
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('InventoryDB', 3);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('inventory')) {
          db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('stock')) {
          const stockStore = db.createObjectStore('stock', {
            keyPath: ['code', 'lot'],
            autoIncrement: false
          });
          stockStore.createIndex('warehouse', 'warehouse');
        }
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'code' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  setupEventListeners() {
    document.getElementById('import-stock').addEventListener('change', (e) => {
      this.importStockData(e.target.files[0]);
    });
    document.getElementById('import-master').addEventListener('change', (e) => {
      this.importProductMaster(e.target.files[0]);
    });
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettingsForm();
    });
    document.getElementById('data-clear-btn').addEventListener('click', () => {
      this.clearAllData();
    });
    document.getElementById('clear-all-btn').addEventListener('click', () => {
      this.clearAllInventory();
    });
    // 棚卸し登録
    document.getElementById('inventory-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.registerInventory();
    });
    // QRコードスキャン
    document.getElementById('qr-btn').addEventListener('click', () => {
      this.startQRScan();
    });
    document.getElementById('close-qr').addEventListener('click', () => {
      this.stopQRScan();
    });
    document.getElementById('torch-btn').addEventListener('click', () => {
      this.toggleTorch();
    });
    // 商品コード入力
    document.getElementById('product-code').addEventListener('change', () => {
      this.onCodeInput();
    });
  }

  // 設定の保存と読み込み
  loadSettings() {
    const s = localStorage.getItem('settings');
    if (s) {
      this.settings = JSON.parse(s);
    }
    this.updateCenterList();
  }
  async saveSettingsForm() {
    this.settings.name = document.getElementById('setting-name').value.trim();
    this.settings.center = document.getElementById('setting-center').value.trim();
    this.settings.codeType = document.getElementById('setting-code-type').value;
    this.settings.outputFormat = document.getElementById('setting-output-format').value;
    localStorage.setItem('settings', JSON.stringify(this.settings));
    alert('設定保存完了');
  }

  // 在庫データの取り込み（最適化版）
  async importStockData(file) {
    if (!file) return;
    try {
      this.showLoading('在庫データ処理中...');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const headers = rows[0];

      // 必須列のインデックス取得
      const colIdx = {
        code: headers.indexOf('商品番号'),
        name: headers.indexOf('商品名称'),
        stock: headers.indexOf('即時在庫数量'),
        warehouse: headers.indexOf('倉庫名'),
        lot: headers.indexOf('ロットNo.')
      };
      if (Object.values(colIdx).some(i => i === -1)) {
        throw new Error('必要な列が見つかりません');
      }

      // データ抽出と変換
      const stockData = rows.slice(1).map((row, i) => {
        return {
          code: String(row[colIdx.code] ?? '').trim(),
          name: String(row[colIdx.name] ?? '').trim(),
          stock: Number(row[colIdx.stock]) || 0,
          warehouse: String(row[colIdx.warehouse] ?? '').trim(),
          lot: String(row[colIdx.lot] ?? '').trim(),
          timestamp: new Date().toISOString()
        };
      }).filter(item => item.code && item.warehouse);

      // センター名抽出
      this.centerNames = [...new Set(stockData.map(d => d.warehouse).filter(Boolean))];
      this.updateCenterList();

      await this.bulkInsertStock(stockData);
      this.hideLoading();
      this.showSuccess(`${stockData.length}件の在庫データを取込完了`);
    } catch (err) {
      this.hideLoading();
      console.error('在庫データ取込エラー:', err);
      this.showError('在庫データの処理に失敗しました');
    }
  }

  // 商品マスタ取込
  async importProductMaster(file) {
    if (!file) return;
    try {
      this.showLoading('商品マスタ取込中...');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      await this.bulkInsertProducts(json);
      this.hideLoading();
      alert(`商品マスタ ${json.length}件取込完了`);
    } catch (err) {
      this.hideLoading();
      console.error('商品マスタ取込エラー:', err);
      this.showError('商品マスタの取込に失敗');
    }
  }

  // CSV/Excel出力
  async exportData() {
    const data = await this.getAllInventory();
    if (!data.length) {
      alert('データがありません');
      return;
    }
    const format = document.getElementById('export-format').value;
    if (format === 'csv') {
      this.exportCSV(data);
    } else {
      this.exportExcel(data);
    }
  }
  exportCSV(data) {
    const headers = ['コード','商品名','数量','単位','ロット','棚番号','センター名','担当者','登録日時'];
    const csvContent = [headers.join(',')];
    data.forEach(d => {
      csvContent.push([
        `"${d.code}"`,
        `"${d.name}"`,
        d.quantity,
        `"${d.unit}"`,
        `"${d.lot}"`,
        `"${d.shelf}"`,
        `"${d.center}"`,
        `"${d.user}"`,
        `"${new Date(d.timestamp).toLocaleString()}"`,
      ].join(','));
    });
    const blob = new Blob(['\uFEFF' + csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, 'inventory.csv');
  }
  exportExcel(data) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '棚卸し');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    this.downloadBlob(blob, 'inventory.xlsx');
  }
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 棚卸し登録
  async registerInventory() {
    const code = document.getElementById('product-code').value.trim();
    const name = document.getElementById('product-name').value.trim();
    const quantity = Number(document.getElementById('quantity').value) || 1;
    const unit = document.getElementById('unit').value;
    const lot = document.getElementById('lot').value.trim();
    const shelf = document.getElementById('shelf').value.trim();
    if (!code) {
      alert('商品コードを入力してください');
      return;
    }
    const item = {
      code,
      name,
      quantity,
      unit,
      lot,
      shelf,
      center: this.settings.center,
      user: this.settings.name,
      timestamp: new Date().toISOString()
    };
    await this.addInventory(item);
    this.playBeep();
    alert('登録完了');
    this.resetForm();
  }
  resetForm() {
    document.getElementById('product-code').value = '';
    document.getElementById('product-name').value = '';
    document.getElementById('quantity').value = 1;
    document.getElementById('unit').value = '個';
    document.getElementById('lot').value = '';
    document.getElementById('shelf').value = '';
  }

  // 商品コード入力
  async onCodeInput() {
    const code = document.getElementById('product-code').value.trim();
    if (!code) {
      document.getElementById('product-name').value = '';
      return;
    }
    const product = await this.getProduct(code);
    if (product) {
      document.getElementById('product-name').value = product.name;
    } else {
      if (confirm('商品が見つかりません。登録しますか？')) {
        document.getElementById('product-name').value = '';
      }
    }
  }

  // QRコードスキャン
  startQRScan() {
    if (this.html5QrCode) return;
    document.getElementById('qr-reader').classList.remove('hidden');
    document.getElementById('torch-btn').style.display = 'block';
    this.html5QrCode = new Html5Qrcode('qr-video');
    this.html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        document.getElementById('product-code').value = decodedText;
        this.onCodeInput();
        this.stopQRScan();
        this.playBeep();
      },
      (err) => {}
    ).catch((err) => {
      alert('カメラ起動失敗');
    });
    this.initTorch();
  }
  stopQRScan() {
    if (!this.html5QrCode) return;
    this.html5QrCode.stop().then(() => {
      this.html5QrCode = null;
      document.getElementById('qr-reader').classList.add('hidden');
      document.getElementById('torch-btn').style.display = 'none';
    });
  }
  toggleTorch() {
    if (!this.html5QrCode) return;
    this.html5QrCode.getRunningTrackCameraCapabilities().then((cap) => {
      if (cap.torch) {
        this.torchOn = !this.torchOn;
        cap.torch.apply(this.torchOn);
        this.updateTorchButton();
      }
    });
  }
  initTorch() {
    this.torchOn = false;
    this.updateTorchButton();
  }
  updateTorchButton() {
    const btn = document.getElementById('torch-btn');
    btn.textContent = this.torchOn ? '💡' : '💡';
    btn.style.backgroundColor = this.torchOn ? '#ffe066' : '';
  }

  // データベース操作
  async addInventory(item) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(['inventory'], 'readwrite');
      tx.objectStore('inventory').add(item).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async getProduct(code) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(['products'], 'readonly');
      tx.objectStore('products').get(code).onsuccess = (e) => {
        res(e.target.result);
      };
    });
  }
  async bulkInsertProducts(products) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');
      let count = 0;
      products.forEach(p => {
        store.put({ code: p['商品コード'] ?? p['コード'], name: p['商品名'] ?? '' });
        count++;
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async getAllInventory() {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(['inventory'], 'readonly');
      tx.objectStore('inventory').getAll().onsuccess = (e) => {
        res(e.target.result);
      };
    });
  }
  async clearAllInventory() {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(['inventory'], 'readwrite');
      tx.objectStore('inventory').clear().onsuccess = () => res();
    });
  }

  // Utility
  playBeep() {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.value = 0.2;
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  showLoading(msg) {
    if (document.getElementById('loading')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loading';
    overlay.innerHTML = `<div class="loading">${msg}</div>`;
    document.body.appendChild(overlay);
  }
  hideLoading() {
    document.getElementById('loading')?.remove();
  }
}

const app = new InventoryPWA();
