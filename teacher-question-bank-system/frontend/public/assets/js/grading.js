// 作業批改 JavaScript

// Firebase 設定
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    // 您的 Firebase 設定
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 載入批改結果
async function loadGradingResults() {
    try {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.innerHTML = '<div class="loading">載入中...</div>';

        // 從 Firestore 獲取批改結果
        const resultsRef = collection(db, 'grading_results');
        const q = query(resultsRef, orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q);

        const results = [];
        querySnapshot.forEach((doc) => {
            results.push({ id: doc.id, ...doc.data() });
        });

        displayResults(results);
        updateStats(results);

    } catch (error) {
        console.error('載入批改結果失敗:', error);
        document.getElementById('resultsContainer').innerHTML =
            '<div class="error">載入失敗，請重新整理頁面</div>';
    }
}

// 顯示批改結果
function displayResults(results) {
    const container = document.getElementById('resultsContainer');

    if (results.length === 0) {
        container.innerHTML = '<div class="no-results">暫無批改結果</div>';
        return;
    }

    const html = results.map(result => `
        <div class="result-item">
            <div class="result-header">
                <h3>${result.form_title || '未命名考試'}</h3>
                <span class="score">${result.total_score}/${result.max_total} (${result.percentage}%)</span>
            </div>
            <div class="result-details">
                <div><strong>學生:</strong> ${result.student_email}</div>
                <div><strong>提交時間:</strong> ${new Date(result.created_at?.toDate()).toLocaleString()}</div>
                <div><strong>任務ID:</strong> ${result.task_id}</div>
            </div>
            <div style="margin-top: 15px;">
                <a href="${result.grading_url}" target="_blank" class="action-btn" style="text-decoration: none; display: inline-block;">
                    查看詳細結果
                </a>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

// 更新統計資訊
function updateStats(results) {
    const totalSubmissions = results.length;
    const gradedCount = results.length; // 所有結果都已批改
    const pendingCount = 0;
    const averageScore = results.length > 0 ?
        Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length) : 0;

    document.getElementById('totalSubmissions').textContent = totalSubmissions;
    document.getElementById('gradedCount').textContent = gradedCount;
    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('averageScore').textContent = averageScore + '%';
}

// 重新整理結果
function refreshResults() {
    loadGradingResults();
}

// 匯出結果
function exportResults() {
    // 實現匯出功能
    alert('匯出功能開發中...');
}

// 批量批改
function batchGrade() {
    // 實現批量批改功能
    alert('批量批改功能開發中...');
}

// 頁面載入時執行
document.addEventListener('DOMContentLoaded', function() {
    loadGradingResults();
});