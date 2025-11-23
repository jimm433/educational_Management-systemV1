@echo off
echo ========================================
echo 🚀 開始部署教育管理系統
echo ========================================

echo.
echo 📋 檢查部署環境...
echo.

REM 檢查 Firebase CLI
firebase --version
if %errorlevel% neq 0 (
    echo ❌ Firebase CLI 未安裝或未正確配置
    pause
    exit /b 1
)

echo ✅ Firebase CLI 已安裝

REM 檢查 Node.js
node --version
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安裝
    pause
    exit /b 1
)

echo ✅ Node.js 已安裝

echo.
echo 🔧 安裝依賴套件...
echo.

REM 安裝前端依賴
cd frontend
if exist package.json (
    echo 📦 安裝前端依賴...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ 前端依賴安裝失敗
        pause
        exit /b 1
    )
    echo ✅ 前端依賴安裝完成
) else (
    echo ⚠️ 未找到前端 package.json，跳過前端依賴安裝
)

cd ..

REM 安裝 Functions 依賴
cd functions
if exist package.json (
    echo 📦 安裝 Functions 依賴...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Functions 依賴安裝失敗
        pause
        exit /b 1
    )
    echo ✅ Functions 依賴安裝完成
) else (
    echo ⚠️ 未找到 Functions package.json，跳過 Functions 依賴安裝
)

cd ..

echo.
echo 🚀 開始部署到 Firebase...
echo.

REM 部署 Firestore 規則
echo 📋 部署 Firestore 規則...
firebase deploy --only firestore:rules
if %errorlevel% neq 0 (
    echo ❌ Firestore 規則部署失敗
    pause
    exit /b 1
)
echo ✅ Firestore 規則部署完成

REM 部署 Firestore 索引
echo 📋 部署 Firestore 索引...
firebase deploy --only firestore:indexes
if %errorlevel% neq 0 (
    echo ❌ Firestore 索引部署失敗
    pause
    exit /b 1
)
echo ✅ Firestore 索引部署完成

REM 部署 Functions
echo 🔧 部署 Cloud Functions...
firebase deploy --only functions
if %errorlevel% neq 0 (
    echo ❌ Cloud Functions 部署失敗
    pause
    exit /b 1
)
echo ✅ Cloud Functions 部署完成

REM 部署 Hosting
echo 🌐 部署 Hosting...
firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo ❌ Hosting 部署失敗
    pause
    exit /b 1
)
echo ✅ Hosting 部署完成

echo.
echo ========================================
echo 🎉 部署完成！
echo ========================================
echo.
echo 📱 您的應用程式已部署到：
echo    https://classhelper-aa6be.web.app
echo.
echo 🔧 管理後台：
echo    https://console.firebase.google.com/project/classhelper-aa6be
echo.
echo 📋 下一步：
echo    1. 測試應用程式功能
echo    2. 配置 Google Forms 同步
echo    3. 設定 AI 批改服務
echo.
pause
