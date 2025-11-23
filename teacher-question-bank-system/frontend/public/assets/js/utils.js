// frontend/public/assets/js/utils.js
// 共用工具函數

// 日期格式化
function formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return '';

    // 處理 Firestore Timestamp
    if (date.toDate && typeof date.toDate === 'function') {
        date = date.toDate();
    }

    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    switch (format) {
        case 'YYYY-MM-DD':
            return `${year}-${month}-${day}`;
        case 'YYYY-MM-DD HH:mm':
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        case 'YYYY-MM-DD HH:mm:ss':
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        case 'MM/DD/YYYY':
            return `${month}/${day}/${year}`;
        case 'DD/MM/YYYY':
            return `${day}/${month}/${year}`;
        default:
            return d.toLocaleDateString('zh-TW');
    }
}

// 時間格式化
function formatTime(date) {
    if (!date) return '';

    if (date.toDate && typeof date.toDate === 'function') {
        date = date.toDate();
    }

    const d = new Date(date);
    return d.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 日期時間格式化
function formatDateTime(date) {
    if (!date) return '';

    if (date.toDate && typeof date.toDate === 'function') {
        date = date.toDate();
    }

    const d = new Date(date);
    return d.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 相對時間格式化（多久前）
function formatTimeAgo(date) {
    if (!date) return '';

    if (date.toDate && typeof date.toDate === 'function') {
        date = date.toDate();
    }

    const now = new Date();
    const d = new Date(date);
    const diff = now - d;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return '剛剛';
    if (minutes < 60) return `${minutes} 分鐘前`;
    if (hours < 24) return `${hours} 小時前`;
    if (days < 7) return `${days} 天前`;
    if (weeks < 4) return `${weeks} 週前`;
    if (months < 12) return `${months} 個月前`;
    return `${years} 年前`;
}

// 生成唯一 ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 深度複製物件
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

// 檢查物件是否為空
function isEmpty(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    return Object.keys(obj).length === 0;
}

// 延遲執行
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 顯示通知訊息
function showNotification(message, type = 'info', duration = 5000) {
    // 移除現有通知
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // 建立通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;

    // 添加樣式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 400px;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-weight: 500;
    `;

    // 設定顏色
    const colors = {
        success: { bg: '#e6ffe6', color: '#006600', border: '#ccffcc' },
        error: { bg: '#ffe6e6', color: '#d00', border: '#ffcccc' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
        info: { bg: '#e6f3ff', color: '#0066cc', border: '#ccddff' }
    };

    const colorSet = colors[type] || colors.info;
    notification.style.backgroundColor = colorSet.bg;
    notification.style.color = colorSet.color;
    notification.style.border = `1px solid ${colorSet.border}`;

    // 添加到頁面
    document.body.appendChild(notification);

    // 關閉按鈕事件
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => notification.remove());

    // 自動關閉
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    return notification;
}

// 顯示載入狀態
function showLoading(show, target = document.body) {
    const loadingId = 'global-loading';
    let loading = document.getElementById(loadingId);

    if (show) {
        if (!loading) {
            loading = document.createElement('div');
            loading.id = loadingId;
            loading.innerHTML = `
                <div class="loading-overlay">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">載入中...</div>
                </div>
            `;
            loading.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            `;

            const style = document.createElement('style');
            style.textContent = `
                .loading-overlay {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                }
                .loading-spinner {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #667eea;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 15px;
                }
                .loading-text {
                    color: #333;
                    font-weight: 500;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);

            target.appendChild(loading);
        }
    } else {
        if (loading) {
            loading.remove();
        }
    }
}

// 確認對話框
function showConfirm(message, title = '確認') {
    return new Promise((resolve) => {
        const result = confirm(`${title}\n\n${message}`);
        resolve(result);
    });
}

// 輸入對話框
function showPrompt(message, defaultValue = '', title = '輸入') {
    return new Promise((resolve) => {
        const result = prompt(`${title}\n\n${message}`, defaultValue);
        resolve(result);
    });
}

// 驗證電子信箱
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// 驗證必填欄位
function validateRequired(value, fieldName) {
    if (!value || value.toString().trim() === '') {
        throw new Error(`${fieldName} 為必填欄位`);
    }
    return true;
}

// 截取文字
function truncateText(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + suffix;
}

// 格式化檔案大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 隨機排序陣列
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 分頁處理
function paginate(array, page = 1, limit = 10) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    return {
        data: array.slice(startIndex, endIndex),
        currentPage: page,
        totalPages: Math.ceil(array.length / limit),
        totalItems: array.length,
        hasNext: endIndex < array.length,
        hasPrev: page > 1
    };
}

// 搜尋功能
function searchInArray(array, searchTerm, searchFields = []) {
    if (!searchTerm) return array;

    const term = searchTerm.toLowerCase();

    return array.filter(item => {
        if (searchFields.length === 0) {
            // 搜尋所有欄位
            return JSON.stringify(item).toLowerCase().includes(term);
        } else {
            // 搜尋指定欄位
            return searchFields.some(field => {
                const value = getNestedValue(item, field);
                return value && value.toString().toLowerCase().includes(term);
            });
        }
    });
}

// 取得巢狀物件值
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
}

// 設定巢狀物件值
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
        if (!(key in current)) current[key] = {};
        return current[key];
    }, obj);
    target[lastKey] = value;
}

// 計算分數百分比
function calculatePercentage(score, total) {
    if (total === 0) return 0;
    return Math.round((score / total) * 100);
}

// 等級評定
function getGrade(percentage) {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
}

// 顏色工具
function getGradeColor(grade) {
    const colors = {
        'A': '#28a745', // 綠色
        'B': '#6f42c1', // 紫色
        'C': '#fd7e14', // 橙色
        'D': '#ffc107', // 黃色
        'F': '#dc3545' // 紅色
    };
    return colors[grade] || '#6c757d';
}

// 難度顏色
function getDifficultyColor(difficulty) {
    const colors = {
        'easy': '#28a745', // 綠色
        'medium': '#ffc107', // 黃色
        'hard': '#dc3545' // 紅色
    };
    return colors[difficulty] || '#6c757d';
}

// Cookie 操作
function setCookie(name, value, days = 30) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

// 本地儲存操作
function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error('設定 localStorage 失敗:', error);
        return false;
    }
}

function getLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('讀取 localStorage 失敗:', error);
        return defaultValue;
    }
}

function removeLocalStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('刪除 localStorage 失敗:', error);
        return false;
    }
}

// URL 參數操作
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function setUrlParameter(name, value) {
    const url = new URL(window.location);
    url.searchParams.set(name, value);
    window.history.replaceState({}, '', url);
}

function removeUrlParameter(name) {
    const url = new URL(window.location);
    url.searchParams.delete(name);
    window.history.replaceState({}, '', url);
}

// 錯誤處理
function handleError(error, context = '') {
    console.error(`錯誤發生在 ${context}:`, error);

    let errorMessage = '發生未知錯誤';

    if (error.code) {
        switch (error.code) {
            case 'permission-denied':
                errorMessage = '權限不足，無法執行此操作';
                break;
            case 'not-found':
                errorMessage = '找不到指定的資源';
                break;
            case 'already-exists':
                errorMessage = '資源已存在';
                break;
            case 'invalid-argument':
                errorMessage = '提供的參數無效';
                break;
            default:
                errorMessage = error.message || errorMessage;
        }
    } else if (error.message) {
        errorMessage = error.message;
    }

    showNotification(errorMessage, 'error');
    return errorMessage;
}

// 導出所有函數（全域變數方式）
window.formatDate = formatDate;
window.formatTime = formatTime;
window.formatDateTime = formatDateTime;
window.formatTimeAgo = formatTimeAgo;
window.generateId = generateId;
window.deepClone = deepClone;
window.isEmpty = isEmpty;
window.delay = delay;
window.showNotification = showNotification;
window.showLoading = showLoading;
window.showConfirm = showConfirm;
window.showPrompt = showPrompt;
window.isValidEmail = isValidEmail;
window.validateRequired = validateRequired;
window.truncateText = truncateText;
window.formatFileSize = formatFileSize;
window.shuffleArray = shuffleArray;
window.paginate = paginate;
window.searchInArray = searchInArray;
window.getNestedValue = getNestedValue;
window.setNestedValue = setNestedValue;
window.calculatePercentage = calculatePercentage;
window.getGrade = getGrade;
window.getGradeColor = getGradeColor;
window.getDifficultyColor = getDifficultyColor;
window.setCookie = setCookie;
window.getCookie = getCookie;
window.deleteCookie = deleteCookie;
window.setLocalStorage = setLocalStorage;
window.getLocalStorage = getLocalStorage;
window.removeLocalStorage = removeLocalStorage;
window.getUrlParameter = getUrlParameter;
window.setUrlParameter = setUrlParameter;
window.removeUrlParameter = removeUrlParameter;
window.handleError = handleError;