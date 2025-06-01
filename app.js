// 棚卸し管理PWAアプリケーション - 完全版
// app.js

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
let centerNames = ['東京センター', '大阪センター', '名古屋センター', '福岡センター', '仙台センター'];
let beepSound = null;
let currentEditId = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeApp();
        await loadSettings();
        setupEventListeners();
        initBeepSound();
        showScreen('main-menu');
        
        // URL パラメータから画面切り替え
        const urlParams = new URLSearchParams(window.location.search);
        const screen = urlParams.get('screen');
        if (screen) {
            showScreen(screen + '-section');
        }
    } catch (error) {
        console.error('アプリ初期化エラー:', error);
        showToast('アプリの初期化に失敗しました', 'error');
    }
});

// -------------------------------
// データベース操作
// -------------------------------

// IndexedDBを開く
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 棚卸しデータストア
            if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
                const inventoryStore = db.createObjectStore(INVENTORY_STORE, { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                inventoryStore.createIndex('code', 'code', { unique: false });
                inventoryStore.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // 商品マスタストア
            if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
                const productStore = db.createObjectStore(PRODUCT_STORE, { 
                    keyPath: 'code' 
                });
                productStore.createIndex('name', 'name', { unique: false });
            }

            // 在庫データストア
            if (!db.objectStoreNames.contains(STOCK_STORE)) {
                const stockStore = db.createObjectStore(STOCK_STORE, { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                stockStore.createIndex('code', 'code', { unique: false });
                stockStore.createIndex('center', 'center', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// データを保存
async function saveData(storeName, data) {
    try {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        if (Array.isArray(data)) {
            for (const item of data) {
                await new Promise((resolve, reject) => {
                    const request = store.put(item);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
        } else {
            await new Promise((resolve, reject) => {
                const request = store.put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        return true;
    } catch (error) {
        console.error('データ保存エラー:', error);
        throw error;
    }
}

// データを取得
async function getData(storeName, key = null) {
    try {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        if (key) {
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } else {
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
    } catch (error) {
        console.error('データ取得エラー:', error);
        throw error;
    }
}

// データを削除
async function deleteData(storeName, key) {
    try {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('データ削除エラー:', error);
        throw error;
    }
}

// すべてのデータを削除
async function clearStore(storeName) {
    try {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('全データ削除エラー:', error);
        throw error;
    }
}

// -------------------------------
// 初期化関数
// -------------------------------

async function initializeApp() {
    try {
        db = await openDB();
        await loadProductMaster();
        await loadStockData();
        await updateDataSummary();
    } catch (error) {
        console.error('アプリ初期化エラー:', error);
        throw error;
    }
}

async function loadProductMaster() {
    try {
        productMaster = await getData(PRODUCT_STORE) || [];
    } catch (error) {
        console.error('商品マスタ読み込みエラー:', error);
        productMaster = [];
    }
}

async function loadStockData() {
    try {
        stockData = await getData(STOCK_STORE) || [];
        // センター名を抽出
        const stockCenters = [...new Set(stockData.map(item => item.center).filter(Boolean))];
        centerNames = [...new Set([...centerNames, ...stockCenters])];
        updateCenterOptions();
    } catch (error) {
        console.error('在庫データ読み込みエラー:', error);
        stockData = [];
    }
}

function setupEventListeners() {
    // 棚卸しフォームの送信
    const inventoryForm = document.getElementById('inventory-form');
    if (inventoryForm) {
        inventoryForm.addEventListener('submit', handleInventorySubmit);
    }
    
    // 商品コード入力時の検索
    const productCodeInput = document.getElementById('product-code');
    if (productCodeInput) {
        productCodeInput.addEventListener('input', searchProduct);
    }
}

function initBeepSound() {
    try {
        // 単純なビープ音の実装
        beepSound = {
            play: () => {
                try {
                    const beepEnabled = localStorage.getItem('beepEnabled') !== 'false';
                    if (beepEnabled) {
                        // 簡単なビープ音（AudioContextが利用できない場合の代替）
                        console.log('Beep!');
                    }
                } catch (error) {
                    console.error('ビープ音再生エラー:', error);
                }
            }
        };
    } catch (error) {
        console.error('ビープ音初期化エラー:', error);
    }
}

// -------------------------------
// 画面操作機能
// -------------------------------

function showScreen(screenId) {
    try {
        // すべての画面を非表示
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // 指定した画面を表示
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');

            // 画面に応じた初期化処理
            switch (screenId) {
                case 'inventory-section':
                    resetInventoryForm();
                    focusProductCode();
                    break;
                case 'edit-section':
                    loadEditList();
                    break;
                case 'export-section':
                    updateExportSummary();
                    break;
                case 'main-menu':
                    updateDataSummary();
                    break;
                case 'settings-section':
                    loadSettings();
                    break;
                default:
                    break;
            }
        } else {
            console.error('画面が見つかりません:', screenId);
        }
    } catch (error) {
        console.error('画面表示エラー:', error);
        showToast('画面の表示に失敗しました', 'error');
    }
}

function resetInventoryForm() {
    const form = document.getElementById('inventory-form');
    if (form) {
        form.reset();
    }
    
    const productName = document.getElementById('product-name');
    if (productName) {
        productName.value = '';
    }
    
    const quantity = document.getElementById('quantity');
    if (quantity) {
        quantity.value = '1';
    }
    
    const unit = document.getElementById('unit');
    if (unit) {
        unit.value = '個';
    }
}

function focusProductCode() {
    setTimeout(() => {
        const productCodeInput = document.getElementById('product-code');
        if (productCodeInput) {
            productCodeInput.focus();
        }
    }, 100);
}

// -------------------------------
// QRコード読み取り機能
// -------------------------------

async function startQRScan() {
    try {
        if (qrScanner) {
            await stopQRScan();
        }

        const qrReaderElement = document.getElementById('qr-reader');
        if (!qrReaderElement) {
            throw new Error('QRリーダー要素が見つかりません');
        }

        // カメラのアクセス許可を要求
        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (error) {
            showToast('カメラへのアクセスが拒否されました', 'error');
            return;
        }

        qrScanner = new Html5Qrcode('qr-reader');
        
        const config = {
            fps: 10,
            qrbox: { width: 200, height: 200 },
            aspectRatio: 1.0
        };

        await qrScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                handleQRScanSuccess(decodedText);
            },
            (error) => {
                // QRコード読み取りエラーは通常動作なので無視
            }
        );

        document.getElementById('start-scan-btn').style.display = 'none';
        document.getElementById('stop-scan-btn').style.display = 'block';

        showToast('QRスキャンを開始しました', 'success');
    } catch (error) {
        console.error('QRスキャン開始エラー:', error);
        showToast('QRスキャンの開始に失敗しました', 'error');
    }
}

async function stopQRScan() {
    try {
        if (qrScanner) {
            await qrScanner.stop();
            await qrScanner.clear();
            qrScanner = null;
        }

        document.getElementById('start-scan-btn').style.display = 'block';
        document.getElementById('stop-scan-btn').style.display = 'none';

        torchOn = false;
    } catch (error) {
        console.error('QRスキャン停止エラー:', error);
    }
}

function handleQRScanSuccess(decodedText) {
    try {
        playBeep();
        document.getElementById('product-code').value = decodedText;
        searchProduct();
        
        // フォーカスを数量フィールドに移動
        setTimeout(() => {
            const quantityInput = document.getElementById('quantity');
            if (quantityInput) {
                quantityInput.focus();
                quantityInput.select();
            }
        }, 100);
    } catch (error) {
        console.error('QRスキャン成功処理エラー:', error);
    }
}

async function toggleTorch() {
    try {
        if (qrScanner) {
            torchOn = !torchOn;
            await qrScanner.applyVideoConstraints({
                advanced: [{ torch: torchOn }]
            });
            
            const torchBtn = document.getElementById('torch-btn');
            if (torchBtn) {
                torchBtn.textContent = torchOn ? '🔦' : '💡';
            }
        }
    } catch (error) {
        console.error('ライト切り替えエラー:', error);
        showToast('ライトの切り替えに失敗しました', 'warning');
    }
}

function playBeep() {
    try {
        if (beepSound) {
            beepSound.play();
        }
    } catch (error) {
        console.error('ビープ音再生エラー:', error);
    }
}

// -------------------------------
// 商品検索機能
// -------------------------------

function searchProduct() {
    try {
        const codeInput = document.getElementById('product-code');
        const productNameField = document.getElementById('product-name');
        const lotList = document.getElementById('lot-list');
        
        if (!codeInput || !productNameField) return;
        
        const code = codeInput.value.trim();
        
        if (!code) {
            productNameField.value = '';
            if (lotList) lotList.innerHTML = '';
            return;
        }

        // 商品マスタから検索
        const product = productMaster.find(p => p.code === code || p.janCode === code);
        
        if (product) {
            productNameField.value = product.name;
            playBeep();
        } else {
            productNameField.value = '商品が見つかりません';
        }

        // 在庫データからロット番号の候補を取得
        if (lotList) {
            const stockItems = stockData.filter(s => s.code === code);
            lotList.innerHTML = '';
            
            stockItems.forEach(item => {
                if (item.lot) {
                    const option = document.createElement('option');
                    option.value = item.lot;
                    lotList.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('商品検索エラー:', error);
    }
}

// -------------------------------
// 棚卸しデータ登録
// -------------------------------

async function handleInventorySubmit(event) {
    event.preventDefault();
    
    try {
        const code = document.getElementById('product-code').value.trim();
        const name = document.getElementById('product-name').value.trim();
        const quantity = parseInt(document.getElementById('quantity').value) || 1;
        const unit = document.getElementById('unit').value;
        const lot = document.getElementById('lot-number').value.trim();
        const shelf = document.getElementById('shelf-number').value.trim();
        
        if (!code) {
            showToast('商品コードを入力してください', 'warning');
            return;
        }

        if (name === '商品が見つかりません') {
            showToast('有効な商品コードを入力してください', 'warning');
            return;
        }

        const inventoryData = {
            code: code,
            name: name || '未設定',
            quantity: quantity,
            unit: unit,
            lot: lot,
            shelf: shelf,
            center: localStorage.getItem('centerName') || '',
            person: localStorage.getItem('personName') || '',
            timestamp: new Date().toISOString()
        };

        await saveData(INVENTORY_STORE, inventoryData);
        
        showToast('登録完了しました', 'success');
        playBeep();
        
        // フォームをリセットして次の入力に備える
        resetInventoryForm();
        focusProductCode();
        
    } catch (error) {
        console.error('棚卸しデータ登録エラー:', error);
        showToast('登録に失敗しました', 'error');
    }
}

// -------------------------------
// データ取り込み機能
// -------------------------------

async function importProductData() {
    try {
        const fileInput = document.getElementById('product-file');
        const file = fileInput.files[0];
        
        if (!file) {
            showToast('ファイルを選択してください', 'warning');
            return;
        }

        showLoading('商品マスタを取り込み中...');
        
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const products = [];
        
        // ヘッダー行をスキップして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row[0]) { // 商品コードがある行のみ処理
                products.push({
                    code: String(row[0]).trim(),
                    name: String(row[1] || '').trim(),
                    janCode: String(row[2] || '').trim(),
                    category: String(row[3] || '').trim(),
                    price: parseFloat(row[4]) || 0
                });
            }
        }

        if (products.length > 0) {
            await clearStore(PRODUCT_STORE);
            await saveData(PRODUCT_STORE, products);
            await loadProductMaster();
            
            showToast(`${products.length}件の商品マスタを取り込みました`, 'success');
        } else {
            showToast('取り込み可能なデータがありませんでした', 'warning');
        }
        
        fileInput.value = '';
    } catch (error) {
        console.error('商品マスタ取り込みエラー:', error);
        showToast('商品マスタの取り込みに失敗しました', 'error');
    } finally {
        hideLoading();
    }
}

async function importStockData() {
    try {
        const fileInput = document.getElementById('stock-file');
        const file = fileInput.files[0];
        
        if (!file) {
            showToast('ファイルを選択してください', 'warning');
            return;
        }

        showLoading('在庫データを取り込み中...');
        
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const stocks = [];
        
        // データ行を処理（A=商品番号、B=商品名称、C=数量、J=倉庫名、P=ロット）
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row[0]) { // A列の商品番号がある行のみ処理
                stocks.push({
                    code: String(row[0]).trim(),           // A列: 商品番号
                    name: String(row[1] || '').trim(),     // B列: 商品名称
                    quantity: parseFloat(row[2]) || 0,     // C列: 数量
                    center: String(row[9] || '').trim(),   // J列: 倉庫名
                    lot: String(row[15] || '').trim()      // P列: ロット
                });
            }
        }

        if (stocks.length > 0) {
            await clearStore(STOCK_STORE);
            await saveData(STOCK_STORE, stocks);
            await loadStockData();
            
            showToast(`${stocks.length}件の在庫データを取り込みました`, 'success');
        } else {
            showToast('取り込み可能なデータがありませんでした', 'warning');
        }
        
        fileInput.value = '';
    } catch (error) {
        console.error('在庫データ取り込みエラー:', error);
        showToast('在庫データの取り込みに失敗しました', 'error');
    } finally {
        hideLoading();
    }
}

// -------------------------------
// データ出力機能
// -------------------------------

async function exportData() {
    try {
        const format = document.querySelector('input[name="export-format"]:checked').value;
        const inventoryData = await getData(INVENTORY_STORE);
        
        if (!inventoryData || inventoryData.length === 0) {
            showToast('出力するデータがありません', 'warning');
            return;
        }

        showLoading('データを出力中...');
        
        // データを整形
        const exportData = inventoryData.map(item => {
            const stockItem = stockData.find(s => s.code === item.code);
            return {
                '商品コード': item.code,
                '商品名': item.name,
                '数量': item.quantity,
                '単位': item.unit,
                'ロット番号': item.lot,
                '棚番号': item.shelf,
                'センター名': item.center,
                '担当者': item.person,
                '登録日時': new Date(item.timestamp).toLocaleString('ja-JP'),
                '倉庫名': stockItem ? stockItem.center : ''
            };
        });

        const fileName = `棚卸しデータ_${new Date().toISOString().slice(0, 10)}`;
        
        if (format === 'csv') {
            downloadCSV(exportData, fileName);
        } else {
            downloadExcel(exportData, fileName);
        }
        
        showToast('データを出力しました', 'success');
    } catch (error) {
        console.error('データ出力エラー:', error);
        showToast('データの出力に失敗しました', 'error');
    } finally {
        hideLoading();
    }
}

function downloadCSV(data, fileName) {
    try {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error('CSV出力エラー:', error);
        throw error;
    }
}

function downloadExcel(data, fileName) {
    try {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, '棚卸しデータ');
        XLSX.writeFile(workbook, fileName + '.xlsx');
    } catch (error) {
        console.error('Excel出力エラー:', error);
        throw error;
    }
}

// -------------------------------
// 編集機能
// -------------------------------

async function loadEditList() {
    try {
        const inventoryData = await getData(INVENTORY_STORE);
        const editList = document.getElementById('edit-list');
        
        if (!editList) return;
        
        editList.innerHTML = '';
        
        if (!inventoryData || inventoryData.length === 0) {
            editList.innerHTML = '<div class="text-center">データがありません</div>';
            return;
        }
        
        inventoryData.reverse().forEach(item => {
            const editItem = createEditItem(item);
            editList.appendChild(editItem);
        });
    } catch (error) {
        console.error('編集リスト読み込みエラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

function createEditItem(item) {
    const div = document.createElement('div');
    div.className = 'edit-item';
    div.innerHTML = `
        <div class="edit-item-info">
            <div class="code">${item.code}</div>
            <div>${item.name}</div>
            <div>数量: ${item.quantity}${item.unit} | ロット: ${item.lot || '-'} | 棚: ${item.shelf || '-'}</div>
            <div>${new Date(item.timestamp).toLocaleString('ja-JP')}</div>
        </div>
        <div class="edit-item-actions">
            <button class="btn btn--outline btn--sm" onclick="editItem(${item.id})">編集</button>
            <button class="btn btn--warning btn--sm" onclick="deleteItem(${item.id})">削除</button>
        </div>
    `;
    return div;
}

function filterEditList() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const editItems = document.querySelectorAll('.edit-item');
    
    editItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

async function editItem(id) {
    try {
        const item = await getData(INVENTORY_STORE, id);
        if (!item) {
            showToast('データが見つかりません', 'error');
            return;
        }
        
        currentEditId = id;
        
        document.getElementById('edit-code').value = item.code;
        document.getElementById('edit-name').value = item.name;
        document.getElementById('edit-quantity').value = item.quantity;
        document.getElementById('edit-unit').value = item.unit;
        document.getElementById('edit-lot').value = item.lot || '';
        document.getElementById('edit-shelf').value = item.shelf || '';
        
        document.getElementById('edit-modal').classList.add('show');
    } catch (error) {
        console.error('編集開始エラー:', error);
        showToast('編集の開始に失敗しました', 'error');
    }
}

async function saveEdit() {
    try {
        if (!currentEditId) return;
        
        const item = await getData(INVENTORY_STORE, currentEditId);
        if (!item) {
            showToast('データが見つかりません', 'error');
            return;
        }
        
        item.quantity = parseInt(document.getElementById('edit-quantity').value) || 1;
        item.unit = document.getElementById('edit-unit').value;
        item.lot = document.getElementById('edit-lot').value.trim();
        item.shelf = document.getElementById('edit-shelf').value.trim();
        
        await saveData(INVENTORY_STORE, item);
        
        closeEditModal();
        await loadEditList();
        showToast('データを更新しました', 'success');
    } catch (error) {
        console.error('編集保存エラー:', error);
        showToast('編集の保存に失敗しました', 'error');
    }
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('show');
    currentEditId = null;
}

async function deleteItem(id) {
    try {
        if (confirm('このデータを削除しますか？')) {
            await deleteData(INVENTORY_STORE, id);
            await loadEditList();
            showToast('データを削除しました', 'success');
        }
    } catch (error) {
        console.error('削除エラー:', error);
        showToast('削除に失敗しました', 'error');
    }
}

function refreshEditList() {
    loadEditList();
}

// -------------------------------
// 設定機能
// -------------------------------

async function loadSettings() {
    try {
        const personName = localStorage.getItem('personName') || '';
        const centerName = localStorage.getItem('centerName') || '';
        const beepEnabled = localStorage.getItem('beepEnabled') !== 'false';
        
        const settingsPersonInput = document.getElementById('settings-person');
        const settingsCenterSelect = document.getElementById('settings-center');
        const beepEnabledCheckbox = document.getElementById('beep-enabled');
        
        if (settingsPersonInput) settingsPersonInput.value = personName;
        if (settingsCenterSelect) settingsCenterSelect.value = centerName;
        if (beepEnabledCheckbox) beepEnabledCheckbox.checked = beepEnabled;
        
        // ヘッダーの表示更新
        const personNameElement = document.getElementById('person-name');
        const centerNameElement = document.getElementById('center-name');
        
        if (personNameElement) personNameElement.textContent = personName || '担当者未設定';
        if (centerNameElement) centerNameElement.textContent = centerName || 'センター未設定';
    } catch (error) {
        console.error('設定読み込みエラー:', error);
    }
}

function saveSettings() {
    try {
        const personName = document.getElementById('settings-person').value.trim();
        const centerName = document.getElementById('settings-center').value.trim();
        const beepEnabled = document.getElementById('beep-enabled').checked;
        
        localStorage.setItem('personName', personName);
        localStorage.setItem('centerName', centerName);
        localStorage.setItem('beepEnabled', beepEnabled.toString());
        
        // ヘッダーの表示更新
        const personNameElement = document.getElementById('person-name');
        const centerNameElement = document.getElementById('center-name');
        
        if (personNameElement) personNameElement.textContent = personName || '担当者未設定';
        if (centerNameElement) centerNameElement.textContent = centerName || 'センター未設定';
        
        showToast('設定を保存しました', 'success');
    } catch (error) {
        console.error('設定保存エラー:', error);
        showToast('設定の保存に失敗しました', 'error');
    }
}

function updateCenterOptions() {
    try {
        const centerSelect = document.getElementById('settings-center');
        if (!centerSelect) return;
        
        const currentValue = centerSelect.value;
        
        // 既存のオプションをクリア（最初のオプションは残す）
        while (centerSelect.children.length > 1) {
            centerSelect.removeChild(centerSelect.lastChild);
        }
        
        // センター名を追加
        centerNames.forEach(center => {
            const option = document.createElement('option');
            option.value = center;
            option.textContent = center;
            centerSelect.appendChild(option);
        });
        
        // 元の値を復元
        if (currentValue) {
            centerSelect.value = currentValue;
        }
    } catch (error) {
        console.error('センターオプション更新エラー:', error);
    }
}

async function exportBackup() {
    try {
        showLoading('バックアップを作成中...');
        
        const inventoryData = await getData(INVENTORY_STORE);
        const productData = await getData(PRODUCT_STORE);
        const stockData = await getData(STOCK_STORE);
        
        const backup = {
            inventory: inventoryData,
            products: productData,
            stock: stockData,
            settings: {
                personName: localStorage.getItem('personName'),
                centerName: localStorage.getItem('centerName'),
                beepEnabled: localStorage.getItem('beepEnabled')
            },
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `棚卸しバックアップ_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        
        showToast('バックアップを作成しました', 'success');
    } catch (error) {
        console.error('バックアップ作成エラー:', error);
        showToast('バックアップの作成に失敗しました', 'error');
    } finally {
        hideLoading();
    }
}

// -------------------------------
// ユーティリティ関数
// -------------------------------

function showLoading(message) {
    try {
        hideLoading();
        
        const loading = document.createElement('div');
        loading.id = 'loading-overlay';
        loading.innerHTML = `
            <div>
                <div class="spinner"></div>
                <div>${message || 'Loading...'}</div>
            </div>
        `;
        document.body.appendChild(loading);
    } catch (error) {
        console.error('ローディング表示エラー:', error);
    }
}

function hideLoading() {
    try {
        const loading = document.getElementById('loading-overlay');
        if (loading && loading.parentNode) {
            loading.parentNode.removeChild(loading);
        }
    } catch (error) {
        console.error('ローディング非表示エラー:', error);
    }
}

function showToast(message, type = 'info', duration = 3000) {
    try {
        const existingToast = document.getElementById('toast');
        if (existingToast) {
            document.body.removeChild(existingToast);
        }

        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, duration);
    } catch (error) {
        console.error('トースト表示エラー:', error);
    }
}

async function updateDataSummary() {
    try {
        const inventoryData = await getData(INVENTORY_STORE);
        const count = inventoryData ? inventoryData.length : 0;
        // データ数をボタンに表示するなどの処理をここに追加可能
    } catch (error) {
        console.error('データサマリー更新エラー:', error);
    }
}

async function updateExportSummary() {
    try {
        const inventoryData = await getData(INVENTORY_STORE);
        const summaryElement = document.getElementById('export-summary');
        
        if (!summaryElement) return;
        
        if (inventoryData && inventoryData.length > 0) {
            summaryElement.innerHTML = `
                <div>出力対象: ${inventoryData.length}件</div>
                <div>最終更新: ${new Date(Math.max(...inventoryData.map(item => new Date(item.timestamp)))).toLocaleString('ja-JP')}</div>
            `;
        } else {
            summaryElement.innerHTML = '<div>出力するデータがありません</div>';
        }
    } catch (error) {
        console.error('出力サマリー更新エラー:', error);
    }
}

function showDataSummary() {
    updateDataSummary();
    showToast('データ確認機能は開発中です', 'info');
}

async function clearAllData() {
    try {
        if (confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
            showLoading('データを削除中...');
            
            await clearStore(INVENTORY_STORE);
            await clearStore(PRODUCT_STORE);
            await clearStore(STOCK_STORE);
            
            productMaster = [];
            stockData = [];
            
            updateCenterOptions();
            showToast('すべてのデータを削除しました', 'success');
            
            if (document.getElementById('edit-section').classList.contains('active')) {
                loadEditList();
            }
        }
    } catch (error) {
        console.error('全データ削除エラー:', error);
        showToast('データの削除に失敗しました', 'error');
    } finally {
        hideLoading();
    }
}

// PWA Service Worker登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker登録成功:', registration);
        } catch (error) {
            console.error('Service Worker登録失敗:', error);
        }
    });
}