// 棚卸し管理PWAアプリケーション
class InventoryApp {
    constructor() {
        this.db = null;
        this.html5QrCode = null;
        this.currentEditId = null;
        this.isScanning = false;
        this.currentSettings = {
            name: '',
            center: '',
            codeType: 'QR',
            outputFormat: 'csv',
            centerNames: []
        };
        
        this.init();
    }

    async init() {
        await this.initDB();
        await this.loadSettings();
        this.initEventListeners();
        this.initSampleData();
        this.registerServiceWorker();
        this.showScreen('main-menu');
    }

    // IndexedDB初期化
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('InventoryDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 棚卸しデータストア
                if (!db.objectStoreNames.contains('inventory')) {
                    const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
                    inventoryStore.createIndex('code', 'code', { unique: false });
                    inventoryStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // 商品マスタストア
                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', { keyPath: 'code' });
                    productStore.createIndex('name', 'name', { unique: false });
                }
                
                // 在庫データストア
                if (!db.objectStoreNames.contains('stock')) {
                    const stockStore = db.createObjectStore('stock', { keyPath: 'id', autoIncrement: true });
                    stockStore.createIndex('code', 'code', { unique: false });
                    stockStore.createIndex('center', 'center', { unique: false });
                }
                
                // 設定ストア
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // サンプルデータ初期化
    async initSampleData() {
        const sampleProducts = [
            {"code": "4901234567890", "name": "サンプル商品A", "price": 100},
            {"code": "4901234567891", "name": "サンプル商品B", "price": 200}
        ];
        
        const sampleStock = [
            {"center": "東京倉庫", "code": "4901234567890", "lot": "LOT001", "stock": 50},
            {"center": "大阪倉庫", "code": "4901234567891", "lot": "LOT002", "stock": 30}
        ];

        // 商品マスタがない場合のみサンプルデータを追加
        const productCount = await this.countData('products');
        if (productCount === 0) {
            for (const product of sampleProducts) {
                await this.saveData('products', product);
            }
        }

        // 在庫データがない場合のみサンプルデータを追加
        const stockCount = await this.countData('stock');
        if (stockCount === 0) {
            for (const stock of sampleStock) {
                await this.saveData('stock', stock);
            }
            // センター名を更新
            this.currentSettings.centerNames = ['東京倉庫', '大阪倉庫'];
            await this.saveSettings();
        }
    }

    // データ件数取得
    async countData(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Service Worker登録
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // Service Workerのコードを動的に作成
                const swCode = `
                const CACHE_NAME = 'inventory-app-v1';
                const urlsToCache = [
                    '/',
                    '/index.html',
                    '/style.css',
                    '/app.js',
                    'https://seiumiyata.github.io/invent2/html5-qrcode.min.js',
                    'https://seiumiyata.github.io/invent2/xlsx.full.min.js'
                ];

                self.addEventListener('install', event => {
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then(cache => cache.addAll(urlsToCache))
                    );
                });

                self.addEventListener('fetch', event => {
                    event.respondWith(
                        caches.match(event.request)
                            .then(response => {
                                if (response) {
                                    return response;
                                }
                                return fetch(event.request);
                            }
                        )
                    );
                });
                `;
                
                const swBlob = new Blob([swCode], { type: 'application/javascript' });
                const swUrl = URL.createObjectURL(swBlob);
                await navigator.serviceWorker.register(swUrl);
            } catch (error) {
                console.warn('Service Worker registration failed:', error);
            }
        }
    }

    // イベントリスナー初期化
    initEventListeners() {
        // 画面遷移ボタン
        document.querySelectorAll('[data-screen]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screenName = e.target.getAttribute('data-screen');
                this.showScreen(screenName);
            });
        });

        // QRスキャンボタン
        document.getElementById('qr-scan-btn').addEventListener('click', () => {
            this.startQRScan();
        });

        // QRスキャン停止ボタン
        document.getElementById('stop-scan').addEventListener('click', () => {
            this.stopQRScan();
        });

        // ライトトグルボタン
        document.getElementById('light-toggle').addEventListener('click', () => {
            this.toggleLight();
        });

        // 商品コード入力変更
        document.getElementById('product-code').addEventListener('input', (e) => {
            this.lookupProduct(e.target.value);
        });

        // 登録ボタン
        document.getElementById('register-btn').addEventListener('click', () => {
            this.registerInventory();
        });

        // ファイル取り込みボタン
        document.getElementById('import-products').addEventListener('click', () => {
            this.importProducts();
        });

        document.getElementById('import-stock').addEventListener('click', () => {
            this.importStock();
        });

        // ダウンロードボタン
        document.getElementById('download-btn').addEventListener('click', () => {
            this.exportData();
        });

        // 設定保存ボタン
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettingsForm();
        });

        // データクリアボタン
        document.getElementById('clear-all-data').addEventListener('click', () => {
            this.clearAllData();
        });

        // 一括削除ボタン
        document.getElementById('delete-all-btn').addEventListener('click', () => {
            this.deleteAllInventory();
        });

        // モーダル関連
        document.getElementById('save-edit').addEventListener('click', () => {
            this.saveEdit();
        });

        document.getElementById('delete-item').addEventListener('click', () => {
            this.deleteItem();
        });

        document.getElementById('cancel-edit').addEventListener('click', () => {
            this.hideModal();
        });

        // モーダル背景クリック
        document.getElementById('edit-modal').addEventListener('click', (e) => {
            if (e.target.id === 'edit-modal') {
                this.hideModal();
            }
        });
    }

    // 画面表示
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        document.getElementById(screenName).classList.add('active');

        // 画面固有の初期化
        if (screenName === 'edit') {
            this.loadDataList();
        } else if (screenName === 'settings') {
            this.loadSettingsForm();
        }
    }

    // QRスキャン開始
    async startQRScan() {
        try {
            const qrReader = document.getElementById('qr-reader');
            qrReader.classList.remove('hidden');
            
            this.html5QrCode = new Html5Qrcode("qr-reader-element");
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };

            await this.html5QrCode.start(
                { facingMode: "environment" },
                config,
                (decodedText, decodedResult) => {
                    this.playBeep();
                    document.getElementById('product-code').value = decodedText;
                    this.lookupProduct(decodedText);
                    this.stopQRScan();
                },
                (errorMessage) => {
                    // エラーは無視（継続スキャン）
                }
            );
            
            this.isScanning = true;
        } catch (error) {
            console.error('QRスキャン開始エラー:', error);
            alert('カメラの起動に失敗しました。');
        }
    }

    // QRスキャン停止
    async stopQRScan() {
        if (this.html5QrCode && this.isScanning) {
            try {
                await this.html5QrCode.stop();
                document.getElementById('qr-reader').classList.add('hidden');
                this.isScanning = false;
            } catch (error) {
                console.error('QRスキャン停止エラー:', error);
            }
        }
    }

    // ライトトグル
    async toggleLight() {
        if (this.html5QrCode && this.isScanning) {
            try {
                const track = this.html5QrCode.getRunningTrackCameraCapabilities();
                if (track && track.torch) {
                    await track.applyConstraints({
                        advanced: [{ torch: !track.getSettings().torch }]
                    });
                }
            } catch (error) {
                console.error('ライト制御エラー:', error);
            }
        }
    }

    // ビープ音再生
    playBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'square';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            console.error('ビープ音再生エラー:', error);
        }
    }

    // 商品検索
    async lookupProduct(code) {
        if (!code) return;
        
        try {
            const product = await this.getData('products', code);
            const nameInput = document.getElementById('product-name');
            
            if (product) {
                nameInput.value = product.name;
            } else {
                nameInput.value = '';
            }
        } catch (error) {
            console.error('商品検索エラー:', error);
        }
    }

    // 棚卸し登録
    async registerInventory() {
        try {
            const code = document.getElementById('product-code').value.trim();
            const name = document.getElementById('product-name').value.trim();
            const quantity = parseInt(document.getElementById('quantity').value) || 1;
            const unit = document.getElementById('unit').value;
            const lot = document.getElementById('lot').value.trim();
            const shelf = document.getElementById('shelf').value.trim();

            if (!code) {
                alert('商品コードを入力してください。');
                return;
            }

            const inventoryData = {
                code,
                name,
                quantity,
                unit,
                lot,
                shelf,
                center: this.currentSettings.center,
                user: this.currentSettings.name,
                timestamp: new Date().toISOString()
            };

            await this.saveData('inventory', inventoryData);
            
            this.showSuccessMessage('登録が完了しました。');
            this.clearInventoryForm();
            
        } catch (error) {
            console.error('登録エラー:', error);
            alert('登録に失敗しました。');
        }
    }

    // フォームクリア
    clearInventoryForm() {
        document.getElementById('product-code').value = '';
        document.getElementById('product-name').value = '';
        document.getElementById('quantity').value = '1';
        document.getElementById('lot').value = '';
        document.getElementById('shelf').value = '';
        document.getElementById('product-code').focus();
    }

    // 成功メッセージ表示
    showSuccessMessage(message) {
        const existingMessage = document.querySelector('.success-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'success-message';
        messageDiv.textContent = message;
        
        const registerBtn = document.getElementById('register-btn');
        registerBtn.parentNode.insertBefore(messageDiv, registerBtn);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }

    // ファイル取り込み（商品マスタ）
    async importProducts() {
        const fileInput = document.getElementById('product-file');
        const file = fileInput.files[0];
        
        if (!file) {
            alert('ファイルを選択してください。');
            return;
        }

        try {
            this.showStatus('商品マスタを取り込み中...');
            
            const data = await this.readExcelFile(file);
            const worksheet = data.Sheets[data.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            let importCount = 0;
            for (const row of jsonData) {
                if (row['商品コード'] && row['商品名']) {
                    const product = {
                        code: String(row['商品コード']),
                        name: String(row['商品名']),
                        price: Number(row['単価']) || 0,
                        category: String(row['カテゴリ']) || ''
                    };
                    await this.saveData('products', product);
                    importCount++;
                }
            }

            this.hideStatus();
            alert(`${importCount}件の商品マスタを取り込みました。`);
            fileInput.value = '';
            
        } catch (error) {
            this.hideStatus();
            console.error('商品マスタ取り込みエラー:', error);
            alert('商品マスタの取り込みに失敗しました。');
        }
    }

    // ファイル取り込み（在庫データ）
    async importStock() {
        const fileInput = document.getElementById('stock-file');
        const file = fileInput.files[0];
        
        if (!file) {
            alert('ファイルを選択してください。');
            return;
        }

        try {
            this.showStatus('在庫データを取り込み中...');
            
            const data = await this.readExcelFile(file);
            const worksheet = data.Sheets[data.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            let importCount = 0;
            const centerNames = new Set(this.currentSettings.centerNames);

            for (const row of jsonData) {
                if (row['センター名'] && row['商品コード']) {
                    const stock = {
                        center: String(row['センター名']),
                        code: String(row['商品コード']),
                        lot: String(row['ロット']) || '',
                        stock: Number(row['在庫数']) || 0
                    };
                    await this.saveData('stock', stock);
                    centerNames.add(stock.center);
                    importCount++;
                }
            }

            this.currentSettings.centerNames = Array.from(centerNames);
            await this.saveSettings();

            this.hideStatus();
            alert(`${importCount}件の在庫データを取り込みました。`);
            fileInput.value = '';
            
        } catch (error) {
            this.hideStatus();
            console.error('在庫データ取り込みエラー:', error);
            alert('在庫データの取り込みに失敗しました。');
        }
    }

    // Excelファイル読み込み
    async readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    resolve(workbook);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // データ出力
    async exportData() {
        try {
            const format = document.getElementById('export-format').value;
            const inventoryData = await this.getAllData('inventory');
            
            if (inventoryData.length === 0) {
                alert('出力するデータがありません。');
                return;
            }

            const exportData = inventoryData.map(item => ({
                '商品コード': item.code,
                '商品名': item.name,
                '数量': item.quantity,
                '単位': item.unit,
                'ロット': item.lot,
                '棚番号': item.shelf,
                'センター名': item.center,
                '担当者': item.user,
                '登録日時': new Date(item.timestamp).toLocaleString('ja-JP')
            }));

            if (format === 'csv') {
                this.downloadCSV(exportData);
            } else {
                this.downloadExcel(exportData);
            }
            
        } catch (error) {
            console.error('データ出力エラー:', error);
            alert('データ出力に失敗しました。');
        }
    }

    // CSV出力
    downloadCSV(data) {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `棚卸しデータ_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Excel出力
    downloadExcel(data) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '棚卸しデータ');
        XLSX.writeFile(workbook, `棚卸しデータ_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    // データ一覧読み込み
    async loadDataList() {
        try {
            const inventoryData = await this.getAllData('inventory');
            const listContainer = document.getElementById('data-list');
            
            listContainer.innerHTML = '';
            
            if (inventoryData.length === 0) {
                listContainer.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">登録されたデータがありません。</p>';
                return;
            }

            inventoryData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            inventoryData.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'data-item';
                itemDiv.addEventListener('click', () => this.editItem(item));
                
                itemDiv.innerHTML = `
                    <div class="data-item-header">
                        <span class="data-item-code">${item.code}</span>
                        <span class="data-item-timestamp">${new Date(item.timestamp).toLocaleString('ja-JP')}</span>
                    </div>
                    <div class="data-item-details">
                        ${item.name} / ${item.quantity}${item.unit} / ロット:${item.lot} / 棚:${item.shelf}
                    </div>
                `;
                
                listContainer.appendChild(itemDiv);
            });
            
        } catch (error) {
            console.error('データ一覧読み込みエラー:', error);
        }
    }

    // アイテム編集
    editItem(item) {
        this.currentEditId = item.id;
        
        document.getElementById('edit-code').value = item.code;
        document.getElementById('edit-name').value = item.name;
        document.getElementById('edit-quantity').value = item.quantity;
        document.getElementById('edit-unit').value = item.unit;
        document.getElementById('edit-lot').value = item.lot;
        document.getElementById('edit-shelf').value = item.shelf;
        
        this.showModal();
    }

    // 編集保存
    async saveEdit() {
        try {
            const updatedItem = {
                id: this.currentEditId,
                code: document.getElementById('edit-code').value,
                name: document.getElementById('edit-name').value,
                quantity: parseInt(document.getElementById('edit-quantity').value),
                unit: document.getElementById('edit-unit').value,
                lot: document.getElementById('edit-lot').value,
                shelf: document.getElementById('edit-shelf').value,
                center: this.currentSettings.center,
                user: this.currentSettings.name,
                timestamp: new Date().toISOString()
            };

            await this.saveData('inventory', updatedItem);
            this.hideModal();
            this.loadDataList();
            
        } catch (error) {
            console.error('編集保存エラー:', error);
            alert('保存に失敗しました。');
        }
    }

    // アイテム削除
    async deleteItem() {
        if (confirm('このデータを削除しますか？')) {
            try {
                await this.deleteData('inventory', this.currentEditId);
                this.hideModal();
                this.loadDataList();
            } catch (error) {
                console.error('削除エラー:', error);
                alert('削除に失敗しました。');
            }
        }
    }

    // 全データ削除
    async deleteAllInventory() {
        if (confirm('すべての棚卸しデータを削除しますか？\nこの操作は取り消せません。')) {
            try {
                await this.clearStore('inventory');
                this.loadDataList();
                alert('すべてのデータを削除しました。');
            } catch (error) {
                console.error('一括削除エラー:', error);
                alert('削除に失敗しました。');
            }
        }
    }

    // 設定フォーム読み込み
    loadSettingsForm() {
        document.getElementById('user-name').value = this.currentSettings.name;
        document.getElementById('center-manual').value = this.currentSettings.center;
        document.getElementById('code-type').value = this.currentSettings.codeType;
        document.getElementById('output-format').value = this.currentSettings.outputFormat;

        // センター名ドロップダウン更新
        const centerSelect = document.getElementById('center-select');
        centerSelect.innerHTML = '<option value="">選択してください</option>';
        
        this.currentSettings.centerNames.forEach(centerName => {
            const option = document.createElement('option');
            option.value = centerName;
            option.textContent = centerName;
            centerSelect.appendChild(option);
        });

        centerSelect.addEventListener('change', (e) => {
            document.getElementById('center-manual').value = e.target.value;
        });
    }

    // 設定保存
    async saveSettingsForm() {
        try {
            this.currentSettings.name = document.getElementById('user-name').value.trim();
            this.currentSettings.center = document.getElementById('center-manual').value.trim();
            this.currentSettings.codeType = document.getElementById('code-type').value;
            this.currentSettings.outputFormat = document.getElementById('output-format').value;

            await this.saveSettings();
            alert('設定を保存しました。');
            
        } catch (error) {
            console.error('設定保存エラー:', error);
            alert('設定の保存に失敗しました。');
        }
    }

    // 全データクリア
    async clearAllData() {
        if (confirm('すべてのデータ（棚卸し、商品マスタ、在庫データ）を削除しますか？\nこの操作は取り消せません。')) {
            try {
                await this.clearStore('inventory');
                await this.clearStore('products');
                await this.clearStore('stock');
                
                this.currentSettings.centerNames = [];
                await this.saveSettings();
                
                alert('すべてのデータを削除しました。');
                
            } catch (error) {
                console.error('データクリアエラー:', error);
                alert('データクリアに失敗しました。');
            }
        }
    }

    // モーダル表示
    showModal() {
        const modal = document.getElementById('edit-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('show'), 10);
    }

    // モーダル非表示
    hideModal() {
        const modal = document.getElementById('edit-modal');
        modal.classList.remove('show');
        setTimeout(() => modal.classList.add('hidden'), 250);
    }

    // ステータス表示
    showStatus(message) {
        const status = document.getElementById('import-status');
        status.textContent = message;
        status.classList.remove('hidden');
    }

    // ステータス非表示
    hideStatus() {
        const status = document.getElementById('import-status');
        status.classList.add('hidden');
    }

    // データベース操作メソッド
    async saveData(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getData(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllData(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteData(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 設定関連
    async saveSettings() {
        await this.saveData('settings', { key: 'config', ...this.currentSettings });
    }

    async loadSettings() {
        try {
            const settings = await this.getData('settings', 'config');
            if (settings) {
                this.currentSettings = { ...this.currentSettings, ...settings };
            }
        } catch (error) {
            console.error('設定読み込みエラー:', error);
        }
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    window.inventoryApp = new InventoryApp();
});

// PWA Manifest作成
const manifest = {
    "name": "棚卸し管理アプリ",
    "short_name": "棚卸し",
    "description": "iPhone向け棚卸し管理PWAアプリ",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#fcfcf9",
    "theme_color": "#21808D",
    "orientation": "portrait",
    "icons": [
        {
            "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' fill='%2321808D'/%3E%3Ctext x='96' y='120' font-size='80' text-anchor='middle' fill='white'%3E📦%3C/text%3E%3C/svg%3E",
            "sizes": "192x192",
            "type": "image/svg+xml"
        }
    ]
};

// Manifest用のBlobを作成
const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
const manifestUrl = URL.createObjectURL(manifestBlob);

// Manifest linkを動的に追加
const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = manifestUrl;
document.head.appendChild(manifestLink);