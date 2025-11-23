/**
 * 全域錯誤處理和快取檢查機制
 * 用於偵測和處理頁面載入失敗、快取問題等
 */

(function() {
        'use strict';

        // 配置
        const CONFIG = {
            MAX_LOAD_TIME: 10000, // 10 秒超時
            CACHE_VERSION: 'v5', // 當前版本
            STORAGE_KEY: 'app_last_version',
            ERROR_COUNT_KEY: 'app_error_count',
            MAX_ERRORS: 3 // 連續錯誤次數上限
        };

        // 錯誤計數器
        let errorCount = 0;
        let isInitialized = false;
        let loadTimeout = null;

        /**
         * 初始化錯誤處理器
         */
        function init() {
            if (isInitialized) return;
            isInitialized = true;

            console.log('🛡️ 錯誤處理器已啟動');

            // 檢查版本更新
            checkVersionUpdate();

            // 監聽全域錯誤
            setupGlobalErrorHandlers();

            // 設置頁面載入超時檢查
            setupLoadTimeout();

            // 檢查錯誤歷史
            checkErrorHistory();
        }

        /**
         * 檢查版本更新
         */
        function checkVersionUpdate() {
            try {
                const lastVersion = localStorage.getItem(CONFIG.STORAGE_KEY);

                if (lastVersion && lastVersion !== CONFIG.CACHE_VERSION) {
                    console.log('🔄 偵測到版本更新:', lastVersion, '->', CONFIG.CACHE_VERSION);

                    // 清除錯誤計數
                    localStorage.removeItem(CONFIG.ERROR_COUNT_KEY);

                    // 顯示更新提示
                    showUpdateNotification();
                }

                // 更新版本記錄
                localStorage.setItem(CONFIG.STORAGE_KEY, CONFIG.CACHE_VERSION);
            } catch (error) {
                console.warn('⚠️ 無法檢查版本:', error);
            }
        }

        /**
         * 設置全域錯誤處理
         */
        function setupGlobalErrorHandlers() {
            // JavaScript 錯誤
            window.addEventListener('error', function(event) {
                console.error('❌ JavaScript 錯誤:', event.error);
                handleError(event.error);
            });

            // Promise 未處理的拒絕
            window.addEventListener('unhandledrejection', function(event) {
                console.error('❌ Promise 錯誤:', event.reason);
                handleError(event.reason);
            });

            // Firebase 錯誤特別處理
            window.addEventListener('error', function(event) {
                if (event.message && event.message.includes('Firebase')) {
                    console.error('❌ Firebase 錯誤:', event.message);
                    handleFirebaseError(event.message);
                }
            });
        }

        /**
         * 設置頁面載入超時
         */
        function setupLoadTimeout() {
            loadTimeout = setTimeout(function() {
                // 檢查頁面是否已載入完成
                const loadingScreen = document.getElementById('loadingScreen');
                const appContainer = document.getElementById('appContainer');

                if (loadingScreen && loadingScreen.style.display !== 'none') {
                    console.error('❌ 頁面載入超時');
                    showLoadTimeoutError();
                }
            }, CONFIG.MAX_LOAD_TIME);

            // 頁面載入完成後清除超時
            window.addEventListener('load', function() {
                if (loadTimeout) {
                    clearTimeout(loadTimeout);
                    loadTimeout = null;
                }
            });
        }

        /**
         * 檢查錯誤歷史
         */
        function checkErrorHistory() {
            try {
                const storedCount = parseInt(localStorage.getItem(CONFIG.ERROR_COUNT_KEY) || '0');

                if (storedCount >= CONFIG.MAX_ERRORS) {
                    console.warn('⚠️ 偵測到連續錯誤，建議清除快取');
                    showCacheClearSuggestion();

                    // 重置計數器
                    localStorage.setItem(CONFIG.ERROR_COUNT_KEY, '0');
                }
            } catch (error) {
                console.warn('⚠️ 無法檢查錯誤歷史:', error);
            }
        }

        /**
         * 處理錯誤
         */
        function handleError(error) {
            errorCount++;

            try {
                const storedCount = parseInt(localStorage.getItem(CONFIG.ERROR_COUNT_KEY) || '0');
                localStorage.setItem(CONFIG.ERROR_COUNT_KEY, String(storedCount + 1));
            } catch (e) {
                // LocalStorage 可能不可用
            }

            // 檢查是否為快取相關錯誤
            if (error && error.message) {
                const message = error.message.toLowerCase();

                // 偵測常見的快取問題
                if (message.includes('is not defined') ||
                    message.includes('is not a function') ||
                    message.includes('cannot read property') ||
                    message.includes('undefined')) {

                    console.warn('⚠️ 可能是快取問題導致的錯誤');

                    if (errorCount >= 2) {
                        showCacheRefreshPrompt();
                    }
                }
            }
        }

        /**
         * 處理 Firebase 錯誤
         */
        function handleFirebaseError(message) {
            if (message.includes('permission') || message.includes('權限')) {
                showPermissionError();
            } else if (message.includes('network') || message.includes('網路')) {
                showNetworkError();
            }
        }

        /**
         * 顯示版本更新通知
         */
        function showUpdateNotification() {
            const notification = createNotification(
                '🔄 系統已更新',
                '我們已更新到最新版本，建議您重新整理頁面以獲得最佳體驗。', [{
                        text: '立即重新整理',
                        class: 'btn-primary',
                        onClick: function() {
                            location.reload(true);
                        }
                    },
                    {
                        text: '稍後',
                        class: 'btn-secondary',
                        onClick: function() {
                            closeNotification();
                        }
                    }
                ]
            );
        }

        /**
         * 顯示載入超時錯誤
         */
        function showLoadTimeoutError() {
            const notification = createNotification(
                '⏱️ 頁面載入超時',
                '頁面載入時間過長，可能是網路問題或快取問題。', [{
                        text: '重新載入頁面',
                        class: 'btn-primary',
                        onClick: function() {
                            location.reload(true);
                        }
                    },
                    {
                        text: '清除快取並重新載入',
                        class: 'btn-warning',
                        onClick: function() {
                            clearCacheAndReload();
                        }
                    }
                ]
            );
        }

        /**
         * 顯示快取清除建議
         */
        function showCacheClearSuggestion() {
            const notification = createNotification(
                '⚠️ 偵測到連續錯誤',
                '系統偵測到您可能遇到快取問題。建議前往專用頁面清除快取。', [{
                        text: '前往清除快取頁面',
                        class: 'btn-primary',
                        onClick: function() {
                            const currentPath = window.location.pathname;
                            const clearCachePath = currentPath.includes('/teacher/') || currentPath.includes('/student/') ?
                                '../clear-cache.html?auto=1' :
                                'clear-cache.html?auto=1';
                            window.location.href = clearCachePath;
                        }
                    },
                    {
                        text: '手動重新整理',
                        class: 'btn-warning',
                        onClick: function() {
                            location.reload(true);
                        }
                    },
                    {
                        text: '稍後處理',
                        class: 'btn-secondary',
                        onClick: function() {
                            closeNotification();
                        }
                    }
                ],
                true // 顯示手動清除快取說明
            );
        }

        /**
         * 顯示快取重新整理提示
         */
        function showCacheRefreshPrompt() {
            const notification = createNotification(
                '🔄 需要重新整理',
                '偵測到可能的快取問題。請按 Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac) 強制重新整理。', [{
                    text: '了解',
                    class: 'btn-primary',
                    onClick: function() {
                        closeNotification();
                    }
                }],
                true
            );
        }

        /**
         * 顯示權限錯誤
         */
        function showPermissionError() {
            const notification = createNotification(
                '🔒 權限不足',
                '您可能沒有權限存取此功能。請確認您的帳號權限或聯絡管理員。', [{
                        text: '重新登入',
                        class: 'btn-primary',
                        onClick: function() {
                            window.location.href = '../index.html';
                        }
                    },
                    {
                        text: '關閉',
                        class: 'btn-secondary',
                        onClick: function() {
                            closeNotification();
                        }
                    }
                ]
            );
        }

        /**
         * 顯示網路錯誤
         */
        function showNetworkError() {
            const notification = createNotification(
                '🌐 網路連線問題',
                '無法連接到伺服器。請檢查您的網路連線。', [{
                        text: '重試',
                        class: 'btn-primary',
                        onClick: function() {
                            location.reload();
                        }
                    },
                    {
                        text: '關閉',
                        class: 'btn-secondary',
                        onClick: function() {
                            closeNotification();
                        }
                    }
                ]
            );
        }

        /**
         * 創建通知
         */
        function createNotification(title, message, buttons, showManualInstructions = false) {
            // 移除舊通知
            closeNotification();

            // 創建通知容器
            const notification = document.createElement('div');
            notification.id = 'error-notification';
            notification.className = 'error-notification';
            notification.innerHTML = `
            <div class="error-notification-overlay"></div>
            <div class="error-notification-content">
                <div class="error-notification-header">
                    <h3>${title}</h3>
                </div>
                <div class="error-notification-body">
                    <p>${message}</p>
                    ${showManualInstructions ? `
                        <div class="manual-instructions">
                            <strong>手動清除快取方法：</strong>
                            <ul>
                                <li><strong>Windows/Linux:</strong> 按 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd></li>
                                <li><strong>Mac:</strong> 按 <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd></li>
                            </ul>
                        </div>
                    ` : ''}
                </div>
                <div class="error-notification-footer">
                    ${buttons.map(btn => `
                        <button class="btn ${btn.class}" data-action="${btn.text}">
                            ${btn.text}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        // 添加樣式
        if (!document.getElementById('error-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'error-notification-styles';
            style.textContent = `
                .error-notification {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease;
                }
                
                .error-notification-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                }
                
                .error-notification-content {
                    position: relative;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    animation: slideUp 0.3s ease;
                }
                
                .error-notification-header {
                    padding: 20px;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .error-notification-header h3 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                    color: #1f2937;
                }
                
                .error-notification-body {
                    padding: 20px;
                }
                
                .error-notification-body p {
                    margin: 0 0 15px 0;
                    color: #4b5563;
                    line-height: 1.6;
                }
                
                .manual-instructions {
                    background: #f3f4f6;
                    padding: 15px;
                    border-radius: 8px;
                    margin-top: 15px;
                }
                
                .manual-instructions strong {
                    display: block;
                    margin-bottom: 10px;
                    color: #1f2937;
                }
                
                .manual-instructions ul {
                    margin: 0;
                    padding-left: 20px;
                }
                
                .manual-instructions li {
                    margin: 5px 0;
                    color: #4b5563;
                }
                
                .manual-instructions kbd {
                    background: white;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-family: monospace;
                    font-size: 0.9em;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                }
                
                .error-notification-footer {
                    padding: 15px 20px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                
                .error-notification-footer .btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .error-notification-footer .btn-primary {
                    background: #4F46E5;
                    color: white;
                }
                
                .error-notification-footer .btn-primary:hover {
                    background: #4338CA;
                }
                
                .error-notification-footer .btn-secondary {
                    background: #e5e7eb;
                    color: #4b5563;
                }
                
                .error-notification-footer .btn-secondary:hover {
                    background: #d1d5db;
                }
                
                .error-notification-footer .btn-warning {
                    background: #f59e0b;
                    color: white;
                }
                
                .error-notification-footer .btn-warning:hover {
                    background: #d97706;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes slideUp {
                    from {
                        transform: translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                
                @media (max-width: 480px) {
                    .error-notification-content {
                        width: 95%;
                        max-width: none;
                    }
                    
                    .error-notification-footer {
                        flex-direction: column;
                    }
                    
                    .error-notification-footer .btn {
                        width: 100%;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // 添加到頁面
        document.body.appendChild(notification);

        // 綁定按鈕事件
        buttons.forEach((btn, index) => {
            const button = notification.querySelectorAll('.btn')[index];
            if (button) {
                button.addEventListener('click', btn.onClick);
            }
        });

        return notification;
    }

    /**
     * 關閉通知
     */
    function closeNotification() {
        const notification = document.getElementById('error-notification');
        if (notification) {
            notification.remove();
        }
    }

    /**
     * 清除快取並重新載入
     */
    function clearCacheAndReload() {
        try {
            // 清除 LocalStorage
            localStorage.clear();
            
            // 清除 SessionStorage
            sessionStorage.clear();
            
            // 清除 Service Worker（如果有）
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (let registration of registrations) {
                        registration.unregister();
                    }
                });
            }
            
            // 強制重新載入
            window.location.reload(true);
        } catch (error) {
            console.error('❌ 清除快取失敗:', error);
            alert('無法自動清除快取。請手動按 Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac) 重新整理。');
        }
    }

    // 頁面載入時初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 匯出全域函數（供其他腳本使用）
    window.ErrorHandler = {
        init: init,
        showUpdateNotification: showUpdateNotification,
        showCacheClearSuggestion: showCacheClearSuggestion,
        clearCacheAndReload: clearCacheAndReload
    };

})();