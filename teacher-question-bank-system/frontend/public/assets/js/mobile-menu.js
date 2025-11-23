/**
 * 手機版選單控制
 */

(function() {
    'use strict';

    // 等待 DOM 載入完成
    document.addEventListener('DOMContentLoaded', function() {
        initMobileMenu();
    });

    function initMobileMenu() {
        // 檢查是否已經有漢堡選單按鈕
        if (document.querySelector('.menu-toggle')) {
            return; // 已經初始化過了
        }

        // 找到側邊欄和主要內容
        const sidebar = document.querySelector('.sidebar');
        const header = document.querySelector('.header');

        if (!sidebar || !header) {
            return; // 頁面沒有這些元素
        }

        // 創建漢堡選單按鈕
        const menuToggle = document.createElement('button');
        menuToggle.className = 'menu-toggle';
        menuToggle.setAttribute('aria-label', '開啟選單');
        menuToggle.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12h18M3 6h18M3 18h18" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

        // 創建遮罩層
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';

        // 插入元素
        const headerLeft = header.querySelector('.header-left');
        if (headerLeft) {
            headerLeft.insertBefore(menuToggle, headerLeft.firstChild);
        } else {
            header.insertBefore(menuToggle, header.firstChild);
        }
        document.body.appendChild(overlay);

        // 點擊漢堡選單
        menuToggle.addEventListener('click', function() {
            toggleSidebar();
        });

        // 點擊遮罩層關閉選單
        overlay.addEventListener('click', function() {
            closeSidebar();
        });

        // 點擊側邊欄連結後自動關閉（手機版）
        const navItems = sidebar.querySelectorAll('.nav-item');
        navItems.forEach(function(item) {
            item.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    closeSidebar();
                }
            });
        });

        // 監聽視窗大小變化
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                closeSidebar();
            }
        });

        // ESC 鍵關閉選單
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        });
    }

    function toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');

        if (!sidebar || !overlay) return;

        const isOpen = sidebar.classList.contains('open');

        if (isOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    function openSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');

        if (!sidebar || !overlay) return;

        sidebar.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // 防止背景滾動
    }

    function closeSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');

        if (!sidebar || !overlay) return;

        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = ''; // 恢復滾動
    }

    // 暴露全域函數
    window.toggleSidebar = toggleSidebar;
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;

})();