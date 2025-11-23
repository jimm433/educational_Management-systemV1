# 自動批改系統教師版 - 考試管理與自動批改系統

## 系統概述

自動批改系統教師版是一個完整的考試管理系統，整合了您現有的三代理人自動批改系統，提供完整的教師管理界面。教師可以輕鬆創建考試、上傳學生答案、執行自動批改，並查看詳細的成績報告。

## 主要功能

### 🎯 考試管理
- **創建考試**: 設定考試標題、科目、描述和滿分
- **題目上傳**: 支援TXT、PDF、DOCX格式的題目檔案
- **考試狀態**: 草稿 → 進行中 → 批改中 → 已完成

### 📁 答案管理
- **批量上傳**: 支援一次上傳多個學生答案檔案
- **檔案格式**: 支援TXT、PDF、DOCX格式
- **命名建議**: 學生ID_姓名.副檔名 (例如: A123456_張三.txt)

### 🤖 自動批改
- **三代理人系統**: GPT + Claude + Gemini仲裁
- **逐題批改**: 自動識別題號並逐題評分
- **配分解析**: 自動從題目文本提取配分
- **語意相似度**: 使用Gemini Embedding進行一致性檢查

### 📊 結果分析
- **成績統計**: 平均分、最高分、最低分
- **成績分布**: 按分數區間統計人數
- **詳細報告**: 逐題批改結果和反饋
- **Excel匯出**: 一鍵匯出成績報表

## 系統架構

```
自動批改系統教師版
├── 原有批改系統 (app.py) - 端口 5000
│   ├── 三代理人批改邏輯
│   ├── 評分提詞管理
│   └── 批改結果生成
└── 教師版界面 (teacher_app.py) - 端口 5001
    ├── 考試管理
    ├── 學生答案上傳
    ├── 批改任務調度
    └── 結果展示
```

## 安裝與設定

### 1. 環境需求
```bash
# Python 3.8+
# MongoDB (本地或雲端)

# 安裝必要套件
pip install flask pymongo pandas openpyxl anthropic google-generativeai openai python-dotenv werkzeug
```

### 2. 環境變數設定
創建 `.env` 或 `key.env` 檔案：
```env
# AI API Keys
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key

# 資料庫設定
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB=auto_grading_teacher

# 系統設定
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
TEACHER_PORT=5001
FLASK_DEBUG=True
SECRET_KEY=your_secret_key

# 批改系統設定
SIMILARITY_THRESHOLD=0.90
SCORE_GAP_RATIO=0.30
MAX_FILE_SIZE=50
```

### 3. 啟動系統
```bash
# 方式一：使用啟動腳本 (推薦)
python start_teacher_app.py

# 方式二：分別啟動
# 終端1: 原有批改系統
python app.py

# 終端2: 教師版界面
python teacher_app.py
```

## 使用流程

### 1. 首次設定
1. 訪問 http://localhost:5000 設定評分提詞
2. 選擇科目 (C#、Java、Python、JavaScript等)
3. 輸入評分提詞內容
4. 儲存提詞

### 2. 創建考試
1. 訪問 http://localhost:5001 (教師版界面)
2. 點擊「創建新考試」
3. 填寫考試資訊：
   - 考試標題
   - 科目 (需與提詞科目一致)
   - 描述 (可選)
   - 滿分
   - 題目檔案
4. 點擊「創建考試」

### 3. 上傳學生答案
1. 在考試詳情頁面點擊「上傳學生答案」
2. 選擇多個答案檔案 (支援拖拽上傳)
3. 建議檔案命名：`學生ID_姓名.副檔名`
4. 點擊「上傳檔案」

### 4. 開始批改
1. 在考試詳情頁面點擊「開始批改」
2. 系統會自動：
   - 讀取題目檔案
   - 拆分題目和答案
   - 調用三代理人批改
   - 執行語意相似度檢查
   - 進行仲裁 (如需要)
   - 生成最終結果

### 5. 查看結果
1. 批改完成後點擊「查看結果」
2. 查看成績統計和分布
3. 點擊「查看詳情」查看逐題批改結果
4. 點擊「匯出Excel」下載成績報表

## 檔案結構

```
專案根目錄/
├── app.py                    # 原有批改系統
├── teacher_app.py           # 教師版應用
├── start_teacher_app.py     # 啟動腳本
├── safety_check_agent.py    # 安全檢查代理
├── 安全檢查代理人.py        # 安全檢查代理 (中文版)
├── config/
│   └── autogen_config.py    # AutoGen設定
├── templates/
│   ├── index.html           # 原有系統首頁
│   ├── task.html            # 原有系統結果頁
│   └── teacher/             # 教師版模板
│       ├── dashboard.html
│       ├── create_exam.html
│       ├── exam_detail.html
│       ├── upload_answers.html
│       ├── exam_results.html
│       └── exams_list.html
├── uploads/                 # 上傳檔案目錄
├── results/                 # 批改結果目錄
├── logs/                    # 日誌目錄
├── .env                     # 環境變數
└── README_教師版.md         # 說明文件
```

## 技術特色

### 🔧 整合現有系統
- 完全保留原有的三代理人批改邏輯
- 無需修改現有的評分提詞和批改流程
- 支援所有現有的AI模型和設定

### 📊 資料庫設計
- 使用MongoDB儲存考試、學生、提交和結果資料
- 支援複雜查詢和統計分析
- 自動建立索引提升效能

### 🚀 效能優化
- 支援批量檔案上傳
- 異步批改處理
- 檔案快取和清理機制

### 🔒 安全性
- 檔案類型檢查
- 檔案大小限制
- 路徑安全處理
- XSS防護

## 故障排除

### 常見問題

1. **MongoDB連接失敗**
   - 檢查MongoDB服務是否啟動
   - 確認MONGODB_URI設定正確

2. **AI API調用失敗**
   - 檢查API Key是否有效
   - 確認網路連接正常
   - 檢查API配額是否充足

3. **檔案上傳失敗**
   - 檢查檔案格式是否支援
   - 確認檔案大小不超過限制
   - 檢查uploads目錄權限

4. **批改結果異常**
   - 檢查評分提詞是否設定
   - 確認題目格式是否正確
   - 查看日誌檔案了解詳細錯誤

### 日誌查看
```bash
# 查看系統日誌
tail -f logs/teacher_app.log

# 查看批改日誌
tail -f logs/grader.log
```

## 進階設定

### 自定義評分提詞
1. 訪問原有系統 (http://localhost:5000)
2. 選擇對應科目
3. 編輯評分提詞
4. 儲存後自動套用到教師版

### 調整批改參數
在 `.env` 檔案中調整：
```env
# 相似度閾值 (0.0-1.0)
SIMILARITY_THRESHOLD=0.90

# 分數差距比例閾值
SCORE_GAP_RATIO=0.30

# 最大檔案大小 (MB)
MAX_FILE_SIZE=50
```

## 支援與維護

### 系統監控
- 定期檢查MongoDB連接狀態
- 監控AI API使用量
- 清理過期檔案和日誌

### 備份建議
- 定期備份MongoDB資料庫
- 備份uploads目錄
- 備份評分提詞設定

### 更新升級
- 保持AI SDK版本更新
- 定期更新安全套件
- 備份資料後進行系統升級

## 聯絡支援

如有問題或建議，請聯繫系統管理員或查看專案文檔。

---

**版本**: 1.0.0  
**更新日期**: 2024年12月  
**相容性**: Python 3.8+, MongoDB 4.0+

