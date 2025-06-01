// 棚卸し管理PWAアプリケーション - v1.1.0
// 更新：商品マスタのW列（JANコード）参照、ロット選択ロジック改善

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

// サンプルデータ
const SAMPLE_PRODUCTS = [
    {"janCode": "4562152082298", "code": "01A0194", "name": "フルーツ缶詰　黄桃　4号　ライト"},
    {"janCode": "4562152082304", "code": "01A0195", "name": "フルーツ缶詰　白桃　4号　ライト"},
    {"janCode": "4562152089525", "code": "01A0412", "name": "Jeretería　フレッシュフルーツ　オレンジ"},
    {"janCode": "4562152089532", "code": "01A0413", "name": "Jeretería　フレッシュフルーツ　マスカット"},
    {"janCode": "4562152089563", "code": "01A0416", "name": "Jeretería くだものぎっしり　みかん"},
    {"janCode": "4562152089570", "code": "01A0417", "name": "Jeretería くだものぎっしり　白桃"},
    {"janCode": "4562152089587", "code": "01A0418", "name": "Jeretería くだものぎっしり　ぶどう＆ナタデココ"},
    {"janCode": "4562152089594", "code": "01A0419", "name": "Jeretería くだものぎっしり　ミックス"},
    {"janCode": "4562152080003", "code": "01A0453", "name": "くだものごろん　みかんゼリー002"},
    {"janCode": "4573116020492", "code": "01A0759", "name": "ぷるっとゼリー　みかん"},
    {"janCode": "4573116020515", "code": "01A0761", "name": "ぷるっとゼリー　ミックス"},
    {"janCode": "4562152081109", "code": "EA00103", "name": "有機栽培天津甘栗　小袋"}
];

const SAMPLE_STOCK = [
    {"code": "01A0194", "quantity": 8400, "center": "コンテナ倉庫", "lot": "240321调整"},
    {"code": "01A0195", "quantity": 6000, "center": "コンテナ倉庫", "lot": "240321调整"},
    {"code": "01A0412", "quantity": 96, "center": "島田完成品倉庫", "lot": "11000-250329"},
    {"code": "01A0412", "quantity": 720, "center": "島田完成品倉庫", "lot": "11407-250507"},
    {"code": "01A0413", "quantity": 432, "center": "吉田使用禁止倉庫", "lot": "10316-241224"},
    {"code": "01A0413", "quantity": 96, "center": "島田完成品倉庫", "lot": "11260-250422"},
    {"code": "01A0416", "quantity": 36, "center": "島田完成品倉庫", "lot": "10723-250303"},
    {"code": "01A0416", "quantity": 12, "center": "島田完成品倉庫", "lot": "10723-250310"},
    {"code": "01A0417", "quantity": 12, "center": "吉田完成品B品倉庫", "lot": "10269-241217"},
    {"code": "01A0417", "quantity": 5664, "center": "島田完成品倉庫", "lot": "11036-250402-2"},
    {"code": "01A0418", "quantity": 36, "center": "島田完成品倉庫", "lot": "10507-250208"},
    {"code": "01A0418", "quantity": 96, "center": "島田完成品倉庫", "lot": "10835-250317-1"},
    {"code": "01A0419", "quantity": 168, "center": "島田完成品倉庫", "lot": "10798-250312"},
    {"code": "01A0419", "quantity": 24, "center": "島田完成品倉庫", "lot": "10974-250327-1"},
    {"code": "01A0453", "quantity": 48, "center": "吉田使用禁止倉庫", "lot": "240930调整"},
    {"code": "01A0453", "quantity": 24960, "center": "コンテナ倉庫", "lot": "CTLS-H0731-48-22"},
    {"code": "01A0759", "quantity": 24, "center": "吉田使用禁止倉庫", "lot": "241130调整"},
    {"code": "01A0759", "quantity": 852, "center": "吉田完成品B品倉庫", "lot": "8451-2405021"},
    {"code": "01A0761", "quantity": 12, "center": "島田完成品倉庫", "lot": "11273-250424-2"},
    {"code": "01A0761", "quantity": 20292, "center": "島田完成品倉庫", "lot": "11273-250424-2"},
    {"code": "EA00103", "quantity": 100, "center": "吉田完成品B品倉庫", "lot": "240630调整2"},
    {"code": "EA00103", "quantity": 800, "center": "島田完成品倉庫", "lot": "240831调整"},
    {"code": "EA00103", "quantity": 20, "center": "島田完成品倉庫", "lot": "241130调整"}
];

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
                const inventoryStore = db.createObjectStore(INVENTORY_STORE, { keyPath: 'id', autoIncrement: true });
                inventoryStore.createIndex('code', 'code', { unique: false });
                inventoryStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            // 商品マスタストア
            if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
                const productStore = db.createObjectStore(PRODUCT_STORE, { keyPath: 'janCode' });
                productStore.createIndex('code', 'code', { unique: false });
                productStore.createIndex('name', 'name', { unique: false });
            }
            
            // 在庫データストア
            if (!db.objectStoreNames.contains(STOCK_STORE)) {
                const stockStore = db.createObjectStore(STOCK_STORE, { keyPath: 'id', autoIncrement: true });
                stockStore.createIndex('code', 'code', { unique: false });
                stockStore.createIndex('lot', 'lot', { unique: false });
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

// インデックスからデータ検索
async function getDataByIndex(storeName, indexName, value) {
    try {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('インデックス検索エラー:', error);
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
        // ローディング表示
        showLoading('アプリを初期化中...');
        
        // IndexedDBを開く
        db = await openDB();
        
        // サンプルデータを初期化
        await initializeSampleData();
        
        // データ読み込み
        await loadProductMaster();
        await loadStockData();
        await updateDataSummary();
        
        // PWA対応
        registerServiceWorker();
        
        // ローディング非表示
        hideLoading();
    } catch (error) {
        console.error('アプリ初期化エラー:', error);
        hideLoading();
        throw error;
    }
}

// サンプルデータの初期化
async function initializeSampleData() {
    try {
        // 既存のデータをチェック
        const existingProducts = await getData(PRODUCT_STORE);
        const existingStock = await getData(STOCK_STORE);
        
        // データが空の場合のみサンプルデータを追加
        if (!existingProducts || existingProducts.length === 0) {
            await saveData(PRODUCT_STORE, SAMPLE_PRODUCTS);
            console.log('サンプル商品マスタを初期化しました');
        }
        
        if (!existingStock || existingStock.length === 0) {
            await saveData(STOCK_STORE, SAMPLE_STOCK);
            console.log('サンプル在庫データを初期化しました');
        }
    } catch (error) {
        console.error('サンプルデータ初期化エラー:', error);
    }
}

// Service Workerの登録
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const swUrl = 'sw.js';
            // オンライン版のため、PWAマニフェストとService Workerを実際に用意する必要がある
            const registration = await navigator.serviceWorker.register(swUrl, { scope: './' });
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
    
    // 編集画面の検索機能
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', filterEditList);
    }
}

function initBeepSound() {
    try {
        beepSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAsAABbhgAJCQkVFRUVICAgLCwsLDc3Nzc3Q0NDT09PT1paWmZmZmZxcXF9fX19iYmJlZWVlaampra2trbBwcHNzc3N2NjY5OTk5O/v7/v7+/v8/Pz8/Pz8//////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAQgAAAAAAAAW4YzgbdnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sUZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
    } catch (error) {
        console.error('ビープ音初期化エラー:', error);
        // 音声APIが使えない場合のダミー関数
        beepSound = {
            play: () => console.log('ビープ音再生（音声API非対応）')
        };
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
    
    // ロットリストをクリア
    const lotList = document.getElementById('lot-list');
    if (lotList) {
        lotList.innerHTML = '';
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
        
        // フォーカスをロットフィールドに移動
        setTimeout(() => {
            const lotInput = document.getElementById('lot-number');
            if (lotInput) {
                lotInput.focus();
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

// -------------------------------
// 商品検索機能 - 更新済み
// -------------------------------

async function searchProduct() {
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
        
        // JANコード（W列）で商品を検索
        let product = null;
        // まずJANコードとして検索
        const products = await getData(PRODUCT_STORE, code);
        
        if (products) {
            // JANコードで見つかった場合
            product = products;
            productNameField.value = product.name;
            playBeep();
        } else {
            // JANコードで見つからない場合、コードインデックスから検索
            const productsByCode = await getDataByIndex(PRODUCT_STORE, 'code', code);
            
            if (productsByCode && productsByCode.length > 0) {
                product = productsByCode[0];
                productNameField.value = product.name;
                playBeep();
            } else {
                productNameField.value = '商品が見つかりません';
                if (lotList) lotList.innerHTML = '';
                return;
            }
        }
        
        // 商品が見つかったら、そのA列の商品コードを使用して在庫データからロットを検索
        if (product && lotList) {
            // 商品の商品コードを取得
            const productCode = product.code;
            
            // その商品コードを使用して在庫データからロットを検索
            const stockItems = await getDataByIndex(STOCK_STORE, 'code', productCode);
            lotList.innerHTML = '';
            
            if (stockItems && stockItems.length > 0) {
                stockItems.forEach(item => {
                    if (item.lot) {
                        const option = document.createElement('option');
                        option.value = item.lot;
                        lotList.appendChild(option);
                    }
                });
                showToast(`${stockItems.length}件のロットが見つかりました`, 'success');
            } else {
                showToast('在庫データが見つかりません', 'warning');
            }
        }
    } catch (error) {
        console.error('商品検索エラー:', error);
        showToast('検索中にエラーが発生しました', 'error');
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
// データ取り込み機能 - 更新済み
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
            if (row && row.length > 22) { // W列まであることを確認
                // JANコード（W列）がある行のみ処理
                const janCode = String(row[22] || '').trim();
                if (janCode) {
                    const productCode = String(row[0] || '').trim();
                    const productName = String(row[1] || '').trim();
                    
                    if (productCode && productName) {
                        products.push({
                            janCode: janCode,
                            code: productCode,
                            name: productName,
                            category: String(row[15] || '').trim(),
                            price: parseFloat(row[26]) || 0
                        });
                    }
                }
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
            if (row && row.length > 15) { // P列まであることを確認
                if (row[0]) { // A列の商品番号がある行のみ処理
                    stocks.push({
                        code: String(row[0]).trim(), // A列: 商品番号
                        name: String(row[1] || '').trim(), // B列: 商品名称
                        quantity: parseFloat(row[2]) || 0, // C列: 数量
                        center: String(row[9] || '').trim(), // J列: 倉庫名
                        lot: String(row[15] || '').trim() // P列: ロット
                    });
                }
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
            const stockItem = stockData.find(s => s.code === item.code && s.lot === item.lot);
            
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
            editList.innerHTML = '<p class="text-center">登録データがありません</p>';
            return;
        }
        
        // 新しい順に並べ替え
        inventoryData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        inventoryData.forEach(item => {
            const editItem = document.createElement('div');
            editItem.className = 'edit-item';
            
            editItem.innerHTML = `
                <div class="edit-item-info">
                    <div class="code">${item.code}</div>
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
        
        document.getElementById('edit-product-code').value = item.code;
        document.getElementById('edit-product-name').value = item.name;
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
        
        // 更新するフィールド
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

// -------------------------------
// 設定機能
// -------------------------------

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
    
    // 現在の選択値を保持
    const currentValue = centerSelect.value;
    
    // オプションをクリア
    centerSelect.innerHTML = '<option value="">センターを選択</option>';
    
    // センター名を追加
    centerNames.forEach(center => {
        if (center) {
            const option = document.createElement('option');
            option.value = center;
            option.textContent = center;
            centerSelect.appendChild(option);
        }
    });
    
    // 以前の値があれば復元
    if (currentValue) {
        centerSelect.value = currentValue;
    }
}

async function createBackup() {
    try {
        showLoading('バックアップを作成中...');
        
        const backup = {
            products: await getData(PRODUCT_STORE),
            stock: await getData(STOCK_STORE),
            inventory: await getData(INVENTORY_STORE),
            version: '1.1.0',
            timestamp: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `棚卸しデータバックアップ_${new Date().toISOString().slice(0, 10)}.json`;
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
// データ状況更新
// -------------------------------

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