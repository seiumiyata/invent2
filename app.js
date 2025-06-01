// 棚卸し管理PWAアプリケーション - 完全版（修正済み）

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

// IndexedDBを開く
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // 棚卸しデータストア
            if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
                const inventoryStore = db.createObjectStore(INVENTORY_STORE, { keyPath: 'id', autoIncrement: true });
                inventoryStore.createIndex('code', 'code', { unique: false });
                inventoryStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            // 商品マスタストア
            if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
                const productStore = db.createObjectStore(PRODUCT_STORE, { keyPath: 'code' });
                productStore.createIndex('name', 'name', { unique: false });
                productStore.createIndex('janCode', 'janCode', { unique: false });
            }
            
            // 在庫データストア
            if (!db.objectStoreNames.contains(STOCK_STORE)) {
                const stockStore = db.createObjectStore(STOCK_STORE, { keyPath: 'id', autoIncrement: true });
                stockStore.createIndex('code', 'code', { unique: false });
                stockStore.createIndex('center', 'center', { unique: false });
                stockStore.createIndex('lot', 'lot', { unique: false });
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
            return await new Promise((resolve, reject) => {
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

// アプリ初期化
async function initializeApp() {
    try {
        showLoading('アプリを初期化中...');
        
        db = await openDB();
        await loadProductMaster();
        await loadStockData();
        await updateDataSummary();
        
        registerServiceWorker();
        
        hideLoading();
    } catch (error) {
        console.error('アプリ初期化エラー:', error);
        hideLoading();
        throw error;
    }
}

// Service Workerの登録
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
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
        
        const stockCenters = [...new Set(stockData.map(item => item.center).filter(Boolean))];
        centerNames = [...new Set([...centerNames, ...stockCenters])];
        updateCenterOptions();
    } catch (error) {
        console.error('在庫データ読み込みエラー:', error);
        stockData = [];
    }
}

function setupEventListeners() {
    const inventoryForm = document.getElementById('inventory-form');
    if (inventoryForm) {
        inventoryForm.addEventListener('submit', handleInventorySubmit);
    }
    
    const productCodeInput = document.getElementById('product-code');
    if (productCodeInput) {
        productCodeInput.addEventListener('input', searchProduct);
    }
    
    const startScanBtn = document.getElementById('start-scan-btn');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    
    if (startScanBtn) {
        startScanBtn.addEventListener('click', startQRScan);
    }
    
    if (stopScanBtn) {
        stopScanBtn.addEventListener('click', stopQRScan);
    }
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', filterEditList);
    }
    
    // ロット選択時のイベントリスナーを追加
    const lotNumberInput = document.getElementById('lot-number');
    if (lotNumberInput) {
        lotNumberInput.addEventListener('change', handleLotSelection);
        lotNumberInput.addEventListener('input', handleLotSelection);
    }
}

function initBeepSound() {
    try {
        beepSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAsAABbhgAJCQkVFRUVICAgLCwsLDc3Nzc3Q0NDT09PT1paWmZmZmZxcXF9fX19iYmJlZWVlaampra2trbBwcHNzc3N2NjY5OTk5O/v7/v7+/v8/Pz8/Pz8//////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAQgAAAAAAAAW4YzgbdnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sUZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
    } catch (error) {
        console.error('ビープ音初期化エラー:', error);
        beepSound = {
            play: () => console.log('ビープ音再生（音声API非対応）')
        };
    }
}

// 画面操作機能
function showScreen(screenId) {
    try {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            
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

function showLoading(message = '処理中...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        const messageElement = loadingOverlay.querySelector('p');
        if (messageElement) {
            messageElement.textContent = message;
        }
        loadingOverlay.classList.add('show');
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = 'toast show toast-' + type;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
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

// QRコード読み取り機能
async function startQRScan() {
    try {
        if (qrScanner) {
            await stopQRScan();
        }
        
        const qrReaderElement = document.getElementById('qr-reader');
        if (!qrReaderElement) {
            throw new Error('QRリーダー要素が見つかりません');
        }
        
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
        
        setTimeout(() => {
            stopQRScan();
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

function playBeep() {
    try {
        const beepEnabled = localStorage.getItem('beepEnabled') !== 'false';
        if (beepSound && beepEnabled) {
            beepSound.play();
        }
    } catch (error) {
        console.error('ビープ音再生エラー:', error);
    }
}

// 商品検索機能（W列参照）
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
        
        // W列（JANコード）から商品を検索
        const product = productMaster.find(p => p.janCode === code);
        if (product) {
            productNameField.value = product.name;
            playBeep();
            
            // A列の商品コードで在庫データからロットを検索
            const stockItems = stockData.filter(s => s.code === product.code);
            lotList.innerHTML = '';
            
            // ロット番号と合算数量を表示
            const lotMap = new Map();
            stockItems.forEach(item => {
                if (item.lot) {
                    const total = lotMap.get(item.lot) || 0;
                    lotMap.set(item.lot, total + (parseFloat(item.quantity) || 0));
                }
            });
            
            lotMap.forEach((quantity, lot) => {
                const option = document.createElement('option');
                option.value = lot;
                option.textContent = `${lot} (在庫: ${quantity})`;
                lotList.appendChild(option);
            });
        } else {
            productNameField.value = '商品が見つかりません';
            lotList.innerHTML = '';
        }
    } catch (error) {
        console.error('商品検索エラー:', error);
    }
}

// ロット選択時の自動数量入力処理
function handleLotSelection() {
    try {
        const codeInput = document.getElementById('product-code');
        const lotInput = document.getElementById('lot-number');
        const quantityInput = document.getElementById('quantity');
        
        const code = codeInput.value.trim();
        const selectedLot = lotInput.value.trim();
        
        if (!code || !selectedLot) return;
        
        // W列から商品コードを取得
        const product = productMaster.find(p => p.janCode === code);
        if (!product) return;
        
        // 在庫データから合算処理
        const matchingStocks = stockData.filter(s => 
            s.code === product.code && s.lot === selectedLot
        );
        
        let totalQuantity = matchingStocks.reduce((sum, stock) => 
            sum + (parseFloat(stock.quantity) || 0), 0
        );
        
        quantityInput.value = totalQuantity || 1;
        quantityInput.classList.add('highlight');
        setTimeout(() => quantityInput.classList.remove('highlight'), 1000);
        
        if (totalQuantity > 0) {
            playBeep();
            showToast(`在庫数量 ${totalQuantity} を自動入力しました`, 'success');
        }
    } catch (error) {
        console.error('ロット選択処理エラー:', error);
        showToast('在庫数量の取得に失敗しました', 'error');
    }
}

// 棚卸しデータ登録
async function handleInventorySubmit(event) {
    event.preventDefault();
    
    try {
        const janCode = document.getElementById('product-code').value.trim();
        const productName = document.getElementById('product-name').value.trim();
        const quantity = parseInt(document.getElementById('quantity').value) || 1;
        const unit = document.getElementById('unit').value;
        const lot = document.getElementById('lot-number').value.trim();
        const shelf = document.getElementById('shelf-number').value.trim();
        
        if (!janCode) {
            showToast('商品コードを入力してください', 'warning');
            return;
        }
        
        if (productName === '商品が見つかりません') {
            showToast('有効な商品コードを入力してください', 'warning');
            return;
        }
        
        // JANコードから商品マスタ情報を取得
        const product = productMaster.find(p => p.janCode === janCode);
        const productCode = product ? product.code : '';
        
        const inventoryData = {
            code: productCode,
            janCode: janCode,
            name: productName || '未設定',
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
        
        resetInventoryForm();
        focusProductCode();
    } catch (error) {
        console.error('棚卸しデータ登録エラー:', error);
        showToast('登録に失敗しました', 'error');
    }
}

// データ取り込み機能
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
        
        // ヘッダー行からW列、A列、B列のインデックスを特定
        const headers = jsonData[0] || [];
        const janCodeColIndex = 22; // W列のインデックス (0ベース、Wは22)
        const productCodeColIndex = 0; // A列のインデックス
        const productNameColIndex = 1; // B列のインデックス
        
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row.length > janCodeColIndex && row[productCodeColIndex]) {
                products.push({
                    code: String(row[productCodeColIndex] || '').trim(),
                    name: String(row[productNameColIndex] || '').trim(),
                    janCode: String(row[janCodeColIndex] || '').trim(),
                    category: String(row[15] || '').trim(),
                    price: parseFloat(row[26]) || 0
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
        
        // A列、B列、C列、J列、P列のインデックスを特定
        const codeColIndex = 0;      // A列
        const nameColIndex = 1;      // B列
        const quantityColIndex = 2;  // C列
        const centerColIndex = 9;    // J列
        const lotColIndex = 15;      // P列
        
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[codeColIndex]) {
                stocks.push({
                    code: String(row[codeColIndex] || '').trim(),
                    name: String(row[nameColIndex] || '').trim(),
                    quantity: parseFloat(row[quantityColIndex]) || 0,
                    center: String(row[centerColIndex] || '').trim(),
                    lot: String(row[lotColIndex] || '').trim()
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

// データ出力機能
async function exportData() {
    try {
        const format = document.querySelector('input[name="export-format"]:checked').value;
        const inventoryData = await getData(INVENTORY_STORE);
        
        if (!inventoryData || inventoryData.length === 0) {
            showToast('出力するデータがありません', 'warning');
            return;
        }
        
        showLoading('データを出力中...');
        
        const exportData = inventoryData.map(item => {
            const stockItem = stockData.find(s => s.code === item.code && s.lot === item.lot);
            
            return {
                '商品コード': item.code,
                'JANコード': item.janCode,
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

// 編集機能
async function loadEditList() {
    try {
        const inventoryData = await getData(INVENTORY_STORE);
        const editList = document.getElementById('edit-list');
        
        if (!editList) return;
        editList.innerHTML = '';
        
        if (!inventoryData || inventoryData.length === 0) {
            editList.innerHTML = '<p class="text-center">登録データがありません</p>';
            return;
        }
        
        inventoryData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        inventoryData.forEach(item => {
            const editItem = document.createElement('div');
            editItem.className = 'edit-item';
            
            editItem.innerHTML = `
                <div class="edit-item-info">
                    <div class="code">${item.janCode || item.code}</div>
                    <div>${item.name}</div>
                    <div>${item.quantity}${item.unit} / ${item.lot || '未設定'}</div>
                </div>
                <div class="edit-item-actions">
                    <button class="btn btn--primary btn--sm" onclick="openEditModal(${item.id})">編集</button>
                    <button class="btn btn--warning btn--sm" onclick="deleteInventory(${item.id})">削除</button>
                </div>
            `;
            
            editList.appendChild(editItem);
        });
    } catch (error) {
        console.error('編集リスト読み込みエラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

function filterEditList() {
    try {
        const searchText = document.getElementById('search-input').value.toLowerCase();
        const editItems = document.querySelectorAll('.edit-item');
        
        editItems.forEach(item => {
            const code = item.querySelector('.code').textContent.toLowerCase();
            const name = item.querySelector('.edit-item-info div:nth-child(2)').textContent.toLowerCase();
            
            if (code.includes(searchText) || name.includes(searchText)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    } catch (error) {
        console.error('フィルタリングエラー:', error);
    }
}

async function openEditModal(id) {
    try {
        currentEditId = id;
        const item = await getData(INVENTORY_STORE, id);
        
        if (!item) {
            showToast('データが見つかりません', 'error');
            return;
        }
        
        document.getElementById('edit-product-code').value = item.janCode || item.code;
        document.getElementById('edit-quantity').value = item.quantity;
        document.getElementById('edit-unit').value = item.unit;
        document.getElementById('edit-lot-number').value = item.lot;
        document.getElementById('edit-shelf-number').value = item.shelf;
        
        document.getElementById('edit-modal').classList.add('show');
    } catch (error) {
        console.error('編集モーダルオープンエラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('show');
    currentEditId = null;
}

async function saveEdit() {
    try {
        if (!currentEditId) {
            showToast('編集対象が見つかりません', 'error');
            return;
        }
        
        const item = await getData(INVENTORY_STORE, currentEditId);
        
        if (!item) {
            showToast('データが見つかりません', 'error');
            return;
        }
        
        item.quantity = parseInt(document.getElementById('edit-quantity').value) || 0;
        item.unit = document.getElementById('edit-unit').value;
        item.lot = document.getElementById('edit-lot-number').value;
        item.shelf = document.getElementById('edit-shelf-number').value;
        
        await saveData(INVENTORY_STORE, item);
        
        closeEditModal();
        loadEditList();
        showToast('データを更新しました', 'success');
    } catch (error) {
        console.error('データ更新エラー:', error);
        showToast('データの更新に失敗しました', 'error');
    }
}

async function deleteInventory(id) {
    try {
        if (confirm('このデータを削除しますか？')) {
            await deleteData(INVENTORY_STORE, id);
            loadEditList();
            showToast('データを削除しました', 'success');
        }
    } catch (error) {
        console.error('データ削除エラー:', error);
        showToast('データの削除に失敗しました', 'error');
    }
}

async function clearAllData() {
    try {
        if (confirm('すべての棚卸しデータを削除しますか？この操作は元に戻せません。')) {
            await clearStore(INVENTORY_STORE);
            loadEditList();
            updateDataSummary();
            showToast('すべてのデータを削除しました', 'success');
        }
    } catch (error) {
        console.error('データ全削除エラー:', error);
        showToast('データの削除に失敗しました', 'error');
    }
}

// 設定機能
function loadSettings() {
    const personName = localStorage.getItem('personName') || '';
    const centerName = localStorage.getItem('centerName') || '';
    const beepEnabled = localStorage.getItem('beepEnabled') !== 'false';
    
    const personNameInput = document.getElementById('person-name');
    const centerNameSelect = document.getElementById('center-name');
    const beepEnabledCheckbox = document.getElementById('beep-enabled');
    
    if (personNameInput) {
        personNameInput.value = personName;
    }
    
    if (centerNameSelect) {
        centerNameSelect.value = centerName;
    }
    
    if (beepEnabledCheckbox) {
        beepEnabledCheckbox.checked = beepEnabled;
    }
}

function saveSettings() {
    try {
        const personName = document.getElementById('person-name').value;
        const centerName = document.getElementById('center-name').value;
        const beepEnabled = document.getElementById('beep-enabled').checked;
        
        localStorage.setItem('personName', personName);
        localStorage.setItem('centerName', centerName);
        localStorage.setItem('beepEnabled', beepEnabled);
        
        showToast('設定を保存しました', 'success');
    } catch (error) {
        console.error('設定保存エラー:', error);
        showToast('設定の保存に失敗しました', 'error');
    }
}

function updateCenterOptions() {
    const centerSelect = document.getElementById('center-name');
    if (!centerSelect) return;
    
    const currentValue = centerSelect.value;
    
    centerSelect.innerHTML = '<option value="">センターを選択</option>';
    
    centerNames.forEach(center => {
        if (center) {
            const option = document.createElement('option');
            option.value = center;
            option.textContent = center;
            centerSelect.appendChild(option);
        }
    });
    
    if (currentValue) {
        centerSelect.value = currentValue;
    }
}

// データ状況更新
async function updateDataSummary() {
    try {
        const products = await getData(PRODUCT_STORE) || [];
        const stock = await getData(STOCK_STORE) || [];
        const inventory = await getData(INVENTORY_STORE) || [];
        
        const productStatus = document.getElementById('product-status');
        const stockStatus = document.getElementById('stock-status');
        const inventoryStatus = document.getElementById('inventory-status');
        const exportCount = document.getElementById('export-count');
        
        if (productStatus) productStatus.textContent = `${products.length}件`;
        if (stockStatus) stockStatus.textContent = `${stock.length}件`;
        if (inventoryStatus) inventoryStatus.textContent = `${inventory.length}件`;
        if (exportCount) exportCount.textContent = inventory.length;
    } catch (error) {
        console.error('データ状況更新エラー:', error);
    }
}

async function updateExportSummary() {
    try {
        const inventory = await getData(INVENTORY_STORE) || [];
        const exportCount = document.getElementById('export-count');
        
        if (exportCount) {
            exportCount.textContent = inventory.length;
        }
    } catch (error) {
        console.error('出力サマリー更新エラー:', error);
    }
}
