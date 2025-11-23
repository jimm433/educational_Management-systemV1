/**
 * 通用初始化檢查器
 * 用於診斷和修復常見的初始化問題
 */

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        MAX_RETRY_COUNT: 2,
        RETRY_DELAY: 1000, // 1秒
        FIREBASE_TIMEOUT: 5000, // 5秒
    };

    // 計數器
    let retryCount = 0;

    /**
     * 檢查 Firebase 是否已初始化
     */
    function checkFirebaseInitialization() {
        return new Promise((resolve, reject) => {
            console.log('🔍 檢查 Firebase 初始化狀態...');

            const timeoutId = setTimeout(() => {
                reject(new Error('Firebase 初始化超時 (5秒)'));
            }, CONFIG.FIREBASE_TIMEOUT);

            // 檢查 Firebase 全域變數
            const checkInterval = setInterval(() => {
                if (typeof firebase !== 'undefined' &&
                    typeof auth !== 'undefined' &&
                    typeof db !== 'undefined') {

                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);

                    console.log('✅ Firebase 已正確初始化');
                    console.log('📋 Firebase 版本:', firebase.SDK_VERSION);
                    console.log('📋 Auth 狀態:', auth ? '已載入' : '未載入');
                    console.log('📋 Firestore 狀態:', db ? '已載入' : '未載入');

                    resolve(true);
                }
            }, 100);
        });
    }

    /**
     * 檢查使用者認證狀態
     */
    function checkAuthState() {
        return new Promise((resolve, reject) => {
            console.log('🔍 檢查使用者認證狀態...');

            if (typeof auth === 'undefined') {
                reject(new Error('Firebase Auth 未初始化'));
                return;
            }

            // 設置超時
            const timeoutId = setTimeout(() => {
                reject(new Error('認證狀態檢查超時'));
            }, CONFIG.FIREBASE_TIMEOUT);

            // 監聽認證狀態
            auth.onAuthStateChanged((user) => {
                clearTimeout(timeoutId);

                if (user) {
                    console.log('✅ 使用者已登入:', user.email);
                    console.log('📋 UID:', user.uid);
                    console.log('📋 顯示名稱:', user.displayName || '未設定');
                    resolve(user);
                } else {
                    console.log('❌ 使用者未登入');
                    reject(new Error('使用者未登入'));
                }
            }, (error) => {
                clearTimeout(timeoutId);
                console.error('❌ 認證狀態檢查失敗:', error);
                reject(error);
            });
        });
    }

    /**
     * 檢查 Firestore 連接
     */
    async function checkFirestoreConnection() {
        try {
            console.log('🔍 檢查 Firestore 連接...');

            if (typeof db === 'undefined') {
                throw new Error('Firestore 未初始化');
            }

            // 嘗試讀取一個簡單的文檔（使用 enableNetwork 檢查）
            await db.enableNetwork();
            console.log('✅ Firestore 連接正常');
            return true;
        } catch (error) {
            console.error('❌ Firestore 連接失敗:', error);
            throw error;
        }
    }

    /**
     * 檢查使用者資料是否存在
     */
    async function checkUserData(user) {
        try {
            console.log('🔍 檢查使用者資料...');

            if (!user || !user.uid) {
                throw new Error('無效的使用者物件');
            }

            const userDoc = await db.collection('users').doc(user.uid).get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                console.log('✅ 使用者資料存在:', {
                    email: userData.email,
                    role: userData.role,
                    displayName: userData.displayName
                });
                return userData;
            } else {
                console.warn('⚠️ 使用者資料不存在');
                return null;
            }
        } catch (error) {
            console.error('❌ 檢查使用者資料失敗:', error);
            throw error;
        }
    }

    /**
     * 自動創建缺失的使用者資料
     */
    async function autoCreateUserData(user) {
        try {
            console.log('🔧 自動創建使用者資料...');

            const userData = {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: 'teacher', // 預設角色
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                photoURL: user.photoURL || null
            };

            await db.collection('users').doc(user.uid).set(userData);
            console.log('✅ 使用者資料創建成功');

            return userData;
        } catch (error) {
            console.error('❌ 創建使用者資料失敗:', error);
            throw error;
        }
    }

    /**
     * 完整的初始化檢查流程
     */
    async function runFullCheck() {
        try {
            console.log('🚀 開始完整的初始化檢查...');
            console.log('═'.repeat(50));

            // 步驟 1: 檢查 Firebase
            await checkFirebaseInitialization();
            console.log('');

            // 步驟 2: 檢查認證狀態
            const user = await checkAuthState();
            console.log('');

            // 步驟 3: 檢查 Firestore 連接
            await checkFirestoreConnection();
            console.log('');

            // 步驟 4: 檢查使用者資料
            let userData = await checkUserData(user);

            // 如果使用者資料不存在，自動創建
            if (!userData) {
                console.log('⚠️ 使用者資料不存在，嘗試自動創建...');
                userData = await autoCreateUserData(user);
            }
            console.log('');

            console.log('═'.repeat(50));
            console.log('✅ 初始化檢查完成！所有系統正常');

            return {
                success: true,
                user: user,
                userData: userData
            };

        } catch (error) {
            console.error('═'.repeat(50));
            console.error('❌ 初始化檢查失敗:', error.message);
            console.error('═'.repeat(50));

            return {
                success: false,
                error: error
            };
        }
    }

    /**
     * 帶重試機制的初始化檢查
     */
    async function runCheckWithRetry() {
        while (retryCount < CONFIG.MAX_RETRY_COUNT) {
            const result = await runFullCheck();

            if (result.success) {
                return result;
            }

            retryCount++;
            console.log(`⏳ 第 ${retryCount} 次重試（最多 ${CONFIG.MAX_RETRY_COUNT} 次）...`);

            if (retryCount < CONFIG.MAX_RETRY_COUNT) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            }
        }

        // 所有重試都失敗
        console.error('❌ 已達最大重試次數，初始化失敗');
        throw new Error('初始化失敗：已達最大重試次數');
    }

    /**
     * 顯示詳細的錯誤訊息
     */
    function showDetailedError(error) {
        const errorDetails = {
            message: error.message,
            code: error.code || 'UNKNOWN',
            name: error.name || 'Error'
        };

        console.error('📋 錯誤詳情:', errorDetails);

        let userMessage = '初始化失敗：' + error.message;
        let suggestions = [];

        // 根據錯誤類型提供建議
        if (error.message.includes('Firebase') || error.message.includes('firebase')) {
            suggestions.push('• 檢查 Firebase 配置是否正確');
            suggestions.push('• 確認 firebase-config.js 已正確載入');
        }

        if (error.message.includes('permission') || error.message.includes('權限')) {
            suggestions.push('• 檢查 Firestore 安全規則');
            suggestions.push('• 確認使用者有足夠的權限');
        }

        if (error.message.includes('network') || error.message.includes('網路')) {
            suggestions.push('• 檢查網路連接');
            suggestions.push('• 嘗試重新整理頁面');
        }

        if (error.message.includes('timeout') || error.message.includes('超時')) {
            suggestions.push('• 網路速度可能較慢');
            suggestions.push('• 嘗試清除瀏覽器快取');
            suggestions.push('• 按 Ctrl+Shift+R 強制重新整理');
        }

        if (suggestions.length > 0) {
            userMessage += '\n\n建議：\n' + suggestions.join('\n');
        }

        return userMessage;
    }

    // 匯出全域函數
    window.InitChecker = {
        runFullCheck: runFullCheck,
        runCheckWithRetry: runCheckWithRetry,
        checkFirebaseInitialization: checkFirebaseInitialization,
        checkAuthState: checkAuthState,
        checkFirestoreConnection: checkFirestoreConnection,
        checkUserData: checkUserData,
        autoCreateUserData: autoCreateUserData,
        showDetailedError: showDetailedError
    };

    console.log('🛡️ 初始化檢查器已載入');

})();