// アプリケーション状態管理
class InventoryApp {
    constructor() {
        this.db = null;
        this.isOnline = navigator.onLine;
        this.currentScreen = 'loading';
        this.qrScanner = null;
        this.lastAction = null;
        this.initTimeout = null;
        this.settings = {
            staffName: '',
            centerName: '',
            outputFormat: 'csv'
        };
        
        // サンプルデータ
        this.sampleData = {
            products: [
                {"code": "A001", "name": "醤油", "category": "調味料", "price": 300, "manufacturer": "○○食品"},
                {"code": "A002", "name": "味噌", "category": "調味料", "price": 450, "manufacturer": "○○食品"},
                {"code": "B001", "name": "白米", "category": "食品", "price": 1200, "manufacturer": "△△農産"},
                {"code": "B002", "name": "玄米", "category": "食品", "price": 1500, "manufacturer": "△△農産"},
                {"code": "C001", "name": "牛乳", "category": "乳製品", "price": 200, "manufacturer": "××乳業"},
                {"code": "C002", "name": "ヨーグルト", "category": "乳製品", "price": 350, "manufacturer": "××乳業"},
                {"code": "D001", "name": "食パン", "category": "パン", "price": 150, "manufacturer": "◇◇ベーカリー"},
                {"code": "D002", "name": "菓子パン", "category": "パン", "price": 180, "manufacturer": "◇◇ベーカリー"},
                {"code": "E001", "name": "冷凍餃子", "category": "冷凍食品", "price": 400, "manufacturer": "□□フーズ"},
                {"code": "E002", "name": "冷凍チャーハン", "category": "冷凍食品", "price": 380, "manufacturer": "□□フーズ"}
            ],
            stock: [
                {"code": "A001", "name": "醤油", "quantity": 50, "center": "東京センター", "lot": "L2024001"},
                {"code": "A001", "name": "醤油", "quantity": 30, "center": "東京センター", "lot": "L2024002"},
                {"code": "A002", "name": "味噌", "quantity": 25, "center": "東京センター", "lot": "L2024003"},
                {"code": "B001", "name": "白米", "quantity": 100, "center": "大阪センター", "lot": "L2024004"},
                {"code": "B002", "name": "玄米", "quantity": 80, "center": "大阪センター", "lot": "L2024005"},
                {"code": "C001", "name": "牛乳", "quantity": 200, "center": "名古屋センター", "lot": "L2024006"},
                {"code": "C002", "name": "ヨーグルト", "quantity": 150, "center": "名古屋センター", "lot": "L2024007"},
                {"code": "D001", "name": "食パン", "quantity": 60, "center": "福岡センター", "lot": "L2024008"},
                {"code": "D002", "name": "菓子パン", "quantity": 40, "center": "福岡センター", "lot": "L2024009"},
                {"code": "E001", "name": "冷凍餃子", "quantity": 75, "center": "仙台センター", "lot": "L2024010"}
            ],
            centers: ["東京センター", "大阪センター", "名古屋センター", "福岡センター", "仙台センター"],
            units: ["個", "箱", "甲"]
        };
        
        // メモリ内データストレージ（IndexedDB失敗時のフォールバック）
        this.memoryData = {
            products: [...this.sampleData.products],
            stock: [...this.sampleData.stock],
            inventory: []
        };
    }

    // アプリケーション初期化（タイムアウト付き）
    async initialize() {
        try {
            this.updateLoadingMessage('アプリケーションを初期化中...');
            
            // 5秒タイムアウトを設定
            this.initTimeout = setTimeout(() => {
                this.showTimeoutOptions();
            }, 5000);

            // 設定を読み込み
            await this.loadSettings();
            
            // データベースを初期化（失敗してもメモリデータで続行）
            try {
                await this.initializeDatabase();
                await this.loadSampleDataToDB();
            } catch (dbError) {
                console.warn('データベース初期化失敗、メモリ内データで続行:', dbError);
                this.db = null;
            }
            
            // サービスワーカーを登録
            if ('serviceWorker' in navigator) {
                this.registerServiceWorker();
            }
            
            // オンライン状態を監視
            this.setupOnlineMonitoring();
            
            // 初期化完了
            clearTimeout(this.initTimeout);
            this.initializationComplete();
            
        } catch (error) {
            console.error('初期化エラー:', error);
            clearTimeout(this.initTimeout);
            this.handleInitializationError(error);
        }
    }

    // データベース初期化（タイムアウト付き）
    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('データベース初期化がタイムアウトしました'));
            }, 3000);

            try {
                const request = indexedDB.open('InventoryApp', 1);
                
                request.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('IndexedDBを開けませんでした'));
                };
                
                request.onsuccess = (event) => {
                    clearTimeout(timeout);
                    this.db = event.target.result;
                    resolve();
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // オブジェクトストアを作成
                    if (!db.objectStoreNames.contains('products')) {
                        db.createObjectStore('products', { keyPath: 'code' });
                    }
                    if (!db.objectStoreNames.contains('stock')) {
                        const stockStore = db.createObjectStore('stock', { keyPath: 'id', autoIncrement: true });
                        stockStore.createIndex('code', 'code', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('inventory')) {
                        const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
                        inventoryStore.createIndex('code', 'code', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    // サンプルデータをデータベースに保存
    async loadSampleDataToDB() {
        if (!this.db) return;

        try {
            // 商品データを保存
            const productTransaction = this.db.transaction(['products'], 'readwrite');
            const productStore = productTransaction.objectStore('products');
            
            for (const product of this.sampleData.products) {
                await new Promise((resolve, reject) => {
                    const request = productStore.put(product);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            // 在庫データを保存
            const stockTransaction = this.db.transaction(['stock'], 'readwrite');
            const stockStore = stockTransaction.objectStore('stock');
            
            for (const stockItem of this.sampleData.stock) {
                await new Promise((resolve, reject) => {
                    const request = stockStore.add(stockItem);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
        } catch (error) {
            console.warn('サンプルデータの保存に失敗:', error);
        }
    }

    // タイムアウト時の選択肢を表示
    showTimeoutOptions() {
        document.getElementById('loading-timeout').style.display = 'block';
        this.updateLoadingMessage('初期化に時間がかかっています。サンプルデータで続行できます。');
    }

    // サンプルデータで強制開始
    forceStart() {
        clearTimeout(this.initTimeout);
        this.updateLoadingMessage('サンプルデータでアプリを開始中...');
        
        // メモリ内データを使用
        this.db = null;
        setTimeout(() => {
            this.initializationComplete();
        }, 1000);
    }

    // 初期化完了
    initializationComplete() {
        this.hideLoadingScreen();
        this.showMainScreen();
        this.loadCenterOptions();
        this.updateDataCounts();
        this.showNotification('アプリが正常に初期化されました', 'success');
    }

    // 初期化エラー処理
    handleInitializationError(error) {
        this.showError('初期化に失敗しました: ' + error.message, () => {
            this.forceStart();
        });
    }

    // ローディング画面を非表示
    hideLoadingScreen() {
        document.getElementById('loading-screen').style.display = 'none';
    }

    // ローディングメッセージ更新
    updateLoadingMessage(message) {
        document.getElementById('loading-message').textContent = message;
    }

    // 画面切り替え
    showScreen(screenId) {
        // 全ての画面を非表示
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        
        // 指定された画面を表示
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = 'block';
            this.currentScreen = screenId.replace('-screen', '');
        }
    }

    // メイン画面表示
    showMainScreen() {
        this.showScreen('main-screen');
        this.updateStatusInfo();
    }

    // 棚卸し画面表示
    showInventoryScreen() {
        this.showScreen('inventory-screen');
        this.resetInventoryForm();
    }

    // データ取り込み画面表示
    showImportScreen() {
        this.showScreen('import-screen');
    }

    // データ出力画面表示
    showExportScreen() {
        this.showScreen('export-screen');
        this.updateExportCount();
    }

    // 編集画面表示
    showEditScreen() {
        this.showScreen('edit-screen');
        document.getElementById('search-input').value = '';
        document.getElementById('edit-list').innerHTML = '<p>検索結果がここに表示されます</p>';
    }

    // 設定画面表示
    showSettingsScreen() {
        this.showScreen('settings-screen');
        this.loadSettingsForm();
    }

    // データ確認画面表示
    showDataConfirmScreen() {
        this.showScreen('data-confirm-screen');
        this.updateDataCounts();
    }

    // 状態情報更新
    updateStatusInfo() {
        document.getElementById('center-name').textContent = this.settings.centerName || 'センター未設定';
        document.getElementById('staff-name').textContent = this.settings.staffName || '担当者未設定';
    }

    // QRスキャン開始
    async startQRScan() {
        try {
            const qrReaderElement = document.getElementById('qr-reader');
            qrReaderElement.style.display = 'block';
            
            if (this.qrScanner) {
                await this.qrScanner.stop();
            }
            
            this.qrScanner = new Html5Qrcode('qr-reader');
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            };
            
            await this.qrScanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    this.onQRScanSuccess(decodedText);
                },
                (errorMessage) => {
                    // QRスキャンエラーは頻繁に発生するため、コンソールログのみ
                    console.log('QR scan error:', errorMessage);
                }
            );
            
        } catch (error) {
            this.showError('QRスキャンを開始できませんでした: ' + error.message);
            document.getElementById('qr-reader').style.display = 'none';
        }
    }

    // QRスキャン成功時の処理
    async onQRScanSuccess(decodedText) {
        try {
            document.getElementById('product-code').value = decodedText;
            await this.stopQRScan();
            await this.lookupProduct(decodedText);
        } catch (error) {
            this.showError('QRコード処理中にエラーが発生しました: ' + error.message);
        }
    }

    // QRスキャン停止
    async stopQRScan() {
        if (this.qrScanner) {
            try {
                await this.qrScanner.stop();
                this.qrScanner = null;
            } catch (error) {
                console.error('QRスキャン停止エラー:', error);
            }
        }
        document.getElementById('qr-reader').style.display = 'none';
    }

    // 商品検索
    async lookupProduct(code) {
        if (!code) return;
        
        try {
            const product = await this.getProduct(code);
            const productNameElement = document.getElementById('product-name');
            
            if (product) {
                productNameElement.textContent = product.name;
                await this.loadLotOptions(code);
            } else {
                productNameElement.textContent = '登録なし';
                const lotSelect = document.getElementById('lot-select');
                lotSelect.innerHTML = '<option value="">ロットデータなし</option>';
            }
        } catch (error) {
            this.showError('商品検索中にエラーが発生しました: ' + error.message);
        }
    }

    // 商品データ取得
    async getProduct(code) {
        if (this.db) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('商品検索がタイムアウトしました'));
                }, 2000);

                const transaction = this.db.transaction(['products'], 'readonly');
                const store = transaction.objectStore('products');
                const request = store.get(code);
                
                request.onsuccess = () => {
                    clearTimeout(timeout);
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('商品データの取得に失敗しました'));
                };
            });
        } else {
            // メモリ内データから検索
            return this.memoryData.products.find(p => p.code === code);
        }
    }

    // ロット選択肢読み込み
    async loadLotOptions(code) {
        try {
            const stockItems = await this.getStockByCode(code);
            const lotSelect = document.getElementById('lot-select');
            
            lotSelect.innerHTML = '<option value="">ロットを選択...</option>';
            
            if (stockItems && stockItems.length > 0) {
                stockItems.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.lot;
                    option.textContent = `${item.lot} (在庫: ${item.quantity})`;
                    option.dataset.quantity = item.quantity;
                    lotSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'ロットデータなし';
                lotSelect.appendChild(option);
            }
        } catch (error) {
            this.showError('ロット情報の読み込みに失敗しました: ' + error.message);
        }
    }

    // 在庫データ取得
    async getStockByCode(code) {
        if (this.db) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('在庫検索がタイムアウトしました'));
                }, 2000);

                const transaction = this.db.transaction(['stock'], 'readonly');
                const store = transaction.objectStore('stock');
                const index = store.index('code');
                const request = index.getAll(code);
                
                request.onsuccess = () => {
                    clearTimeout(timeout);
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('在庫データの取得に失敗しました'));
                };
            });
        } else {
            // メモリ内データから検索
            return this.memoryData.stock.filter(s => s.code === code);
        }
    }

    // ロット変更時の処理
    onLotChange() {
        const lotSelect = document.getElementById('lot-select');
        const selectedOption = lotSelect.options[lotSelect.selectedIndex];
        
        if (selectedOption && selectedOption.dataset.quantity) {
            document.getElementById('quantity').value = selectedOption.dataset.quantity;
        }
    }

    // カスタムロット追加
    addCustomLot() {
        const customLot = document.getElementById('custom-lot').value.trim();
        if (!customLot) {
            this.showError('ロット番号を入力してください');
            return;
        }
        
        const lotSelect = document.getElementById('lot-select');
        const option = document.createElement('option');
        option.value = customLot;
        option.textContent = `${customLot} (新規)`;
        option.selected = true;
        
        lotSelect.appendChild(option);
        document.getElementById('custom-lot').value = '';
        document.getElementById('quantity').value = '';
        document.getElementById('quantity').focus();
    }

    // 棚卸しデータ登録
    async registerInventory() {
        try {
            const button = document.getElementById('register-btn');
            button.disabled = true;
            button.textContent = '登録中...';

            const data = this.collectInventoryData();
            
            if (!this.validateInventoryData(data)) {
                return;
            }

            await this.saveInventoryData(data);
            
            this.showNotification('棚卸しデータを登録しました', 'success');
            this.resetInventoryForm();
            
        } catch (error) {
            this.showError('登録に失敗しました: ' + error.message);
        } finally {
            const button = document.getElementById('register-btn');
            button.disabled = false;
            button.textContent = '登録';
        }
    }

    // 棚卸しデータ収集
    collectInventoryData() {
        return {
            code: document.getElementById('product-code').value.trim(),
            name: document.getElementById('product-name').textContent,
            lot: document.getElementById('lot-select').value,
            quantity: parseInt(document.getElementById('quantity').value) || 0,
            unit: document.getElementById('unit-select').value,
            shelfNumber: document.getElementById('shelf-number').value.trim(),
            staff: this.settings.staffName,
            center: this.settings.centerName,
            timestamp: new Date().toISOString()
        };
    }

    // 棚卸しデータ検証
    validateInventoryData(data) {
        if (!data.code) {
            this.showError('商品コードを入力してください');
            return false;
        }
        
        if (!data.lot) {
            this.showError('ロットを選択してください');
            return false;
        }
        
        if (data.quantity <= 0) {
            this.showError('数量を正しく入力してください');
            return false;
        }
        
        return true;
    }

    // 棚卸しデータ保存
    async saveInventoryData(data) {
        if (this.db) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('データ保存がタイムアウトしました'));
                }, 3000);

                const transaction = this.db.transaction(['inventory'], 'readwrite');
                const store = transaction.objectStore('inventory');
                const request = store.add(data);
                
                request.onsuccess = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                
                request.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('データの保存に失敗しました'));
                };
            });
        } else {
            // メモリ内データに保存
            data.id = Date.now();
            this.memoryData.inventory.push(data);
        }
    }

    // フォームリセット
    resetInventoryForm() {
        document.getElementById('product-code').value = '';
        document.getElementById('product-name').textContent = '商品を選択してください';
        document.getElementById('lot-select').innerHTML = '<option value="">ロットを選択...</option>';
        document.getElementById('quantity').value = '';
        document.getElementById('unit-select').value = '個';
        document.getElementById('shelf-number').value = '';
        document.getElementById('custom-lot').value = '';
    }

    // センター選択肢読み込み
    loadCenterOptions() {
        const centerSelect = document.getElementById('center-select');
        centerSelect.innerHTML = '<option value="">センターを選択...</option>';
        
        this.sampleData.centers.forEach(center => {
            const option = document.createElement('option');
            option.value = center;
            option.textContent = center;
            centerSelect.appendChild(option);
        });
    }

    // 設定読み込み
    async loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('inventoryAppSettings') || '{}');
            this.settings = { ...this.settings, ...saved };
        } catch (error) {
            console.warn('設定読み込みエラー:', error);
        }
    }

    // 設定保存
    async saveSettings() {
        try {
            this.settings.staffName = document.getElementById('staff-name-input').value.trim();
            this.settings.centerName = document.getElementById('center-select').value;
            this.settings.outputFormat = document.getElementById('output-format').value;
            
            localStorage.setItem('inventoryAppSettings', JSON.stringify(this.settings));
            this.updateStatusInfo();
            this.showNotification('設定を保存しました', 'success');
            
        } catch (error) {
            this.showError('設定の保存に失敗しました: ' + error.message);
        }
    }

    // 設定フォーム読み込み
    loadSettingsForm() {
        document.getElementById('staff-name-input').value = this.settings.staffName;
        document.getElementById('center-select').value = this.settings.centerName;
        document.getElementById('output-format').value = this.settings.outputFormat;
    }

    // データ件数更新
    async updateDataCounts() {
        try {
            const counts = await this.getDataCounts();
            document.getElementById('product-count').textContent = counts.products;
            document.getElementById('stock-count').textContent = counts.stock;
            document.getElementById('inventory-count').textContent = counts.inventory;
        } catch (error) {
            console.error('データ件数取得エラー:', error);
        }
    }

    // データ件数取得
    async getDataCounts() {
        return {
            products: this.memoryData.products.length,
            stock: this.memoryData.stock.length,
            inventory: this.memoryData.inventory.length
        };
    }

    // エクスポート件数更新
    async updateExportCount() {
        try {
            const count = this.memoryData.inventory.length;
            document.getElementById('export-count').textContent = `登録件数: ${count}件`;
        } catch (error) {
            console.error('エクスポート件数取得エラー:', error);
        }
    }

    // 棚卸しデータエクスポート
    async exportInventoryData() {
        try {
            const data = this.memoryData.inventory;
            
            if (data.length === 0) {
                this.showError('エクスポートするデータがありません');
                return;
            }
            
            const csvContent = this.convertToCSV(data);
            this.downloadFile(csvContent, 'inventory_data.csv', 'text/csv');
            this.showNotification('データをダウンロードしました', 'success');
            
        } catch (error) {
            this.showError('データエクスポートに失敗しました: ' + error.message);
        }
    }

    // CSV変換
    convertToCSV(data) {
        const headers = ['商品コード', '商品名', 'ロット', '数量', '単位', '棚番号', '担当者', 'センター', '登録日時'];
        const rows = data.map(item => [
            item.code,
            item.name,
            item.lot,
            item.quantity,
            item.unit,
            item.shelfNumber,
            item.staff,
            item.center,
            new Date(item.timestamp).toLocaleString('ja-JP')
        ]);
        
        return [headers, ...rows].map(row => 
            row.map(field => `"${field}"`).join(',')
        ).join('\n');
    }

    // ファイルダウンロード
    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // 全データクリア
    async clearAllData() {
        if (confirm('本当に全てのデータを削除しますか？この操作は取り消せません。')) {
            try {
                this.memoryData.inventory = [];
                localStorage.removeItem('inventoryAppSettings');
                this.settings = { staffName: '', centerName: '', outputFormat: 'csv' };
                this.updateStatusInfo();
                this.showNotification('全データを削除しました', 'success');
            } catch (error) {
                this.showError('データ削除に失敗しました: ' + error.message);
            }
        }
    }

    // サービスワーカー登録
    async registerServiceWorker() {
        try {
            // 簡易的なサービスワーカー登録
            const swCode = `
                self.addEventListener('install', event => {
                    self.skipWaiting();
                });
                
                self.addEventListener('activate', event => {
                    event.waitUntil(self.clients.claim());
                });
            `;
            
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            const registration = await navigator.serviceWorker.register(swUrl);
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    // オンライン状態監視
    setupOnlineMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.hideOfflineIndicator();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showOfflineIndicator();
        });
    }

    // オフライン表示
    showOfflineIndicator() {
        let indicator = document.getElementById('offline-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'offline-indicator';
            indicator.className = 'offline-indicator';
            indicator.textContent = 'オフラインモードで動作中';
            document.body.appendChild(indicator);
        }
        indicator.classList.add('show');
    }

    // オフライン表示非表示
    hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.classList.remove('show');
        }
    }

    // エラー表示
    showError(message, retryCallback = null) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-modal').style.display = 'flex';
        
        const retryButton = document.getElementById('retry-button');
        if (retryCallback) {
            retryButton.style.display = 'inline-block';
            this.lastAction = retryCallback;
        } else {
            retryButton.style.display = 'none';
            this.lastAction = null;
        }
    }

    // 通知表示
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `sw-notification show`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="btn btn--secondary" onclick="this.parentElement.remove()">閉じる</button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// グローバル関数
let app;

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
    app = new InventoryApp();
    app.initialize();
});

// 画面遷移関数
function showMainScreen() { app.showMainScreen(); }
function showInventoryScreen() { app.showInventoryScreen(); }
function showImportScreen() { app.showImportScreen(); }
function showExportScreen() { app.showExportScreen(); }
function showEditScreen() { app.showEditScreen(); }
function showSettingsScreen() { app.showSettingsScreen(); }
function showDataConfirmScreen() { app.showDataConfirmScreen(); }

// 棚卸し機能
function startQRScan() { app.startQRScan(); }
function onLotChange() { app.onLotChange(); }
function addCustomLot() { app.addCustomLot(); }
function registerInventory() { app.registerInventory(); }

// 設定機能
function saveSettings() { app.saveSettings(); }
function clearAllData() { app.clearAllData(); }

// エクスポート機能
function exportInventoryData() { app.exportInventoryData(); }

// エラーモーダル制御
function closeErrorModal() {
    document.getElementById('error-modal').style.display = 'none';
}

function retryLastAction() {
    closeErrorModal();
    if (app.lastAction) {
        app.lastAction();
    }
}

// 強制開始
function forceStart() {
    app.forceStart();
}

// 商品コード入力時の処理
document.addEventListener('DOMContentLoaded', () => {
    // 商品コード入力時の自動検索
    setTimeout(() => {
        const productCodeInput = document.getElementById('product-code');
        if (productCodeInput) {
            productCodeInput.addEventListener('input', async (event) => {
                const code = event.target.value.trim();
                if (code && app) {
                    await app.lookupProduct(code);
                }
            });
            
            productCodeInput.addEventListener('blur', async (event) => {
                const code = event.target.value.trim();
                if (code && app) {
                    await app.lookupProduct(code);
                }
            });
        }
    }, 100);
});

// その他のユーティリティ関数
function validateFile(input, type) {
    const file = input.files[0];
    if (file && file.type === 'text/csv') {
        document.getElementById('import-btn').disabled = false;
    }
}

function importData() {
    app.showError('データ取り込み機能は開発中です');
}

function searchInventoryData() {
    const searchTerm = document.getElementById('search-input').value.trim();
    const editList = document.getElementById('edit-list');
    
    if (searchTerm && app) {
        const results = app.memoryData.inventory.filter(item => 
            item.code.includes(searchTerm) || item.name.includes(searchTerm)
        );
        
        if (results.length > 0) {
            editList.innerHTML = results.map(item => `
                <div class="edit-item">
                    <div class="edit-item-info">
                        <h4>${item.code} - ${item.name}</h4>
                        <p>ロット: ${item.lot}, 数量: ${item.quantity}${item.unit}</p>
                    </div>
                    <div class="edit-item-actions">
                        <button class="btn btn--sm btn--outline">編集</button>
                        <button class="btn btn--sm btn--error">削除</button>
                    </div>
                </div>
            `).join('');
        } else {
            editList.innerHTML = '<p>検索結果がありません</p>';
        }
    } else {
        editList.innerHTML = '<p>検索結果がここに表示されます</p>';
    }
}