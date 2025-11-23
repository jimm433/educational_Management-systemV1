# Teacher Question Bank System

一個全面的教師題庫管理系統，提供題目管理、考試建立、數據分析等功能。

## 功能特點

- 🔐 使用者身份驗證（Firebase Auth）
- 📝 題庫管理（新增、編輯、分類、標籤）
- 📊 考試管理（建立考試、設定時間、自動評分）
- 📈 數據分析（成績統計、題目分析）
- 📤 匯入匯出功能（支援 CSV、Excel、JSON）
- 🔗 Google Forms 整合
- 🤖 AI 智能批改（GPT + Claude）
- 📱 響應式設計
- 🎨 現代化 UI/UX

## 技術架構

- **前端**: Vanilla JavaScript, HTML5, CSS3
- **後端**: Firebase Functions (Node.js)
- **資料庫**: Firebase Firestore
- **身份驗證**: Firebase Authentication
- **儲存**: Firebase Storage
- **AI 批改**: OpenAI GPT-4 + Anthropic Claude Haiku 4.5
- **整合**: Google Apps Script, Google Forms

## 快速開始

### 環境需求

- Node.js >= 18.0.0
- npm >= 8.0.0
- Firebase CLI
- Google Cloud Platform 帳戶

### 安裝步驟

1. **複製專案**
```bash
git clone <repository-url>
cd teacher-question-bank-system
```

2. **安裝依賴**
```bash
# 安裝主要依賴
npm install

# 安裝前端依賴
cd frontend
npm install

# 安裝後端依賴
cd ../backend/functions
npm install
```

3. **設定 Firebase 配置**
```bash
# 編輯 frontend/public/assets/js/firebase-config.js
# 將 Firebase 配置替換為您自己的專案配置
# 
# 取得 Firebase 配置的步驟：
# 1. 前往 https://console.firebase.google.com/
# 2. 建立新專案或選擇現有專案
# 3. 進入專案設定 > 一般 > 您的應用程式
# 4. 複製配置資訊並替換到 firebase-config.js
```

4. **初始化 Firebase**
```bash
firebase login
firebase init
```

5. **啟動開發伺服器**
```bash
cd frontend
npm run dev
```

詳細設定說明請參考 [SETUP.md](SETUP.md)

## 專案結構

```
teacher-question-bank-system/
├── frontend/              # 前端程式碼
│   └── public/            # 前端靜態檔案（HTML、CSS、JS）
│       ├── assets/        # 資源檔案（CSS、JS、圖片）
│       ├── teacher/       # 教師端頁面
│       └── student/       # 學生端頁面
├── backend/               # 後端程式碼
│   ├── functions/         # Firebase Cloud Functions
│   └── firestore-rules/   # Firestore 安全規則
├── database/              # 資料庫結構定義
│   └── schema/            # 資料庫 schema
├── docs/                  # 專案文件和使用指南
├── scripts/               # 建置和部署腳本
├── google-apps-script/    # Google Apps Script 整合（可選）
├── SETUP.md               # 詳細設定指南
└── CHANGELOG.md           # 更新日誌
```

## AI 批改功能

系統支援 AI 智能批改功能，使用雙 AI 代理人（GPT-4 + Claude Haiku 4.5）進行批改：

- **預設 Claude 模型**: `claude-haiku-4-5`
- **配置方式**: 透過環境變數 `CLAUDE_MODEL_NAME` 設定
- **詳細說明**: 請參考 [SETUP.md](SETUP.md#claude-模型配置)

## 部署

### 開發環境
```bash
# 啟動前端開發伺服器
cd frontend
npm run dev
```

### 生產環境
```bash
# 建置前端
cd frontend
npm run build

# 部署到 Firebase
firebase deploy
```

詳細部署說明請參考 [SETUP.md](SETUP.md)

## 文檔

- [SETUP.md](SETUP.md) - **詳細設定指南**（Firebase 配置、AI 批改設定、部署說明）
- [USER_GUIDE.md](USER_GUIDE.md) - **使用者指南**（功能使用說明、操作步驟、最佳實踐）
- [FIREBASE_OPERATIONS.md](FIREBASE_OPERATIONS.md) - **Firebase 操作指南**（CLI 指令、Hosting、Rules、部署詳細說明）
- [docs/guides/setup-guide.md](docs/guides/setup-guide.md) - 安裝設定指南
- [CHANGELOG.md](CHANGELOG.md) - 更新日誌

### 快速連結

- 🚀 [開始使用](SETUP.md) - 從零開始設定系統
- 📖 [使用指南](USER_GUIDE.md) - 學習如何使用各項功能
- 🔥 [Firebase 操作](FIREBASE_OPERATIONS.md) - Firebase CLI 和 Console 操作教學
- 🔧 [疑難排解](SETUP.md#疑難排解) - 解決常見問題

## 貢獻指南

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 授權

此專案使用 MIT 授權 - 詳見 [LICENSE](LICENSE) 檔案

## 聯絡方式

專案維護者 - [jim43621203@gmail.com]

