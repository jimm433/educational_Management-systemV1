// frontend/public/assets/js/settings.js
import { auth, db, storage, checkFirebaseConnection } from './firebase-config.js';

let currentUser = null;

// Initialize Settings Page
document.addEventListener('DOMContentLoaded', () => {
    console.log('📊 設定頁面載入中...');
    initializeSettings();
    setupNavigation();
    setupLogout();
    setupAvatarUpload();
});

// Main Initialization Function
async function initializeSettings() {
    try {
        document.getElementById('loadingScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';

        // Check Firebase connection
        const isConnected = await checkFirebaseConnection();
        if (!isConnected) throw new Error('Firebase 連接失敗');

        await checkAuthState();
        await loadUserData();
        await loadSubjects();
        await loadPreferences();
        await loadNotifications();
        await loadBackupSettings();

        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        console.log('✅ 設定頁面初始化完成');
    } catch (error) {
        document.getElementById('loadingScreen').style.display = 'none';
        console.error('❌ 設定頁面初始化失敗:', error);
        showErrorToast('初始化失敗，請重新登入');
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
}

// Check Authentication State
function checkAuthState() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                console.log('✅ 使用者已登入:', user.email);
                resolve(user);
            } else {
                console.log('❌ 使用者未登入，重導向到登入頁面');
                reject(new Error('使用者未登入'));
            }
        });
    });
}

// Load User Data
async function loadUserData() {
    try {
        if (!currentUser) throw new Error('無使用者資訊');
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.role !== 'teacher') {
                showErrorToast('此頁面僅限教師使用');
                setTimeout(() => window.location.href = 'index.html', 2000);
                throw new Error('非教師角色');
            }

            // Update UI
            document.getElementById('userName').textContent = userData.name || '未知使用者';
            document.getElementById('userName').classList.remove('placeholder');
            document.getElementById('displayName').value = userData.name || '';
            document.getElementById('email').value = currentUser.email;
            document.getElementById('teacherId').value = userData.teacherId || '';
            document.getElementById('school').value = userData.school || '';
            document.getElementById('bio').value = userData.bio || '';

            // Update Avatar
            const avatarUrl = userData.photoURL;
            const avatarImage = document.getElementById('avatarImage');
            const avatarPlaceholder = document.getElementById('avatarPlaceholder');
            const avatarInitial = document.getElementById('avatarInitial');
            if (avatarUrl) {
                avatarImage.src = avatarUrl;
                avatarImage.style.display = 'block';
                avatarPlaceholder.style.display = 'none';
            } else {
                avatarInitial.textContent = userData.name ? userData.name[0] : 'T';
                avatarImage.style.display = 'none';
                avatarPlaceholder.style.display = 'flex';
            }

            console.log('✅ 使用者資料載入完成:', userData);
        } else {
            throw new Error('找不到使用者資料');
        }
    } catch (error) {
        console.error('❌ 載入使用者資料失敗:', error);
        showErrorToast('無法載入使用者資料');
        throw error;
    }
}

// Load Preferences
async function loadPreferences() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const preferences = userDoc.data().preferences || {};
        document.querySelector(`input[name="theme"][value="${preferences.theme || 'light'}"]`).checked = true;
        document.getElementById('fontSize').value = preferences.fontSize || 'medium';
        document.getElementById('language').value = preferences.language || 'zh-TW';
        document.getElementById('autoSave').checked = preferences.autoSave || false;
        document.getElementById('showTips').checked = preferences.showTips || false;
    } catch (error) {
        console.error('❌ 載入偏好設定失敗:', error);
        showErrorToast('載入偏好設定失敗');
    }
}

// Load Notifications
async function loadNotifications() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const notifications = userDoc.data().notifications || {};
        document.getElementById('emailNotifications').checked = notifications.email || false;
        document.getElementById('pushNotifications').checked = notifications.push || false;
        document.getElementById('doNotDisturbStart').value = notifications.doNotDisturbStart || '22:00';
        document.getElementById('doNotDisturbEnd').value = notifications.doNotDisturbEnd || '07:00';
    } catch (error) {
        console.error('❌ 載入通知設定失敗:', error);
        showErrorToast('載入通知設定失敗');
    }
}

// Load Backup Settings
async function loadBackupSettings() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const backup = userDoc.data().backup || {};
        document.getElementById('autoBackup').checked = backup.autoBackup || false;
    } catch (error) {
        console.error('❌ 載入備份設定失敗:', error);
        showErrorToast('載入備份設定失敗');
    }
}

// Load Subjects
async function loadSubjects() {
    const subjectsList = document.getElementById('subjectsList');
    try {
        const coursesSnapshot = await db.collection('courses').where('teacherId', '==', currentUser.uid).get();
        if (coursesSnapshot.empty) {
            subjectsList.innerHTML = '<div class="empty-message">目前沒有科目</div>';
            return;
        }

        subjectsList.innerHTML = coursesSnapshot.docs.map(doc => {
            const course = doc.data();
            return `
                <div class="subject-item">
                    <div class="subject-info">
                        <div class="subject-name">${course.name}</div>
                        <div class="subject-code">${course.code}</div>
                        <div class="subject-description">${course.description || '無描述'}</div>
                    </div>
                    <div class="subject-actions">
                        <button class="btn btn-sm btn-primary" onclick="editSubject('${doc.id}')">編輯</button>
                        <button class="btn btn-sm btn-secondary" onclick="deleteSubject('${doc.id}')">刪除</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('❌ 載入科目失敗:', error);
        showErrorToast('載入科目失敗');
    }
}

// Save All Settings
document.getElementById('saveAllSettingsBtn').addEventListener('click', async() => {
    try {
        const profileData = {
            name: document.getElementById('displayName').value,
            teacherId: document.getElementById('teacherId').value,
            school: document.getElementById('school').value,
            bio: document.getElementById('bio').value
        };

        const preferences = {
            theme: document.querySelector('input[name="theme"]:checked').value,
            fontSize: document.getElementById('fontSize').value,
            language: document.getElementById('language').value,
            autoSave: document.getElementById('autoSave').checked,
            showTips: document.getElementById('showTips').checked
        };

        const notifications = {
            email: document.getElementById('emailNotifications').checked,
            push: document.getElementById('pushNotifications').checked,
            doNotDisturbStart: document.getElementById('doNotDisturbStart').value,
            doNotDisturbEnd: document.getElementById('doNotDisturbEnd').value
        };

        const backup = {
            autoBackup: document.getElementById('autoBackup').checked
        };

        await db.collection('users').doc(currentUser.uid).update({
            ...profileData,
            preferences,
            notifications,
            backup
        });

        document.getElementById('userName').textContent = profileData.name;
        showSuccessToast('所有設定已儲存');
    } catch (error) {
        console.error('❌ 儲存設定失敗:', error);
        showErrorToast('儲存設定失敗');
    }
});

// Reset to Defaults
document.getElementById('resetToDefaultsBtn').addEventListener('click', async() => {
    try {
        await db.collection('users').doc(currentUser.uid).update({
            preferences: {
                theme: 'light',
                fontSize: 'medium',
                language: 'zh-TW',
                autoSave: false,
                showTips: true
            },
            notifications: {
                email: true,
                push: true,
                doNotDisturbStart: '22:00',
                doNotDisturbEnd: '07:00'
            },
            backup: { autoBackup: false }
        });

        await loadPreferences();
        await loadNotifications();
        await loadBackupSettings();
        showSuccessToast('已重置為預設值');
    } catch (error) {
        console.error('❌ 重置設定失敗:', error);
        showErrorToast('重置設定失敗');
    }
});

// Setup Avatar Upload
function setupAvatarUpload() {
    const uploadBtn = document.getElementById('uploadAvatarBtn');
    const removeBtn = document.getElementById('removeAvatarBtn');
    const avatarInput = document.getElementById('avatarInput');

    uploadBtn.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', async(e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const storageRef = storage.ref(`avatars/${currentUser.uid}/${file.name}`);
            await storageRef.put(file);
            const photoURL = await storageRef.getDownloadURL();

            await db.collection('users').doc(currentUser.uid).update({ photoURL });

            const avatarImage = document.getElementById('avatarImage');
            const avatarPlaceholder = document.getElementById('avatarPlaceholder');
            avatarImage.src = photoURL;
            avatarImage.style.display = 'block';
            avatarPlaceholder.style.display = 'none';

            showSuccessToast('頭像上傳成功');
        } catch (error) {
            console.error('❌ 頭像上傳失敗:', error);
            showErrorToast('頭像上傳失敗');
        }
    });

    removeBtn.addEventListener('click', async() => {
        try {
            await db.collection('users').doc(currentUser.uid).update({ photoURL: null });

            const avatarImage = document.getElementById('avatarImage');
            const avatarPlaceholder = document.getElementById('avatarPlaceholder');
            const avatarInitial = document.getElementById('avatarInitial');
            avatarImage.style.display = 'none';
            avatarPlaceholder.style.display = 'flex';
            avatarInitial.textContent = document.getElementById('displayName').value[0] || 'T';

            showSuccessToast('頭像已移除');
        } catch (error) {
            console.error('❌ 移除頭像失敗:', error);
            showErrorToast('移除頭像失敗');
        }
    });
}

// Save Subject
document.getElementById('saveSubjectBtn').addEventListener('click', async() => {
    try {
        const subjectName = document.getElementById('subjectName').value;
        const subjectCode = document.getElementById('subjectCode').value;
        const subjectDescription = document.getElementById('subjectDescription').value;

        if (!subjectName || !subjectCode) {
            showErrorToast('科目名稱和代碼為必填項');
            return;
        }

        await db.collection('courses').add({
            name: subjectName,
            code: subjectCode,
            description: subjectDescription,
            teacherId: currentUser.uid,
            createdAt: new Date()
        });

        bootstrap.Modal.getInstance(document.getElementById('addSubjectModal')).hide();
        document.getElementById('addSubjectForm').reset();
        await loadSubjects();
        showSuccessToast('科目新增成功');
    } catch (error) {
        console.error('❌ 新增科目失敗:', error);
        showErrorToast('新增科目失敗');
    }
});

// Change Password
document.getElementById('savePasswordBtn').addEventListener('click', async() => {
    try {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            showErrorToast('新密碼與確認密碼不符');
            return;
        }

        const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
        await currentUser.reauthenticateWithCredential(credential);
        await currentUser.updatePassword(newPassword);

        bootstrap.Modal.getInstance(document.getElementById('changePasswordModal')).hide();
        document.getElementById('changePasswordForm').reset();
        showSuccessToast('密碼已更新');
    } catch (error) {
        console.error('❌ 更改密碼失敗:', error);
        showErrorToast('更改密碼失敗');
    }
});

// Manual Backup (Placeholder)
document.getElementById('manualBackupBtn').addEventListener('click', () => {
    showSuccessToast('備份功能尚未實現');
});

// Setup Navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.settings-nav .nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            const sectionId = item.dataset.section + 'Section';
            document.getElementById(sectionId).classList.add('active');
        });
    });
}

// Setup Logout
function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async() => {
        try {
            await auth.signOut();
            console.log('✅ 登出成功');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('❌ 登出失敗:', error);
            showErrorToast('登出失敗，請重試');
        }
    });
}

// Show Error Toast
function showErrorToast(message) {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast-${Date.now()}`;
    const toastHTML = `
        <div class="toast" id="${toastId}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <strong class="me-auto">錯誤</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">${message}</div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}

// Show Success Toast
function showSuccessToast(message) {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast-${Date.now()}`;
    const toastHTML = `
        <div class="toast" id="${toastId}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <strong class="me-auto">成功</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">${message}</div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}