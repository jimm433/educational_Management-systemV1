// 題庫管理頁面 JavaScript

// Firebase 配置
// ⚠️ 重要：請將此配置替換為您自己的 Firebase 專案配置
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};

// 初始化 Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// 全域變數
let currentUser = null;
let allQuestions = [];
let filteredQuestions = [];
let selectedQuestions = new Set();
let currentPage = 1;
const questionsPerPage = 10;
let currentFilters = {
    subject: 'all',
    tag: 'all',
    difficulty: 'all',
    type: 'all'
};
let editingQuestionId = null;

// 標準化題目類型（統一轉換）
function normalizeQuestionType(type) {
    if (!type) return 'text'; // 預設為問答題

    const typeStr = String(type).toLowerCase().trim();

    // 問答題的各種格式
    if (typeStr === 'essay' || typeStr === 'short_answer' || typeStr === 'short-answer' ||
        typeStr === 'text' || typeStr === 'qa' || typeStr === 'question') {
        return 'text';
    }

    // 程式題的各種格式
    if (typeStr === 'programming' || typeStr === 'coding' || typeStr === 'code' || typeStr === 'program') {
        return 'code';
    }

    // 選擇題的各種格式
    if (typeStr === 'multiple-choice' || typeStr === 'multiple_choice' || typeStr === 'multiplechoice' ||
        typeStr === 'choice' || typeStr === 'multiple' || typeStr === 'mc') {
        return 'multiple';
    }

    // 是非題的各種格式
    if (typeStr === 'true-false' || typeStr === 'true_false' || typeStr === 'truefalse' ||
        typeStr === 'tf' || typeStr === 'boolean' || typeStr === 'bool') {
        return 'truefalse';
    }

    // 未知類型，預設為問答題
    console.warn('⚠️ 未知的題目類型:', type, '→ 預設為 text');
    return 'text';
}

// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('📝 題庫管理頁面載入中...');
    initializePage();
});

// 初始化頁面
async function initializePage() {
    try {
        // 檢查登入狀態
        await checkAuthState();

        // 載入題目
        await loadQuestions();

        // 載入統計資料
        updateStatistics();

        // 設定事件監聽
        setupEventListeners();

        // 隱藏載入畫面
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';

        console.log('✅ 頁面初始化完成');
    } catch (error) {
        console.error('❌ 頁面初始化失敗:', error);
        console.error('❌ 錯誤詳情:', error.message);
        console.error('❌ 錯誤堆疊:', error.stack);
        alert(`初始化失敗：${error.message}\n\n請檢查：\n1. 是否已登入\n2. Firebase 配置是否正確\n3. 網路連線是否正常\n\n按確定後會重新導向到登入頁面。`);
        window.location.href = '../index.html';
    }
}

// 檢查登入狀態
function checkAuthState() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user;
                console.log('✅ 使用者已登入:', user.email);
                document.getElementById('userName').textContent = user.displayName || user.email;
                resolve(user);
            } else {
                console.log('❌ 使用者未登入');
                reject(new Error('使用者未登入'));
            }
        });
    });
}

// 載入題目
async function loadQuestions() {
    try {
        console.log('🔍 開始載入題目，當前用戶:', currentUser.uid);

        // 只載入當前用戶的題目
        const snapshot = await db.collection('questions')
            .where('createdBy', '==', currentUser.uid)
            .get();

        console.log('📊 Firestore 查詢完成，找到', snapshot.size, '個文件');

        allQuestions = snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    id: doc.id, // 確保使用 Firestore 真實 ID
                    type: normalizeQuestionType(data.type) // 標準化類型
                };
            });

        console.log(`✅ 成功載入 ${allQuestions.length} 個題目`);

        // 調試：統計各類型數量
        const typeStats = {};
        allQuestions.forEach(q => {
            typeStats[q.type] = (typeStats[q.type] || 0) + 1;
        });
        console.log('📊 題目類型統計:', typeStats);

        // 在客戶端排序（避免需要 Firestore 複合索引）
        allQuestions.sort((a, b) => {
            const timeA = (a.createdAt && a.createdAt.toDate) ? a.createdAt.toDate() : new Date(0);
            const timeB = (b.createdAt && b.createdAt.toDate) ? b.createdAt.toDate() : new Date(0);
            return timeB - timeA; // 降序排列（新的在前）
        });

        // 重新應用篩選條件
        // 動態載入標籤
        loadTagFilters();

        applyFilters();

        renderQuestions();

    } catch (error) {
        console.error('❌ 載入題目失敗:', error);
        document.getElementById('questionsList').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg viewBox="0 0 20 20" fill="none">
                        <path d="M10 3a7 7 0 100 14 7 7 0 000-14z" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M10 7v4M10 13h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <h3>載入失敗</h3>
                <p style="color: var(--error-color);">${error.message}</p>
                <button class="btn btn-primary" onclick="location.reload()">重新載入</button>
            </div>
        `;
    }
}

// 全域標籤列表
let allTagsList = [];

// 載入所有標籤
function loadTagFilters() {
    // 收集所有標籤
    const allTags = new Set();
    allQuestions.forEach(question => {
        if (question.tags && Array.isArray(question.tags)) {
            question.tags.forEach(tag => {
                if (tag && tag.trim()) {
                    allTags.add(tag.trim());
                }
            });
        }
    });

    // 將標籤轉為陣列並排序
    allTagsList = Array.from(allTags).sort();

    console.log(`📊 載入 ${allTagsList.length} 個標籤:`, allTagsList);
}

// 打開標籤篩選彈窗
function openTagFilterModal() {
    const modal = document.getElementById('tagFilterModal');
    modal.style.display = 'flex';
    renderTagList(allTagsList);
}

// 關閉標籤篩選彈窗
function closeTagFilterModal() {
    const modal = document.getElementById('tagFilterModal');
    modal.style.display = 'none';
    document.getElementById('tagSearchInput').value = '';
}

// 渲染標籤列表
function renderTagList(tags) {
    const container = document.getElementById('tagListContainer');

    if (tags.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 32px;">沒有可用的標籤</p>';
        return;
    }

    container.innerHTML = tags.map(tag => {
        const isSelected = currentFilters.tag === tag;
        return `
            <div class="tag-item ${isSelected ? 'selected' : ''}" onclick="selectTag('${tag}')">
                <span class="tag-name">${tag}</span>
                ${isSelected ? '<span class="tag-check">✓</span>' : ''}
            </div>
        `;
    }).join('');
}

// 選擇標籤
function selectTag(tag) {
    currentFilters.tag = tag;
    document.getElementById('tagFilterText').textContent = `標籤: ${tag}`;
    renderTagList(allTagsList);
    applyFilters();
}

// 清除標籤篩選
function clearTagFilter() {
    currentFilters.tag = 'all';
    document.getElementById('tagFilterText').textContent = '篩選標籤';
    closeTagFilterModal();
    applyFilters();
}

// 搜尋標籤
function searchTags() {
    const searchTerm = document.getElementById('tagSearchInput').value.toLowerCase();
    const filteredTags = allTagsList.filter(tag => tag.toLowerCase().includes(searchTerm));
    renderTagList(filteredTags);
}

// 設定篩選器事件監聽
function setupFilterListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        // 先移除舊的事件監聽器（避免重複綁定）
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', function() {
            const filterType = this.dataset.filter || this.getAttribute('data-filter');
            const filterValue = this.dataset.value || this.getAttribute('data-value');

            // 更新按鈕狀態
            document.querySelectorAll(`[data-filter="${filterType}"]`).forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');

            // 應用篩選
            currentFilters[filterType] = filterValue;
            console.log(`🔍 篩選器更新: ${filterType} = ${filterValue}`);
            applyFilters();
        });
    });
}

// 渲染題目列表
function renderQuestions() {
    const questionsList = document.getElementById('questionsList');
    const pagination = document.getElementById('pagination');

    // 如果沒有題目，顯示空狀態
    if (filteredQuestions.length === 0) {
        questionsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg viewBox="0 0 20 20" fill="none">
                        <path d="M4 6h12M4 10h12M4 14h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <h3>沒有符合條件的題目</h3>
                <p>請調整篩選條件或新增題目</p>
            </div>
        `;
        pagination.style.display = 'none';
        return;
    }

    // 計算分頁
    const totalPages = Math.ceil(filteredQuestions.length / questionsPerPage);
    const startIndex = (currentPage - 1) * questionsPerPage;
    const endIndex = startIndex + questionsPerPage;
    const questionsToShow = filteredQuestions.slice(startIndex, endIndex);

    // 渲染題目
    questionsList.innerHTML = questionsToShow.map(question => {
                const isSelected = selectedQuestions.has(question.id);
                const typeLabel = getTypeLabel(question.type);
                const difficultyLabel = getDifficultyLabel(question.difficulty);

                // 優先顯示 title，如果沒有則顯示 text
                const questionTitle = question.title || question.text || question.question || question.content || '無題目標題';

                // 截取前100個字符作為預覽
                const previewText = questionTitle.length > 100 ?
                    questionTitle.substring(0, 100) + '...' :
                    questionTitle;

                return `
            <div class="question-item" data-id="${question.id}">
                <div class="question-checkbox">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                        onchange="toggleQuestionSelection('${question.id}')">
                </div>
                <div class="question-content">
                    <div class="question-header">
                        <div class="question-title">${escapeHtml(previewText)}</div>
                    </div>
                    <div class="question-meta">
                        <span class="meta-badge badge-type">${typeLabel}</span>
                        <span class="meta-badge badge-subject">${escapeHtml(question.subject || '未分類')}</span>
                        <span class="meta-badge badge-difficulty">${difficultyLabel}</span>
                        <span class="meta-badge badge-points">${question.points || 10} 分</span>
                    </div>
                    ${question.tags && question.tags.length > 0 ? `
                        <div class="question-tags">
                            ${question.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="question-actions">
                    <button class="action-btn edit" onclick="editQuestion('${question.id}')">編輯</button>
                    <button class="action-btn delete" onclick="deleteQuestion('${question.id}')">刪除</button>
                </div>
            </div>
        `;
    }).join('');
    
    // 渲染分頁
    if (totalPages > 1) {
        renderPagination(totalPages);
        pagination.style.display = 'flex';
    } else {
        pagination.style.display = 'none';
    }
}

// 渲染分頁
function renderPagination(totalPages) {
    const pageNumbers = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    // 更新按鈕狀態
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    
    // 生成頁碼按鈕
    let pages = '';
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            pages += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" 
                    onclick="goToPage(${i})">${i}</button>
            `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            pages += '<span style="padding: 0 8px;">...</span>';
        }
    }
    
    pageNumbers.innerHTML = pages;
}

// 切換頁面
function goToPage(page) {
    currentPage = page;
    renderQuestions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 上一頁
document.getElementById('prevPageBtn')?.addEventListener('click', function() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    }
});

// 下一頁
document.getElementById('nextPageBtn')?.addEventListener('click', function() {
    const totalPages = Math.ceil(filteredQuestions.length / questionsPerPage);
    if (currentPage < totalPages) {
        goToPage(currentPage + 1);
    }
});

// 更新統計資料
function updateStatistics() {
    document.getElementById('totalQuestions').textContent = allQuestions.length;
    
    // 計算科目數
    const subjects = new Set(allQuestions.map(q => q.subject).filter(s => s));
    document.getElementById('totalSubjects').textContent = subjects.size;
    
    // 計算平均難度
    const difficultyMap = { easy: 1, medium: 2, hard: 3 };
    if (allQuestions.length > 0) {
        const avgDiff = allQuestions.reduce((sum, q) => sum + (difficultyMap[q.difficulty] || 2), 0) / allQuestions.length;
        const diffLabel = avgDiff < 1.5 ? '簡單' : avgDiff < 2.5 ? '中等' : '困難';
        document.getElementById('avgDifficulty').textContent = diffLabel;
    } else {
        document.getElementById('avgDifficulty').textContent = '-';
    }
    
    // 計算本週新增
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyNew = allQuestions.filter(q => {
        const createdAt = q.createdAt?.toDate ? q.createdAt.toDate() : new Date(q.createdAt);
        return createdAt >= weekAgo;
    }).length;
    document.getElementById('weeklyNew').textContent = weeklyNew;
}

// 設定事件監聽
function setupEventListeners() {
    // 登出按鈕
    document.getElementById('logoutBtn').addEventListener('click', async function() {
        try {
            await auth.signOut();
            window.location.href = '../index.html';
        } catch (error) {
            console.error('登出失敗:', error);
            alert('登出失敗');
        }
    });
    
    // 新增題目按鈕
    document.getElementById('addQuestionBtn').addEventListener('click', openAddQuestionModal);
    
    // 搜尋功能
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            currentFilters.search = searchTerm;
            
            // 顯示/隱藏清除按鈕
            clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
            
            // 重新篩選和渲染
            applyFilters();
        });
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function() {
            searchInput.value = '';
            currentFilters.search = '';
            this.style.display = 'none';
            applyFilters();
        });
    }

    // 篩選按鈕
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const filterType = this.dataset.filter;
            const filterValue = this.dataset.value;
            
            // 更新按鈕狀態
            document.querySelectorAll(`[data-filter="${filterType}"]`).forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            
            // 應用篩選
            currentFilters[filterType] = filterValue;
            applyFilters();
        });
    });
    
    // 批量操作按鈕
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    
    if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllQuestions);
    if (deselectAllBtn) deselectAllBtn.addEventListener('click', deselectAllQuestions);
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDeleteQuestions);
    
    // 其他功能按鈕
    const importBtn = document.getElementById('importBtn');
    const exportBtn = document.getElementById('exportBtn');
    const jsonFormatBtn = document.getElementById('jsonFormatBtn');
    
    if (importBtn) importBtn.addEventListener('click', openImportModal);
    if (exportBtn) exportBtn.addEventListener('click', openExportModal);
    if (jsonFormatBtn) jsonFormatBtn.addEventListener('click', openJsonFormatModal);

    // 綁定篩選按鈕事件
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const filterType = this.getAttribute('data-filter');
            const filterValue = this.getAttribute('data-value');
            
            // 移除同類型篩選的 active 狀態
            document.querySelectorAll(`.filter-btn[data-filter="${filterType}"]`).forEach(b => {
                b.classList.remove('active');
            });
            
            // 添加 active 狀態
            this.classList.add('active');
            
            // 更新篩選條件
            currentFilters[filterType] = filterValue;
            
            // 應用篩選
            currentPage = 1; // 重置到第一頁
            applyFilters();
            renderQuestions();
        });
    });
}

// 應用篩選
function applyFilters() {
    filteredQuestions = allQuestions.filter(question => {
        // 搜尋篩選
        if (currentFilters.search) {
            const searchTerm = currentFilters.search.toLowerCase();
            const questionText = (question.text || question.question || question.content || question.title || question.questionText || question.description || '').toLowerCase();
            const subject = (question.subject || '').toLowerCase();
            const tags = (question.tags || []).join(' ').toLowerCase();
            const explanation = (question.explanation || question.solution || '').toLowerCase();
            
            if (!questionText.includes(searchTerm) && 
                !subject.includes(searchTerm) && 
                !tags.includes(searchTerm) && 
                !explanation.includes(searchTerm)) {
                return false;
            }
        }
        
        // 科目篩選
        if (currentFilters.subject !== 'all' && question.subject !== currentFilters.subject) {
            return false;
        }
        
        // 標籤篩選
        if (currentFilters.tag !== 'all') {
            const questionTags = question.tags || [];
            if (!questionTags.includes(currentFilters.tag)) {
                return false;
            }
        }
        
        // 難度篩選
        if (currentFilters.difficulty !== 'all' && question.difficulty !== currentFilters.difficulty) {
            return false;
        }
        
        // 類型篩選
        if (currentFilters.type !== 'all' && question.type !== currentFilters.type) {
            return false;
        }
        
        return true;
    });
    
    currentPage = 1;
    renderQuestions();
}

// 開啟新增題目對話框
function openAddQuestionModal() {
    editingQuestionId = null;
    document.getElementById('modalTitle').textContent = '新增題目';
    document.getElementById('questionForm').reset();
    document.getElementById('questionModal').classList.add('show');
    
    // 設置題目類型監聽器
    setupQuestionTypeListener();
    
    // 預設為選擇題，顯示選項設定
    updateQuestionTypeFields('multiple');
    document.getElementById('optionsList').innerHTML = '';
    addOption();
    addOption();
}

// 設置題目類型切換監聽器
function setupQuestionTypeListener() {
    const questionTypeSelect = document.getElementById('questionType');
    // 移除舊的監聽器（如果有）
    const newSelect = questionTypeSelect.cloneNode(true);
    questionTypeSelect.parentNode.replaceChild(newSelect, questionTypeSelect);
    
    // 添加新的監聽器
    newSelect.addEventListener('change', function() {
        updateQuestionTypeFields(this.value);
    });
}

// 根據題目類型更新表單欄位
function updateQuestionTypeFields(type) {
    const optionsSection = document.getElementById('optionsSection');
    const answerSection = document.getElementById('answerSection');
    const answerInput = document.getElementById('questionAnswer');
    
    console.log('🔄 切換題目類型:', type);
    
    if (type === 'multiple') {
        // 選擇題：顯示選項設定，答案格式為 A/B/C/D
        optionsSection.style.display = 'block';
        answerInput.placeholder = '例如：A（對應第一個選項）';
        answerInput.setAttribute('pattern', '[A-Za-z]');
    } else if (type === 'truefalse') {
        // 是非題：隱藏選項設定，答案為 true/false
        optionsSection.style.display = 'none';
        answerInput.placeholder = '輸入 true 或 false';
        answerInput.removeAttribute('pattern');
    } else if (type === 'text') {
        // 問答題：隱藏選項設定
        optionsSection.style.display = 'none';
        answerInput.placeholder = '輸入參考答案或答題要點';
        answerInput.removeAttribute('pattern');
    } else if (type === 'code') {
        // 程式題：隱藏選項設定
        optionsSection.style.display = 'none';
        answerInput.placeholder = '輸入參考程式碼或答題要點';
        answerInput.removeAttribute('pattern');
    }
}

// 關閉題目對話框
function closeQuestionModal() {
    document.getElementById('questionModal').classList.remove('show');
    editingQuestionId = null;
}

// 新增選項
function addOption() {
    const optionsList = document.getElementById('optionsList');
    const optionIndex = optionsList.children.length;
    const optionLetter = String.fromCharCode(65 + optionIndex); // A, B, C, D...
    
    const optionHtml = `
        <div class="option-item">
            <span style="flex-shrink: 0; width: 20px;">${optionLetter}.</span>
            <input type="text" class="form-input option-input" placeholder="輸入選項內容" required>
            <button type="button" class="remove-option-btn" onclick="removeOption(this)">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;
    
    optionsList.insertAdjacentHTML('beforeend', optionHtml);
}

// 移除選項
function removeOption(btn) {
    const optionItem = btn.parentElement;
    optionItem.remove();
    
    // 重新編號
    const optionsList = document.getElementById('optionsList');
    Array.from(optionsList.children).forEach((item, index) => {
        const letter = String.fromCharCode(65 + index);
        item.querySelector('span').textContent = letter + '.';
    });
}

// 切換程式題專用欄位
function toggleProgrammingFields() {
    const questionType = document.getElementById('questionType').value;
    const sampleInputSection = document.getElementById('sampleInputSection');
    const sampleOutputSection = document.getElementById('sampleOutputSection');
    const optionsSection = document.getElementById('optionsSection');
    const answerSection = document.getElementById('answerSection');
    
    // 根據題目類型顯示/隱藏相應欄位
    if (questionType === 'code') {
        sampleInputSection.style.display = 'block';
        sampleOutputSection.style.display = 'block';
        optionsSection.style.display = 'none';
        answerSection.style.display = 'none';
    } else if (questionType === 'multiple') {
        sampleInputSection.style.display = 'none';
        sampleOutputSection.style.display = 'none';
        optionsSection.style.display = 'block';
        answerSection.style.display = 'block';
    } else {
        sampleInputSection.style.display = 'none';
        sampleOutputSection.style.display = 'none';
        optionsSection.style.display = 'none';
        answerSection.style.display = 'block';
    }
}

// 儲存題目
async function saveQuestion() {
    try {
        const questionType = document.getElementById('questionType').value;
        
        const questionData = {
            title: document.getElementById('questionTitle').value.trim(),
            text: document.getElementById('questionText').value.trim() || '',
            type: questionType,
            subject: document.getElementById('questionSubject').value.trim(),
            points: parseInt(document.getElementById('questionPoints').value) || 25,
            difficulty: document.getElementById('questionDifficulty').value,
            explanation: document.getElementById('questionExplanation').value.trim() || '',
            tags: document.getElementById('questionTags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 根據題目類型處理答案和其他欄位
        if (questionType === 'code') {
            // 程式題：添加範例輸入/輸出
            questionData.sampleInput = document.getElementById('sampleInput').value.trim() || '';
            questionData.sampleOutput = document.getElementById('sampleOutput').value.trim() || '';
        } else if (questionType === 'multiple') {
            // 選擇題：添加選項
            const options = Array.from(document.querySelectorAll('.option-input'))
                .map(input => input.value.trim())
                .filter(opt => opt);
            questionData.options = options;
            questionData.answer = document.getElementById('questionAnswer').value.trim();
        } else {
            // 其他題型：只需要答案
            questionData.answer = document.getElementById('questionAnswer').value.trim() || '';
        }
        
        console.log('📝 準備儲存題目:', questionData);
        
        if (editingQuestionId) {
            // 更新現有題目
            await db.collection('questions').doc(editingQuestionId).update(questionData);
            console.log('✅ 題目已更新:', editingQuestionId);
        } else {
            // 新增題目
            questionData.createdBy = currentUser.uid;
            questionData.teacherId = currentUser.uid;
            questionData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('questions').add(questionData);
            console.log('✅ 題目已新增:', docRef.id);
        }
        
        closeQuestionModal();
        await loadQuestions();
        updateStatistics();
        alert('✅ 題目儲存成功！');
        
    } catch (error) {
        console.error('❌ 儲存題目失敗:', error);
        alert('儲存失敗：' + error.message);
    }
}

// 編輯題目
async function editQuestion(questionId) {
    try {
        console.log('📝 [V2] 嘗試編輯題目:', questionId);
        console.log('🔍 本地題目列表:', allQuestions.map(q => q.id));
        
        // 先從本地陣列查找
        const localQuestion = allQuestions.find(q => q.id === questionId);
        if (!localQuestion) {
            console.error('❌ 本地陣列中找不到題目:', questionId);
        } else {
            console.log('✅ 本地找到題目:', localQuestion);
        }
        
        // 從 Firestore 讀取
        const docRef = db.collection('questions').doc(questionId);
        console.log('🔍 查詢 Firestore:', docRef.path);
        
        const doc = await docRef.get();
        console.log('🔍 Firestore 查詢結果:', doc.exists ? '✅ 存在' : '❌ 不存在');
        
        if (!doc.exists) {
            console.error('❌ Firestore 中找不到題目');
            // 如果本地有，就用本地的
            if (localQuestion) {
                console.log('⚠️ 使用本地資料');
                editQuestionWithData(questionId, localQuestion);
                return;
            }
            alert('題目不存在');
            return;
        }
        
        const question = doc.data();
        console.log('✅ 載入題目資料:', question);
        editQuestionWithData(questionId, question);
        
    } catch (error) {
        console.error('❌ 載入題目失敗:', error);
        alert('載入失敗：' + error.message);
    }
}

// 使用題目資料填充編輯表單
function editQuestionWithData(questionId, question) {
    editingQuestionId = questionId;
    
    // 設置模態框標題
    document.getElementById('modalTitle').textContent = '編輯題目';
    
    // 填入基本資料
    document.getElementById('questionTitle').value = question.title || '';
    document.getElementById('questionText').value = question.text || '';
    document.getElementById('questionType').value = question.type || 'text';
    document.getElementById('questionSubject').value = question.subject || '';
    document.getElementById('questionExplanation').value = question.explanation || '';
    document.getElementById('questionPoints').value = question.points || 25;
    document.getElementById('questionDifficulty').value = question.difficulty || 'medium';
    document.getElementById('questionTags').value = question.tags ? question.tags.join(', ') : '';
    
    // 根據題目類型顯示對應欄位
    toggleProgrammingFields();
    
    // 填入題型專屬欄位
    if (question.type === 'code') {
        document.getElementById('sampleInput').value = question.sampleInput || '';
        document.getElementById('sampleOutput').value = question.sampleOutput || '';
    } else if (question.type === 'multiple') {
        // 載入選項
        const optionsList = document.getElementById('optionsList');
        optionsList.innerHTML = '';
        if (question.options && question.options.length > 0) {
            question.options.forEach(option => {
                addOption();
                const inputs = optionsList.querySelectorAll('.option-input');
                inputs[inputs.length - 1].value = option;
            });
        } else {
            // 添加兩個空選項
            addOption();
            addOption();
        }
        document.getElementById('questionAnswer').value = question.answer || '';
    } else {
        // 其他題型
        document.getElementById('questionAnswer').value = question.answer || '';
    }
    
    console.log('✅ 表單已填充完成');
    document.getElementById('questionModal').classList.add('show');
}

// 測試 Firebase 連接
async function testFirebaseConnection() {
    try {
        console.log('🔍 測試 Firebase 連接...');
        const testDoc = await db.collection('questions').limit(1).get();
        console.log('✅ Firebase 連接正常');
        return true;
    } catch (error) {
        console.error('❌ Firebase 連接失敗:', error);
        return false;
    }
}

// 刪除題目
async function deleteQuestion(questionId) {
    if (!confirm('確定要刪除此題目嗎？此操作無法復原。')) {
        return;
    }

    try {
        await db.collection('questions').doc(questionId).delete();
        
        console.log('✅ 成功刪除題目');
        alert('題目已刪除');
        
        // 重新載入題目列表（從 Firestore 重新讀取）
        await loadQuestions();
        updateStatistics();
        
    } catch (error) {
        console.error('❌ 刪除題目失敗:', error);
        alert('刪除失敗：' + error.message);
    }
}

// 切換題目選擇
function toggleQuestionSelection(questionId) {
    if (selectedQuestions.has(questionId)) {
        selectedQuestions.delete(questionId);
    } else {
        selectedQuestions.add(questionId);
    }
    
    updateBulkActionsBar();
}

// 更新批量操作欄
function updateBulkActionsBar() {
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    const selectedCount = document.getElementById('selectedCount');
    
    selectedCount.textContent = selectedQuestions.size;
    
    if (selectedQuestions.size > 0) {
        bulkActionsBar.style.display = 'flex';
    } else {
        bulkActionsBar.style.display = 'none';
    }
}

// 全選
function selectAllQuestions() {
    filteredQuestions.forEach(q => selectedQuestions.add(q.id));
    renderQuestions();
    updateBulkActionsBar();
}

// 取消全選
function deselectAllQuestions() {
    selectedQuestions.clear();
    renderQuestions();
    updateBulkActionsBar();
}

// 批量刪除（使用逐一刪除方式，與 question.html 相同）
async function bulkDeleteQuestions() {
    if (selectedQuestions.size === 0) {
        alert('請先選擇要刪除的題目');
        return;
    }
    
    if (!confirm(`確定要刪除選中的 ${selectedQuestions.size} 個題目嗎？此操作無法復原！`)) {
        return;
    }
    
    try {
        console.log('🗑️ 開始批量刪除題目...');
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // 逐一刪除（與 question.html 相同的邏輯）
        for (const questionId of selectedQuestions) {
            try {
                console.log(`🗑️ 刪除題目: ${questionId}`);
                await db.collection('questions').doc(questionId).delete();
                successCount++;
                console.log(`✅ 已刪除 ${successCount}/${selectedQuestions.size} 個題目`);
            } catch (error) {
                errorCount++;
                console.error(`❌ 題目 ${questionId} 刪除失敗:`, error);
                errors.push(`題目 ${questionId} 刪除失敗：${error.message}`);
            }
        }
        
        // 清空選擇
        selectedQuestions.clear();
        
        // 重新載入題目
        console.log('📥 重新載入題目列表...');
        await loadQuestions();
        updateStatistics();
        updateBulkActionsBar();
        
        // 顯示結果
        if (errorCount === 0) {
            console.log(`✅ 成功刪除所有 ${successCount} 個題目！`);
            alert(`✅ 成功刪除 ${successCount} 個題目！`);
        } else {
            console.error(`⚠️ 刪除完成：成功 ${successCount} 個，失敗 ${errorCount} 個`);
            alert(`刪除完成：成功 ${successCount} 個，失敗 ${errorCount} 個\n${errors.join('\n')}`);
        }
        
    } catch (error) {
        console.error('❌ 批量刪除失敗:', error);
        alert('批量刪除失敗：' + error.message);
        
        // 重新載入以確保界面同步
        await loadQuestions();
        updateStatistics();
    }
}

// 匯入功能
function openImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">批次匯入題目</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <svg viewBox="0 0 20 20" fill="none">
                        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">選擇 JSON 檔案</label>
                    <input type="file" id="importFile" accept=".json" class="form-input" onchange="handleFileImport()">
                    <p class="form-hint">支援 JSON 格式的題目檔案</p>
                </div>
                <div class="form-group">
                    <label class="form-label">或直接貼上 JSON 內容</label>
                    <textarea class="form-textarea" id="importJson" rows="10" placeholder="貼上 JSON 格式的題目資料..." oninput="handleJsonImport()"></textarea>
                </div>
                <div id="importPreview" style="display: none;">
                    <h4>預覽匯入資料</h4>
                    <p>將匯入 <strong id="importCount">0</strong> 個題目</p>
                    <div id="importPreviewList" style="max-height: 200px; overflow-y: auto; margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
                <button class="btn btn-primary" onclick="importQuestions()">匯入題目</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 匯出功能
function openExportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">匯出題目</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <svg viewBox="0 0 20 20" fill="none">
                        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">選擇匯出方式</label>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="radio" name="exportType" value="all" checked>
                            <span>匯出全部題目 (${allQuestions.length} 個)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="radio" name="exportType" value="selected">
                            <span>匯出選中的題目 (${selectedQuestions.size} 個)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="radio" name="exportType" value="filtered">
                            <span>匯出篩選後的題目 (${filteredQuestions.length} 個)</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
                <button class="btn btn-primary" onclick="exportQuestions()">開始匯出</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// JSON 格式範例
function openJsonFormatModal() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.style.zIndex = '1001';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h2 class="modal-title">JSON 格式範例</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <svg viewBox="0 0 20 20" fill="none">
                        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div style="display: flex; gap: 12px; margin-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="showJsonExample('multiple')">選擇題</button>
                    <button class="btn btn-secondary" onclick="showJsonExample('truefalse')">是非題</button>
                    <button class="btn btn-secondary" onclick="showJsonExample('text')">問答題</button>
                    <button class="btn btn-secondary" onclick="showJsonExample('code')">程式題</button>
                </div>
                <div class="form-group">
                    <label class="form-label">JSON 格式範例</label>
                    <textarea id="jsonExample" class="form-textarea" rows="15" readonly></textarea>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-secondary" onclick="copyJsonExample()">複製範例</button>
                    <button class="btn btn-secondary" onclick="downloadJsonExample()">下載範例</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    showJsonExample('multiple'); // 預設顯示選擇題範例
}

// 顯示 JSON 範例
function showJsonExample(type) {
    const examples = {
        multiple: `[
  {
    "title": "下列哪個是正確的變數宣告方式？",
    "type": "multiple",
    "subject": "程式設計",
    "difficulty": "easy",
    "options": [
      "int x = 5;",
      "var x = 5;",
      "x = 5;",
      "int x; x = 5;"
    ],
    "answer": "A",
    "explanation": "正確的 C# 變數宣告語法",
    "points": 10,
    "difficulty": "easy",
    "tags": ["C#", "變數", "基礎"]
  }
]`,
        truefalse: `[
  {
    "title": "C# 是一種物件導向程式語言",
    "type": "truefalse",
    "subject": "程式設計",
    "difficulty": "easy",
    "answer": "true",
    "explanation": "C# 確實是物件導向程式語言",
    "points": 5,
    "tags": ["C#", "物件導向"]
  }
]`,
        text: `[
  {
    "title": "請說明什麼是物件導向程式設計的三個基本特性？",
    "type": "text",
    "subject": "程式設計",
    "difficulty": "medium",
    "sampleInput": "",
    "sampleOutput": "封裝(Encapsulation)、繼承(Inheritance)、多型(Polymorphism)",
    "answer": "封裝、繼承、多型",
    "explanation": "物件導向的三個基本特性：封裝隱藏實作細節、繼承重用程式碼、多型提供彈性",
    "points": 15,
    "tags": ["物件導向", "概念", "理論"]
  }
]`,
        code: `[
  {
    "title": "請寫一個函數計算兩個數字的和",
    "type": "code",
    "subject": "程式設計",
    "difficulty": "easy",
    "sampleInput": "add(3, 5)",
    "sampleOutput": "8",
    "answer": "function add(a, b) {\\n  return a + b;\\n}",
    "explanation": "定義一個接受兩個參數並返回其和的函數",
    "points": 20,
    "tags": ["JavaScript", "函數", "基礎"]
  }
]`
    };
    
    document.getElementById('jsonExample').value = examples[type] || examples.multiple;
}

// 複製 JSON 範例
function copyJsonExample() {
    const textarea = document.getElementById('jsonExample');
    textarea.select();
    document.execCommand('copy');
    alert('已複製到剪貼簿！');
}

// 下載 JSON 範例
function downloadJsonExample() {
    const content = document.getElementById('jsonExample').value;
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question-template.json';
    a.click();
    URL.revokeObjectURL(url);
}

// 處理檔案匯入
async function handleFileImport() {
    const fileInput = document.getElementById('importFile');
    if (fileInput.files.length > 0) {
        try {
            const file = fileInput.files[0];
            const text = await file.text();
            const jsonData = JSON.parse(text);
            showImportPreview(jsonData);
        } catch (error) {
            console.error('檔案解析失敗:', error);
            alert('檔案格式錯誤：' + error.message);
        }
    }
}

// 處理 JSON 匯入
function handleJsonImport() {
    const jsonInput = document.getElementById('importJson');
    if (jsonInput.value.trim()) {
        try {
            const jsonData = JSON.parse(jsonInput.value);
            showImportPreview(jsonData);
        } catch (error) {
            console.error('JSON 解析失敗:', error);
            // 不顯示錯誤，讓用戶繼續輸入
        }
    } else {
        hideImportPreview();
    }
}

// 顯示匯入預覽
function showImportPreview(jsonData) {
    if (!Array.isArray(jsonData)) {
        alert('JSON 格式錯誤：應該是陣列格式');
        return;
    }
    
    const preview = document.getElementById('importPreview');
    const count = document.getElementById('importCount');
    const list = document.getElementById('importPreviewList');
    
    count.textContent = jsonData.length;
    
    // 顯示前 5 個題目的預覽
    const previewItems = jsonData.slice(0, 5).map((item, index) => {
        const questionText = item.text || item.question || item.content || item.title || '無題目內容';
        const type = getTypeLabel(item.type);
        const subject = item.subject || '未分類';
        return `
            <div style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 14px;">
                <strong>${index + 1}.</strong> ${escapeHtml(questionText.substring(0, 50))}...
                <span style="color: #666; margin-left: 10px;">[${type}] ${subject}</span>
            </div>
        `;
    }).join('');
    
    const moreText = jsonData.length > 5 ? `<div style="padding: 8px; color: #666; text-align: center;">... 還有 ${jsonData.length - 5} 個題目</div>` : '';
    
    list.innerHTML = previewItems + moreText;
    preview.style.display = 'block';
}

// 隱藏匯入預覽
function hideImportPreview() {
    const preview = document.getElementById('importPreview');
    preview.style.display = 'none';
}

// 匯入題目
async function importQuestions() {
    const fileInput = document.getElementById('importFile');
    const jsonInput = document.getElementById('importJson');
    
    let jsonData;
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const text = await file.text();
        jsonData = JSON.parse(text);
    } else if (jsonInput.value.trim()) {
        jsonData = JSON.parse(jsonInput.value);
    } else {
        alert('請選擇檔案或輸入 JSON 內容');
        return;
    }
    
    if (!Array.isArray(jsonData)) {
        alert('JSON 格式錯誤：應該是陣列格式');
        return;
    }
    
    try {
        const batch = db.batch();
        let successCount = 0;
        
        for (const questionData of jsonData) {
            const docRef = db.collection('questions').doc();
            
            // 標準化類型值
            let normalizedType = normalizeQuestionType(questionData.type);
            
            const question = {
                ...questionData,
                type: normalizedType, // 使用標準化後的類型
                createdBy: currentUser.uid,
                teacherId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(docRef, question);
            successCount++;
        }
        
        await batch.commit();
        
        // 關閉模態框
        const modal = document.querySelector('.modal.show');
        if (modal) {
            modal.remove();
        }
        
        // 顯示成功訊息（不需要點擊確認）
        showSuccessToast(`✅ 成功匯入 ${successCount} 個題目！`);
        
        // 重新載入題目並更新顯示
        await loadQuestions();
        updateStatistics();
        renderQuestions();
        
        console.log(`✅ 匯入完成，重新載入 ${allQuestions.length} 個題目`);
        
    } catch (error) {
        console.error('匯入失敗:', error);
        alert('匯入失敗：' + error.message);
    }
}

// 匯出題目
function exportQuestions() {
    const exportType = document.querySelector('input[name="exportType"]:checked').value;
    let questionsToExport = [];
    
    switch (exportType) {
        case 'all':
            questionsToExport = allQuestions;
            break;
        case 'selected':
            questionsToExport = allQuestions.filter(q => selectedQuestions.has(q.id));
            break;
        case 'filtered':
            questionsToExport = filteredQuestions;
            break;
    }
    
    if (questionsToExport.length === 0) {
        alert('沒有題目可以匯出');
        return;
    }
    
    // 移除 Firestore 特有的欄位
    const exportData = questionsToExport.map(q => {
        const { id, createdBy, createdAt, updatedAt, ...cleanQuestion } = q;
        return cleanQuestion;
    });
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questions-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    document.querySelector('.modal').remove();
    alert(`已匯出 ${questionsToExport.length} 個題目！`);
}

// 工具函數
function getTypeLabel(type) {
    // 調試：輸出類型值
    if (!type) {
        console.warn('⚠️ 題目類型為空:', type);
    }
    
    const labels = {
        multiple: '選擇題',
        multiple_choice: '選擇題',
        'multiple-choice': '選擇題',
        choice: '選擇題',
        truefalse: '是非題',
        true_false: '是非題',
        'true-false': '是非題',
        tf: '是非題',
        text: '問答題',
        essay: '問答題',
        short_answer: '問答題',
        'short-answer': '問答題',
        code: '程式題',
        programming: '程式題',
        coding: '程式題'
    };
    
    // 轉換為小寫以提高匹配率
    const normalizedType = type ? String(type).toLowerCase().trim() : '';
    const result = labels[normalizedType] || (type ? `${type}` : '未知類型');
    
    // 調試：輸出轉換結果
    if (!labels[normalizedType] && type) {
        console.warn('⚠️ 未識別的題目類型:', type, '→', result);
    }
    
    return result;
}

function getDifficultyLabel(difficulty) {
    const labels = {
        easy: '簡單',
        medium: '中等',
        hard: '困難',
        difficult: '困難',
        normal: '中等',
        basic: '簡單',
        advanced: '困難'
    };
    
    const normalizedDifficulty = difficulty ? String(difficulty).toLowerCase().trim() : '';
    return labels[normalizedDifficulty] || (difficulty ? `${difficulty}` : '中等');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 顯示成功 Toast 通知（自動消失）
function showSuccessToast(message) {
    // 創建 Toast 容器（如果不存在）
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;
        document.body.appendChild(toastContainer);
    }

    // 創建 Toast 元素
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideInRight 0.3s ease;
        min-width: 300px;
    `;
    
    toast.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none" style="width: 20px; height: 20px; flex-shrink: 0;">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
            <path d="M6 10l2 2 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    // 3 秒後自動移除
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// 添加動畫 CSS（如果還沒有）
if (!document.getElementById('toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}