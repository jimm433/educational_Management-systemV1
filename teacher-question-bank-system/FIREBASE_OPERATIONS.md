# Firebase 操作指南

本指南詳細說明如何使用 Firebase CLI 和 Console 進行各種操作，包括初始化、部署、規則設定等。

---

## 📋 目錄

1. [Firebase CLI 安裝與登入](#firebase-cli-安裝與登入)
2. [firebase init 詳細說明](#firebase-init-詳細說明)
3. [Firestore Rules 設定與部署](#firestore-rules-設定與部署)
4. [Storage Rules 設定與部署](#storage-rules-設定與部署)
5. [Hosting 設定與部署](#hosting-設定與部署)
6. [Functions 部署](#functions-部署)
7. [常用部署指令](#常用部署指令)
8. [Firebase Console 操作](#firebase-console-操作)

---

## Firebase CLI 安裝與登入

### 安裝 Firebase CLI

```bash
# 全域安裝
npm install -g firebase-tools

# 驗證安裝
firebase --version
```

### 登入 Firebase

```bash
# 登入（會開啟瀏覽器）
firebase login

# 查看登入狀態
firebase login:list

# 登出
firebase logout
```

### 選擇專案

```bash
# 查看可用專案列表
firebase projects:list

# 選擇專案
firebase use <project-id>

# 查看當前使用的專案
firebase use
```

---

## firebase init 詳細說明

### 執行初始化

```bash
# 在專案根目錄執行
firebase init
```

### 互動式設定步驟詳解

#### 步驟 1：選擇要設定的功能

使用**空格鍵**選擇，**Enter** 確認：

```
? Which Firebase features do you want to set up for this directory?
  ◯ Database: Deploy Firebase Realtime Database Rules
  ◯ Firestore: Deploy Firestore Rules and Indexes
  ◯ Functions: Configure a Cloud Functions directory and files
  ◯ Hosting: Configure files for Firebase Hosting
  ◯ Storage: Configure a security rules file for Cloud Storage
  ◯ Emulators: Set up local emulators for Firebase features
```

**建議選擇**：
- ✅ **Firestore**（必須）
- ✅ **Functions**（如果使用 AI 批改功能）
- ✅ **Hosting**（必須，用於部署前端）
- ✅ **Storage**（如果使用檔案上傳功能）
- ⬜ **Emulators**（可選，用於本地測試）

**操作方式**：
- 按**空格鍵**選擇/取消選擇
- 選好後按 **Enter** 確認

#### 步驟 2：選擇或建立專案

```
? Please select an option:
  ◯ Use an existing project
  ◯ Create a new project
  ◯ Add Firebase to an existing Google Cloud Platform project
```

**選擇**：`Use an existing project`（使用現有專案）

**如果選擇「使用現有專案」**：
```
? Select a default Firebase project for this directory:
  [使用方向鍵選擇專案]
  teacher-question-bank (teacher-question-bank)
  my-other-project (my-other-project)
```

**操作方式**：
- 使用**上下方向鍵**選擇專案
- 按 **Enter** 確認

#### 步驟 3：Firestore 設定

如果選擇了 Firestore，會出現：

```
? What file should be used for Firestore Rules?
  firestore.rules
```

**回答**：直接按 **Enter** 使用預設值 `firestore.rules`

```
? What file should be used for Firestore indexes?
  firestore.indexes.json
```

**回答**：直接按 **Enter** 使用預設值 `firestore.indexes.json`

#### 步驟 4：Functions 設定

如果選擇了 Functions，會出現：

```
? What language would you like to use to write Cloud Functions?
  JavaScript
  TypeScript
```

**選擇**：`JavaScript`（使用方向鍵選擇，Enter 確認）

```
? Do you want to use ESLint to catch probable bugs and enforce style?
  Yes
  No
```

**選擇**：
- `No`（如果不想使用 ESLint，較簡單）
- `Yes`（如果想要程式碼檢查）

```
? Do you want to install dependencies with npm now?
  Yes
  No
```

**選擇**：`Yes`（自動安裝依賴）

#### 步驟 5：Hosting 設定

如果選擇了 Hosting，會出現：

```
? What do you want to use as your public directory?
  public
```

**回答**：輸入 `frontend/public` 然後按 Enter

**說明**：這是前端靜態檔案的位置

```
? Configure as a single-page app (rewrite all urls to /index.html)?
  Yes
  No
```

**選擇**：`Yes`（單頁應用程式，推薦）

**說明**：這樣所有路由都會指向 index.html，適合 SPA

```
? Set up automatic builds and deploys with GitHub?
  Yes
  No
```

**選擇**：`No`（除非您要使用 GitHub Actions 自動部署）

#### 步驟 6：Storage 設定

如果選擇了 Storage，會出現：

```
? What file should be used for Storage Rules?
  storage.rules
```

**回答**：直接按 **Enter** 使用預設值 `storage.rules`

#### 步驟 7：Emulators 設定（可選）

如果選擇了 Emulators，會出現：

```
? Which Firebase emulators do you want to set up?
  [使用空格鍵選擇]
  ◯ Authentication Emulator
  ◯ Functions Emulator
  ◯ Firestore Emulator
  ◯ Realtime Database Emulator
  ◯ Storage Emulator
  ◯ UI Emulator
```

**建議選擇**：
- ✅ **Authentication Emulator**
- ✅ **Functions Emulator**
- ✅ **Firestore Emulator**
- ✅ **UI Emulator**（方便查看所有模擬器）

---

## Firestore Rules 設定與部署

### 查看當前 Rules

```bash
# 查看 firestore.rules 檔案內容
cat firestore.rules
```

### 編輯 Rules

編輯 `firestore.rules` 檔案：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 您的規則
  }
}
```

### 部署 Rules

```bash
# 只部署 Firestore 規則
firebase deploy --only firestore:rules

# 部署規則和索引
firebase deploy --only firestore
```

### 測試 Rules（使用模擬器）

```bash
# 啟動模擬器
firebase emulators:start --only firestore

# 在另一個終端測試規則
firebase emulators:exec --only firestore "npm test"
```

### 在 Firebase Console 中設定 Rules

1. 前往 Firebase Console
2. 進入「Firestore Database」
3. 點擊「規則」頁籤
4. 直接編輯規則
5. 點擊「發布」

**注意**：在 Console 中編輯的規則會覆蓋本地檔案，建議使用 CLI 部署。

---

## Storage Rules 設定與部署

### 查看當前 Rules

```bash
cat storage.rules
```

### 編輯 Rules

編輯 `storage.rules` 檔案：

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      // 您的規則
    }
  }
}
```

### 部署 Rules

```bash
# 只部署 Storage 規則
firebase deploy --only storage

# 或使用完整指令
firebase deploy --only storage:rules
```

### 在 Firebase Console 中設定 Rules

1. 前往 Firebase Console
2. 進入「Storage」
3. 點擊「規則」頁籤
4. 編輯規則
5. 點擊「發布」

---

## Hosting 設定與部署

### 查看 Hosting 設定

檢查 `firebase.json` 中的 hosting 設定：

```json
{
  "hosting": {
    "public": "frontend/public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  }
}
```

### 部署到 Hosting

```bash
# 部署前端到 Hosting
firebase deploy --only hosting

# 預覽部署（不實際部署）
firebase hosting:channel:deploy preview
```

### Hosting 設定選項

#### 設定重寫規則（單頁應用）

在 `firebase.json` 中：

```json
{
  "hosting": {
    "public": "frontend/public",
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

#### 設定快取標頭

```json
{
  "hosting": {
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=604800"
          }
        ]
      }
    ]
  }
}
```

### 查看部署歷史

```bash
# 查看部署歷史
firebase hosting:channel:list

# 查看特定部署
firebase hosting:channel:open preview
```

### 回滾部署

1. 在 Firebase Console > Hosting
2. 點擊「發布歷史」
3. 選擇要回滾的版本
4. 點擊「回滾到此版本」

---

## Functions 部署

### 部署所有 Functions

```bash
# 部署所有函數
firebase deploy --only functions

# 部署特定函數
firebase deploy --only functions:functionName
```

### 查看 Functions 日誌

```bash
# 查看即時日誌
firebase functions:log

# 查看特定函數日誌
firebase functions:log --only functionName
```

### 設定 Functions 環境變數

```bash
# 設定環境變數
firebase functions:config:set openai.api_key="your_key"

# 查看已設定的環境變數
firebase functions:config:get

# 刪除環境變數
firebase functions:config:unset openai.api_key
```

### Functions 部署選項

在 `firebase.json` 中：

```json
{
  "functions": [{
    "source": "backend/functions",
    "codebase": "default",
    "ignore": [
      "node_modules",
      ".git",
      "firebase-debug.log"
    ]
  }]
}
```

---

## 常用部署指令

### 完整部署（所有服務）

```bash
# 部署所有服務
firebase deploy
```

### 分別部署

```bash
# 只部署 Hosting（前端）
firebase deploy --only hosting

# 只部署 Functions（後端函數）
firebase deploy --only functions

# 只部署 Firestore 規則
firebase deploy --only firestore:rules

# 只部署 Firestore 索引
firebase deploy --only firestore:indexes

# 只部署 Storage 規則
firebase deploy --only storage
```

### 組合部署

```bash
# 同時部署多個服務
firebase deploy --only hosting,functions

# 部署 Hosting 和 Firestore 規則
firebase deploy --only hosting,firestore:rules
```

### 強制部署（忽略錯誤）

```bash
# 強制部署（不推薦，除非確定）
firebase deploy --force
```

### 查看部署狀態

```bash
# 查看當前專案狀態
firebase projects:list

# 查看部署歷史
firebase hosting:channel:list
```

---

## Firebase Console 操作

### Firestore Database 操作

#### 查看資料

1. 前往 Firebase Console
2. 進入「Firestore Database」
3. 點擊集合名稱查看文件
4. 可以新增、編輯、刪除文件

#### 建立集合和文件

1. 點擊「開始集合」
2. 輸入集合 ID（例如：`questions`）
3. 輸入文件 ID（或選擇自動生成）
4. 新增欄位
5. 點擊「儲存」

#### 匯入/匯出資料

1. 點擊「...」選單
2. 選擇「匯出」或「匯入」
3. 選擇匯出格式（JSON）
4. 下載或上傳檔案

### Authentication 操作

#### 查看使用者

1. 進入「Authentication」
2. 查看「使用者」頁籤
3. 可以看到所有註冊的使用者

#### 手動新增使用者

1. 點擊「新增使用者」
2. 輸入電子郵件和密碼
3. 點擊「新增使用者」

#### 刪除使用者

1. 在使用者列表中
2. 點擊使用者右側的「...」
3. 選擇「刪除」

### Hosting 操作

#### 查看部署

1. 進入「Hosting」
2. 查看「發布歷史」
3. 可以看到所有部署記錄

#### 設定自訂網域

1. 進入「Hosting」
2. 點擊「新增自訂網域」
3. 輸入您的網域
4. 按照指示設定 DNS 記錄
5. 等待驗證完成

### Functions 操作

#### 查看函數

1. 進入「Functions」
2. 查看函數列表
3. 可以看到函數狀態、觸發次數等

#### 查看日誌

1. 點擊函數名稱
2. 進入「日誌」頁籤
3. 查看執行日誌和錯誤

#### 設定環境變數

1. 進入「Functions」
2. 點擊「設定」頁籤
3. 進入「環境變數」
4. 新增或編輯變數
5. 點擊「儲存」

### Storage 操作

#### 上傳檔案

1. 進入「Storage」
2. 點擊「上傳檔案」
3. 選擇檔案
4. 設定路徑（可選）
5. 上傳

#### 下載檔案

1. 在檔案列表中
2. 點擊檔案右側的「...」
3. 選擇「下載」

#### 設定規則

1. 進入「Storage」
2. 點擊「規則」頁籤
3. 編輯規則
4. 點擊「發布」

---

## 常見操作情境

### 情境 1：首次設定專案

```bash
# 1. 登入
firebase login

# 2. 初始化
firebase init
# 選擇：Firestore, Functions, Hosting, Storage

# 3. 部署規則
firebase deploy --only firestore:rules,storage

# 4. 部署前端
firebase deploy --only hosting
```

### 情境 2：更新 Firestore 規則

```bash
# 1. 編輯 firestore.rules
# 2. 部署規則
firebase deploy --only firestore:rules

# 3. 驗證規則（在 Console 中測試）
```

### 情境 3：更新 Functions

```bash
# 1. 編輯 Functions 程式碼
# 2. 部署 Functions
firebase deploy --only functions

# 3. 查看日誌
firebase functions:log
```

### 情境 4：只更新前端

```bash
# 1. 修改前端檔案
# 2. 部署 Hosting
firebase deploy --only hosting
```

### 情境 5：回滾到上一個版本

1. 在 Firebase Console > Hosting
2. 查看「發布歷史」
3. 選擇上一個版本
4. 點擊「回滾到此版本」

---

## 疑難排解

### 問題 1：firebase init 失敗

**錯誤訊息**：`Error: Failed to get Firebase project`

**解決方案**：
1. 確認已登入：`firebase login`
2. 確認專案存在：`firebase projects:list`
3. 檢查網路連線

### 問題 2：部署失敗 - 權限不足

**錯誤訊息**：`Permission denied`

**解決方案**：
1. 確認已登入正確的帳戶
2. 確認帳戶有專案權限
3. 在 Firebase Console 檢查專案成員設定

### 問題 3：Hosting 部署後無法訪問

**解決方案**：
1. 檢查 `firebase.json` 中的 `public` 路徑是否正確
2. 確認檔案確實存在
3. 檢查 `.firebaserc` 檔案中的專案 ID
4. 在 Console 中查看部署狀態

### 問題 4：Functions 部署失敗

**錯誤訊息**：`Functions did not deploy`

**解決方案**：
1. 檢查 `backend/functions/package.json` 是否正確
2. 確認所有依賴已安裝：`cd backend/functions && npm install`
3. 檢查 Node.js 版本是否符合要求
4. 查看詳細錯誤：`firebase deploy --only functions --debug`

### 問題 5：Rules 部署後仍無法存取

**解決方案**：
1. 確認規則語法正確
2. 在 Console 中測試規則
3. 檢查使用者是否已登入
4. 查看 Firestore 日誌中的錯誤訊息

---

## 最佳實踐

### 1. 使用版本控制

```bash
# 確保 .firebaserc 和 firebase.json 已加入 Git
git add .firebaserc firebase.json
git commit -m "Add Firebase configuration"
```

### 2. 測試後再部署

```bash
# 使用模擬器測試
firebase emulators:start

# 測試完成後再部署
firebase deploy
```

### 3. 分別部署不同服務

```bash
# 不要一次部署所有服務
# 分別部署可以更快發現問題
firebase deploy --only hosting
firebase deploy --only functions
```

### 4. 定期備份

- 定期匯出 Firestore 資料
- 備份 `firestore.rules` 和 `storage.rules`
- 備份 Functions 程式碼

### 5. 監控使用情況

- 在 Firebase Console 中監控使用量
- 設定預算警報
- 定期檢查日誌

---

## 快速參考

### 常用指令速查表

```bash
# 登入/登出
firebase login
firebase logout

# 專案管理
firebase use <project-id>
firebase projects:list

# 初始化
firebase init

# 部署
firebase deploy                    # 部署所有
firebase deploy --only hosting      # 只部署前端
firebase deploy --only functions    # 只部署函數
firebase deploy --only firestore:rules  # 只部署規則

# 模擬器
firebase emulators:start            # 啟動模擬器
firebase emulators:exec            # 執行測試

# 查看狀態
firebase use                        # 查看當前專案
firebase functions:log             # 查看函數日誌
```

---

## 需要更多幫助？

- [Firebase 官方文件](https://firebase.google.com/docs)
- [Firebase CLI 參考](https://firebase.google.com/docs/cli)
- [Firestore 規則文件](https://firebase.google.com/docs/firestore/security/get-started)
- [Hosting 文件](https://firebase.google.com/docs/hosting)

---

**最後更新**：2024-12-XX  
**版本**：2.0

