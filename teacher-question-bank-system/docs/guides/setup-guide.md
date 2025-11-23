# 教師題庫管理系統 - 安裝設定指南

## 系統需求

### 軟體需求
- Node.js 18.0 或更高版本
- npm 8.0 或更高版本
- Firebase CLI
- Git

### 硬體需求
- RAM: 8GB 以上
- 硬碟空間: 5GB 以上
- 網路連線: 穩定的網際網路連線

## 安裝步驟

### 1. 下載專案
```bash
git clone https://github.com/your-username/teacher-question-bank-system.git
cd teacher-question-bank-system
```

### 2. 安裝依賴套件
```bash
# 安裝主要套件
npm install

# 安裝前端套件
cd frontend
npm install

# 安裝後端套件
cd ../backend/functions
npm install
```

### 3. Firebase 設定

#### 3.1 建立 Firebase 專案
1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 點擊「建立專案」
3. 輸入專案名稱，例如「teacher-question-bank」
4. 選擇是否啟用 Google Analytics（建議啟用）
5. 等待專案建立完成

#### 3.2 啟用 Firebase 服務
1. **Authentication**
   - 在左側選單選擇「Authentication」
   - 點擊「開始使用」
   - 在「Sign-in method」頁籤中啟用：
     - Email/Password
     - Google（推薦）

2. **Firestore Database**
   - 選擇「Firestore Database」
   - 點擊「建立資料庫」
   - 選擇「以測試模式開始」
   - 選擇資料庫位置（建議選擇 asia-east1）

3. **Storage**
   - 選擇「Storage」
   - 點擊「開始使用」
   - 使用預設設定

4. **Functions**
   - 選擇「Functions」
   - 點擊「開始使用」

#### 3.3 獲取 Firebase 配置
1. 在專案設定中點擊「專案設定」
2. 滾動到「你的應用程式」區域
3. 點擊「</> 網頁」圖示
4. 輸入應用程式名稱
5. 複製配置物件

### 4. 環境變數設定

#### 4.1 建立環境變數檔案
```bash
# 回到專案根目錄
cd ../..

# 複製環境變數範本
cp .env.example .env
```

#### 4.2 編輯環境變數
開啟 `.env` 檔案，填入 Firebase 配置資訊：

```env
# Firebase Configuration
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

### 5. Firebase CLI 設定

#### 5.1 安裝 Firebase CLI
```bash
npm install -g firebase-tools
```

#### 5.2 登入 Firebase
```bash
firebase login
```

#### 5.3 初始化 Firebase
```bash
firebase init
```

選擇以下服務：
- Firestore
- Functions
- Hosting
- Storage

### 6. 資料庫初始化

#### 6.1 設定 Firestore 安全規則
```bash
# 部署 Firestore 規則
firebase deploy --only firestore:rules
```

#### 6.2 建立初始資料
資料庫結構定義位於 `database/schema/` 目錄，可參考：
- `users.json` - 使用者資料結構
- `questions.json` - 題目資料結構

### 7. 本地開發環境

#### 7.1 啟動 Firebase 模擬器
```bash
firebase emulators:start
```

#### 7.2 啟動前端開發伺服器
```bash
# 新開一個終端機視窗
cd frontend
npm run dev
```

### 8. 驗證安裝

1. 開啟瀏覽器，前往 `http://localhost:3000`
2. 確認頁面正常載入
3. 嘗試註冊新帳號
4. 確認可以正常登入

## 常見問題

### Q1: Firebase 初始化失敗
**解決方案:**
- 確認已正確安裝 Firebase CLI
- 檢查網路連線
- 確認已登入正確的 Google 帳號

### Q2: 前端無法連接到 Firebase
**解決方案:**
- 檢查 `.env` 檔案中的配置是否正確
- 確認 Firebase 專案設定中的網域設定
- 檢查瀏覽器控制台的錯誤訊息

### Q3: 資料庫權限錯誤
**解決方案:**
- 確認 Firestore 安全規則已正確部署
- 檢查使用者是否已正確登入
- 查看 Firebase Console 中的使用者清單

### Q4: 函數部署失敗
**解決方案:**
- 確認 Node.js 版本符合需求
- 檢查 `backend/functions/package.json` 中的依賴
- 查看部署日誌中的具體錯誤訊息

## 部署到生產環境

### 1. 建置專案
```bash
npm run build
```

### 2. 部署到 Firebase
```bash
firebase deploy
```

### 3. 設定自訂網域（可選）
1. 在 Firebase Console 的 Hosting 頁面
2. 點擊「新增自訂網域」
3. 依照指示設定 DNS 記錄

## 更新指南

### 更新套件
```bash
# 更新主要套件
npm update

# 更新前端套件
cd frontend && npm update

# 更新後端套件
cd ../backend/functions && npm update
```

### 更新 Firebase SDK
```bash
npm install firebase@latest
```

## 支援

如果在安裝過程中遇到問題，請：

1. 查看專案的 [FAQ 頁面](../guides/user-manual.md#常見問題)
2. 搜尋 [GitHub Issues](https://github.com/your-username/teacher-question-bank-system/issues)
3. 建立新的 Issue 描述問題

## 下一步

安裝完成後，建議閱讀：
- [SETUP.md](../../SETUP.md) - 詳細設定指南
- [README.md](../../README.md) - 專案說明文件
