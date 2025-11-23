// 導航輔助腳本 - 統一處理登出、錯誤處理和頁面跳轉

// Firebase 配置
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// 初始化 Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
}

// 統一的登出函數
async function logout() {
    try {
        if (confirm('確定要登出嗎？')) {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                await firebase.auth().signOut();
                console.log('✅ 登出成功');

                // 根據當前頁面位置決定跳轉路徑
                const currentPath = window.location.pathname;
                if (currentPath.includes('/teacher/')) {
                    window.location.href = '../index.html';
                } else if (currentPath.includes('/student/')) {
                    window.location.href = '../index.html';
                } else {
                    window.location.href = 'index.html';
                }
            } else {
                alert('Firebase 未載入，無法登出');
            }
        }
    } catch (error) {
        console.error('❌ 登出失敗:', error);
        alert('登出失敗: ' + error.message);
    }
}

// 統一的錯誤處理函數
function handleError(error, context = '') {
    console.error(`❌ ${context} 錯誤:`, error);

    let message = '系統發生錯誤';
    if (error.message) {
        message += ': ' + error.message;
    }

    // 顯示錯誤通知
    showNotification(message, 'error');

    // 如果是權限錯誤，跳轉到登入頁面
    if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
        setTimeout(() => {
            redirectToLogin();
        }, 2000);
    }
}

// 統一的頁面跳轉函數
function redirectToLogin() {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/teacher/') || currentPath.includes('/student/')) {
        window.location.href = '../index.html';
    } else {
        window.location.href = 'index.html';
    }
}

function redirectToDashboard() {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/teacher/') || currentPath.includes('/student/')) {
        window.location.href = '../dashboard.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

function redirectTo404() {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/teacher/') || currentPath.includes('/student/')) {
        window.location.href = '../404.html';
    } else {
        window.location.href = '404.html';
    }
}

// 統一的身份驗證檢查
function checkAuthState() {
    return new Promise((resolve, reject) => {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            reject(new Error('Firebase 未載入'));
            return;
        }

        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                console.log('✅ 用戶已登入:', user.uid);
                resolve(user);
            } else {
                console.log('❌ 用戶未登入');
                reject(new Error('用戶未登入'));
            }
        });
    });
}

// 統一的通知函數
function showNotification(message, type = 'info') {
    // 檢查是否有通知元素
    let notification = document.getElementById('notification');
    let messageElement = document.getElementById('notificationMessage');

    if (!notification) {
        // 創建通知元素
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            display: none;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;

        messageElement = document.createElement('span');
        messageElement.id = 'notificationMessage';
        notification.appendChild(messageElement);
        document.body.appendChild(notification);
    }

    // 設置通知樣式
    if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
    } else if (type === 'error') {
        notification.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
    } else if (type === 'warning') {
        notification.style.background = 'linear-gradient(135deg, #ed8936, #dd6b20)';
    } else {
        notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }

    // 顯示通知
    messageElement.textContent = message;
    notification.style.display = 'block';

    // 自動隱藏
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// 統一的頁面初始化函數
function initializePage(pageName) {
    console.log(`📚 ${pageName} 頁面初始化中...`);

    // 檢查 Firebase 是否載入
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase 未載入');
        showNotification('系統初始化失敗，請重新整理頁面', 'error');
        return;
    }

    // 檢查身份驗證
    checkAuthState()
        .then(user => {
            // 更新用戶資訊
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.displayName || user.email;
            }

            // 綁定登出按鈕
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', logout);
            }

            console.log(`✅ ${pageName} 頁面初始化完成`);
        })
        .catch(error => {
            console.error(`❌ ${pageName} 頁面初始化失敗:`, error);
            showNotification('身份驗證失敗，請重新登入', 'error');
            setTimeout(() => {
                redirectToLogin();
            }, 2000);
        });
}

// 統一的頁面離開提醒
function setupPageLeaveWarning() {
    window.addEventListener('beforeunload', function(e) {
        // 檢查是否在考試中
        if (window.location.pathname.includes('exam-taking.html')) {
            e.preventDefault();
            e.returnValue = '您正在進行考試，確定要離開嗎？';
            return '您正在進行考試，確定要離開嗎？';
        }
    });
}

// 統一的錯誤處理
window.addEventListener('error', function(event) {
    console.error('❌ 全域錯誤:', event.error);
    showNotification('系統發生錯誤，請重新整理頁面', 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('❌ 未處理的 Promise 拒絕:', event.reason);
    showNotification('系統發生錯誤，請重新整理頁面', 'error');
});

// 導出函數供其他腳本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        logout,
        handleError,
        redirectToLogin,
        redirectToDashboard,
        redirectTo404,
        checkAuthState,
        showNotification,
        initializePage,
        setupPageLeaveWarning
    };
}