# 詳細設定指南

本指南將詳細說明如何從零開始設定教師題庫管理系統。

---

## 📋 目錄

1. [系統需求](#系統需求)
2. [Firebase 專案設定](#firebase-專案設定)
3. [本地環境設定](#本地環境設定)
4. [Firebase 配置](#firebase-配置)
5. [AI 批改功能設定](#ai-批改功能設定)
6. [驗證設定](#驗證設定)
7. [部署指南](#部署指南)
8. [疑難排解](#疑難排解)

---

## 系統需求

### 必要軟體

- **Node.js** >= 18.0.0
  - 下載：https://nodejs.org/
  - 驗證安裝：`node --version`
  - 驗證 npm：`npm --version`

- **npm** >= 8.0.0（通常隨 Node.js 一起安裝）

- **Firebase CLI**
  - 安裝：`npm install -g firebase-tools`
  - 驗證：`firebase --version`

- **Git**（用於版本控制）
  - 下載：https://git-scm.com/
  - 驗證：`git --version`

### 必要帳戶

- **Google 帳戶**（用於 Firebase）
- **Firebase 專案**（需要建立，詳見下方說明）

### 可選軟體（AI 批改功能）

- **Python 3.8+**（用於 AI 批改系統）
- **AI API 金鑰**：
  - OpenAI API Key（https://platform.openai.com/api-keys）
  - Anthropic API Key（https://console.anthropic.com/）
  - Google Gemini API Key（https://makersuite.google.com/app/apikey）

---

## Firebase 專案設定

### 步驟 1：建立 Firebase 專案

1. **前往 Firebase Console**
   - 開啟瀏覽器，前往：https://console.firebase.google.com/
   - 使用您的 Google 帳戶登入

2. **建立新專案**
   - 點擊「新增專案」或「建立專案」按鈕
   - 輸入專案名稱（例如：`teacher-question-bank`）
   - 點擊「繼續」

3. **選擇 Google Analytics（可選）**
   - 建議啟用以追蹤使用情況
   - 選擇或建立 Analytics 帳戶
   - 點擊「建立專案」

4. **等待專案建立完成**
   - 通常需要 1-2 分鐘
   - 完成後點擊「繼續」

### 步驟 2：啟用 Firebase 服務

#### 2.1 啟用 Authentication（身份驗證）

1. 在 Firebase Console 左側選單，點擊「Authentication」
2. 點擊「開始使用」按鈕
3. 進入「Sign-in method」頁籤
4. 啟用以下登入方式：
   - **Google**（推薦）
     - 點擊「Google」行
     - 切換「啟用」開關為開啟
     - 輸入專案支援電子郵件（通常是您的 Google 帳戶）
     - 點擊「儲存」
   - **Email/Password**（可選）
     - 點擊「Email/Password」行
     - 切換「啟用」開關為開啟
     - 點擊「儲存」

#### 2.2 建立 Firestore Database（資料庫）

1. 在左側選單點擊「Firestore Database」
2. 點擊「建立資料庫」按鈕
3. **選擇資料庫模式**：
   - **測試模式**（開發階段推薦）
     - 允許所有讀寫（30 天後會自動鎖定）
     - 適合快速開始
   - **生產模式**（正式環境）
     - 需要設定安全規則
     - 更安全但需要額外設定
4. **選擇資料庫位置**：
   - 建議選擇 `asia-east1`（台灣、香港）
   - 或選擇最接近您的位置
5. 點擊「啟用」
6. 等待資料庫建立完成（約 1-2 分鐘）

#### 2.3 啟用 Storage（儲存空間）

1. 在左側選單點擊「Storage」
2. 點擊「開始使用」按鈕
3. 選擇「以測試模式開始」（或使用安全規則）
4. 選擇與 Firestore 相同的位置
5. 點擊「完成」

#### 2.4 啟用 Functions（雲端函數）

1. 在左側選單點擊「Functions」
2. 點擊「開始使用」按鈕
3. 等待 Functions 啟用完成

### 步驟 3：取得 Firebase 配置資訊

1. **進入專案設定**
   - 點擊左側選單底部的「⚙️ 專案設定」（齒輪圖示）

2. **滾動到「您的應用程式」區塊**
   - 在「一般」頁籤中
   - 找到「您的應用程式」區塊

3. **註冊 Web 應用程式**
   - 點擊「</> 網頁」圖示（或「新增應用程式」>「網頁」）
   - 輸入應用程式暱稱（例如：`Teacher Question Bank Web`）
   - **可選**：勾選「也為此應用程式設定 Firebase Hosting」
   - 點擊「註冊應用程式」

4. **複製配置資訊**
   - 您會看到類似以下的配置物件：
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdefghijklmnop",
     measurementId: "G-XXXXXXXXXX"
   };
   ```
   - **重要**：請先不要關閉此頁面，稍後需要這些資訊

---

## 本地環境設定

### 步驟 1：下載專案

```bash
# 使用 Git 複製專案（如果從 GitHub）
git clone https://github.com/your-username/teacher-question-bank-system.git

# 或下載 ZIP 檔案並解壓縮
# 然後進入專案目錄
cd teacher-question-bank-system
```

### 步驟 2：安裝 Node.js 依賴

```bash
# 1. 安裝根目錄的依賴（如果有 package.json）
npm install

# 2. 安裝前端依賴
cd frontend
npm install

# 3. 安裝後端依賴
cd ../backend/functions
npm install

# 4. 回到專案根目錄
cd ../..
```

**驗證安裝**：
```bash
# 檢查 Node.js 版本（應該 >= 18.0.0）
node --version

# 檢查 npm 版本（應該 >= 8.0.0）
npm --version

# 檢查 Firebase CLI（如果已安裝）
firebase --version
```

### 步驟 3：安裝 Firebase CLI（如果尚未安裝）

```bash
# 全域安裝 Firebase CLI
npm install -g firebase-tools

# 驗證安裝
firebase --version
```

### 步驟 4：登入 Firebase

```bash
# 登入 Firebase（會開啟瀏覽器進行驗證）
firebase login

# 驗證登入狀態
firebase projects:list
```

---

## Firebase 配置

### 步驟 1：更新前端 Firebase 配置

1. **開啟配置檔案**
   - 使用文字編輯器開啟：`frontend/public/assets/js/firebase-config.js`

2. **替換配置值**
   - 將您在 Firebase Console 複製的配置資訊貼上
   - 替換所有 `YOUR_*` 的值：

```javascript
// frontend/public/assets/js/firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSy...",                    // 從 Firebase Console 複製
    authDomain: "your-project.firebaseapp.com", // 從 Firebase Console 複製
    projectId: "your-project-id",             // 從 Firebase Console 複製
    storageBucket: "your-project.appspot.com", // 從 Firebase Console 複製
    messagingSenderId: "123456789",       // 從 Firebase Console 複製
    appId: "1:123456789:web:abcdefghijklmnop", // 從 Firebase Console 複製
    measurementId: "G-XXXXXXXXXX"         // 從 Firebase Console 複製（可選）
};
```

3. **儲存檔案**

### 步驟 2：更新其他 HTML 檔案中的配置（如果需要）

系統中部分 HTML 檔案可能包含內嵌的 Firebase 配置。請檢查並更新以下檔案：

- `frontend/public/index.html`
- `frontend/public/dashboard.html`
- `frontend/public/teacher/*.html`
- `frontend/public/student/*.html`

**搜尋模式**：在這些檔案中搜尋 `YOUR_API_KEY` 或 `YOUR_PROJECT`，並替換為實際值。

### 步驟 3：設定 Firestore 安全規則

1. **查看規則檔案**
   - 開啟 `firestore.rules` 檔案
   - 檢查規則內容是否符合您的需求

2. **部署規則到 Firebase**
   ```bash
   # 在專案根目錄執行
   firebase deploy --only firestore:rules
   ```

3. **驗證規則**
   - 在 Firebase Console 中進入「Firestore Database」>「規則」
   - 確認規則已更新

### 步驟 4：設定 Storage 安全規則

1. **查看規則檔案**
   - 開啟 `storage.rules` 檔案

2. **部署規則**
   ```bash
   firebase deploy --only storage
   ```

### 步驟 5：初始化 Firebase 專案（首次設定）

```bash
# 在專案根目錄執行
firebase init
```

**互動式設定步驟**：

1. **選擇功能**（使用空格鍵選擇，Enter 確認）：
   - ✅ Firestore: Configure security rules and indexes files
   - ✅ Functions: Configure a Cloud Functions directory and files
   - ✅ Hosting: Configure files for Firebase Hosting
   - ✅ Storage: Configure a security rules file for Cloud Storage

2. **選擇專案**：
   - 選擇「Use an existing project」
   - 選擇您剛才建立的 Firebase 專案

3. **Firestore 設定**：
   - Rules file: `firestore.rules`（直接按 Enter 使用預設）
   - Indexes file: `firestore.indexes.json`（直接按 Enter 使用預設）

4. **Functions 設定**：
   - Language: JavaScript
   - ESLint: No（或 Yes，依個人喜好）
   - Install dependencies: Yes

5. **Hosting 設定**：
   - Public directory: `frontend/public`
   - Single-page app: Yes
   - Set up automatic builds: No（或 Yes）

6. **Storage 設定**：
   - Rules file: `storage.rules`（直接按 Enter 使用預設）

---

## AI 批改功能設定

### 步驟 1：取得 AI API 金鑰

#### 1.1 OpenAI API Key

1. 前往：https://platform.openai.com/api-keys
2. 登入您的 OpenAI 帳戶
3. 點擊「Create new secret key」
4. 輸入金鑰名稱（例如：`teacher-question-bank`）
5. 複製 API Key（**重要**：只會顯示一次，請妥善保存）

#### 1.2 Anthropic API Key

1. 前往：https://console.anthropic.com/
2. 登入您的 Anthropic 帳戶
3. 進入「API Keys」頁面
4. 點擊「Create Key」
5. 輸入金鑰名稱
6. 複製 API Key

#### 1.3 Google Gemini API Key

1. 前往：https://makersuite.google.com/app/apikey
2. 使用 Google 帳戶登入
3. 點擊「Create API Key」
4. 選擇專案或建立新專案
5. 複製 API Key

### 步驟 2：設定 Firebase Functions 環境變數

#### 方式 1：使用 Firebase CLI（推薦）

```bash
# 設定 OpenAI API Key
firebase functions:config:set openai.api_key="your_openai_api_key"

# 設定 Anthropic API Key
firebase functions:config:set anthropic.api_key="your_anthropic_api_key"

# 設定 Gemini API Key
firebase functions:config:set gemini.api_key="your_gemini_api_key"

# 設定 Claude 模型名稱（可選，預設為 claude-haiku-4-5）
firebase functions:config:set claude.model_name="claude-haiku-4-5"
```

#### 方式 2：在 Firebase Console 設定

1. 前往 Firebase Console > Functions > 設定
2. 進入「環境變數」頁籤
3. 新增以下變數：
   - `OPENAI_API_KEY` = `your_openai_api_key`
   - `ANTHROPIC_API_KEY` = `your_anthropic_api_key`
   - `GEMINI_API_KEY` = `your_gemini_api_key`
   - `CLAUDE_MODEL_NAME` = `claude-haiku-4-5`（可選）

### 步驟 3：設定本地開發環境變數（可選）

如果要在本地測試 AI 批改功能：

1. **建立 `.env` 檔案**（在 `backend/functions/` 目錄）
   ```bash
   cd backend/functions
   touch .env
   ```

2. **編輯 `.env` 檔案**：
   ```env
   OPENAI_API_KEY=your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   GEMINI_API_KEY=your_gemini_api_key
   CLAUDE_MODEL_NAME=claude-haiku-4-5
   ```

3. **確保 `.env` 在 `.gitignore` 中**（避免上傳到 Git）

### 步驟 4：Claude 模型配置說明

系統預設使用 `claude-haiku-4-5` 模型，這是 Anthropic 最新的快速且經濟的模型。

**支援的 Claude 模型**：
- `claude-haiku-4-5`（預設）- 快速、經濟、適合批改
- `claude-3-5-sonnet-20241022` - 平衡效能與成本
- `claude-3-5-sonnet-latest` - 最新版本
- `claude-3-sonnet-20240229` - 穩定版本
- `claude-3-opus-20240229` - 最高品質（成本較高）

**更改模型**：
```bash
# 透過環境變數設定
firebase functions:config:set claude.model_name="claude-3-5-sonnet-20241022"
```

---

## 驗證設定

### 步驟 1：驗證 Firebase 連接

1. **啟動本地開發伺服器**
   ```bash
   cd frontend
   npm run dev
   ```

2. **開啟瀏覽器**
   - 前往：http://localhost:3000（或終端顯示的網址）
   - 開啟瀏覽器開發者工具（F12）

3. **檢查控制台**
   - 應該看到：`🔥 Firebase 已初始化`
   - 不應該有錯誤訊息

4. **測試登入**
   - 點擊「使用 Google 帳號登入」
   - 選擇您的 Google 帳戶
   - 確認可以成功登入

### 步驟 2：驗證 Firestore 連接

1. **登入後檢查**
   - 登入成功後，應該能看到儀表板
   - 檢查瀏覽器控制台是否有 Firestore 相關錯誤

2. **在 Firebase Console 驗證**
   - 前往 Firebase Console > Firestore Database
   - 應該能看到 `users` 集合
   - 檢查是否有您的使用者資料

### 步驟 3：驗證 AI 批改功能（如果已設定）

1. **前往批改頁面**
   - 開啟：`frontend/public/teacher/grading.html`

2. **測試 AI 批改**
   - 選擇一個作業
   - 點擊「開始 AI 批改」
   - 檢查是否正常運作

3. **檢查 Functions 日誌**
   - 在 Firebase Console > Functions > 日誌
   - 查看是否有錯誤訊息

---

## 部署指南

### 開發環境（本地測試）

```bash
# 1. 啟動前端開發伺服器
cd frontend
npm run dev

# 2. 在另一個終端啟動 Firebase 模擬器（可選）
firebase emulators:start
```

### 生產環境部署

#### 方式 1：部署到 Firebase Hosting

```bash
# 1. 建置前端（如果需要）
cd frontend
npm run build

# 2. 部署所有服務
firebase deploy

# 或分別部署
firebase deploy --only hosting      # 只部署前端
firebase deploy --only functions    # 只部署函數
firebase deploy --only firestore:rules  # 只部署規則
```

#### 方式 2：使用 Firebase Hosting 預覽

```bash
# 預覽部署（不實際部署）
firebase hosting:channel:deploy preview
```

### 部署後驗證

1. **檢查部署狀態**
   - 在 Firebase Console > Hosting 查看部署狀態
   - 確認網址可以正常訪問

2. **測試功能**
   - 在生產環境測試登入
   - 測試題庫管理功能
   - 測試考試建立功能

---

## 疑難排解

### 問題 1：Firebase 初始化失敗

**症狀**：`firebase init` 執行失敗或無法連接

**解決方案**：
1. 檢查網路連線
2. 確認已正確登入：`firebase login`
3. 檢查 Firebase CLI 版本：`firebase --version`
4. 更新 Firebase CLI：`npm install -g firebase-tools@latest`
5. 清除快取：`firebase logout` 然後重新 `firebase login`

### 問題 2：前端無法連接到 Firebase

**症狀**：瀏覽器控制台顯示 Firebase 連接錯誤

**解決方案**：
1. **檢查配置檔案**
   - 確認 `firebase-config.js` 中的配置正確
   - 確認沒有遺漏任何欄位
   - 確認沒有多餘的引號或逗號

2. **檢查 Firebase Console**
   - 確認專案狀態正常
   - 確認所有服務已啟用

3. **檢查瀏覽器控制台**
   - 查看具體錯誤訊息
   - 常見錯誤：
     - `auth/unauthorized-domain`：需要將網域加入授權清單
     - `permission-denied`：檢查 Firestore 規則

4. **檢查授權網域**
   - 在 Firebase Console > Authentication > 設定
   - 在「授權網域」中新增您的網域（localhost 通常已自動加入）

### 問題 3：Firestore 權限錯誤

**症狀**：無法讀寫資料庫，出現 `permission-denied` 錯誤

**解決方案**：
1. **檢查安全規則**
   ```bash
   # 查看當前規則
   cat firestore.rules
   ```

2. **部署規則**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **檢查使用者登入狀態**
   - 確認使用者已正確登入
   - 檢查 Firebase Console > Authentication > 使用者

4. **測試模式檢查**
   - 如果使用測試模式，確認未超過 30 天
   - 或切換到生產模式並設定正確規則

### 問題 4：AI 批改功能無法使用

**症狀**：點擊「開始 AI 批改」沒有反應或出現錯誤

**解決方案**：
1. **檢查 API 金鑰**
   ```bash
   # 查看已設定的環境變數
   firebase functions:config:get
   ```

2. **檢查 Functions 日誌**
   - Firebase Console > Functions > 日誌
   - 查看具體錯誤訊息

3. **驗證 API 金鑰有效性**
   - 測試 OpenAI API：https://platform.openai.com/playground
   - 測試 Anthropic API：https://console.anthropic.com/
   - 測試 Gemini API：https://makersuite.google.com/

4. **檢查配額**
   - 確認 API 金鑰有足夠的配額
   - 檢查是否有費用限制

### 問題 5：npm install 失敗

**症狀**：執行 `npm install` 時出現錯誤

**解決方案**：
1. **清除快取**
   ```bash
   npm cache clean --force
   ```

2. **刪除 node_modules 重新安裝**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **檢查 Node.js 版本**
   ```bash
   node --version  # 應該 >= 18.0.0
   ```

4. **使用特定版本**
   ```bash
   npm install --legacy-peer-deps
   ```

### 問題 6：部署失敗

**症狀**：`firebase deploy` 執行失敗

**解決方案**：
1. **檢查登入狀態**
   ```bash
   firebase login:list
   ```

2. **檢查專案設定**
   ```bash
   firebase use
   ```

3. **查看詳細錯誤**
   ```bash
   firebase deploy --debug
   ```

4. **檢查 Functions 程式碼**
   - 確認 `backend/functions/package.json` 正確
   - 確認所有依賴已安裝

### 問題 7：本地開發伺服器無法啟動

**症狀**：`npm run dev` 失敗或無法訪問

**解決方案**：
1. **檢查端口是否被占用**
   ```bash
   # Windows
   netstat -ano | findstr :3000
   
   # Mac/Linux
   lsof -i :3000
   ```

2. **更改端口**
   - 編輯 `vite.config.js` 或 `package.json`
   - 修改 `port` 設定

3. **檢查防火牆設定**
   - 確認防火牆允許 Node.js 訪問網路

---

## 下一步

設定完成後，建議：

1. **閱讀使用指南**
   - 熟悉題庫管理功能
   - 學習如何建立考試
   - 了解 AI 批改功能

2. **測試所有功能**
   - 建立測試題目
   - 建立測試考試
   - 測試 AI 批改

3. **設定生產環境**
   - 配置自訂網域
   - 設定備份策略
   - 監控系統使用情況

4. **加入社群**
   - 關注 GitHub Issues
   - 參與討論
   - 回報問題或建議

---

## 需要幫助？

如果遇到問題：

1. 查看 [常見問題](#疑難排解)
2. 搜尋 [GitHub Issues](https://github.com/your-username/teacher-question-bank-system/issues)
3. 建立新的 Issue 描述問題
4. 查看 [Firebase 文件](https://firebase.google.com/docs)

---

**最後更新**：2024-12-XX  
**版本**：2.0
