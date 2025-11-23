// 學生課程管理系統 JavaScript
// 作者: 教師題庫管理系統
// 版本: 1.0.0

// Firebase 配置
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
    console.log('🔥 Firebase 已初始化');
} else {
    console.log('🔥 Firebase 已存在，使用現有實例');
}

const auth = firebase.auth();
const db = firebase.firestore();

// 全域變數
let currentUser = null;
let courses = [];
let filteredCourses = [];
let currentFilter = 'all';

// DOM 元素
const elements = {
    loadingScreen: null,
    mainContent: null,
    coursesGrid: null,
    searchInput: null,
    filterButtons: null,
    joinCourseModal: null,
    courseDetailsModal: null,
    notification: null
};

// 初始化應用程式
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 學生課程管理系統正在初始化...');

    initializeElements();
    checkAuthState();
    bindEventListeners();
});

// 初始化 DOM 元素
function initializeElements() {
    elements.loadingScreen = document.getElementById('loadingScreen');
    elements.mainContent = document.getElementById('mainContent');
    elements.coursesGrid = document.getElementById('coursesGrid');
    elements.searchInput = document.getElementById('searchInput');
    elements.filterButtons = document.querySelectorAll('.filter-btn');
    elements.joinCourseModal = document.getElementById('joinCourseModal');
    elements.courseDetailsModal = document.getElementById('courseDetailsModal');
    elements.notification = document.getElementById('notification');
}

// 檢查身份驗證狀態
function checkAuthState() {
    auth.onAuthStateChanged(function(user) {
        if (user) {
            console.log('✅ 使用者已登入:', user.email);
            currentUser = user;
            hideLoadingScreen();
            loadUserCourses();
        } else {
            console.log('❌ 使用者未登入，導向登入頁面');
            window.location.href = '../dashboard.html';
        }
    });
}

// 隱藏載入畫面
function hideLoadingScreen() {
    if (elements.loadingScreen) {
        elements.loadingScreen.style.display = 'none';
    }
    if (elements.mainContent) {
        elements.mainContent.style.display = 'block';
    }
}

// 載入使用者的課程
async function loadUserCourses() {
    try {
        console.log('📚 正在載入課程資料...');

        const userCoursesRef = db.collection('userCourses')
            .where('userId', '==', currentUser.uid);

        const snapshot = await userCoursesRef.get();

        if (snapshot.empty) {
            console.log('📝 使用者尚未加入任何課程');
            showEmptyState();
            return;
        }

        const courseIds = snapshot.docs.map(doc => doc.data().courseId);

        // 獲取課程詳細資訊
        const coursesPromises = courseIds.map(async(courseId) => {
            const courseDoc = await db.collection('courses').doc(courseId).get();
            if (courseDoc.exists) {
                return {
                    id: courseDoc.id,
                    ...courseDoc.data()
                };
            }
            return null;
        });

        const coursesData = await Promise.all(coursesPromises);
        courses = coursesData.filter(course => course !== null);
        filteredCourses = [...courses];

        console.log(`✅ 成功載入 ${courses.length} 個課程`);
        renderCourses();

    } catch (error) {
        console.error('❌ 載入課程失敗:', error);
        showNotification('載入課程失敗，請重新整理頁面', 'error');
    }
}

// 顯示空狀態
function showEmptyState() {
    if (elements.coursesGrid) {
        elements.coursesGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <div class="empty-state-title">尚未加入任何課程</div>
                <div class="empty-state-description">
                    您還沒有加入任何課程。請點擊下方的「加入課程」按鈕來開始您的學習之旅。
                </div>
            </div>
        `;
    }
}

// 渲染課程列表
function renderCourses() {
    if (!elements.coursesGrid) return;

    if (filteredCourses.length === 0) {
        elements.coursesGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-title">沒有找到符合的課程</div>
                <div class="empty-state-description">
                    請嘗試調整搜尋條件或篩選器。
                </div>
            </div>
        `;
        return;
    }

    const coursesHTML = filteredCourses.map(course => `
        <div class="course-card" data-course-id="${course.id}">
            <div class="course-header">
                <div class="course-title">${course.title}</div>
                <div class="course-teacher">教師: ${course.teacherName}</div>
            </div>
            <div class="course-body">
                <div class="course-description">
                    ${course.description || '此課程暫無描述'}
                </div>
                <div class="course-meta">
                    <span class="course-status ${course.status === 'active' ? 'status-active' : 'status-inactive'}">
                        ${course.status === 'active' ? '進行中' : '已結束'}
                    </span>
                    <span>建立時間: ${formatDate(course.createdAt)}</span>
                </div>
                <div class="course-actions">
                    <button class="action-btn btn-primary" onclick="viewCourseDetails('${course.id}')">
                        查看詳情
                    </button>
                    <button class="action-btn btn-secondary" onclick="enterCourse('${course.id}')">
                        進入課程
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    elements.coursesGrid.innerHTML = coursesHTML;
}

// 查看課程詳情
function viewCourseDetails(courseId) {
    const course = courses.find(c => c.id === courseId);
    if (!course) {
        showNotification('找不到課程資訊', 'error');
        return;
    }

    const modal = document.getElementById('courseDetailsModal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title">課程詳情</h2>
            <button class="close-btn" onclick="closeCourseDetailsModal()">&times;</button>
        </div>
        <div class="course-details">
            <h3>${course.title}</h3>
            <p><strong>教師:</strong> ${course.teacherName}</p>
            <p><strong>描述:</strong> ${course.description || '暫無描述'}</p>
            <p><strong>狀態:</strong> ${course.status === 'active' ? '進行中' : '已結束'}</p>
            <p><strong>建立時間:</strong> ${formatDateTime(course.createdAt)}</p>
            <p><strong>課程代碼:</strong> ${course.code}</p>
        </div>
        <div class="form-actions">
            <button class="btn btn-cancel" onclick="closeCourseDetailsModal()">關閉</button>
            <button class="btn btn-submit" onclick="enterCourse('${courseId}')">進入課程</button>
        </div>
    `;

    modal.style.display = 'block';
}

// 關閉課程詳情模態框
function closeCourseDetailsModal() {
    const modal = document.getElementById('courseDetailsModal');
    modal.style.display = 'none';
}

// 進入課程
function enterCourse(courseId) {
    // 儲存當前課程 ID 到 sessionStorage
    sessionStorage.setItem('currentCourseId', courseId);
    window.location.href = 'course-content.html';
}

// 開啟加入課程模態框
function openJoinCourseModal() {
    const modal = document.getElementById('joinCourseModal');
    modal.style.display = 'block';

    // 聚焦到課程代碼輸入框
    setTimeout(() => {
        const courseCodeInput = document.getElementById('courseCode');
        if (courseCodeInput) {
            courseCodeInput.focus();
        }
    }, 100);
}

// 關閉加入課程模態框
function closeJoinCourseModal() {
    const modal = document.getElementById('joinCourseModal');
    modal.style.display = 'none';

    // 清空輸入框
    const courseCodeInput = document.getElementById('courseCode');
    if (courseCodeInput) {
        courseCodeInput.value = '';
    }
}

// 透過課程代碼加入課程
async function joinCourseByCode() {
    const courseCode = document.getElementById('courseCode').value.trim();

    if (!courseCode) {
        showNotification('請輸入課程代碼', 'warning');
        return;
    }

    try {
        console.log('🔍 正在搜尋課程代碼:', courseCode);

        // 查詢課程
        const coursesRef = db.collection('courses');
        const query = coursesRef.where('code', '==', courseCode);
        const snapshot = await query.get();

        if (snapshot.empty) {
            showNotification('找不到此課程代碼，請確認後再試', 'error');
            return;
        }

        const courseDoc = snapshot.docs[0];
        const courseData = courseDoc.data();

        // 檢查課程狀態
        if (courseData.status !== 'active') {
            showNotification('此課程已結束，無法加入', 'error');
            return;
        }

        // 檢查是否已經加入
        const existingMembership = await db.collection('userCourses')
            .where('userId', '==', currentUser.uid)
            .where('courseId', '==', courseDoc.id)
            .get();

        if (!existingMembership.empty) {
            showNotification('您已經加入此課程了', 'warning');
            closeJoinCourseModal();
            return;
        }

        // 加入課程
        await db.collection('userCourses').add({
            userId: currentUser.uid,
            courseId: courseDoc.id,
            role: 'student',
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('✅ 成功加入課程:', courseData.title);
        showNotification('成功加入課程！', 'success');
        closeJoinCourseModal();

        // 重新載入課程列表
        loadUserCourses();

    } catch (error) {
        console.error('❌ 加入課程失敗:', error);
        showNotification('加入課程失敗，請稍後再試', 'error');
    }
}

// 搜尋功能
function applySearch() {
    const searchTerm = elements.searchInput.value.toLowerCase().trim();

    filteredCourses = courses.filter(course => {
        const title = course.title.toLowerCase();
        const teacher = course.teacherName.toLowerCase();
        const description = (course.description || '').toLowerCase();

        return title.includes(searchTerm) ||
            teacher.includes(searchTerm) ||
            description.includes(searchTerm);
    });

    renderCourses();
}

// 篩選功能
function applyFilter(filter) {
    currentFilter = filter;

    // 更新篩選按鈕狀態
    elements.filterButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        }
    });

    // 應用篩選
    if (filter === 'all') {
        filteredCourses = [...courses];
    } else if (filter === 'active') {
        filteredCourses = courses.filter(course => course.status === 'active');
    } else if (filter === 'inactive') {
        filteredCourses = courses.filter(course => course.status === 'inactive');
    }

    renderCourses();
}

// 綁定事件監聽器
function bindEventListeners() {
    // 登出按鈕
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            auth.signOut()
                .then(function() {
                    window.location.href = '../dashboard.html';
                })
                .catch(function(error) {
                    console.error('登出失敗:', error);
                    showNotification('登出失敗', 'error');
                });
        });
    }

    // 搜尋功能
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce(applySearch, 300));
    }

    // 模態框點擊外部關閉
    if (elements.joinCourseModal) {
        elements.joinCourseModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeJoinCourseModal();
            }
        });
    }

    if (elements.courseDetailsModal) {
        elements.courseDetailsModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeCourseDetailsModal();
            }
        });
    }

    // Enter 鍵加入課程
    const courseCodeInput = document.getElementById('courseCode');
    if (courseCodeInput) {
        courseCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                joinCourseByCode();
            }
        });
    }
}

// 顯示通知
function showNotification(message, type) {
    type = type || 'success';

    if (elements.notification) {
        const messageElement = elements.notification.querySelector('#notificationMessage');
        if (messageElement) {
            messageElement.textContent = message;
        }

        elements.notification.className = 'notification ' + type;
        elements.notification.style.display = 'block';

        setTimeout(function() {
            elements.notification.style.display = 'none';
        }, 3000);
    }
}

// 工具函數
function formatDate(timestamp) {
    if (!timestamp) return '未知';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('zh-TW');
}

function formatDateTime(timestamp) {
    if (!timestamp) return '未知';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('zh-TW') + ' ' + date.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction() {
        const args = Array.prototype.slice.call(arguments);
        const later = function() {
            clearTimeout(timeout);
            func.apply(null, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 錯誤處理
window.addEventListener('error', function(event) {
    console.error('❌ 全域錯誤:', event.error);
    showNotification('系統發生錯誤，請重新整理頁面', 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('❌ 未處理的 Promise 拒絕:', event.reason);
    showNotification('系統發生錯誤，請重新整理頁面', 'error');
});

// 開啟診斷頁面
function openDebugPage() {
    console.log('🔍 開啟診斷頁面');
    window.open('../debug-student-courses.html', '_blank');
}

console.log(' 學生課程管理系統已載入完成');