#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自動批改系統教師版啟動腳本
整合原有的批改系統和新的教師管理界面
"""

import os
import sys
import subprocess
import threading
import time
import webbrowser
from pathlib import Path

def check_requirements():
    """檢查必要的套件和環境"""
    # 套件名稱對應表：pip名稱 -> import名稱
    required_packages = {
        'flask': 'flask',
        'pymongo': 'pymongo', 
        'pandas': 'pandas',
        'openpyxl': 'openpyxl',
        'anthropic': 'anthropic',
        'google-generativeai': 'google.generativeai',
        'openai': 'openai',
        'python-dotenv': 'dotenv',
        'werkzeug': 'werkzeug'
    }
    
    missing_packages = []
    for pip_name, import_name in required_packages.items():
        try:
            __import__(import_name)
        except ImportError:
            missing_packages.append(pip_name)
    
    if missing_packages:
        print("❌ 缺少必要的套件:")
        for package in missing_packages:
            print(f"   - {package}")
        print("\n請執行以下命令安裝:")
        print(f"pip install {' '.join(missing_packages)}")
        return False
    
    return True

def check_env_file():
    """檢查環境變數檔案"""
    env_files = ['.env', 'key.env']
    found_env = False
    
    for env_file in env_files:
        if os.path.exists(env_file):
            found_env = True
            print(f"✅ 找到環境變數檔案: {env_file}")
            break
    
    if not found_env:
        print("⚠️  未找到環境變數檔案 (.env 或 key.env)")
        print("請確保已設定以下環境變數:")
        print("   - OPENAI_API_KEY")
        print("   - ANTHROPIC_API_KEY") 
        print("   - GEMINI_API_KEY")
        print("   - MONGODB_URI (可選，預設: mongodb://localhost:27017/)")
    
    return found_env

def get_python_command():
    """獲取Python命令"""
    # 在Windows上優先使用py命令
    if os.name == 'nt':
        try:
            subprocess.run(['py', '--version'], check=True, capture_output=True)
            return 'py'
        except:
            pass
    
    # 嘗試python命令
    try:
        subprocess.run(['python', '--version'], check=True, capture_output=True)
        return 'python'
    except:
        pass
    
    # 最後嘗試python3
    try:
        subprocess.run(['python3', '--version'], check=True, capture_output=True)
        return 'python3'
    except:
        pass
    
    return 'python'  # 預設值

def start_original_app():
    """啟動原有的批改系統"""
    print("🚀 啟動原有批改系統 (端口 5000)...")
    python_cmd = get_python_command()
    try:
        subprocess.run([python_cmd, "app.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ 原有批改系統啟動失敗: {e}")
    except KeyboardInterrupt:
        print("⏹️  原有批改系統已停止")

def start_teacher_app():
    """啟動教師版應用"""
    print("🎓 啟動教師版應用 (端口 5001)...")
    python_cmd = get_python_command()
    try:
        subprocess.run([python_cmd, "teacher_app.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ 教師版應用啟動失敗: {e}")
    except KeyboardInterrupt:
        print("⏹️  教師版應用已停止")

def open_browser():
    """自動開啟瀏覽器到教師版系統"""
    print("🌐 等待應用程式完全啟動...")
    time.sleep(15)  # 等待應用程式完全啟動
    
    # 檢查端口是否真的在監聽
    import socket
    max_retries = 10
    for i in range(max_retries):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', 5001))
            sock.close()
            if result == 0:
                print("✅ 應用程式已完全啟動，正在開啟瀏覽器...")
                break
        except:
            pass
        time.sleep(2)
        print(f"⏳ 等待應用程式啟動... ({i+1}/{max_retries})")
    
    try:
        # 使用 open_new_tab 確保開啟新分頁
        webbrowser.open_new_tab("http://localhost:5001/teacher")
        print("✅ 已開啟教師版系統網頁: http://localhost:5001/teacher")
    except Exception as e:
        print(f"⚠️  無法自動開啟瀏覽器: {e}")
        print("請手動開啟瀏覽器並訪問: http://localhost:5001/teacher")

def main():
    """主函數"""
    print("="*60)
    print("🎓 自動批改系統教師版 - 考試管理與自動批改系統")
    print("="*60)
    
    # 檢查環境
    if not check_requirements():
        sys.exit(1)
    
    check_env_file()
    
    print("\n📋 系統說明:")
    print("   - 原有批改系統: http://localhost:5000")
    print("   - 教師版管理界面: http://localhost:5001")
    print("   - 按 Ctrl+C 停止所有服務")
    print("\n" + "="*60)
    
    # 創建必要的目錄
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("templates/teacher", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    
    try:
        # 啟動兩個應用
        original_thread = threading.Thread(target=start_original_app, daemon=True)
        teacher_thread = threading.Thread(target=start_teacher_app, daemon=True)
        browser_thread = threading.Thread(target=open_browser, daemon=True)
        
        original_thread.start()
        time.sleep(2)  # 等待原有系統啟動
        teacher_thread.start()
        browser_thread.start()  # 啟動瀏覽器開啟線程
        
        # 等待用戶中斷
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n⏹️  正在停止所有服務...")
        print("✅ 所有服務已停止")

if __name__ == "__main__":
    main()
