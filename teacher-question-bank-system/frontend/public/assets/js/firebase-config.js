// frontend/public/assets/js/firebase-config.js
// Firebase 配置和初始化

// Firebase 配置
// ⚠️ 重要：請將此配置替換為您自己的 Firebase 專案配置
// 1. 前往 https://console.firebase.google.com/ 建立新專案
// 2. 在專案設定中取得您的配置資訊
// 3. 替換下方的配置值
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // 請替換為您的 API Key
    authDomain: "YOUR_PROJECT.firebaseapp.com", // 請替換為您的 Auth Domain
    projectId: "YOUR_PROJECT_ID", // 請替換為您的 Project ID
    storageBucket: "YOUR_PROJECT.appspot.com", // 請替換為您的 Storage Bucket
    messagingSenderId: "YOUR_SENDER_ID", // 請替換為您的 Messaging Sender ID
    appId: "YOUR_APP_ID", // 請替換為您的 App ID
    measurementId: "YOUR_MEASUREMENT_ID" // 請替換為您的 Measurement ID（可選）
};

// 初始化 Firebase（如果尚未初始化）
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('🔥 Firebase 已初始化');
} else {
    console.log('🔥 Firebase 已存在，使用現有實例');
}

// 導出 Firebase 服務
const auth = firebase.auth();
const db = firebase.firestore();
// 移除 storage，因為我們還沒載入 Storage SDK

// Google 身份驗證提供者
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// 檢查 Firebase 連接狀態
function checkFirebaseConnection() {
    return new Promise((resolve, reject) => {
        try {
            // 測試 Firestore 連接
            db.collection('test').limit(1).get()
                .then(() => {
                    console.log('✅ Firebase 連接正常');
                    resolve(true);
                })
                .catch((error) => {
                    console.warn('⚠️ Firebase 連接問題:', error);
                    resolve(false);
                });
        } catch (error) {
            console.error('❌ Firebase 連接失敗:', error);
            reject(error);
        }
    });
}

// 導出配置和服務（全域變數方式）
window.firebaseConfig = firebaseConfig;
window.auth = auth;
window.db = db;
window.googleProvider = googleProvider;
window.checkFirebaseConnection = checkFirebaseConnection;