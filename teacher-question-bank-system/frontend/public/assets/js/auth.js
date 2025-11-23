// frontend/public/assets/js/auth.js

(function() {
    // 私有角色快取
    let cachedUserRole = null;

    // 身份驗證工具物件
    const AuthUtils = {
        // 取得目前使用者
        getCurrentUser: function() {
            return firebase.auth().currentUser;
        },

        // 檢查是否已登入
        isLoggedIn: function() {
            return !!this.getCurrentUser();
        },

        // 檢查使用者角色（帶快取）
        getUserRole: async function() {
            const user = this.getCurrentUser();
            if (!user) return null;

            // 如果已有快取，直接返回
            if (cachedUserRole) {
                return cachedUserRole;
            }

            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                cachedUserRole = userDoc.exists ? userDoc.data().role : null;
                return cachedUserRole;
            } catch (error) {
                console.error('取得使用者角色失敗:', error);
                return null;
            }
        },

        // 清除角色快取（在登出或使用者變更時使用）
        clearRoleCache: function() {
            cachedUserRole = null;
        },

        // 檢查是否為教師
        isTeacher: async function() {
            const role = await this.getUserRole();
            return role === 'teacher';
        },

        // 檢查是否為學生
        isStudent: async function() {
            const role = await this.getUserRole();
            return role === 'student';
        },

        // 登出函數
        signOut: async function() {
            try {
                await firebase.auth().signOut();
                this.clearRoleCache();
                console.log('✅ 使用者已登出');
                return true;
            } catch (error) {
                console.error('❌ 登出失敗:', error);
                return false;
            }
        },

        // 重導向到登入頁面
        redirectToLogin: function() {
            const currentUrl = new URL(window.location.href);
            const basePath = currentUrl.pathname.substring(0, currentUrl.pathname.lastIndexOf('/') + 1);
            const loginPath = basePath + 'index.html';

            // 避免重複重導向到 index.html
            if (!currentUrl.pathname.endsWith('index.html') && !currentUrl.pathname.endsWith('/')) {
                window.location.href = loginPath;
            }
        },

        // 檢查認證狀態的通用函數
        checkAuthState: function() {
            return new Promise((resolve, reject) => {
                if (typeof firebase === 'undefined') {
                    reject(new Error('Firebase 未載入'));
                    return;
                }

                const unsubscribe = firebase.auth().onAuthStateChanged(user => {
                    unsubscribe(); // 取消監聽，避免重複觸發
                    if (user) {
                        console.log('✅ 使用者已登入:', user.email);
                        resolve(user);
                    } else {
                        console.log('❌ 使用者未登入');
                        reject(new Error('使用者未登入'));
                    }
                }, error => {
                    unsubscribe();
                    console.error('認證狀態檢查失敗:', error);
                    reject(error);
                });
            });
        },

        // 初始化認證監聽（用於需要持續監聽的頁面）
        initAuthListener: function(onAuthChanged) {
            return firebase.auth().onAuthStateChanged(user => {
                this.clearRoleCache(); // 當使用者變更時清除角色快取
                if (onAuthChanged && typeof onAuthChanged === 'function') {
                    onAuthChanged(user);
                }
            }, error => {
                console.error('認證監聽失敗:', error);
            });
        }
    };

    // 頁面保護函數
    async function requireAuth(requiredRole = null) {
        try {
            const user = await AuthUtils.checkAuthState();

            if (requiredRole) {
                const userRole = await AuthUtils.getUserRole();
                if (userRole !== requiredRole) {
                    throw new Error(`需要 ${requiredRole} 權限`);
                }
            }

            return true;
        } catch (error) {
            console.error('身份驗證失敗:', error);
            alert('請先登入');
            AuthUtils.redirectToLogin();
            return false;
        }
    }

    // 暴露到全域
    window.AuthUtils = AuthUtils;
    window.requireAuth = requireAuth;

    console.log('🔐 身份驗證模組已載入');
})();