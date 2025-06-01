// Global variables
let db;
let html5QrCode;
let currentSettings = {
    personName: '',
    centerName: '',
    soundFeedback: true
};

// Sample data from the provided JSON
const sampleProducts = [
    {"code": "P001", "name": "醤油 1L", "category": "調味料", "price": 300, "manufacturer": "調味料製造"},
    {"code": "P002", "name": "味噌 500g", "category": "調味料", "price": 250, "manufacturer": "調味料製造"},
    {"code": "P003", "name": "砂糖 1kg", "category": "調味料", "price": 200, "manufacturer": "甘味料工場"},
    {"code": "P004", "name": "塩 500g", "category": "調味料", "price": 100, "manufacturer": "塩田製塩"},
    {"code": "P005", "name": "米 5kg", "category": "食品", "price": 2000, "manufacturer": "米穀店"}
];

const sampleStock = [
    {"id": 1, "code": "P001", "name": "醤油 1L", "quantity": 50, "center": "東京センター", "lot": "LOT20250101"},
    {"id": 2, "code": "P001", "name": "醤油 1L", "quantity": 30, "center": "東京センター", "lot": "LOT20250115"},
    {"id": 3, "code": "P002", "name": "味噌 500g", "quantity": 25, "center": "東京センター", "lot": "LOT20250110"},
    {"id": 4, "code": "P002", "name": "味噌 500g", "quantity": 40, "center": "東京センター", "lot": "LOT20250120"},
    {"id": 5, "code": "P003", "name": "砂糖 1kg", "quantity": 100, "center": "大阪センター", "lot": "LOT20250105"},
    {"id": 6, "code": "P004", "name": "塩 500g", "quantity": 80, "center": "東京センター", "lot": "LOT20250112"},
    {"id": 7, "code": "P005", "name": "米 5kg", "quantity": 60, "center": "東京センター", "lot": "LOT20250108"}
];

// IndexedDB setup
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('InventoryDB', 1);
        
        request.onerror = () => {
            console.error('Database error:', request.error);
            resolve(null); // Don't reject, just resolve with null
        };
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            try {
                // Inventory store
                if (!db.objectStoreNames.contains('INVENTORY_STORE')) {
                    const inventoryStore = db.createObjectStore('INVENTORY_STORE', { keyPath: 'id', autoIncrement: true });
                    inventoryStore.createIndex('code', 'code', { unique: false });
                    inventoryStore.createIndex('datetime', 'datetime', { unique: false });
                }
                
                // Product store
                if (!db.objectStoreNames.contains('PRODUCT_STORE')) {
                    const productStore = db.createObjectStore('PRODUCT_STORE', { keyPath: 'code' });
                    productStore.createIndex('name', 'name', { unique: false });
                }
                
                // Stock store
                if (!db.objectStoreNames.contains('STOCK_STORE')) {
                    const stockStore = db.createObjectStore('STOCK_STORE', { keyPath: 'id', autoIncrement: true });
                    stockStore.createIndex('code', 'code', { unique: false });
                    stockStore.createIndex('lot', 'lot', { unique: false });
                }
            } catch (error) {
                console.error('Database setup error:', error);
            }
        };
    });
}

// Database operations with error handling
async function addData(storeName, data) {
    if (!db) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(); // Don't reject on duplicates
        } catch (error) {
            resolve(); // Silent fail
        }
    });
}

async function getData(storeName, key = null) {
    if (!db) return Promise.resolve([]);
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = key ? store.get(key) : store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        } catch (error) {
            resolve([]);
        }
    });
}

async function updateData(storeName, data) {
    if (!db) return Promise.resolve();
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve();
        } catch (error) {
            resolve();
        }
    });
}

async function deleteData(storeName, key) {
    if (!db) return Promise.resolve();
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        } catch (error) {
            resolve();
        }
    });
}

// Load sample data
async function loadSampleData() {
    if (!db) return;
    
    try {
        // Load sample products
        for (const product of sampleProducts) {
            await addData('PRODUCT_STORE', product);
        }
        
        // Load sample stock
        for (const stock of sampleStock) {
            await addData('STOCK_STORE', stock);
        }
        
        console.log('Sample data loaded');
    } catch (error) {
        console.error('Sample data loading error:', error);
    }
}

// Screen management
function showScreen(screenId) {
    try {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
        
        // Load screen-specific data
        switch (screenId) {
            case 'edit':
                loadEditData();
                break;
            case 'view':
                loadViewData();
                break;
            case 'settings':
                loadSettings();
                break;
        }
    } catch (error) {
        console.error('Screen navigation error:', error);
    }
}

// Toast notification
function showToast(message, type = 'info') {
    try {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        if (toast && toastMessage) {
            toastMessage.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    } catch (error) {
        console.error('Toast error:', error);
    }
}

// Loading overlay
function showLoading(show = true) {
    try {
        const loading = document.getElementById('loading');
        if (loading) {
            if (show) {
                loading.classList.remove('hidden');
            } else {
                loading.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Loading overlay error:', error);
    }
}

// QR Code Scanner
function initScanner() {
    try {
        const scanBtn = document.getElementById('scan-btn');
        const scannerModal = document.getElementById('scanner-modal');
        const closeScannerBtn = document.getElementById('close-scanner');
        const torchBtn = document.getElementById('torch-btn');
        
        if (scanBtn && scannerModal && closeScannerBtn) {
            scanBtn.addEventListener('click', () => {
                scannerModal.classList.add('active');
                startScanning();
            });
            
            closeScannerBtn.addEventListener('click', () => {
                stopScanning();
                scannerModal.classList.remove('active');
            });
        }
        
        if (torchBtn) {
            torchBtn.addEventListener('click', () => {
                if (html5QrCode && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
                    html5QrCode.applyVideoConstraints({
                        advanced: [{ torch: true }]
                    }).catch(err => {
                        console.log('Torch not supported:', err);
                        showToast('ライト機能はサポートされていません', 'warning');
                    });
                }
            });
        }
    } catch (error) {
        console.error('Scanner init error:', error);
    }
}

function startScanning() {
    try {
        if (typeof Html5Qrcode !== 'undefined') {
            html5QrCode = new Html5Qrcode("qr-reader");
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            html5QrCode.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                onScanFailure
            ).catch(err => {
                console.error('Scanner start failed:', err);
                showToast('カメラの起動に失敗しました', 'error');
            });
        } else {
            showToast('QRスキャナーライブラリが読み込まれていません', 'error');
        }
    } catch (error) {
        console.error('Scanner start error:', error);
        showToast('スキャナーの開始に失敗しました', 'error');
    }
}

function stopScanning() {
    try {
        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
            }).catch(err => {
                console.error('Scanner stop failed:', err);
            });
        }
    } catch (error) {
        console.error('Scanner stop error:', error);
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    try {
        // Stop scanning and close modal
        stopScanning();
        const scannerModal = document.getElementById('scanner-modal');
        if (scannerModal) {
            scannerModal.classList.remove('active');
        }
        
        // Set the scanned code
        const productCodeInput = document.getElementById('product-code');
        if (productCodeInput) {
            productCodeInput.value = decodedText;
        }
        
        // Play success sound
        if (currentSettings.soundFeedback) {
            playBeep();
        }
        
        // Auto-lookup product and lots
        await lookupProduct(decodedText);
        
        showToast('QRコードを読み取りました', 'success');
    } catch (error) {
        console.error('Scan success handler error:', error);
    }
}

function onScanFailure(error) {
    // Silent failure - don't spam console
}

function playBeep() {
    try {
        // Create audio context for beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Audio not supported:', error);
    }
}

// Product lookup
async function lookupProduct(code) {
    try {
        if (!db) {
            // Fallback to sample data
            const product = sampleProducts.find(p => p.code === code);
            const productNameDiv = document.getElementById('product-name');
            
            if (productNameDiv) {
                if (product) {
                    productNameDiv.textContent = product.name;
                    productNameDiv.style.color = 'var(--color-text)';
                } else {
                    productNameDiv.textContent = '登録なし';
                    productNameDiv.style.color = 'var(--color-error)';
                }
            }
            
            // Load lots from sample data
            loadLotsFromSample(code);
            return;
        }
        
        const transaction = db.transaction(['PRODUCT_STORE'], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(code);
        
        request.onsuccess = () => {
            const product = request.result;
            const productNameDiv = document.getElementById('product-name');
            
            if (productNameDiv) {
                if (product) {
                    productNameDiv.textContent = product.name;
                    productNameDiv.style.color = 'var(--color-text)';
                } else {
                    productNameDiv.textContent = '登録なし';
                    productNameDiv.style.color = 'var(--color-error)';
                }
            }
        };
        
        request.onerror = () => {
            console.error('Product lookup failed');
        };
        
        // Load lots for this product
        await loadLots(code);
        
    } catch (error) {
        console.error('Product lookup error:', error);
        
        // Fallback to sample data
        const product = sampleProducts.find(p => p.code === code);
        const productNameDiv = document.getElementById('product-name');
        
        if (productNameDiv) {
            if (product) {
                productNameDiv.textContent = product.name;
                productNameDiv.style.color = 'var(--color-text)';
            } else {
                productNameDiv.textContent = '登録なし';
                productNameDiv.style.color = 'var(--color-error)';
            }
        }
        
        loadLotsFromSample(code);
    }
}

// Load lots for product
async function loadLots(code) {
    try {
        if (!db) {
            loadLotsFromSample(code);
            return;
        }
        
        const transaction = db.transaction(['STOCK_STORE'], 'readonly');
        const store = transaction.objectStore('STOCK_STORE');
        const index = store.index('code');
        const request = index.getAll(code);
        
        request.onsuccess = () => {
            const stocks = request.result || [];
            updateLotSelect(stocks);
        };
        
        request.onerror = () => {
            loadLotsFromSample(code);
        };
        
    } catch (error) {
        console.error('Lot loading error:', error);
        loadLotsFromSample(code);
    }
}

function loadLotsFromSample(code) {
    const stocks = sampleStock.filter(s => s.code === code);
    updateLotSelect(stocks);
}

function updateLotSelect(stocks) {
    const lotSelect = document.getElementById('lot-select');
    
    if (lotSelect) {
        // Clear existing options except default ones
        lotSelect.innerHTML = `
            <option value="">ロットを選択してください</option>
            <option value="manual">その他（手入力）</option>
        `;
        
        // Add lots from stock data
        stocks.forEach(stock => {
            const option = document.createElement('option');
            option.value = stock.lot;
            option.textContent = `${stock.lot} (在庫: ${stock.quantity})`;
            option.dataset.quantity = stock.quantity;
            lotSelect.appendChild(option);
        });
    }
}

// Lot selection handling
function initLotSelection() {
    try {
        const lotSelect = document.getElementById('lot-select');
        const lotManual = document.getElementById('lot-manual');
        const quantityInput = document.getElementById('quantity');
        
        if (lotSelect && lotManual && quantityInput) {
            lotSelect.addEventListener('change', (e) => {
                const selectedValue = e.target.value;
                const selectedOption = e.target.selectedOptions[0];
                
                if (selectedValue === 'manual') {
                    lotManual.classList.remove('hidden');
                    lotManual.focus();
                } else {
                    lotManual.classList.add('hidden');
                    
                    // Auto-fill quantity if available
                    if (selectedOption && selectedOption.dataset.quantity) {
                        quantityInput.value = selectedOption.dataset.quantity;
                    }
                }
            });
        }
    } catch (error) {
        console.error('Lot selection init error:', error);
    }
}

// Form handling
function initInventoryForm() {
    try {
        const registerBtn = document.getElementById('register-btn');
        const clearBtn = document.getElementById('clear-btn');
        const productCodeInput = document.getElementById('product-code');
        
        if (registerBtn) {
            registerBtn.addEventListener('click', registerInventory);
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', clearForm);
        }
        
        // Auto-lookup on code input
        if (productCodeInput) {
            productCodeInput.addEventListener('blur', async (e) => {
                const code = e.target.value.trim();
                if (code) {
                    await lookupProduct(code);
                }
            });
        }
    } catch (error) {
        console.error('Form init error:', error);
    }
}

async function registerInventory() {
    try {
        showLoading(true);
        
        const code = document.getElementById('product-code')?.value.trim() || '';
        const lotSelect = document.getElementById('lot-select');
        const lotManual = document.getElementById('lot-manual');
        const quantityInput = document.getElementById('quantity');
        const unit = document.getElementById('unit')?.value || '個';
        const shelf = document.getElementById('shelf')?.value.trim() || '';
        
        const quantity = parseInt(quantityInput?.value || '0');
        
        // Validation
        if (!code) {
            showToast('商品コードを入力してください', 'error');
            showLoading(false);
            return;
        }
        
        if (!quantity || quantity <= 0) {
            showToast('数量を正しく入力してください', 'error');
            showLoading(false);
            return;
        }
        
        let lot = '';
        if (lotSelect?.value === 'manual') {
            lot = lotManual?.value.trim() || '';
        } else {
            lot = lotSelect?.value || '';
        }
        
        if (!lot) {
            showToast('ロットを選択または入力してください', 'error');
            showLoading(false);
            return;
        }
        
        // Get product name
        const productNameDiv = document.getElementById('product-name');
        const name = productNameDiv?.textContent || '';
        
        // Create inventory record
        const inventoryData = {
            code,
            name,
            quantity,
            unit,
            lot,
            shelf,
            center: currentSettings.centerName,
            person: currentSettings.personName,
            datetime: new Date().toISOString()
        };
        
        await addData('INVENTORY_STORE', inventoryData);
        
        showToast('棚卸しデータを登録しました', 'success');
        
        // Play success sound
        if (currentSettings.soundFeedback) {
            playBeep();
        }
        
        // Clear form for next entry
        clearForm();
        
        // Focus on product code for next entry
        const productCodeInput = document.getElementById('product-code');
        if (productCodeInput) {
            productCodeInput.focus();
        }
        
    } catch (error) {
        console.error('Registration error:', error);
        showToast('登録に失敗しました', 'error');
    } finally {
        showLoading(false);
    }
}

function clearForm() {
    try {
        const elements = [
            'product-code',
            'quantity',
            'shelf'
        ];
        
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.value = '';
            }
        });
        
        const productNameDiv = document.getElementById('product-name');
        if (productNameDiv) {
            productNameDiv.textContent = '';
        }
        
        const lotSelect = document.getElementById('lot-select');
        if (lotSelect) {
            lotSelect.value = '';
            lotSelect.innerHTML = `
                <option value="">ロットを選択してください</option>
                <option value="manual">その他（手入力）</option>
            `;
        }
        
        const lotManual = document.getElementById('lot-manual');
        if (lotManual) {
            lotManual.value = '';
            lotManual.classList.add('hidden');
        }
    } catch (error) {
        console.error('Clear form error:', error);
    }
}

// Data import functions
async function importProducts() {
    const fileInput = document.getElementById('product-file');
    const file = fileInput?.files[0];
    
    if (!file) {
        showToast('ファイルを選択してください', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        if (typeof XLSX === 'undefined') {
            showToast('Excel処理ライブラリが読み込まれていません', 'error');
            showLoading(false);
            return;
        }
        
        const data = await readExcelFile(file);
        const worksheet = data.Sheets[data.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        let importCount = 0;
        
        for (const row of jsonData) {
            const product = {
                code: row['商品コード'] || row['code'] || row['Code'],
                name: row['商品名'] || row['name'] || row['Name'],
                category: row['カテゴリ'] || row['category'] || row['Category'] || '',
                price: row['価格'] || row['price'] || row['Price'] || 0,
                manufacturer: row['メーカー'] || row['manufacturer'] || row['Manufacturer'] || ''
            };
            
            if (product.code && product.name) {
                await updateData('PRODUCT_STORE', product);
                importCount++;
            }
        }
        
        showToast(`${importCount}件の商品マスタを取り込みました`, 'success');
        
        if (fileInput) {
            fileInput.value = '';
        }
        
    } catch (error) {
        console.error('Product import error:', error);
        showToast('商品マスタの取り込みに失敗しました', 'error');
    } finally {
        showLoading(false);
    }
}

async function importStock() {
    const fileInput = document.getElementById('stock-file');
    const file = fileInput?.files[0];
    
    if (!file) {
        showToast('ファイルを選択してください', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        if (typeof XLSX === 'undefined') {
            showToast('Excel処理ライブラリが読み込まれていません', 'error');
            showLoading(false);
            return;
        }
        
        const data = await readExcelFile(file);
        const worksheet = data.Sheets[data.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        let importCount = 0;
        const centers = new Set();
        
        // Skip header row, start from index 1
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            const stock = {
                code: row[0], // A列: 商品番号
                name: row[1], // B列: 商品名称
                quantity: parseInt(row[2]) || 0, // C列: 即時在庫数量
                center: row[9], // J列: 倉庫名
                lot: row[15] // P列: ロットNo.
            };
            
            if (stock.code && stock.name && stock.lot) {
                await addData('STOCK_STORE', stock);
                importCount++;
                
                if (stock.center) {
                    centers.add(stock.center);
                }
            }
        }
        
        // Update center list in settings
        updateCenterList(Array.from(centers));
        
        showToast(`${importCount}件の在庫データを取り込みました`, 'success');
        
        if (fileInput) {
            fileInput.value = '';
        }
        
    } catch (error) {
        console.error('Stock import error:', error);
        showToast('在庫データの取り込みに失敗しました', 'error');
    } finally {
        showLoading(false);
    }
}

function readExcelFile(file) {
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

function updateCenterList(centers) {
    const centerSelect = document.getElementById('center-name');
    
    if (centerSelect) {
        // Keep existing options
        const existingOptions = Array.from(centerSelect.options).map(opt => opt.value);
        
        centers.forEach(center => {
            if (!existingOptions.includes(center)) {
                const option = document.createElement('option');
                option.value = center;
                option.textContent = center;
                centerSelect.appendChild(option);
            }
        });
    }
}

// Data export
async function exportData() {
    try {
        showLoading(true);
        
        const format = document.getElementById('export-format')?.value || 'csv';
        const data = await getData('INVENTORY_STORE');
        
        if (data.length === 0) {
            showToast('エクスポートするデータがありません', 'warning');
            showLoading(false);
            return;
        }
        
        if (format === 'csv') {
            exportToCSV(data);
        } else {
            exportToExcel(data);
        }
        
        showToast('データをエクスポートしました', 'success');
        
    } catch (error) {
        console.error('Export error:', error);
        showToast('エクスポートに失敗しました', 'error');
    } finally {
        showLoading(false);
    }
}

function exportToCSV(data) {
    const headers = ['ID', '商品コード', '商品名', '数量', '単位', 'ロット', '棚番号', 'センター', '担当者', '登録日時'];
    
    const csvContent = [
        headers.join(','),
        ...data.map(item => [
            item.id || '',
            item.code || '',
            item.name || '',
            item.quantity || '',
            item.unit || '',
            item.lot || '',
            item.shelf || '',
            item.center || '',
            item.person || '',
            item.datetime ? new Date(item.datetime).toLocaleString('ja-JP') : ''
        ].map(field => `"${field}"`).join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'inventory_export.csv', 'text/csv;charset=utf-8;');
}

function exportToExcel(data) {
    try {
        if (typeof XLSX === 'undefined') {
            showToast('Excel処理ライブラリが読み込まれていません', 'error');
            return;
        }
        
        const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
            'ID': item.id || '',
            '商品コード': item.code || '',
            '商品名': item.name || '',
            '数量': item.quantity || '',
            '単位': item.unit || '',
            'ロット': item.lot || '',
            '棚番号': item.shelf || '',
            'センター': item.center || '',
            '担当者': item.person || '',
            '登録日時': item.datetime ? new Date(item.datetime).toLocaleString('ja-JP') : ''
        })));
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '棚卸しデータ');
        
        XLSX.writeFile(workbook, 'inventory_export.xlsx');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excelエクスポートでエラーが発生しました', 'error');
    }
}

function downloadFile(content, filename, contentType) {
    try {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        showToast('ファイルダウンロードに失敗しました', 'error');
    }
}

// Edit functionality
async function loadEditData() {
    try {
        const data = await getData('INVENTORY_STORE');
        const editList = document.getElementById('edit-list');
        
        if (editList) {
            if (data.length === 0) {
                editList.innerHTML = '<div class="empty-state"><h3>編集可能なデータがありません</h3></div>';
                return;
            }
            
            editList.innerHTML = data.map(item => `
                <div class="edit-item">
                    <div class="edit-item-info">
                        <h4>${item.name || item.code}</h4>
                        <p>数量: ${item.quantity}${item.unit} | ロット: ${item.lot} | 棚: ${item.shelf}</p>
                    </div>
                    <div class="edit-item-actions">
                        <button class="btn btn--sm btn--outline" onclick="editItem(${item.id})">編集</button>
                        <button class="btn btn--sm btn--outline" onclick="deleteItem(${item.id})">削除</button>
                    </div>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Edit data loading error:', error);
    }
}

async function deleteItem(id) {
    if (confirm('このデータを削除しますか？')) {
        try {
            await deleteData('INVENTORY_STORE', id);
            showToast('データを削除しました', 'success');
            loadEditData();
        } catch (error) {
            console.error('Delete error:', error);
            showToast('削除に失敗しました', 'error');
        }
    }
}

function editItem(id) {
    // For simplicity, we'll just show a basic edit form
    // In a real application, you'd want a more sophisticated edit UI
    showToast('編集機能は開発中です', 'info');
}

// View/Statistics functionality
async function loadViewData() {
    try {
        const inventory = await getData('INVENTORY_STORE');
        const products = await getData('PRODUCT_STORE');
        const stock = await getData('STOCK_STORE');
        
        // Update statistics
        const totalItems = document.getElementById('total-items');
        const totalProducts = document.getElementById('total-products');
        const stockItems = document.getElementById('stock-items');
        
        if (totalItems) totalItems.textContent = inventory.length;
        if (totalProducts) totalProducts.textContent = products.length;
        if (stockItems) stockItems.textContent = stock.length;
        
        // Show recent entries
        const recentList = document.getElementById('recent-list');
        if (recentList) {
            const recentEntries = inventory
                .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
                .slice(0, 5);
                
            if (recentEntries.length === 0) {
                recentList.innerHTML = '<div class="empty-state"><h3>最近の登録がありません</h3></div>';
            } else {
                recentList.innerHTML = recentEntries.map(item => `
                    <div class="recent-item">
                        <h4>${item.name || item.code}</h4>
                        <p>数量: ${item.quantity}${item.unit} | ${item.datetime ? new Date(item.datetime).toLocaleString('ja-JP') : ''}</p>
                    </div>
                `).join('');
            }
        }
        
    } catch (error) {
        console.error('View data loading error:', error);
    }
}

// Settings functionality
function loadSettings() {
    try {
        const personNameInput = document.getElementById('person-name');
        const centerNameSelect = document.getElementById('center-name');
        const soundFeedbackSelect = document.getElementById('sound-feedback');
        
        if (personNameInput) personNameInput.value = currentSettings.personName;
        if (centerNameSelect) centerNameSelect.value = currentSettings.centerName;
        if (soundFeedbackSelect) soundFeedbackSelect.value = currentSettings.soundFeedback.toString();
    } catch (error) {
        console.error('Settings loading error:', error);
    }
}

function saveSettings() {
    try {
        const personNameInput = document.getElementById('person-name');
        const centerNameSelect = document.getElementById('center-name');
        const soundFeedbackSelect = document.getElementById('sound-feedback');
        
        if (personNameInput) currentSettings.personName = personNameInput.value;
        if (centerNameSelect) currentSettings.centerName = centerNameSelect.value;
        if (soundFeedbackSelect) currentSettings.soundFeedback = soundFeedbackSelect.value === 'true';
        
        // Save to localStorage
        localStorage.setItem('inventorySettings', JSON.stringify(currentSettings));
        
        showToast('設定を保存しました', 'success');
    } catch (error) {
        console.error('Settings save error:', error);
        showToast('設定の保存に失敗しました', 'error');
    }
}

function loadSettingsFromStorage() {
    try {
        const saved = localStorage.getItem('inventorySettings');
        if (saved) {
            currentSettings = { ...currentSettings, ...JSON.parse(saved) };
        }
    } catch (error) {
        console.error('Settings load from storage error:', error);
    }
}

// Service Worker registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        const swCode = `
            const CACHE_NAME = 'inventory-pwa-v1';
            const urlsToCache = [
                './',
                './index.html',
                './style.css',
                './app.js'
            ];
            
            self.addEventListener('install', (event) => {
                event.waitUntil(
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.addAll(urlsToCache))
                        .catch((error) => console.log('Cache failed:', error))
                );
            });
            
            self.addEventListener('fetch', (event) => {
                event.respondWith(
                    caches.match(event.request)
                        .then((response) => {
                            if (response) {
                                return response;
                            }
                            return fetch(event.request);
                        })
                        .catch(() => {
                            return new Response('Offline', { status: 200 });
                        })
                );
            });
        `;
        
        try {
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            navigator.serviceWorker.register(swUrl)
                .then(() => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed:', err));
        } catch (error) {
            console.log('Service Worker setup failed:', error);
        }
    }
}

// Initialize app
async function initApp() {
    try {
        console.log('Initializing app...');
        
        // Initialize database
        await initDB();
        
        // Load settings
        loadSettingsFromStorage();
        
        // Load sample data
        await loadSampleData();
        
        // Initialize components
        initScanner();
        initLotSelection();
        initInventoryForm();
        
        // Register service worker
        registerServiceWorker();
        
        console.log('App initialized successfully');
        
    } catch (error) {
        console.error('App initialization error:', error);
    } finally {
        showLoading(false);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting app...');
    initApp();
});