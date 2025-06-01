// 棚卸しアプリ - メインJavaScript
class InventoryApp {
    constructor() {
        this.db = null;
        this.currentScreen = 'main-menu';
        this.inventoryResults = [];
        this.products = [];
        this.stock = [];
        this.initialized = false;
        this.initTimeout = null;
        
        // サンプルデータ
        this.sampleProducts = [
            {"code": "P001", "name": "醤油 1L", "category": "調味料", "price": 300},
            {"code": "P002", "name": "みそ 1kg", "category": "調味料", "price": 500},
            {"code": "P003", "name": "米 5kg", "category": "穀物", "price": 2000},
            {"code": "P004", "name": "パン 6枚切り", "category": "パン", "price": 150},
            {"code": "P005", "name": "牛乳 1L", "category": "乳製品", "price": 200}
        ];
        
        this.sampleStock = [
            {"code": "P001", "name": "醤油 1L", "quantity": 50, "center": "東京センター", "lot": "L001"},
            {"code": "P002", "name": "みそ 1kg", "quantity": 30, "center": "東京センター", "lot": "L002"},
            {"code": "P003", "name": "米 5kg", "quantity": 100, "center": "大阪センター", "lot": "L003"},
            {"code": "P004", "name": "パン 6枚切り", "quantity": 20, "center": "東京センター", "lot": "L004"},
            {"code": "P005", "name": "牛乳 1L", "quantity": 25, "center": "名古屋センター", "lot": "L005"}
        ];
    }

    // アプリ初期化（タイムアウト付き）
    async init() {
        try {
            console.log('アプリ初期化開始');
            
            // 初期化タイムアウトを設定（3秒）
            this.initTimeout = setTimeout(() => {
                console.warn('初期化タイムアウト - サンプルデータで続行');
                this.forceInitWithSampleData();
            }, 3000);

            // IndexedDB初期化を試行
            await this.initDatabase();
            
            // データ読み込み
            await this.loadData();
            
            // 初期化完了
            clearTimeout(this.initTimeout);
            this.finishInitialization();
            
        } catch (error) {
            console.error('初期化エラー:', error);
            clearTimeout(this.initTimeout);
            // エラー時もサンプルデータで続行
            this.forceInitWithSampleData();
        }
    }

    // 強制的にサンプルデータで初期化
    forceInitWithSampleData() {
        console.log('サンプルデータで強制初期化');
        this.products = [...this.sampleProducts];
        this.stock = [...this.sampleStock];
        this.finishInitialization();
    }

    // 初期化完了処理
    finishInitialization() {
        this.initialized = true;
        this.hideLoading();
        this.setupEventListeners();
        this.updateDataCounts();
        this.showMessage('アプリが正常に起動しました', 'success');
        console.log('アプリ初期化完了');
    }

    // IndexedDB初期化
    async initDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('IndexedDB未対応 - メモリ内データを使用');
                resolve();
                return;
            }

            const request = indexedDB.open('InventoryDB', 1);
            let resolved = false;

            // タイムアウト処理
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn('IndexedDB接続タイムアウト');
                    resolve();
                }
            }, 2000);

            request.onerror = () => {
                clearTimeout(timeout);
                if (!resolved) {
                    resolved = true;
                    console.warn('IndexedDB接続エラー:', request.error);
                    resolve(); // エラーでも続行
                }
            };

            request.onsuccess = () => {
                clearTimeout(timeout);
                if (!resolved) {
                    resolved = true;
                    this.db = request.result;
                    console.log('IndexedDB接続成功');
                    resolve();
                }
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                try {
                    // 商品マスタ
                    if (!db.objectStoreNames.contains('products')) {
                        const productStore = db.createObjectStore('products', { keyPath: 'code' });
                        productStore.createIndex('name', 'name', { unique: false });
                    }

                    // 在庫データ
                    if (!db.objectStoreNames.contains('stock')) {
                        const stockStore = db.createObjectStore('stock', { keyPath: 'id', autoIncrement: true });
                        stockStore.createIndex('code', 'code', { unique: false });
                    }

                    // 棚卸し結果
                    if (!db.objectStoreNames.contains('inventory')) {
                        const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
                        inventoryStore.createIndex('code', 'code', { unique: false });
                        inventoryStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                } catch (error) {
                    console.error('DB作成エラー:', error);
                }
            };
        });
    }

    // データ読み込み
    async loadData() {
        try {
            if (this.db) {
                await this.loadFromIndexedDB();
            } else {
                throw new Error('IndexedDB未使用');
            }
        } catch (error) {
            console.warn('DB読み込みエラー - サンプルデータ使用:', error);
            this.products = [...this.sampleProducts];
            this.stock = [...this.sampleStock];
        }

        // データが空の場合はサンプルデータを使用
        if (this.products.length === 0) {
            console.log('商品データが空 - サンプルデータ読み込み');
            this.products = [...this.sampleProducts];
        }
        
        if (this.stock.length === 0) {
            console.log('在庫データが空 - サンプルデータ読み込み');
            this.stock = [...this.sampleStock];
        }
    }

    // IndexedDBからデータ読み込み
    async loadFromIndexedDB() {
        const transaction = this.db.transaction(['products', 'stock', 'inventory'], 'readonly');
        
        // 商品データ
        const productStore = transaction.objectStore('products');
        const productRequest = productStore.getAll();
        
        // 在庫データ
        const stockStore = transaction.objectStore('stock');
        const stockRequest = stockStore.getAll();
        
        // 棚卸し結果
        const inventoryStore = transaction.objectStore('inventory');
        const inventoryRequest = inventoryStore.getAll();

        return new Promise((resolve, reject) => {
            let completed = 0;
            const total = 3;

            const checkComplete = () => {
                completed++;
                if (completed === total) {
                    resolve();
                }
            };

            productRequest.onsuccess = () => {
                this.products = productRequest.result || [];
                checkComplete();
            };
            
            productRequest.onerror = () => {
                console.warn('商品データ読み込みエラー');
                this.products = [];
                checkComplete();
            };

            stockRequest.onsuccess = () => {
                this.stock = stockRequest.result || [];
                checkComplete();
            };
            
            stockRequest.onerror = () => {
                console.warn('在庫データ読み込みエラー');
                this.stock = [];
                checkComplete();
            };

            inventoryRequest.onsuccess = () => {
                this.inventoryResults = inventoryRequest.result || [];
                checkComplete();
            };
            
            inventoryRequest.onerror = () => {
                console.warn('棚卸しデータ読み込みエラー');
                this.inventoryResults = [];
                checkComplete();
            };
        });
    }

    // ローディング非表示
    hideLoading() {
        const loading = document.getElementById('loading');
        const mainApp = document.getElementById('main-app');
        
        if (loading) loading.classList.add('hidden');
        if (mainApp) mainApp.classList.remove('hidden');
    }

    // イベントリスナー設定
    setupEventListeners() {
        // メニューボタン
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.showScreen(screen);
            });
        });

        // 戻るボタン
        document.getElementById('back-btn').addEventListener('click', () => {
            this.showScreen('main-menu');
        });

        // 棚卸し機能
        this.setupInventoryListeners();

        // データ取り込み
        this.setupImportListeners();

        // データ出力
        this.setupExportListeners();

        // 設定
        this.setupSettingsListeners();
    }

    // 棚卸し機能のイベントリスナー
    setupInventoryListeners() {
        const codeInput = document.getElementById('product-code');
        const qrBtn = document.getElementById('qr-scan-btn');
        const registerBtn = document.getElementById('register-btn');

        // 商品コード入力
        codeInput.addEventListener('input', (e) => {
            this.searchProduct(e.target.value);
        });

        // QRスキャンボタン（モック）
        qrBtn.addEventListener('click', () => {
            this.showMessage('QRスキャン機能は開発中です', 'info');
            // デモ用にP001を入力
            codeInput.value = 'P001';
            this.searchProduct('P001');
        });

        // 登録ボタン
        registerBtn.addEventListener('click', () => {
            this.registerInventory();
        });

        // ロット選択
        document.getElementById('lot-select').addEventListener('change', (e) => {
            this.selectLot(e.target.value);
        });
    }

    // データ取り込み機能のイベントリスナー
    setupImportListeners() {
        document.getElementById('import-btn').addEventListener('click', () => {
            this.importData();
        });

        document.getElementById('load-sample-btn').addEventListener('click', () => {
            this.loadSampleData();
        });
    }

    // データ出力機能のイベントリスナー
    setupExportListeners() {
        document.getElementById('export-csv-btn').addEventListener('click', () => {
            this.exportData('csv');
        });

        document.getElementById('export-excel-btn').addEventListener('click', () => {
            this.exportData('excel');
        });
    }

    // 設定機能のイベントリスナー
    setupSettingsListeners() {
        document.getElementById('reset-data-btn').addEventListener('click', () => {
            this.resetData();
        });
    }

    // 画面切り替え
    showScreen(screenId) {
        // 全画面非表示
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });

        // 指定画面表示
        const targetScreen = document.getElementById(screenId === 'main-menu' ? 'main-menu' : `${screenId}-screen`);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
        }

        // ヘッダー更新
        const titles = {
            'main-menu': '棚卸しアプリ',
            'inventory': '棚卸し',
            'import': 'データ取り込み',
            'export': 'データ出力',
            'edit': '編集',
            'settings': '設定'
        };

        document.getElementById('page-title').textContent = titles[screenId] || '棚卸しアプリ';
        
        // 戻るボタン表示制御
        const backBtn = document.getElementById('back-btn');
        if (screenId === 'main-menu') {
            backBtn.classList.add('hidden');
        } else {
            backBtn.classList.remove('hidden');
        }

        this.currentScreen = screenId;

        // 画面固有の初期化
        if (screenId === 'export') {
            this.updateExportInfo();
        }
    }

    // 商品検索
    searchProduct(code) {
        const productDisplay = document.getElementById('product-name');
        const lotSection = document.getElementById('lot-section');
        const lotSelect = document.getElementById('lot-select');

        if (!code.trim()) {
            productDisplay.textContent = '商品コードを入力してください';
            productDisplay.className = 'product-display';
            lotSection.classList.add('hidden');
            return;
        }

        const product = this.products.find(p => p.code === code.toUpperCase());
        
        if (product) {
            productDisplay.textContent = product.name;
            productDisplay.className = 'product-display found';
            
            // ロット情報を検索
            const lots = this.stock.filter(s => s.code === code.toUpperCase());
            
            if (lots.length > 0) {
                lotSelect.innerHTML = '<option value="">ロットを選択</option>';
                lots.forEach(lot => {
                    const option = document.createElement('option');
                    option.value = JSON.stringify(lot);
                    option.textContent = `${lot.lot} (${lot.center}) - 在庫:${lot.quantity}`;
                    lotSelect.appendChild(option);
                });
                lotSection.classList.remove('hidden');
            } else {
                lotSection.classList.add('hidden');
            }
        } else {
            productDisplay.textContent = '商品が見つかりません（登録なし）';
            productDisplay.className = 'product-display not-found';
            lotSection.classList.add('hidden');
        }
    }

    // ロット選択
    selectLot(lotData) {
        if (!lotData) return;
        
        try {
            const lot = JSON.parse(lotData);
            document.getElementById('quantity').value = lot.quantity;
        } catch (error) {
            console.error('ロットデータ解析エラー:', error);
        }
    }

    // 棚卸し登録
    registerInventory() {
        const code = document.getElementById('product-code').value.trim();
        const quantity = document.getElementById('quantity').value;
        const unit = document.getElementById('unit').value.trim();
        const shelf = document.getElementById('shelf-number').value.trim();
        const lotSelect = document.getElementById('lot-select');

        if (!code) {
            this.showMessage('商品コードを入力してください', 'error');
            return;
        }

        if (!quantity || quantity < 0) {
            this.showMessage('数量を正しく入力してください', 'error');
            return;
        }

        const product = this.products.find(p => p.code === code.toUpperCase());
        let lotInfo = '';
        
        if (lotSelect.value) {
            try {
                const lot = JSON.parse(lotSelect.value);
                lotInfo = `${lot.lot} (${lot.center})`;
            } catch (error) {
                console.error('ロット情報エラー:', error);
            }
        }

        const inventoryItem = {
            id: Date.now(),
            code: code.toUpperCase(),
            name: product ? product.name : '登録なし',
            quantity: parseInt(quantity),
            unit: unit || '個',
            shelf: shelf,
            lot: lotInfo,
            timestamp: new Date().toISOString()
        };

        this.inventoryResults.push(inventoryItem);
        this.saveInventoryToDb(inventoryItem);
        this.updateInventoryDisplay();
        this.clearInventoryForm();
        
        this.showMessage('棚卸しデータを登録しました', 'success');
    }

    // IndexedDBに棚卸しデータ保存
    async saveInventoryToDb(item) {
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['inventory'], 'readwrite');
            const store = transaction.objectStore('inventory');
            store.add(item);
        } catch (error) {
            console.error('DB保存エラー:', error);
        }
    }

    // 棚卸し結果表示更新
    updateInventoryDisplay() {
        const resultsList = document.getElementById('results-list');
        
        if (this.inventoryResults.length === 0) {
            resultsList.innerHTML = '<p class="text-center">まだ登録がありません</p>';
            return;
        }

        resultsList.innerHTML = this.inventoryResults
            .slice(-5) // 最新5件のみ表示
            .reverse()
            .map(item => `
                <div class="result-item">
                    <div class="result-info">
                        <div class="result-product">${item.name}</div>
                        <div class="result-details">
                            コード: ${item.code} | 
                            ロット: ${item.lot || 'なし'} | 
                            棚: ${item.shelf || 'なし'}
                        </div>
                    </div>
                    <div class="result-quantity">${item.quantity}${item.unit}</div>
                </div>
            `).join('');
    }

    // 棚卸しフォームクリア
    clearInventoryForm() {
        document.getElementById('product-code').value = '';
        document.getElementById('product-name').textContent = '商品コードを入力してください';
        document.getElementById('product-name').className = 'product-display';
        document.getElementById('quantity').value = '';
        document.getElementById('shelf-number').value = '';
        document.getElementById('lot-section').classList.add('hidden');
    }

    // サンプルデータ読み込み
    loadSampleData() {
        this.products = [...this.sampleProducts];
        this.stock = [...this.sampleStock];
        this.updateDataCounts();
        this.showMessage('サンプルデータを読み込みました', 'success');
    }

    // データ取り込み
    importData() {
        this.showMessage('ファイル取り込み機能は開発中です', 'info');
    }

    // データ出力
    exportData(format) {
        if (this.inventoryResults.length === 0) {
            this.showMessage('出力するデータがありません', 'warning');
            return;
        }

        const csvData = this.generateCSV();
        
        if (format === 'csv') {
            this.downloadFile(csvData, 'inventory-results.csv', 'text/csv');
            this.showMessage('CSVファイルをダウンロードしました', 'success');
        } else {
            this.showMessage('Excel出力機能は開発中です', 'info');
        }
    }

    // CSV生成
    generateCSV() {
        const headers = ['商品コード', '商品名', '数量', '単位', 'ロット', '棚番号', '登録日時'];
        const rows = this.inventoryResults.map(item => [
            item.code,
            item.name,
            item.quantity,
            item.unit,
            item.lot || '',
            item.shelf || '',
            new Date(item.timestamp).toLocaleString('ja-JP')
        ]);
        
        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }

    // ファイルダウンロード
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 出力画面情報更新
    updateExportInfo() {
        document.getElementById('export-count').textContent = this.inventoryResults.length;
        const lastUpdate = this.inventoryResults.length > 0 
            ? new Date(this.inventoryResults[this.inventoryResults.length - 1].timestamp).toLocaleString('ja-JP')
            : '未実施';
        document.getElementById('last-update').textContent = lastUpdate;
    }

    // データリセット
    resetData() {
        if (confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
            this.inventoryResults = [];
            this.updateInventoryDisplay();
            this.updateDataCounts();
            this.showMessage('データをリセットしました', 'success');
        }
    }

    // データ件数更新
    updateDataCounts() {
        document.getElementById('product-count').textContent = `${this.products.length}件`;
        document.getElementById('stock-count').textContent = `${this.stock.length}件`;
    }

    // メッセージ表示
    showMessage(text, type = 'info') {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.classList.remove('hidden');

        setTimeout(() => {
            messageEl.classList.add('hidden');
        }, 3000);
    }
}

// Service Worker登録
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('data:application/javascript;base64,Ly8gU2VydmljZSBXb3JrZXIgZm9yIFBXQQpzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2luc3RhbGwnLCBldmVudCA9PiB7CiAgICBjb25zb2xlLmxvZygnU2VydmljZSBXb3JrZXIgaW5zdGFsbGVkJyk7Cn0pOwoKc2VsZi5hZGRFdmVudExpc3RlbmVyKCdhY3RpdmF0ZScsIGV2ZW50ID0+IHsKICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlIFdvcmtlciBhY3RpdmF0ZWQnKTsKfSk7CgpzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2ZldGNoJywgZXZlbnQgPT4gewogICAgLy8gTmV0d29yayBmaXJzdCBzdHJhdGVneQogICAgZXZlbnQucmVzcG9uZFdpdGgoZmV0Y2goZXZlbnQucmVxdWVzdCkpOwp9KTs=')
        .then(() => console.log('Service Worker 登録成功'))
        .catch(err => console.log('Service Worker 登録失敗:', err));
}

// アプリ起動
const app = new InventoryApp();

// DOM読み込み完了後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// エラーハンドリング
window.addEventListener('error', (event) => {
    console.error('グローバルエラー:', event.error);
    // エラーが発生してもアプリを停止させない
    if (!app.initialized) {
        app.forceInitWithSampleData();
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未処理Promise拒否:', event.reason);
    // エラーが発生してもアプリを停止させない
    event.preventDefault();
    if (!app.initialized) {
        app.forceInitWithSampleData();
    }
});

// アプリをグローバルに公開（デバッグ用）
window.inventoryApp = app;