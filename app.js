// 棚卸しPWAアプリケーション - JavaScript

class InventoryApp {
    constructor() {
        // データストレージ
        this.inventoryData = JSON.parse(localStorage.getItem('inventoryData')) || [];
        this.masterData = JSON.parse(localStorage.getItem('masterData')) || [
            {"code": "4901234567890", "name": "サンプル商品A", "description": "商品Aの説明"},
            {"code": "4901234567891", "name": "サンプル商品B", "description": "商品Bの説明"},
            {"code": "4901234567892", "name": "サンプル商品C", "description": "商品Cの説明"}
        ];
        this.stockData = JSON.parse(localStorage.getItem('stockData')) || [
            {"code": "4901234567890", "center": "東京センター", "warehouse": "A倉庫", "stock": 100},
            {"code": "4901234567891", "center": "東京センター", "warehouse": "B倉庫", "stock": 50},
            {"code": "4901234567892", "center": "大阪センター", "warehouse": "C倉庫", "stock": 75}
        ];
        this.settings = JSON.parse(localStorage.getItem('settings')) || {
            "userName": "",
            "centerName": "東京センター",
            "codeType": "QR",
            "outputFormat": "CSV",
            "inputFormat": "XLSX"
        };

        // カメラ関連
        this.cameraStream = null;
        this.isScanning = false;
        this.flashlight = false;

        // UI要素
        this.currentScreen = 'main-menu';
        this.selectedItems = new Set();

        // 初期化
        this.init();
    }

    init() {
        try {
            this.setupEventListeners();
            this.loadSettings();
            this.registerServiceWorker();
            this.hideLoading();
        } catch (error) {
            console.error('初期化エラー:', error);
            this.forceShowMainMenu();
        }
    }

    // 強制的にメインメニューを表示
    forceShowMainMenu() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
        this.showScreen('main-menu');
    }

    // ローディング画面を非表示
    hideLoading() {
        setTimeout(() => {
            try {
                const loading = document.getElementById('loading');
                if (loading) {
                    loading.style.display = 'none';
                }
                this.showScreen('main-menu');
            } catch (error) {
                console.error('Loading hide error:', error);
                this.forceShowMainMenu();
            }
        }, 1000);
    }

    // Service Worker登録
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // インラインService Worker
                const swCode = `
                const CACHE_NAME = 'inventory-app-v1';
                const urlsToCache = [
                    '/',
                    '/index.html',
                    '/style.css',
                    '/app.js'
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
                            .then(response => response || fetch(event.request))
                    );
                });
                `;
                
                const blob = new Blob([swCode], { type: 'application/javascript' });
                const swUrl = URL.createObjectURL(blob);
                await navigator.serviceWorker.register(swUrl);
                console.log('Service Worker registered');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    // イベントリスナー設定
    setupEventListeners() {
        // DOM要素の存在確認
        const mainBtns = document.querySelectorAll('.main-btn');
        const backBtns = document.querySelectorAll('.back-btn');

        // メインメニューボタン
        mainBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                this.showScreen(screen);
            });
        });

        // 戻るボタン
        backBtns.forEach(btn => {
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
    }

    // 棚卸し機能のイベントリスナー
    setupInventoryListeners() {
        const startCameraBtn = document.getElementById('start-camera');
        const toggleLightBtn = document.getElementById('toggle-light');
        const productCodeInput = document.getElementById('product-code');
        const quantityInput = document.getElementById('quantity');
        const registerBtn = document.getElementById('register-btn');

        if (startCameraBtn) {
            startCameraBtn.addEventListener('click', () => this.startCamera());
        }
        if (toggleLightBtn) {
            toggleLightBtn.addEventListener('click', () => this.toggleFlashlight());
        }
        if (productCodeInput) {
            productCodeInput.addEventListener('input', (e) => {
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
                    importBtn.textContent = `${fileName} を取り込み`;
                }
            });
        }
    }

    // データ出力機能のイベントリスナー
    setupExportListeners() {
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }
        this.updateExportPreview();
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
            clearAllBtn.addEventListener('click', () => this.clearAllData());
        }
    }

    // 設定機能のイベントリスナー
    setupSettingsListeners() {
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const clearDataBtn = document.getElementById('clear-data-btn');
        const centerNameSelect = document.getElementById('center-name');
        const centerNameCustom = document.getElementById('center-name-custom');

        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', () => this.confirmClearAllData());
        }
        if (centerNameSelect && centerNameCustom) {
            centerNameSelect.addEventListener('change', (e) => {
                centerNameCustom.classList.toggle('hidden', e.target.value !== 'other');
            });
        }
    }

    // 画面切り替え
    showScreen(screenId) {
        try {
            const screens = document.querySelectorAll('.screen');
            screens.forEach(screen => {
                screen.classList.remove('active');
            });
            
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                targetScreen.classList.add('active');
                this.currentScreen = screenId;

                // 画面固有の初期化処理
                if (screenId === 'edit') {
                    this.loadInventoryList();
                } else if (screenId === 'export') {
                    this.updateExportPreview();
                } else if (screenId === 'settings') {
                    this.loadSettings();
                } else if (screenId === 'inventory') {
                    this.resetInventoryForm();
                }
            }
        } catch (error) {
            console.error('Screen switching error:', error);
        }
    }

    // カメラ開始
    async startCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            const video = document.getElementById('camera-video');
            if (video) {
                video.srcObject = this.cameraStream;
                video.classList.add('active');
                
                const startBtn = document.getElementById('start-camera');
                if (startBtn) {
                    startBtn.style.display = 'none';
                }
                
                this.isScanning = true;
                this.startQRScanning(video);
            }
            
        } catch (error) {
            console.error('カメラアクセスエラー:', error);
            this.showMessage('カメラにアクセスできません。手動でコードを入力してください。', 'error');
        }
    }

    // QRコードスキャニング（シミュレーション）
    startQRScanning(video) {
        if (!this.isScanning) return;

        // 実際のQRコード読み取りライブラリの代わりにシミュレーション
        setTimeout(() => {
            if (this.isScanning && Math.random() > 0.7) {
                const sampleCodes = ['4901234567890', '4901234567891', '4901234567892'];
                const randomCode = sampleCodes[Math.floor(Math.random() * sampleCodes.length)];
                this.onCodeScanned(randomCode);
            } else if (this.isScanning) {
                this.startQRScanning(video);
            }
        }, 2000);
    }

    // コード読み取り成功時の処理
    onCodeScanned(code) {
        this.playBeepSound();
        const productCodeInput = document.getElementById('product-code');
        if (productCodeInput) {
            productCodeInput.value = code;
        }
        this.lookupProduct(code);
        this.stopCamera();
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
            console.error('音声再生エラー:', error);
        }
    }

    // カメラ停止
    stopCamera() {
        this.isScanning = false;
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        const video = document.getElementById('camera-video');
        const startBtn = document.getElementById('start-camera');
        if (video) {
            video.classList.remove('active');
        }
        if (startBtn) {
            startBtn.style.display = 'block';
        }
    }

    // フラッシュライト切り替え
    async toggleFlashlight() {
        if (!this.cameraStream) return;

        try {
            const track = this.cameraStream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            
            if (capabilities.torch) {
                this.flashlight = !this.flashlight;
                await track.applyConstraints({
                    advanced: [{ torch: this.flashlight }]
                });
                
                const btn = document.getElementById('toggle-light');
                if (btn) {
                    btn.textContent = this.flashlight ? '💡 ライトOFF' : '💡 ライト';
                }
            }
        } catch (error) {
            console.error('フラッシュライトエラー:', error);
        }
    }

    // 商品検索
    lookupProduct(code) {
        if (!code) {
            const productInfo = document.getElementById('product-info');
            if (productInfo) {
                productInfo.classList.add('hidden');
            }
            return;
        }

        const product = this.masterData.find(item => item.code === code);
        const productInfo = document.getElementById('product-info');
        
        if (product && productInfo) {
            const productName = document.getElementById('product-name');
            const productDescription = document.getElementById('product-description');
            
            if (productName) {
                productName.textContent = product.name;
            }
            if (productDescription) {
                productDescription.textContent = product.description || '';
            }
            productInfo.classList.remove('hidden');
            
            // ロット情報を更新
            this.updateLotOptions(code);
        } else if (productInfo) {
            productInfo.classList.add('hidden');
            this.showMessage('商品が見つかりません', 'warning');
        }
    }

    // ロットオプション更新
    updateLotOptions(code) {
        const lotSelect = document.getElementById('lot');
        if (!lotSelect) return;
        
        lotSelect.innerHTML = '<option value="">ロットを選択</option>';
        
        const stockItems = this.stockData.filter(item => item.code === code);
        stockItems.forEach(item => {
            const option = document.createElement('option');
            option.value = `${item.warehouse}-${item.stock}`;
            option.textContent = `${item.warehouse} (在庫: ${item.stock})`;
            lotSelect.appendChild(option);
        });
        
        // 手動入力オプション
        const manualOption = document.createElement('option');
        manualOption.value = 'manual';
        manualOption.textContent = '手動入力';
        lotSelect.appendChild(manualOption);
    }

    // 棚卸しアイテム登録
    registerInventoryItem() {
        const codeInput = document.getElementById('product-code');
        const quantityInput = document.getElementById('quantity');
        const unitSelect = document.getElementById('unit');
        const lotSelect = document.getElementById('lot');

        if (!codeInput || !quantityInput || !unitSelect || !lotSelect) {
            this.showMessage('入力フィールドが見つかりません', 'error');
            return;
        }

        const code = codeInput.value.trim();
        const quantity = parseInt(quantityInput.value);
        const unit = unitSelect.value;
        const lot = lotSelect.value;

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
            id: Date.now(),
            code: code,
            name: product.name,
            quantity: quantity,
            unit: unit,
            lot: lot,
            timestamp: new Date().toISOString(),
            user: this.settings.userName || '未設定'
        };

        this.inventoryData.push(inventoryItem);
        this.saveData();
        
        this.showMessage(`${product.name} を登録しました`, 'success');
        this.resetInventoryForm();
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
            if (element) {
                element.value = value;
            }
        });

        const productInfo = document.getElementById('product-info');
        if (productInfo) {
            productInfo.classList.add('hidden');
        }
        this.stopCamera();
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

        const progressSection = document.getElementById('import-progress');
        const progressFill = progressSection?.querySelector('.progress-fill');
        const progressText = progressSection?.querySelector('.progress-text');

        if (progressSection) {
            progressSection.classList.remove('hidden');
        }
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        if (progressText) {
            progressText.textContent = 'ファイルを読み込み中...';
        }

        try {
            // ファイル読み込みシミュレーション
            await this.simulateProgress(progressFill, progressText);
            
            const text = await file.text();
            let data;

            if (file.name.endsWith('.csv')) {
                data = this.parseCSV(text);
            } else {
                // Excel読み込みは実際にはSheetJSライブラリを使用
                data = this.parseExcel(text);
            }

            if (importType.value === 'master') {
                this.masterData = data;
            } else {
                this.stockData = data;
            }

            this.saveData();
            this.showMessage('データの取り込みが完了しました', 'success');
            
        } catch (error) {
            console.error('インポートエラー:', error);
            this.showMessage('ファイルの読み込みに失敗しました', 'error');
        } finally {
            if (progressSection) {
                progressSection.classList.add('hidden');
            }
            fileInput.value = '';
        }
    }

    // 進捗シミュレーション
    simulateProgress(progressFill, progressText) {
        return new Promise(resolve => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 20;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    resolve();
                }
                if (progressFill) {
                    progressFill.style.width = `${progress}%`;
                }
                if (progressText) {
                    progressText.textContent = `処理中... ${Math.round(progress)}%`;
                }
            }, 200);
        });
    }

    // CSV解析
    parseCSV(text) {
        const lines = text.split('\n');
        const headers = lines[0].split(',');
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',');
                const item = {};
                headers.forEach((header, index) => {
                    item[header.trim()] = values[index]?.trim() || '';
                });
                data.push(item);
            }
        }
        
        return data;
    }

    // Excel解析（簡易版）
    parseExcel(text) {
        // 実際の実装ではSheetJSライブラリを使用
        console.log('Excel parsing would use SheetJS library');
        return [];
    }

    // データ出力プレビュー更新
    updateExportPreview() {
        const inventoryCount = document.getElementById('inventory-count');
        if (inventoryCount) {
            inventoryCount.textContent = `${this.inventoryData.length}件`;
        }
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
        const headers = ['ID', 'コード', '商品名', '数量', '単位', 'ロット', '登録日時', '登録者'];
        const rows = this.inventoryData.map(item => [
            item.id,
            item.code,
            item.name,
            item.quantity,
            item.unit,
            item.lot,
            new Date(item.timestamp).toLocaleString('ja-JP'),
            item.user
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        this.downloadFile(csvContent, '棚卸しデータ.csv', 'text/csv');
    }

    // Excel出力（簡易版）
    exportExcel() {
        // 実際の実装ではSheetJSライブラリを使用
        const csvContent = this.generateCSVContent();
        this.downloadFile(csvContent, '棚卸しデータ.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    // ファイルダウンロード
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
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

    // CSV内容生成
    generateCSVContent() {
        const headers = ['ID', 'コード', '商品名', '数量', '単位', 'ロット', '登録日時', '登録者'];
        const rows = this.inventoryData.map(item => [
            item.id,
            item.code,
            item.name,
            item.quantity,
            item.unit,
            item.lot,
            new Date(item.timestamp).toLocaleString('ja-JP'),
            item.user
        ]);

        return [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    // 在庫リスト読み込み
    loadInventoryList() {
        const listContainer = document.getElementById('inventory-list');
        if (!listContainer) return;
        
        if (this.inventoryData.length === 0) {
            listContainer.innerHTML = `
                <div class="no-data">
                    <div class="no-data-icon">📦</div>
                    <p>棚卸しデータがありません</p>
                </div>
            `;
            return;
        }

        const itemsHtml = this.inventoryData.map(item => `
            <div class="inventory-item" data-id="${item.id}">
                <div class="inventory-item-header">
                    <div class="inventory-item-checkbox" onclick="app.toggleItemSelection(${item.id})"></div>
                    <div class="inventory-item-name">${item.name}</div>
                </div>
                <div class="inventory-item-details">
                    <div>コード: ${item.code}</div>
                    <div>数量: ${item.quantity}${item.unit}</div>
                    <div>ロット: ${item.lot || '未設定'}</div>
                    <div>登録: ${new Date(item.timestamp).toLocaleDateString('ja-JP')}</div>
                </div>
                <div class="inventory-item-actions">
                    <button class="btn btn--secondary" onclick="app.editItem(${item.id})">編集</button>
                    <button class="btn btn--outline" onclick="app.deleteItem(${item.id})">削除</button>
                </div>
            </div>
        `).join('');

        listContainer.innerHTML = itemsHtml;
    }

    // アイテム選択切り替え
    toggleItemSelection(id) {
        const checkbox = document.querySelector(`[data-id="${id}"] .inventory-item-checkbox`);
        const item = document.querySelector(`[data-id="${id}"]`);
        
        if (!checkbox || !item) return;
        
        if (this.selectedItems.has(id)) {
            this.selectedItems.delete(id);
            checkbox.classList.remove('checked');
            item.classList.remove('selected');
        } else {
            this.selectedItems.add(id);
            checkbox.classList.add('checked');
            item.classList.add('selected');
        }
    }

    // 全選択
    selectAllItems() {
        const items = document.querySelectorAll('.inventory-item');
        items.forEach(item => {
            const id = parseInt(item.dataset.id);
            this.selectedItems.add(id);
            const checkbox = item.querySelector('.inventory-item-checkbox');
            if (checkbox) {
                checkbox.classList.add('checked');
            }
            item.classList.add('selected');
        });
    }

    // リストフィルタリング
    filterInventoryList(query) {
        const items = document.querySelectorAll('.inventory-item');
        items.forEach(item => {
            const nameElement = item.querySelector('.inventory-item-name');
            if (nameElement) {
                const name = nameElement.textContent;
                const visible = name.toLowerCase().includes(query.toLowerCase());
                item.style.display = visible ? 'block' : 'none';
            }
        });
    }

    // 選択アイテム削除
    deleteSelectedItems() {
        if (this.selectedItems.size === 0) {
            this.showMessage('削除するアイテムを選択してください', 'warning');
            return;
        }

        this.showConfirm(
            '選択アイテムの削除',
            `選択した${this.selectedItems.size}件のアイテムを削除しますか？`,
            () => {
                this.inventoryData = this.inventoryData.filter(item => !this.selectedItems.has(item.id));
                this.selectedItems.clear();
                this.saveData();
                this.loadInventoryList();
                this.showMessage('選択したアイテムを削除しました', 'success');
            }
        );
    }

    // 単一アイテム削除
    deleteItem(id) {
        this.showConfirm(
            'アイテムの削除',
            'このアイテムを削除しますか？',
            () => {
                this.inventoryData = this.inventoryData.filter(item => item.id !== id);
                this.saveData();
                this.loadInventoryList();
                this.showMessage('アイテムを削除しました', 'success');
            }
        );
    }

    // アイテム編集（簡易版）
    editItem(id) {
        const item = this.inventoryData.find(item => item.id === id);
        if (!item) return;

        const newQuantity = prompt('新しい数量を入力してください:', item.quantity);
        if (newQuantity && !isNaN(newQuantity) && parseInt(newQuantity) > 0) {
            item.quantity = parseInt(newQuantity);
            item.timestamp = new Date().toISOString();
            this.saveData();
            this.loadInventoryList();
            this.showMessage('アイテムを更新しました', 'success');
        }
    }

    // 全データクリア確認
    confirmClearAllData() {
        this.showConfirm(
            'データオールクリア',
            '全ての棚卸しデータを削除しますか？この操作は取り消せません。',
            () => this.clearAllData()
        );
    }

    // 全データクリア
    clearAllData() {
        this.inventoryData = [];
        this.selectedItems.clear();
        this.saveData();
        this.loadInventoryList();
        this.showMessage('全データを削除しました', 'success');
    }

    // 設定読み込み
    loadSettings() {
        const elements = {
            'user-name': this.settings.userName,
            'center-name': this.settings.centerName,
            'code-type': this.settings.codeType,
            'output-format': this.settings.outputFormat,
            'input-format': this.settings.inputFormat
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });
        
        const centerNameCustom = document.getElementById('center-name-custom');
        const centerNameSelect = document.getElementById('center-name');
        
        if (centerNameCustom && centerNameSelect) {
            if (!['東京センター', '大阪センター', '名古屋センター'].includes(this.settings.centerName)) {
                centerNameSelect.value = 'other';
                centerNameCustom.value = this.settings.centerName;
                centerNameCustom.classList.remove('hidden');
            }
        }
    }

    // 設定保存
    saveSettings() {
        const centerNameSelect = document.getElementById('center-name');
        const centerNameCustom = document.getElementById('center-name-custom');
        
        if (!centerNameSelect) {
            this.showMessage('設定フォームが見つかりません', 'error');
            return;
        }

        const centerName = centerNameSelect.value;
        this.settings = {
            userName: document.getElementById('user-name')?.value || '',
            centerName: centerName === 'other' ? (centerNameCustom?.value || '') : centerName,
            codeType: document.getElementById('code-type')?.value || 'QR',
            outputFormat: document.getElementById('output-format')?.value || 'CSV',
            inputFormat: document.getElementById('input-format')?.value || 'XLSX'
        };

        localStorage.setItem('settings', JSON.stringify(this.settings));
        this.showMessage('設定を保存しました', 'success');
    }

    // データ保存
    saveData() {
        try {
            localStorage.setItem('inventoryData', JSON.stringify(this.inventoryData));
            localStorage.setItem('masterData', JSON.stringify(this.masterData));
            localStorage.setItem('stockData', JSON.stringify(this.stockData));
        } catch (error) {
            console.error('データ保存エラー:', error);
        }
    }

    // メッセージ表示
    showMessage(text, type = 'success') {
        const message = document.getElementById('message');
        const messageText = document.getElementById('message-text');
        
        if (!message || !messageText) return;
        
        message.className = `message show ${type}`;
        messageText.textContent = text;
        
        setTimeout(() => {
            message.classList.remove('show');
        }, 3000);
    }

    // 確認ダイアログ表示
    showConfirm(title, message, onConfirm) {
        const dialog = document.getElementById('confirm-dialog');
        const confirmTitle = document.getElementById('confirm-title');
        const confirmMessage = document.getElementById('confirm-message');
        const confirmOk = document.getElementById('confirm-ok');
        const confirmCancel = document.getElementById('confirm-cancel');
        
        if (!dialog || !confirmTitle || !confirmMessage || !confirmOk || !confirmCancel) {
            // フォールバック：ネイティブconfirm
            if (confirm(message)) {
                onConfirm();
            }
            return;
        }
        
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        dialog.classList.add('show');
        
        const cleanup = () => {
            dialog.classList.remove('show');
            confirmOk.removeEventListener('click', handleOk);
            confirmCancel.removeEventListener('click', handleCancel);
        };
        
        const handleOk = () => {
            cleanup();
            onConfirm();
        };
        
        const handleCancel = () => {
            cleanup();
        };
        
        confirmOk.addEventListener('click', handleOk);
        confirmCancel.addEventListener('click', handleCancel);
    }
}

// アプリケーション初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new InventoryApp();
    } catch (error) {
        console.error('アプリ初期化エラー:', error);
        // フォールバック：ローディング画面を隠す
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
        const mainMenu = document.getElementById('main-menu');
        if (mainMenu) {
            mainMenu.classList.add('active');
        }
    }
});

// PWAインストール対応
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// オフライン対応
window.addEventListener('online', () => {
    if (app) {
        app.showMessage('オンラインになりました', 'success');
    }
});

window.addEventListener('offline', () => {
    if (app) {
        app.showMessage('オフラインモードです', 'warning');
    }
});

// エラーハンドリング
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    if (app) {
        app.showMessage('予期しないエラーが発生しました', 'error');
    }
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    if (app) {
        app.showMessage('処理中にエラーが発生しました', 'error');
    }
});
