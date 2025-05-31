// 棚卸し管理PWA - 完全版app.js
class InventoryPWA {
    constructor() {
        this.db = null;
        this.html5QrCode = null;
        this.isScanning = false;
        this.torchEnabled = false;
        this.currentSettings = {
            centerNames: [],
            name: '',
            center: '',
            codeType: 'QR',
            outputFormat: 'csv'
        };
        this.init();
    }

    // IndexedDB初期化（バルク挿入対応）
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('InventoryDB', 3);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('inventory')) {
                    db.createObjectStore('inventory', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                }
                if (!db.objectStoreNames.contains('stock')) {
                    const stockStore = db.createObjectStore('stock', {
                        keyPath: ['code', 'lot'],
                        autoIncrement: false
                    });
                    stockStore.createIndex('warehouse', 'warehouse');
                }
                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', {
                        keyPath: 'code'
                    });
                    productStore.createIndex('name', 'name');
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = reject;
        });
    }

    // 在庫データ取込（最適化版）
    async importStockData(file) {
        if (!file) return;

        try {
            this.showLoading('在庫データ処理中...');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { 
                type: 'array',
                cellDates: true,
                dateNF: 'yyyy-mm-dd'
            });
            
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // カラムマッピング（日本語ヘッダー直接指定）
            const headers = rows[0];
            const colMap = {
                code: headers.indexOf('商品番号'),
                name: headers.indexOf('商品名称'),
                quantity: headers.indexOf('即時在庫数量'),
                warehouse: headers.indexOf('倉庫名'),
                lot: headers.indexOf('ロットNo.')
            };

            // バリデーション
            if (Object.values(colMap).some(i => i === -1)) {
                throw new Error('必要な列が見つかりません');
            }

            // データ変換（必要な列のみ抽出）
            const stockData = rows.slice(1).map(row => ({
                code: row[colMap.code]?.toString().trim() || '',
                name: row[colMap.name]?.toString().trim() || '',
                quantity: Number(row[colMap.quantity]) || 0,
                warehouse: row[colMap.warehouse]?.toString().trim() || '',
                lot: row[colMap.lot]?.toString().trim() || '',
                timestamp: new Date().toISOString()
            })).filter(item => item.code && item.warehouse);

            // センター名更新
            this.currentSettings.centerNames = [...new Set(stockData.map(i => i.warehouse))];
            this.updateCenterList();

            // IndexedDBバルク挿入
            await this.bulkInsertStock(stockData);

            this.hideLoading();
            this.showSuccess(`✅ 在庫データ取込完了: ${stockData.length}件`);

        } catch (error) {
            this.hideLoading();
            console.error('在庫データ取込エラー:', error);
            this.showError(`失敗: ${error.message}`);
        }
    }

    // 商品マスタ取込
    async importProductMaster(file) {
        if (!file) return;

        try {
            this.showLoading('商品マスタ処理中...');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const products = XLSX.utils.sheet_to_json(worksheet);

            await this.bulkInsertProducts(products);
            this.hideLoading();
            this.showSuccess(`✅ 商品マスタ取込完了: ${products.length}件`);
        } catch (error) {
            this.hideLoading();
            console.error('商品マスタ取込エラー:', error);
            this.showError(`失敗: ${error.message}`);
        }
    }

    // バルク挿入（在庫データ）
    async bulkInsertStock(data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['stock'], 'readwrite');
            const store = transaction.objectStore('stock');
            
            let completed = 0;
            const total = data.length;
            
            data.forEach(item => {
                const request = store.put({
                    code: item.code,
                    name: item.name,
                    quantity: item.quantity,
                    warehouse: item.warehouse,
                    lot: item.lot,
                    timestamp: item.timestamp
                });
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === total) resolve();
                };
            });

            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // バルク挿入（商品マスタ）
    async bulkInsertProducts(products) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['products'], 'readwrite');
            const store = transaction.objectStore('products');
            
            let completed = 0;
            const total = products.length;
            
            products.forEach(product => {
                const request = store.put({
                    code: product.code || product['商品コード'] || '',
                    name: product.name || product['商品名'] || '',
                    price: product.price || product['価格'] || 0
                });
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === total) resolve();
                };
            });

            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // QRコード読み取り開始
    async startQRScan() {
        if (this.isScanning) return;
        
        try {
            this.isScanning = true;
            document.getElementById('qr-reader').classList.remove('hidden');
            
            this.html5QrCode = new Html5Qrcode("qr-video");
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            await this.html5QrCode.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    this.onQRCodeScanned(decodedText);
                },
                (errorMessage) => {
                    // スキャンエラーは無視（頻繁に発生するため）
                }
            );
            
            // Torch機能の初期化
            this.initTorchFeature();
            
        } catch (error) {
            console.error('QRスキャン開始エラー:', error);
            this.showError('カメラの起動に失敗しました');
            this.isScanning = false;
        }
    }

    // QRスキャン停止
    async stopQRScan() {
        if (!this.isScanning) return;
        
        try {
            if (this.html5QrCode) {
                await this.html5QrCode.stop();
                this.html5QrCode = null;
            }
            
            document.getElementById('qr-reader').classList.add('hidden');
            this.isScanning = false;
            this.torchEnabled = false;
            
        } catch (error) {
            console.error('QRスキャン停止エラー:', error);
        }
    }

    // Torch機能初期化
    initTorchFeature() {
        try {
            setTimeout(() => {
                if (this.html5QrCode) {
                    const capabilities = this.html5QrCode.getRunningTrackCameraCapabilities();
                    if (capabilities && capabilities.torchFeature && capabilities.torchFeature().isSupported()) {
                        document.getElementById('torch-btn').style.display = 'flex';
                    }
                }
            }, 1000);
        } catch (error) {
            console.warn('Torch機能初期化エラー:', error);
        }
    }

    // Torch切り替え
    async toggleTorch() {
        if (!this.html5QrCode) return;
        
        try {
            const capabilities = this.html5QrCode.getRunningTrackCameraCapabilities();
            if (capabilities && capabilities.torchFeature) {
                const torch = capabilities.torchFeature();
                if (torch.isSupported()) {
                    this.torchEnabled = !this.torchEnabled;
                    await torch.apply(this.torchEnabled);
                    document.getElementById('torch-btn').classList.toggle('active', this.torchEnabled);
                }
            }
        } catch (error) {
            console.error('Torch切り替えエラー:', error);
        }
    }

    // QRコード読み取り完了
    onQRCodeScanned(decodedText) {
        this.playBeep();
        document.getElementById('product-code').value = decodedText;
        this.onCodeInput(decodedText);
        this.stopQRScan();
    }

    // ビープ音再生
    playBeep() {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(context.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.value = 1000;
            
            gainNode.gain.value = 0.3;
            gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);
            
            oscillator.start();
            oscillator.stop(context.currentTime + 0.1);
        } catch (error) {
            console.warn('ビープ音再生エラー:', error);
        }
    }

    // 商品コード入力時処理
    async onCodeInput(code) {
        if (!code) {
            document.getElementById('product-name').value = '';
            return;
        }
        
        try {
            const product = await this.getProduct(code);
            document.getElementById('product-name').value = product ? product.name : '';
        } catch (error) {
            console.error('商品検索エラー:', error);
            document.getElementById('product-name').value = '';
        }
    }

    // 商品検索
    async getProduct(code) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['products'], 'readonly');
            const store = transaction.objectStore('products');
            const request = store.get(code);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 棚卸し登録
    async registerInventory(formData) {
        try {
            const data = {
                code: formData.code,
                name: formData.name,
                quantity: formData.quantity,
                unit: formData.unit,
                lot: formData.lot,
                shelf: formData.shelf,
                center: this.currentSettings.center || '',
                user: this.currentSettings.name || '',
                timestamp: new Date().toISOString()
            };
            
            await this.addInventory(data);
            this.playBeep();
            this.showSuccess('✅ 登録完了');
            return true;
            
        } catch (error) {
            console.error('登録エラー:', error);
            this.showError('登録に失敗しました');
            return false;
        }
    }

    // 棚卸しデータ追加
    async addInventory(item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readwrite');
            const store = transaction.objectStore('inventory');
            const request = store.add(item);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 棚卸しデータ取得
    async getAllInventory() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readonly');
            const store = transaction.objectStore('inventory');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 棚卸しデータ更新
    async updateInventory(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readwrite');
            const store = transaction.objectStore('inventory');
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    Object.assign(item, updates);
                    const putRequest = store.put(item);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('データが見つかりません'));
                }
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // 棚卸しデータ削除
    async deleteInventory(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readwrite');
            const store = transaction.objectStore('inventory');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 棚卸しデータ全削除
    async clearAllInventory() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readwrite');
            const store = transaction.objectStore('inventory');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // データ出力
    async exportData() {
        try {
            const format = this.currentSettings.outputFormat;
            const inventoryData = await this.getAllInventory();
            
            if (inventoryData.length === 0) {
                this.showError('出力するデータがありません');
                return;
            }
            
            if (format === 'csv') {
                this.exportCSV(inventoryData);
            } else {
                this.exportExcel(inventoryData);
            }
            
        } catch (error) {
            console.error('データ出力エラー:', error);
            this.showError('データの出力に失敗しました');
        }
    }

    // CSV出力
    exportCSV(data) {
        let csv = 'コード,商品名,数量,単位,ロット,棚番号,センター名,担当者,日時\n';
        
        data.forEach(item => {
            csv += [
                item.code,
                item.name,
                item.quantity,
                item.unit,
                item.lot || '',
                item.shelf || '',
                item.center || '',
                item.user || '',
                item.timestamp
            ].map(value => `"${value}"`).join(',') + '\n';
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory_${this.formatDate()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showSuccess('✅ CSVファイルを出力しました');
    }

    // Excel出力
    exportExcel(data) {
        const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
            'コード': item.code,
            '商品名': item.name,
            '数量': item.quantity,
            '単位': item.unit,
            'ロット': item.lot || '',
            '棚番号': item.shelf || '',
            'センター名': item.center || '',
            '担当者': item.user || '',
            '日時': item.timestamp
        })));
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '棚卸しデータ');
        
        XLSX.writeFile(workbook, `inventory_${this.formatDate()}.xlsx`);
        
        this.showSuccess('✅ Excelファイルを出力しました');
    }

    // 日付フォーマット
    formatDate() {
        const now = new Date();
        return now.getFullYear() + 
               ('0' + (now.getMonth() + 1)).slice(-2) + 
               ('0' + now.getDate()).slice(-2) + '_' + 
               ('0' + now.getHours()).slice(-2) + 
               ('0' + now.getMinutes()).slice(-2);
    }

    // センター名リスト更新
    updateCenterList() {
        const datalist = document.getElementById('center-list');
        if (datalist) {
            datalist.innerHTML = this.currentSettings.centerNames
                .map(c => `<option value="${c}">`)
                .join('');
        }
    }

    // 設定読み込み
    loadSettings() {
        const saved = localStorage.getItem('settings');
        if (saved) {
            this.currentSettings = JSON.parse(saved);
            this.updateCenterList();
            this.updateSettingsForm();
        }
    }

    // 設定保存
    saveSettings(newSettings) {
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        localStorage.setItem('settings', JSON.stringify(this.currentSettings));
        this.updateCenterList();
    }

    // 設定フォーム更新
    updateSettingsForm() {
        const settingName = document.getElementById('setting-name');
        const settingCenter = document.getElementById('setting-center');
        const settingCodeType = document.getElementById('setting-code-type');
        const settingOutputFormat = document.getElementById('setting-output-format');
        
        if (settingName) settingName.value = this.currentSettings.name || '';
        if (settingCenter) settingCenter.value = this.currentSettings.center || '';
        if (settingCodeType) settingCodeType.value = this.currentSettings.codeType || 'QR';
        if (settingOutputFormat) settingOutputFormat.value = this.currentSettings.outputFormat || 'csv';
    }

    // UIユーティリティ
    showLoading(msg) {
        const loading = document.createElement('div');
        loading.id = 'loading-overlay';
        loading.innerHTML = `
            <div class="loading-box">
                <div class="spinner"></div>
                <div>${msg}</div>
            </div>
        `;
        document.body.appendChild(loading);
    }

    hideLoading() {
        const loading = document.getElementById('loading-overlay');
        if (loading) loading.remove();
    }

    showSuccess(msg) {
        this.showToast(msg, 'success');
    }

    showError(msg) {
        this.showToast(msg, 'error');
    }

    showToast(msg, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // 初期化
    async init() {
        try {
            await this.initDB();
            this.setupEventListeners();
            this.loadSettings();
            console.log('アプリ初期化完了');
        } catch (error) {
            console.error('初期化エラー:', error);
            this.showError('アプリの初期化に失敗しました');
        }
    }

    // イベントリスナー設定
    setupEventListeners() {
        // 在庫データ取込
        const importStock = document.getElementById('import-stock');
        if (importStock) {
            importStock.addEventListener('change', (e) => {
                this.importStockData(e.target.files[0]);
            });
        }
        
        // 商品マスタ取込
        const importMaster = document.getElementById('import-master');
        if (importMaster) {
            importMaster.addEventListener('change', (e) => {
                this.importProductMaster(e.target.files[0]);
            });
        }
        
        // QRスキャン開始
        const qrBtn = document.getElementById('qr-btn');
        if (qrBtn) {
            qrBtn.addEventListener('click', () => {
                this.startQRScan();
            });
        }
        
        // QRスキャン終了
        const closeQrBtn = document.getElementById('close-qr');
        if (closeQrBtn) {
            closeQrBtn.addEventListener('click', () => {
                this.stopQRScan();
            });
        }
        
        // トーチ切替
        const torchBtn = document.getElementById('torch-btn');
        if (torchBtn) {
            torchBtn.addEventListener('click', () => {
                this.toggleTorch();
            });
        }
        
        // 商品コード入力
        const productCode = document.getElementById('product-code');
        if (productCode) {
            productCode.addEventListener('input', (e) => {
                this.onCodeInput(e.target.value);
            });
        }
        
        // 棚卸しフォーム送信
        const inventoryForm = document.getElementById('inventory-form');
        if (inventoryForm) {
            inventoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = {
                    code: document.getElementById('product-code').value,
                    name: document.getElementById('product-name').value,
                    quantity: Number(document.getElementById('quantity').value) || 1,
                    unit: document.getElementById('unit').value,
                    lot: document.getElementById('lot')?.value || '',
                    shelf: document.getElementById('shelf')?.value || ''
                };
                this.registerInventory(formData).then(success => {
                    if (success) {
                        document.getElementById('product-code').value = '';
                        document.getElementById('product-name').value = '';
                        document.getElementById('quantity').value = '1';
                        if (document.getElementById('lot')) document.getElementById('lot').value = '';
                        if (document.getElementById('shelf')) document.getElementById('shelf').value = '';
                    }
                });
            });
        }
        
        // データ出力
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }
        
        // 設定保存
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newSettings = {
                    name: document.getElementById('setting-name').value,
                    center: document.getElementById('setting-center').value,
                    codeType: document.getElementById('setting-code-type').value,
                    outputFormat: document.getElementById('setting-output-format').value
                };
                this.saveSettings(newSettings);
                this.showSuccess('✅ 設定を保存しました');
            });
        }
        
        // データ全削除
        const clearAllBtn = document.getElementById('data-clear-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                if (confirm('全データを削除しますか？この操作は取り消せません。')) {
                    this.clearAllInventory().then(() => {
                        this.showSuccess('✅ データを削除しました');
                    });
                }
            });
        }
        
        // 画面切替イベント
        document.querySelectorAll('[data-screen]').forEach(el => {
            el.addEventListener('click', (e) => {
                const screenId = e.currentTarget.dataset.screen;
                this.showScreen(screenId);
            });
        });
    }
    
    // 画面切替
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            // 編集画面表示時にデータ読込
            if (screenId === 'edit') {
                this.loadEditScreen();
            }
        }
    }
    
    // 編集画面データ読込
    async loadEditScreen() {
        const editList = document.getElementById('edit-list');
        if (!editList) return;
        
        editList.innerHTML = '<div class="loading">データ読込中...</div>';
        
        try {
            const data = await this.getAllInventory();
            
            if (data.length === 0) {
                editList.innerHTML = '<div class="empty">データがありません</div>';
                return;
            }
            
            editList.innerHTML = '';
            
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'edit-item';
                div.innerHTML = `
                    <div>
                        <div class="item-code">${item.code}</div>
                        <div class="item-name">${item.name || ''}</div>
                    </div>
                    <div class="item-details">
                        <input type="number" value="${item.quantity}" min="1" class="quantity">
                        <select class="unit">
                            <option value="個" ${item.unit === '個' ? 'selected' : ''}>個</option>
                            <option value="箱" ${item.unit === '箱' ? 'selected' : ''}>箱</option>
                            <option value="甲" ${item.unit === '甲' ? 'selected' : ''}>甲</option>
                        </select>
                        <input type="text" value="${item.lot || ''}" placeholder="ロット" class="lot">
                        <input type="text" value="${item.shelf || ''}" placeholder="棚番号" class="shelf">
                    </div>
                    <div class="item-actions">
                        <button class="save-btn" data-id="${item.id}">保存</button>
                        <button class="delete-btn" data-id="${item.id}">削除</button>
                    </div>
                `;
                
                const saveBtn = div.querySelector('.save-btn');
                if (saveBtn) {
                    saveBtn.addEventListener('click', () => {
                        const quantity = Number(div.querySelector('.quantity').value) || 1;
                        const unit = div.querySelector('.unit').value;
                        const lot = div.querySelector('.lot').value;
                        const shelf = div.querySelector('.shelf').value;
                        
                        this.updateInventory(item.id, { quantity, unit, lot, shelf })
                            .then(() => {
                                this.showSuccess('✅ 更新しました');
                            })
                            .catch(error => {
                                this.showError('更新に失敗しました');
                                console.error(error);
                            });
                    });
                }
                
                const deleteBtn = div.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        if (confirm('このデータを削除しますか？')) {
                            this.deleteInventory(item.id)
                                .then(() => {
                                    div.remove();
                                    this.showSuccess('✅ 削除しました');
                                    if (editList.children.length === 0) {
                                        editList.innerHTML = '<div class="empty">データがありません</div>';
                                    }
                                })
                                .catch(error => {
                                    this.showError('削除に失敗しました');
                                    console.error(error);
                                });
                        }
                    });
                }
                
                editList.appendChild(div);
            });
            
        } catch (error) {
            console.error('編集画面データ読込エラー:', error);
            editList.innerHTML = '<div class="error">データの読込に失敗しました</div>';
        }
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    window.app = new InventoryPWA();
});
