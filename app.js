// app.js - 棚卸し管理PWAアプリケーション - 完全実装版

class InventoryApp {
    constructor() {
        // データベース設定
        this.dbName = 'InventoryDB';
        this.dbVersion = 1;
        this.db = null;
        
        // アプリケーションデータ
        this.inventoryData = [];
        this.masterData = [];
        this.stockData = [];
        this.settings = {
            userName: '',
            centerName: '東京センター',
            codeType: 'QR',
            outputFormat: 'CSV'
        };

        // QRスキャナー関連
        this.qrScanner = null;
        this.isScanning = false;
        
        // UI状態
        this.currentScreen = 'main-menu';
        this.selectedItems = new Set();

        // 初期化
        this.init();
    }

    async init() {
        try {
            // まずローディングを隠してUIを表示
            this.hideLoading();
            
            // バックグラウンドでデータベース初期化
            await this.initDatabase();
            await this.loadAllData();
            this.setupEventListeners();
            this.checkUrlParams();
            
            console.log('アプリケーション初期化完了');
        } catch (error) {
            console.error('初期化エラー:', error);
            // エラーが発生してもUIは表示する
            this.hideLoading();
            this.setupEventListeners();
            this.showMessage('データベースの初期化に失敗しましたが、基本機能は利用できます', 'warning');
        }
    }

    // ローディング画面を非表示
    hideLoading() {
        setTimeout(() => {
            const loading = document.getElementById('loading');
            if (loading) {
                loading.style.display = 'none';
            }
            // メインメニューを確実に表示
            this.showScreen('main-menu');
        }, 500);
    }

    // IndexedDB初期化
    async initDatabase() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = () => {
                    console.error('IndexedDB open error:', request.error);
                    resolve(); // エラーでも処理を続行
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('IndexedDB初期化成功');
                    resolve();
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    try {
                        // 棚卸しデータストア
                        if (!db.objectStoreNames.contains('inventory')) {
                            const inventoryStore = db.createObjectStore('inventory', { 
                                keyPath: 'id', 
                                autoIncrement: true 
                            });
                            inventoryStore.createIndex('code', 'code', { unique: false });
                            inventoryStore.createIndex('timestamp', 'timestamp', { unique: false });
                        }
                        
                        // 商品マスタストア
                        if (!db.objectStoreNames.contains('master')) {
                            const masterStore = db.createObjectStore('master', { 
                                keyPath: 'code' 
                            });
                            masterStore.createIndex('name', 'name', { unique: false });
                        }
                        
                        // 在庫データストア
                        if (!db.objectStoreNames.contains('stock')) {
                            const stockStore = db.createObjectStore('stock', { 
                                keyPath: 'id', 
                                autoIncrement: true 
                            });
                            stockStore.createIndex('code', 'code', { unique: false });
                        }
                        
                        // 設定ストア
                        if (!db.objectStoreNames.contains('settings')) {
                            db.createObjectStore('settings', { keyPath: 'key' });
                        }
                    } catch (upgradeError) {
                        console.error('Database upgrade error:', upgradeError);
                    }
                };
            } catch (error) {
                console.error('IndexedDB initialization error:', error);
                resolve(); // エラーでも処理を続行
            }
        });
    }

    // 全データ読み込み
    async loadAllData() {
        try {
            if (!this.db) {
                // データベースが利用できない場合はサンプルデータを使用
                this.initSampleDataMemory();
                return;
            }
            
            this.inventoryData = await this.getFromDB('inventory') || [];
            this.masterData = await this.getFromDB('master') || [];
            this.stockData = await this.getFromDB('stock') || [];
            
            const savedSettings = await this.getSettingFromDB('userSettings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...savedSettings.value };
            }
            
            // サンプルデータ（初回のみ）
            if (this.masterData.length === 0) {
                await this.initSampleData();
            }
        } catch (error) {
            console.error('データ読み込みエラー:', error);
            this.initSampleDataMemory();
        }
    }

    // メモリ上でサンプルデータを初期化
    initSampleDataMemory() {
        this.masterData = [
            { code: '4901234567890', name: 'サンプル商品A', description: '商品Aの説明' },
            { code: '4901234567891', name: 'サンプル商品B', description: '商品Bの説明' },
            { code: '4901234567892', name: 'サンプル商品C', description: '商品Cの説明' }
        ];
        
        this.stockData = [
            { code: '4901234567890', center: '東京センター', warehouse: 'A倉庫', stock: 100 },
            { code: '4901234567891', center: '東京センター', warehouse: 'B倉庫', stock: 50 },
            { code: '4901234567892', center: '大阪センター', warehouse: 'C倉庫', stock: 75 }
        ];
        
        console.log('サンプルデータをメモリに読み込みました');
    }

    // サンプルデータ初期化
    async initSampleData() {
        const sampleMaster = [
            { code: '4901234567890', name: 'サンプル商品A', description: '商品Aの説明' },
            { code: '4901234567891', name: 'サンプル商品B', description: '商品Bの説明' },
            { code: '4901234567892', name: 'サンプル商品C', description: '商品Cの説明' }
        ];
        
        const sampleStock = [
            { code: '4901234567890', center: '東京センター', warehouse: 'A倉庫', stock: 100 },
            { code: '4901234567891', center: '東京センター', warehouse: 'B倉庫', stock: 50 },
            { code: '4901234567892', center: '大阪センター', warehouse: 'C倉庫', stock: 75 }
        ];
        
        try {
            await this.saveToDB('master', sampleMaster);
            await this.saveToDB('stock', sampleStock);
            this.masterData = sampleMaster;
            this.stockData = sampleStock;
        } catch (error) {
            console.error('サンプルデータ保存エラー:', error);
            this.masterData = sampleMaster;
            this.stockData = sampleStock;
        }
    }

    // IndexedDBからデータ取得
    async getFromDB(storeName) {
        if (!this.db) return [];
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onerror = () => resolve([]);
                request.onsuccess = () => resolve(request.result || []);
            } catch (error) {
                console.error('DB取得エラー:', error);
                resolve([]);
            }
        });
    }

    // IndexedDBに配列データ保存
    async saveToDB(storeName, dataArray) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                // 既存データをクリア
                store.clear();
                
                // 新しいデータを追加
                dataArray.forEach(item => {
                    store.add(item);
                });
                
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => resolve(); // エラーでも続行
            } catch (error) {
                console.error('DB保存エラー:', error);
                resolve();
            }
        });
    }

    // 単一アイテムをDBに追加
    async addToDB(storeName, item) {
        if (!this.db) return null;
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(item);
                
                request.onerror = () => resolve(null);
                request.onsuccess = () => resolve(request.result);
            } catch (error) {
                console.error('DB追加エラー:', error);
                resolve(null);
            }
        });
    }

    // DBから削除
    async deleteFromDB(storeName, key) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(key);
                
                request.onerror = () => resolve();
                request.onsuccess = () => resolve();
            } catch (error) {
                console.error('DB削除エラー:', error);
                resolve();
            }
        });
    }

    // 設定をDBに保存
    async saveSettingToDB(key, value) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['settings'], 'readwrite');
                const store = transaction.objectStore('settings');
                const request = store.put({ key, value });
                
                request.onerror = () => resolve();
                request.onsuccess = () => resolve();
            } catch (error) {
                console.error('設定保存エラー:', error);
                resolve();
            }
        });
    }

    // 設定をDBから取得
    async getSettingFromDB(key) {
        if (!this.db) return null;
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['settings'], 'readonly');
                const store = transaction.objectStore('settings');
                const request = store.get(key);
                
                request.onerror = () => resolve(null);
                request.onsuccess = () => resolve(request.result);
            } catch (error) {
                console.error('設定取得エラー:', error);
                resolve(null);
            }
        });
    }

    // URLパラメータチェック
    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const screen = urlParams.get('screen');
        if (screen && ['inventory', 'import', 'export', 'edit', 'settings'].includes(screen)) {
            this.showScreen(screen);
        } else {
            this.showScreen('main-menu');
        }
    }

    // イベントリスナー設定
    setupEventListeners() {
        // メインメニューボタン
        document.querySelectorAll('.main-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.showScreen(screen);
            });
        });

        // 戻るボタン
        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showScreen('main-menu');
            });
        });

        // 棚卸し機能
        this.setupInventoryListeners();
        
        // データ取り込み機能
        this.setupImportListeners();
        
        // データ出力機能
        this.setupExportListeners();
        
        // 編集機能
        this.setupEditListeners();
        
        // 設定機能
        this.setupSettingsListeners();
        
        // 確認ダイアログ
        this.setupDialogListeners();
    }

    // 棚卸し機能のイベントリスナー
    setupInventoryListeners() {
        const startBtn = document.getElementById('start-camera');
        const stopBtn = document.getElementById('stop-camera');
        const codeInput = document.getElementById('product-code');
        const quantityInput = document.getElementById('quantity');
        const registerBtn = document.getElementById('register-btn');

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startQRScanner());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopQRScanner());
        }

        if (codeInput) {
            codeInput.addEventListener('input', (e) => {
                this.lookupProduct(e.target.value);
            });
        }

        if (quantityInput) {
            quantityInput.addEventListener('focus', (e) => {
                if (e.target.value === '1') {
                    e.target.select();
                }
            });
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', () => this.registerInventoryItem());
        }
    }

    // QRスキャナー開始
    startQRScanner() {
        const readerElement = document.getElementById('qr-reader');
        const startBtn = document.getElementById('start-camera');
        const stopBtn = document.getElementById('stop-camera');
        const statusElement = document.getElementById('camera-status');
        
        if (!readerElement) return;
        
        // Html5Qrcodeが利用可能かチェック
        if (typeof Html5Qrcode === 'undefined') {
            this.showMessage('QRスキャナーライブラリが読み込まれていません', 'error');
            return;
        }

        try {
            this.qrScanner = new Html5Qrcode('qr-reader');
            
            const config = {
                fps: 10,
                qrbox: { width: 200, height: 200 },
                aspectRatio: 1.0
            };

            this.qrScanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    this.onQRCodeScanned(decodedText);
                },
                (errorMessage) => {
                    // エラーメッセージは表示しない（継続的にスキャンするため）
                }
            ).then(() => {
                this.isScanning = true;
                if (startBtn) startBtn.classList.add('hidden');
                if (stopBtn) stopBtn.classList.remove('hidden');
                if (statusElement) statusElement.textContent = 'QRコードをスキャンしてください';
            }).catch(err => {
                console.error('QRスキャナー開始エラー:', err);
                this.showMessage('カメラの起動に失敗しました。手動でコードを入力してください。', 'warning');
                if (statusElement) statusElement.textContent = 'カメラアクセスエラー - 手動入力をご利用ください';
            });
        } catch (error) {
            console.error('QRスキャナー初期化エラー:', error);
            this.showMessage('QRスキャナーの初期化に失敗しました', 'error');
        }
    }

    // QRスキャナー停止
    stopQRScanner() {
        if (this.qrScanner && this.isScanning) {
            this.qrScanner.stop().then(() => {
                this.qrScanner.clear();
                this.qrScanner = null;
                this.isScanning = false;
                
                const startBtn = document.getElementById('start-camera');
                const stopBtn = document.getElementById('stop-camera');
                const statusElement = document.getElementById('camera-status');
                
                if (startBtn) startBtn.classList.remove('hidden');
                if (stopBtn) stopBtn.classList.add('hidden');
                if (statusElement) statusElement.textContent = 'カメラを開始してQRコードをスキャンしてください';
            }).catch(err => {
                console.error('QRスキャナー停止エラー:', err);
            });
        }
    }

    // QRコード読み取り成功時
    onQRCodeScanned(decodedText) {
        this.playBeepSound();
        
        const codeInput = document.getElementById('product-code');
        if (codeInput) {
            codeInput.value = decodedText;
        }
        
        this.lookupProduct(decodedText);
        this.stopQRScanner();
        
        this.showMessage('QRコードを読み取りました', 'success');
    }

    // ビープ音再生
    playBeepSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.error('ビープ音再生エラー:', error);
        }
    }

    // 商品検索
    lookupProduct(code) {
        if (!code) {
            const productInfo = document.getElementById('product-info');
            if (productInfo) productInfo.classList.add('hidden');
            return;
        }

        const product = this.masterData.find(item => item.code === code);
        const productInfo = document.getElementById('product-info');
        
        if (product && productInfo) {
            const nameElement = document.getElementById('product-name');
            const descElement = document.getElementById('product-description');
            
            if (nameElement) nameElement.textContent = product.name;
            if (descElement) descElement.textContent = product.description || '';
            
            productInfo.classList.remove('hidden');
        } else if (productInfo) {
            productInfo.classList.add('hidden');
            if (code.length > 3) {
                this.showMessage('商品マスタに登録されていません', 'warning');
            }
        }
    }

    // 棚卸しアイテム登録
    async registerInventoryItem() {
        const codeInput = document.getElementById('product-code');
        const quantityInput = document.getElementById('quantity');
        const unitSelect = document.getElementById('unit');
        const lotInput = document.getElementById('lot');
        
        if (!codeInput || !quantityInput || !unitSelect) {
            this.showMessage('入力フィールドが見つかりません', 'error');
            return;
        }
        
        const code = codeInput.value.trim();
        const quantity = parseInt(quantityInput.value);
        const unit = unitSelect.value;
        const lot = lotInput ? lotInput.value.trim() : '';
        
        if (!code || !quantity || quantity < 1) {
            this.showMessage('コードと数量を正しく入力してください', 'error');
            return;
        }
        
        const product = this.masterData.find(item => item.code === code);
        if (!product) {
            this.showMessage('商品マスタに登録されていない商品です', 'error');
            return;
        }
        
        const inventoryItem = {
            code: code,
            name: product.name,
            quantity: quantity,
            unit: unit,
            lot: lot || '',
            timestamp: new Date().toISOString(),
            user: this.settings.userName || '未設定',
            center: this.settings.centerName
        };
        
        try {
            // DBに保存を試行
            const id = await this.addToDB('inventory', inventoryItem);
            if (id) {
                inventoryItem.id = id;
            } else {
                // DBに保存できない場合は一意IDを生成
                inventoryItem.id = Date.now() + Math.random();
            }
            
            this.inventoryData.push(inventoryItem);
            
            this.showMessage(`${product.name} を登録しました`, 'success');
            this.resetInventoryForm();
        } catch (error) {
            console.error('登録エラー:', error);
            this.showMessage('登録に失敗しました', 'error');
        }
    }

    // 棚卸しフォームリセット
    resetInventoryForm() {
        const elements = {
            'product-code': '',
            'quantity': '1',
            'unit': '個',
            'lot': ''
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = value;
        });
        
        const productInfo = document.getElementById('product-info');
        if (productInfo) productInfo.classList.add('hidden');
    }

    // データ取り込み機能のイベントリスナー
    setupImportListeners() {
        const importBtn = document.getElementById('import-btn');
        const importFile = document.getElementById('import-file');

        if (importBtn) {
            importBtn.addEventListener('click', () => this.importData());
        }

        if (importFile) {
            importFile.addEventListener('change', (e) => {
                const fileName = e.target.files[0]?.name || '';
                if (fileName && importBtn) {
                    importBtn.textContent = `📥 ${fileName} を取り込み`;
                }
            });
        }
    }

    // データ取り込み
    async importData() {
        const fileInput = document.getElementById('import-file');
        const importType = document.getElementById('import-type');
        
        if (!fileInput || !importType) {
            this.showMessage('必要な要素が見つかりません', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        if (!file) {
            this.showMessage('ファイルを選択してください', 'error');
            return;
        }
        
        // XLSXライブラリが利用可能かチェック
        if (typeof XLSX === 'undefined') {
            this.showMessage('Excelライブラリが読み込まれていません', 'error');
            return;
        }
        
        const progressSection = document.getElementById('import-progress');
        const progressFill = progressSection?.querySelector('.progress-fill');
        const progressText = progressSection?.querySelector('.progress-text');
        
        if (progressSection) progressSection.classList.remove('hidden');
        if (progressFill) progressFill.style.width = '10%';
        if (progressText) progressText.textContent = 'ファイルを読み込み中...';
        
        try {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    if (progressFill) progressFill.style.width = '50%';
                    if (progressText) progressText.textContent = 'データ処理中...';
                    
                    let parsedData = [];
                    
                    if (file.name.toLowerCase().endsWith('.csv')) {
                        const csvText = e.target.result;
                        parsedData = this.parseCSV(csvText);
                    } else {
                        const workbook = XLSX.read(e.target.result, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                        
                        if (rawData.length > 1) {
                            const headers = rawData[0];
                            parsedData = rawData.slice(1).map(row => {
                                const obj = {};
                                headers.forEach((header, i) => {
                                    obj[header] = row[i] || '';
                                });
                                return obj;
                            }).filter(row => Object.values(row).some(val => val !== ''));
                        }
                    }
                    
                    if (progressFill) progressFill.style.width = '80%';
                    if (progressText) progressText.textContent = 'データベースに保存中...';
                    
                    const storeName = importType.value === 'master' ? 'master' : 'stock';
                    await this.saveToDB(storeName, parsedData);
                    
                    if (importType.value === 'master') {
                        this.masterData = parsedData;
                    } else {
                        this.stockData = parsedData;
                    }
                    
                    if (progressFill) progressFill.style.width = '100%';
                    if (progressText) progressText.textContent = '完了!';
                    
                    setTimeout(() => {
                        if (progressSection) progressSection.classList.add('hidden');
                    }, 1000);
                    
                    this.showMessage(`${parsedData.length}件のデータを取り込みました`, 'success');
                    fileInput.value = '';
                    
                } catch (err) {
                    console.error('データ処理エラー:', err);
                    this.showMessage('ファイル形式が正しくないか、処理中にエラーが発生しました', 'error');
                    if (progressSection) progressSection.classList.add('hidden');
                }
            };
            
            reader.onerror = () => {
                this.showMessage('ファイルの読み込みに失敗しました', 'error');
                if (progressSection) progressSection.classList.add('hidden');
            };
            
            if (file.name.toLowerCase().endsWith('.csv')) {
                reader.readAsText(file, 'UTF-8');
            } else {
                reader.readAsArrayBuffer(file);
            }
            
        } catch (error) {
            console.error('インポートエラー:', error);
            this.showMessage('ファイルの処理中にエラーが発生しました', 'error');
            if (progressSection) progressSection.classList.add('hidden');
        }
    }

    // CSV解析
    parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.some(v => v !== '')) {
                const item = {};
                headers.forEach((header, index) => {
                    item[header] = values[index] || '';
                });
                data.push(item);
            }
        }
        
        return data;
    }

    // データ出力機能のイベントリスナー
    setupExportListeners() {
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }
    }

    // データ出力プレビュー更新
    updateExportPreview() {
        const inventoryCount = document.getElementById('inventory-count');
        const masterCount = document.getElementById('master-count');
        const stockCount = document.getElementById('stock-count');
        
        if (inventoryCount) inventoryCount.textContent = `${this.inventoryData.length}件`;
        if (masterCount) masterCount.textContent = `${this.masterData.length}件`;
        if (stockCount) stockCount.textContent = `${this.stockData.length}件`;
    }

    // データ出力
    exportData() {
        const formatSelect = document.getElementById('export-format');
        if (!formatSelect) {
            this.showMessage('出力形式選択が見つかりません', 'error');
            return;
        }
        
        const format = formatSelect.value;
        
        if (this.inventoryData.length === 0) {
            this.showMessage('出力するデータがありません', 'warning');
            return;
        }
        
        try {
            if (format === 'csv') {
                this.exportCSV();
            } else {
                this.exportExcel();
            }
        } catch (error) {
            console.error('エクスポートエラー:', error);
            this.showMessage('データの出力に失敗しました', 'error');
        }
    }

    // CSV出力
    exportCSV() {
        const headers = ['ID', 'コード', '商品名', '数量', '単位', 'ロット', '登録日時', '登録者', 'センター'];
        
        const rows = this.inventoryData.map(item => [
            item.id || '',
            item.code,
            item.name,
            item.quantity,
            item.unit,
            item.lot,
            new Date(item.timestamp).toLocaleString('ja-JP'),
            item.user,
            item.center || this.settings.centerName
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
            
        this.downloadFile(csvContent, '棚卸しデータ.csv', 'text/csv;charset=utf-8;');
    }

    // Excel出力
    exportExcel() {
        // XLSXライブラリが利用可能かチェック
        if (typeof XLSX === 'undefined') {
            this.showMessage('Excelライブラリが読み込まれていません', 'error');
            return;
        }
        
        try {
            const headers = ['ID', 'コード', '商品名', '数量', '単位', 'ロット', '登録日時', '登録者', 'センター'];
            
            const rows = this.inventoryData.map(item => [
                item.id || '',
                item.code,
                item.name,
                item.quantity,
                item.unit,
                item.lot,
                new Date(item.timestamp).toLocaleString('ja-JP'),
                item.user,
                item.center || this.settings.centerName
            ]);
            
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "棚卸しデータ");
            
            XLSX.writeFile(workbook, '棚卸しデータ.xlsx');
            
            this.showMessage('Excelファイルをダウンロードしました', 'success');
        } catch (error) {
            console.error('Excel出力エラー:', error);
            this.showMessage('Excelファイルの作成に失敗しました', 'error');
        }
    }

    // ファイルダウンロード（CSV用）
    downloadFile(content, filename, mimeType) {
        const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
        const blob = new Blob([BOM + content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('ファイルをダウンロードしました', 'success');
    }

    // 編集機能のイベントリスナー
    setupEditListeners() {
        const searchInput = document.getElementById('search-input');
        const selectAllBtn = document.getElementById('select-all-btn');
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');
        const clearAllBtn = document.getElementById('clear-all-btn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterInventoryList(e.target.value);
            });
        }

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAllItems());
        }

        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => this.deleteSelectedItems());
        }

        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => this.confirmClearAllData());
        }
    }

    // 在庫リスト読み込み
    loadInventoryList() {
        const listContainer = document.getElementById('inventory-list');
        if (!listContainer) return;
        
        this.selectedItems.clear();
        
        if (this.inventoryData.length === 0) {
            listContainer.innerHTML = `
                <div class="no-data">
                    <div class="no-data-icon">📋</div>
                    <p>棚卸しデータがありません</p>
                </div>
            `;
            return;
        }
        
        listContainer.innerHTML = '';
        this.inventoryData.forEach((item, index) => {
            const itemElement = this.createInventoryListItem(item, index);
            listContainer.appendChild(itemElement);
        });
    }

    // 在庫リストアイテム作成
    createInventoryListItem(item, index) {
        const itemElement = document.createElement('div');
        itemElement.className = 'inventory-item';
        itemElement.dataset.id = item.id;
        
        itemElement.innerHTML = `
            <div class="inventory-item-header">
                <div class="inventory-item-checkbox"></div>
                <div class="inventory-item-name">${item.name}</div>
            </div>
            <div class="inventory-item-details">
                <div>コード: ${item.code}</div>
                <div>数量: ${item.quantity}${item.unit}</div>
                <div>ロット: ${item.lot || '未設定'}</div>
                <div>日時: ${new Date(item.timestamp).toLocaleString('ja-JP')}</div>
            </div>
            <div class="inventory-item-actions">
                <button class="btn btn--outline btn--sm delete-btn">削除</button>
            </div>
        `;
        
        // チェックボックス処理
        const checkbox = itemElement.querySelector('.inventory-item-checkbox');
        if (checkbox) {
            checkbox.addEventListener('click', () => {
                const itemId = item.id;
                if (this.selectedItems.has(itemId)) {
                    this.selectedItems.delete(itemId);
                    checkbox.classList.remove('checked');
                    itemElement.classList.remove('selected');
                } else {
                    this.selectedItems.add(itemId);
                    checkbox.classList.add('checked');
                    itemElement.classList.add('selected');
                }
            });
        }
        
        // 削除ボタン
        const deleteBtn = itemElement.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteInventoryItem(item.id);
            });
        }
        
        return itemElement;
    }

    // 在庫アイテム削除
    async deleteInventoryItem(id) {
        try {
            await this.deleteFromDB('inventory', id);
            this.inventoryData = this.inventoryData.filter(item => item.id !== id);
            this.loadInventoryList();
            this.showMessage('項目を削除しました', 'success');
        } catch (error) {
            console.error('削除エラー:', error);
            this.showMessage('削除に失敗しました', 'error');
        }
    }

    // 在庫リスト検索フィルター
    filterInventoryList(query) {
        const items = document.querySelectorAll('.inventory-item');
        
        if (!query) {
            items.forEach(item => item.style.display = 'block');
            return;
        }
        
        query = query.toLowerCase();
        
        items.forEach(item => {
            const name = item.querySelector('.inventory-item-name').textContent.toLowerCase();
            const details = item.querySelector('.inventory-item-details').textContent.toLowerCase();
            
            if (name.includes(query) || details.includes(query)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // 全選択
    selectAllItems() {
        const items = document.querySelectorAll('.inventory-item');
        const allSelected = this.inventoryData.length === this.selectedItems.size;
        
        if (allSelected) {
            this.selectedItems.clear();
            items.forEach(item => {
                item.classList.remove('selected');
                const checkbox = item.querySelector('.inventory-item-checkbox');
                if (checkbox) checkbox.classList.remove('checked');
            });
        } else {
            this.inventoryData.forEach(item => {
                this.selectedItems.add(item.id);
            });
            
            items.forEach(item => {
                item.classList.add('selected');
                const checkbox = item.querySelector('.inventory-item-checkbox');
                if (checkbox) checkbox.classList.add('checked');
            });
        }
    }

    // 選択アイテム削除
    deleteSelectedItems() {
        if (this.selectedItems.size === 0) {
            this.showMessage('削除する項目が選択されていません', 'warning');
            return;
        }
        
        this.showConfirmDialog(
            `${this.selectedItems.size}件の項目を削除しますか？`,
            async () => {
                try {
                    for (const id of this.selectedItems) {
                        await this.deleteFromDB('inventory', id);
                    }
                    
                    this.inventoryData = this.inventoryData.filter(
                        item => !this.selectedItems.has(item.id)
                    );
                    
                    this.selectedItems.clear();
                    this.loadInventoryList();
                    this.showMessage('選択した項目を削除しました', 'success');
                } catch (error) {
                    console.error('一括削除エラー:', error);
                    this.showMessage('削除に失敗しました', 'error');
                }
            }
        );
    }

    // 設定機能のイベントリスナー
    setupSettingsListeners() {
        const saveBtn = document.getElementById('save-settings-btn');
        const clearBtn = document.getElementById('clear-data-btn');
        const centerSelect = document.getElementById('center-name');
        const centerCustom = document.getElementById('center-name-custom');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.confirmClearAllData());
        }

        if (centerSelect && centerCustom) {
            centerSelect.addEventListener('change', (e) => {
                centerCustom.classList.toggle('hidden', e.target.value !== 'other');
            });
        }
    }

    // 設定の読み込み
    loadSettings() {
        const elements = {
            'user-name': this.settings.userName,
            'code-type': this.settings.codeType,
            'output-format': this.settings.outputFormat
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = value;
        });
        
        const centerSelect = document.getElementById('center-name');
        const centerCustom = document.getElementById('center-name-custom');
        
        if (centerSelect) {
            const predefinedCenters = ['東京センター', '大阪センター', '名古屋センター'];
            if (predefinedCenters.includes(this.settings.centerName)) {
                centerSelect.value = this.settings.centerName;
                if (centerCustom) centerCustom.classList.add('hidden');
            } else {
                centerSelect.value = 'other';
                if (centerCustom) {
                    centerCustom.value = this.settings.centerName;
                    centerCustom.classList.remove('hidden');
                }
            }
        }
    }

    // 設定の保存
    async saveSettings() {
        const elements = {
            userName: document.getElementById('user-name')?.value || '',
            codeType: document.getElementById('code-type')?.value || 'QR',
            outputFormat: document.getElementById('output-format')?.value || 'CSV'
        };
        
        const centerSelect = document.getElementById('center-name');
        const centerCustom = document.getElementById('center-name-custom');
        
        if (centerSelect) {
            elements.centerName = centerSelect.value === 'other' && centerCustom ? 
                centerCustom.value : centerSelect.value;
        }
        
        this.settings = { ...this.settings, ...elements };
        
        try {
            await this.saveSettingToDB('userSettings', this.settings);
            this.showMessage('設定を保存しました', 'success');
        } catch (error) {
            console.error('設定保存エラー:', error);
            this.showMessage('設定の保存に失敗しました', 'error');
        }
    }

    // 全データ削除確認
    confirmClearAllData() {
        this.showConfirmDialog(
            'すべてのデータを削除しますか？この操作は元に戻せません。',
            () => this.clearAllData()
        );
    }

    // 全データ削除
    async clearAllData() {
        try {
            await this.saveToDB('inventory', []);
            this.inventoryData = [];
            
            this.showMessage('全データを削除しました', 'success');
            
            if (this.currentScreen === 'edit') {
                this.loadInventoryList();
            } else if (this.currentScreen === 'export') {
                this.updateExportPreview();
            }
        } catch (error) {
            console.error('データ削除エラー:', error);
            this.showMessage('データの削除に失敗しました', 'error');
        }
    }

    // ダイアログのイベントリスナー
    setupDialogListeners() {
        const cancelBtn = document.getElementById('confirm-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideConfirmDialog();
            });
        }
    }

    // 確認ダイアログ表示
    showConfirmDialog(message, onConfirm) {
        const dialog = document.getElementById('confirm-dialog');
        const messageElement = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        
        if (!dialog || !messageElement || !okBtn) return;
        
        messageElement.textContent = message;
        
        // 既存のイベントリスナーを削除
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        
        // 新しいイベントリスナーを追加
        newOkBtn.addEventListener('click', () => {
            this.hideConfirmDialog();
            if (onConfirm) onConfirm();
        });
        
        dialog.classList.add('show');
    }

    // 確認ダイアログ非表示
    hideConfirmDialog() {
        const dialog = document.getElementById('confirm-dialog');
        if (dialog) {
            dialog.classList.remove('show');
        }
    }

    // 画面切り替え
    showScreen(screenId) {
        // QRスキャナーを停止
        if (this.isScanning && screenId !== 'inventory') {
            this.stopQRScanner();
        }
        
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.classList.remove('active'));

        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;

            // 画面固有の初期化処理
            switch (screenId) {
                case 'edit':
                    this.loadInventoryList();
                    break;
                case 'export':
                    this.updateExportPreview();
                    break;
                case 'settings':
                    this.loadSettings();
                    break;
                case 'inventory':
                    this.resetInventoryForm();
                    break;
            }
        }
    }

    // メッセージ表示
    showMessage(text, type = 'success') {
        const message = document.getElementById('message');
        const messageText = document.getElementById('message-text');
        
        if (!message || !messageText) return;
        
        message.className = `message ${type}`;
        messageText.textContent = text;
        
        message.classList.add('show');
        
        setTimeout(() => {
            message.classList.remove('show');
        }, 3000);
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new InventoryApp();
});