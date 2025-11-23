#!/bin/bash

# 教師題庫管理系統 - 建置腳本

echo "🔧 開始建置教師題庫管理系統..."

# 檢查 Node.js 版本
echo "📋 檢查 Node.js 版本..."
node_version=$(node -v | cut -d'v' -f2)
required_version="18.0.0"

if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ 錯誤: 需要 Node.js $required_version 或更高版本，目前版本: $node_version"
    exit 1
fi

echo "✅ Node.js 版本檢查通過: $node_version"

# 清理舊的建置檔案
echo "🧹 清理舊的建置檔案..."
rm -rf frontend/dist
rm -rf backend/functions/dist
rm -rf build/

# 安裝依賴
echo "📦 安裝主要依賴..."
npm install

echo "📦 安裝前端依賴..."
cd frontend
npm install

echo "📦 安裝後端依賴..."
cd ../backend/functions
npm install
cd ../..

# 執行測試
echo "🧪 執行測試..."
npm run test

if [ $? -ne 0 ]; then
    echo "❌ 測試失敗，建置中止"
    exit 1
fi

# 程式碼檢查
echo "🔍 執行程式碼檢查..."
cd frontend
npm run lint

if [ $? -ne 0 ]; then
    echo "❌ 程式碼檢查失敗，建置中止"
    exit 1
fi

cd ..

# 建置前端
echo "🏗️ 建置前端..."
cd frontend
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 前端建置失敗"
    exit 1
fi

cd ..

# 建置後端
echo "🏗️ 建置後端..."
cd backend/functions
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 後端建置失敗"
    exit 1
fi

cd ../..

# 建立建置目錄
echo "📁 建立建置目錄..."
mkdir -p build

# 複製建置檔案
echo "📋 複製建置檔案..."
cp -r frontend/dist/* build/
cp -r backend/functions/dist build/functions

# 複製配置檔案
cp firebase.json build/

# 生成建置資訊
echo "📄 生成建置資訊..."
cat > build/build-info.json << EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "$(node -p "require('./package.json').version")",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "nodeVersion": "$(node -v)",
  "npmVersion": "$(npm -v)"
}
EOF

# 壓縮建置檔案
echo "🗜️ 壓縮建置檔案..."
cd build
tar -czf ../teacher-question-bank-system-$(date +%Y%m%d-%H%M%S).tar.gz .
cd ..

echo "✅ 建置完成！"
echo "📦 建置檔案位置: build/"
echo "🗜️ 壓縮檔案: teacher-question-bank-system-*.tar.gz"

# 顯示建置摘要
echo ""
echo "📊 建置摘要:"
echo "   版本: $(node -p "require('./package.json').version")"
echo "   建置時間: $(date)"
echo "   檔案大小: $(du -sh build/ | cut -f1)"

echo ""
echo "🚀 下一步: 執行 npm run deploy 進行部署"
