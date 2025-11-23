# -*- coding: utf-8 -*-
"""
自動批改系統教師版 - 考試管理與自動批改系統
整合現有的三代理人批改系統，提供完整的教師管理界面
"""

from flask import Flask, render_template, request, redirect, url_for, jsonify, flash, send_file
from werkzeug.utils import secure_filename
import os, uuid, logging, json, re, time, random, math
from collections import Counter
from datetime import datetime, timezone
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
import zipfile
import io
import pandas as pd

# 導入現有的批改系統
from app import (
    call_gpt_grader, call_claude_grader, call_gemini_arbitration,
    call_gemini_similarity, enhanced_split_by_question, split_by_question,
    read_text, allowed_file, get_latest_prompt, create_or_bump_prompt,
    log_prompt_blackboard, sanitize_html, render_final_table,
    normalize_items, _sort_items_by_id, i, calc_score_gap,
    decorate_comment_by_outcome, build_comment_matrix_for_weakness,
    run_gemini_weakness_review, extract_json_best_effort,
    run_prompt_autotune, PROMPT_AUTOTUNE_MODE
)

# === MongoDB ===
from pymongo import MongoClient, errors as mongo_errors

load_dotenv()

# ----------------------------------------------------------------------
# Flask 應用
# ----------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(24))
app.config["UPLOAD_FOLDER"] = os.path.join(os.getcwd(), "uploads")
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO),
                    format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("teacher_app")

# 初始化Gemini模型
import google.generativeai as genai
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_model = None

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel("gemini-2.5-pro")
        logger.info("✅ Gemini model 初始化")
    except Exception as e:
        logger.error(f"Gemini 初始化失敗: {e}")

# ----------------------------------------------------------------------
# MongoDB 連接
# ----------------------------------------------------------------------
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
MONGODB_DB = os.getenv("MONGODB_DB", "grading_blackboard")
mongo = MongoClient(MONGODB_URI)
db = mongo[MONGODB_DB]

# 集合定義
col_exams = db["exams"]
col_students = db["students"] 
col_submissions = db["submissions"]
col_grading_results = db["grading_results"]
col_classes = db["classes"]

# 建立索引
try:
    col_exams.create_index([("teacher_id", 1), ("created_at", -1)])
    col_students.create_index([("class_id", 1), ("student_id", 1)])
    col_submissions.create_index([("exam_id", 1), ("student_id", 1)])
    col_grading_results.create_index([("exam_id", 1), ("student_id", 1)])
    col_classes.create_index([("teacher_id", 1)])
except Exception as e:
    logger.warning("Mongo 索引建立警告: %s", e)

# ----------------------------------------------------------------------
# 資料模型
# ----------------------------------------------------------------------
class Exam:
    def __init__(self, teacher_id, title, subject, description="", max_score=100):
        self.exam_id = str(uuid.uuid4())
        self.teacher_id = teacher_id
        self.title = title
        self.subject = subject
        self.description = description
        self.max_score = max_score
        self.created_at = datetime.now(timezone.utc)
        self.status = "draft"  # draft, active, completed
        self.question_file = None
        self.total_students = 0
        self.graded_students = 0

class Student:
    def __init__(self, class_id, student_id, name, email=""):
        self.student_id = student_id
        self.class_id = class_id
        self.name = name
        self.email = email
        self.created_at = datetime.now(timezone.utc)

class Submission:
    def __init__(self, exam_id, student_id, answer_file):
        self.submission_id = str(uuid.uuid4())
        self.exam_id = exam_id
        self.student_id = student_id
        self.answer_file = answer_file
        self.submitted_at = datetime.now(timezone.utc)
        self.status = "submitted"  # submitted, grading, completed, failed
        self.grading_result_id = None

class GradingResult:
    def __init__(self, exam_id, student_id, submission_id):
        self.result_id = str(uuid.uuid4())
        self.exam_id = exam_id
        self.student_id = student_id
        self.submission_id = submission_id
        self.task_id = str(uuid.uuid4())  # 用於關聯黑板訊息
        self.graded_at = datetime.now(timezone.utc)
        self.gpt_score = 0
        self.claude_score = 0
        self.final_score = 0
        self.gpt_feedback = ""
        self.claude_feedback = ""
        self.final_feedback = ""
        self.gpt_table = ""
        self.claude_table = ""
        self.final_table = ""
        self.weakness_analysis = None
        self.status = "completed"  # completed, failed

# ----------------------------------------------------------------------
# 工具函數
# ----------------------------------------------------------------------
def get_teacher_id():
    """簡化版：使用固定教師ID，實際應用中應該從session或認證系統獲取"""
    return "teacher_001"

def save_exam(exam):
    """儲存考試到資料庫"""
    exam_dict = {
        "exam_id": exam.exam_id,
        "teacher_id": exam.teacher_id,
        "title": exam.title,
        "subject": exam.subject,
        "description": exam.description,
        "max_score": exam.max_score,
        "created_at": exam.created_at,
        "status": exam.status,
        "question_file": exam.question_file,
        "total_students": exam.total_students,
        "graded_students": exam.graded_students
    }
    col_exams.insert_one(exam_dict)
    return exam_dict

def get_exam(exam_id):
    """獲取考試資料"""
    return col_exams.find_one({"exam_id": exam_id})

def get_exams_by_teacher(teacher_id):
    """獲取教師的所有考試"""
    return list(col_exams.find({"teacher_id": teacher_id}).sort("created_at", -1))

def save_student(student):
    """儲存學生到資料庫"""
    student_dict = {
        "student_id": student.student_id,
        "class_id": student.class_id,
        "name": student.name,
        "email": student.email,
        "created_at": student.created_at
    }
    col_students.insert_one(student_dict)
    return student_dict

def get_students_by_class(class_id):
    """獲取班級的所有學生"""
    return list(col_students.find({"class_id": class_id}))

def save_submission(submission):
    """儲存學生提交"""
    submission_dict = {
        "submission_id": submission.submission_id,
        "exam_id": submission.exam_id,
        "student_id": submission.student_id,
        "answer_file": submission.answer_file,
        "submitted_at": submission.submitted_at,
        "status": submission.status,
        "grading_result_id": submission.grading_result_id
    }
    col_submissions.insert_one(submission_dict)
    return submission_dict

def get_submissions_by_exam(exam_id):
    """獲取考試的所有提交"""
    return list(col_submissions.find({"exam_id": exam_id}))

def save_grading_result(result):
    """儲存批改結果"""
    result_dict = {
        "result_id": result.result_id,
        "exam_id": result.exam_id,
        "student_id": result.student_id,
        "submission_id": result.submission_id,
        "task_id": result.task_id,
        "graded_at": result.graded_at,
        "gpt_score": result.gpt_score,
        "claude_score": result.claude_score,
        "final_score": result.final_score,
        "gpt_feedback": result.gpt_feedback,
        "claude_feedback": result.claude_feedback,
        "final_feedback": result.final_feedback,
        "gpt_table": result.gpt_table,
        "claude_table": result.claude_table,
        "final_table": result.final_table,
        "weakness_analysis": result.weakness_analysis,
        "status": result.status
    }
    col_grading_results.insert_one(result_dict)
    return result_dict

def get_grading_results_by_exam(exam_id):
    """獲取考試的所有批改結果"""
    return list(col_grading_results.find({"exam_id": exam_id}))

def get_grading_result(exam_id, student_id):
    """獲取特定學生的批改結果"""
    return col_grading_results.find_one({"exam_id": exam_id, "student_id": student_id})

def get_blackboard_messages(task_id):
    """獲取黑板訊息"""
    try:
        # 直接連接黑板訊息資料庫
        from pymongo import MongoClient
        mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
        client = MongoClient(mongodb_uri)
        db_blackboard = client["grading_blackboard"]
        col_bbmsgs = db_blackboard["blackboard_messages"]
        
        cur = col_bbmsgs.find({"task_id": task_id}).sort("timestamp", 1)
        messages = []
        for x in cur:
            messages.append({
                "type": x.get("type"),
                "action": x.get("action"),
                "content": x.get("content"),
                "payload": x.get("payload"),
                "timestamp": x.get("timestamp")
            })
        client.close()
        return messages
    except Exception as e:
        logger.warning(f"獲取黑板訊息失敗：{e}")
        return []

def _normalize_practice_suggestions(raw_list):
    """將練習建議標準化為字典列表。
    支援輸入為字串或字典；字串將轉為 {"title": 字串, "description": ""}。
    """
    try:
        if not raw_list:
            return []
        normalized = []
        for item in raw_list:
            if isinstance(item, dict):
                # 確保必備鍵存在
                normalized.append({
                    "title": item.get("title") or item.get("action") or item.get("topic") or "練習建議",
                    "description": item.get("description") or item.get("example_fix") or "",
                    "key_focus": item.get("key_focus"),
                    "examples": item.get("examples"),
                    "pre_submission_check": item.get("pre_submission_check")
                })
            else:
                # 視為簡單字串
                text = str(item)
                normalized.append({
                    "title": text,
                    "description": ""
                })
        return normalized
    except Exception as e:
        logger.warning(f"標準化練習建議失敗：{e}")
        return []

def analyze_class_performance(exam_id):
    """分析全班學習狀況"""
    try:
        grading_results = get_grading_results_by_exam(exam_id)
        if not grading_results:
            return None
        
        # 獲取考試信息
        exam = get_exam(exam_id)
        max_possible_score = exam.get("max_score", 100) if exam else 100
        
        # 基本統計
        scores = [r["final_score"] for r in grading_results]
        total_students = len(scores)
        avg_score = sum(scores) / total_students if total_students > 0 else 0
        max_score = max(scores) if scores else 0
        min_score = min(scores) if scores else 0
        
        # 根據實際滿分（不限 100）動態計算成績分布（以百分比門檻切分）
        score_ranges = {
            "優秀": len([s for s in scores if s >= max_possible_score * 0.9]),
            "良好": len([s for s in scores if max_possible_score * 0.8 <= s < max_possible_score * 0.9]),
            "中等": len([s for s in scores if max_possible_score * 0.7 <= s < max_possible_score * 0.8]),
            "待改進": len([s for s in scores if max_possible_score * 0.6 <= s < max_possible_score * 0.7]),
            "需要加強": len([s for s in scores if s < max_possible_score * 0.6])
        }
        # 及格率基於 60% 的滿分
        pass_rate = len([s for s in scores if s >= max_possible_score * 0.6]) / total_students * 100 if total_students > 0 else 0
        
        # 標準差
        variance = sum((s - avg_score) ** 2 for s in scores) / total_students if total_students > 0 else 0
        std_dev = variance ** 0.5
        
        return {
            "total_students": total_students,
            "avg_score": round(avg_score, 1),
            "max_score": max_score,
            "min_score": min_score,
            "pass_rate": round(pass_rate, 1),
            "std_dev": round(std_dev, 1),
            "score_ranges": score_ranges,
            "scores": scores
        }
    except Exception as e:
        logger.error(f"分析全班表現失敗：{e}")
        return None

def generate_learning_suggestions(exam_id, student_id, result_id=None):
    """使用Gemini生成詳細的個人學習建議"""
    try:
        logger.info(f"generate_learning_suggestions 開始: exam_id={exam_id}, student_id={student_id}, result_id={result_id}")
        
        # 獲取學生結果
        if result_id:
            result = col_grading_results.find_one({"result_id": result_id})
            logger.info(f"使用result_id查詢結果: {result}")
        else:
            result = get_grading_result(exam_id, student_id)
            logger.info(f"使用exam_id和student_id查詢結果: {result}")
        
        if not result:
            return None
        
        # 獲取考試信息
        exam = get_exam(exam_id)
        if not exam:
            return None
        
        # 獲取全班統計
        class_stats = analyze_class_performance(exam_id)
        if not class_stats:
            return None
        
        student_score = result["final_score"]
        max_possible_score = exam.get("max_score", 100)
        avg_score = class_stats["avg_score"]
        std_dev = class_stats["std_dev"]
        
        # 計算分數差異
        score_diff = student_score - avg_score
        
        # 嘗試使用Gemini生成詳細的學習建議
        gemini_suggestions = None
        if gemini_model and result.get("task_id"):
            try:
                # 從黑板訊息中獲取Gemini生成的弱點分析
                blackboard_messages = get_blackboard_messages(result["task_id"])
                for msg in blackboard_messages:
                    if msg.get("prompt_type") == "weakness_review" and msg.get("payload", {}).get("ok") is not False:
                        # 嘗試從payload中獲取詳細數據
                        payload = msg.get("payload", {})
                        if payload.get("topics") or payload.get("risk_score") is not None:
                            # 構建Gemini建議數據
                            gemini_suggestions = {
                                "coach_comment": f"基於AI分析，您的表現需要關注以下重點：{', '.join(payload.get('topics', ['程式碼品質']))}。",
                                "risk_score": payload.get("risk_score", 50),
                                "weakness_clusters": [
                                    {
                                        "topic": topic,
                                        "frequency": 1,
                                        "evidence_qids": ["1"],
                                        "evidence_snippets": [f"在{topic}方面需要加強"]
                                    } for topic in payload.get("topics", ["程式碼品質"])
                                ],
                                "prioritized_actions": [
                                    {
                                        "action": f"加強{topic}的學習",
                                        "example_fix": f"建議多練習{topic}相關的題目"
                                    } for topic in payload.get("topics", ["程式碼品質"])
                                ],
                                "practice_suggestions": [
                                    f"針對{topic}進行專門練習" for topic in payload.get("topics", ["程式碼品質"])
                                ]
                            }
                            logger.info("使用黑板訊息中的Gemini弱點分析數據")
                            break
            except Exception as e:
                logger.warning(f"從黑板訊息獲取弱點分析數據失敗：{e}")
        
        # 如果沒有從黑板訊息獲取到，嘗試使用result中的weakness_analysis
        if not gemini_suggestions and result.get("weakness_analysis"):
            try:
                weakness_data = result["weakness_analysis"]
                if isinstance(weakness_data, dict):
                    gemini_suggestions = weakness_data
                    logger.info("使用result中的weakness_analysis數據")
            except Exception as e:
                logger.warning(f"使用result中的weakness_analysis數據失敗：{e}")
        
        # 如果沒有Gemini生成的建議，使用詳細的簡單建議
        if not gemini_suggestions:
            logger.info("使用詳細的學習建議生成")
            # 計算風險分數 (0-100)
            risk_score = calculate_risk_score(student_score, max_possible_score, avg_score, std_dev)
            
            # 生成教練短評
            coach_comment = generate_coach_comment(student_score, max_possible_score, avg_score, risk_score)
            
            # 分析弱點
            weakness_clusters = analyze_weakness_clusters(result, exam)
            logger.info(f"分析出的弱點聚類: {weakness_clusters}")
            
            # 生成優先修正行動
            prioritized_actions = generate_prioritized_actions(weakness_clusters, exam.get("subject", "C#"))
            logger.info(f"生成的優先修正行動: {prioritized_actions}")
            
            # 生成練習建議
            practice_suggestions = generate_practice_suggestions(weakness_clusters, exam.get("subject", "C#"))
            logger.info(f"生成的練習建議: {practice_suggestions}")
            
            # 如果沒有弱點分析，提供通用的詳細建議
            if not weakness_clusters:
                weakness_clusters = [
                    {
                        "topic": "程式碼品質",
                        "frequency": 1,
                        "evidence_qids": ["1"],
                        "evidence_snippets": ["程式碼結構需要優化"]
                    },
                    {
                        "topic": "邏輯思維",
                        "frequency": 1,
                        "evidence_qids": ["1"],
                        "evidence_snippets": ["邏輯流程需要加強"]
                    }
                ]
                
                prioritized_actions = [
                    {
                        "action": "加強程式碼結構設計",
                        "example_fix": "建議先規劃程式架構，再開始編寫代碼"
                    },
                    {
                        "action": "提升邏輯思維能力",
                        "example_fix": "多練習演算法題目，培養邏輯思維"
                    }
                ]
                
                practice_suggestions = [
                    {
                        "title": "程式碼品質提升",
                        "description": "專注於程式碼的可讀性和結構化",
                        "key_focus": ["變數命名規範", "函數設計原則", "程式碼註解"],
                        "examples": ["練習重構現有程式碼", "學習設計模式"],
                        "pre_submission_check": "檢查程式碼是否清晰易懂"
                    },
                    {
                        "title": "邏輯思維訓練",
                        "description": "加強問題分析和解決能力",
                        "key_focus": ["問題分解", "演算法設計", "邊界條件處理"],
                        "examples": ["練習LeetCode題目", "分析經典演算法"],
                        "pre_submission_check": "確認邏輯流程正確無誤"
                    }
                ]
            
            final_suggestions = {
                "coach_comment": coach_comment,
                "risk_score": risk_score,
                "score_diff": round(score_diff, 1),
                "weakness_clusters": weakness_clusters,
                "prioritized_actions": prioritized_actions,
                "practice_suggestions": practice_suggestions,
                "performance_summary": {
                    "student_score": student_score,
                    "max_score": max_possible_score,
                    "avg_score": avg_score,
                    "rank_percentile": round((len([s for s in class_stats["scores"] if s < student_score]) / class_stats["total_students"]) * 100, 1)
                }
            }
            logger.info(f"最終返回的學習建議: {final_suggestions}")
            return final_suggestions
        else:
            # 使用Gemini生成的詳細建議
            logger.info("使用Gemini生成的詳細學習建議")
            return {
                "coach_comment": gemini_suggestions.get("coach_comment", ""),
                "risk_score": gemini_suggestions.get("risk_score", 0),
                "score_diff": round(score_diff, 1),
                "weakness_clusters": gemini_suggestions.get("weakness_clusters", []),
                "prioritized_actions": gemini_suggestions.get("prioritized_actions", []),
                "practice_suggestions": _normalize_practice_suggestions(gemini_suggestions.get("practice_suggestions", [])),
                "performance_summary": {
                    "student_score": student_score,
                    "max_score": max_possible_score,
                    "avg_score": avg_score,
                    "rank_percentile": round((len([s for s in class_stats["scores"] if s < student_score]) / class_stats["total_students"]) * 100, 1)
                }
            }
    except Exception as e:
        logger.error(f"生成學習建議失敗：{e}")
        return None

def calculate_risk_score(student_score, max_score, avg_score, std_dev):
    """計算學習風險分數 (0-100)"""
    try:
        # 基於分數百分比的風險
        score_percentage = (student_score / max_score) * 100
        if score_percentage >= 90:
            base_risk = 10
        elif score_percentage >= 80:
            base_risk = 25
        elif score_percentage >= 70:
            base_risk = 40
        elif score_percentage >= 60:
            base_risk = 60
        else:
            base_risk = 80
        
        # 基於與平均分差距的調整
        if max_score > 0:
            score_diff_percentage = ((student_score - avg_score) / max_score) * 100
            if score_diff_percentage < -20:
                base_risk += 15
            elif score_diff_percentage < -10:
                base_risk += 10
            elif score_diff_percentage > 20:
                base_risk -= 10
        
        return max(0, min(100, base_risk))
    except:
        return 50

def generate_coach_comment(student_score, max_score, avg_score, risk_score):
    """生成教練短評"""
    try:
        score_percentage = (student_score / max_score) * 100 if max_score > 0 else 0
        
        if score_percentage >= 90:
            return f"表現優秀！您已掌握核心概念，建議挑戰更進階的內容，或協助其他同學學習。"
        elif score_percentage >= 80:
            return f"表現良好！基礎扎實，建議加強細節處理和程式碼品質，向更高水準邁進。"
        elif score_percentage >= 70:
            return f"表現中等，有進步空間。建議重點加強薄弱環節，多做練習提升熟練度。"
        elif score_percentage >= 60:
            return f"需要加強學習。建議重新檢視基礎概念，制定詳細的學習計劃，尋求額外輔導。"
        else:
            return f"需要緊急加強！建議立即尋求老師指導，重新檢視學習方法，制定密集的補救計劃。"
    except:
        return "請繼續努力學習，相信您一定能取得進步！"

def analyze_weakness_clusters(result, exam):
    """分析弱點聚類 - 根據學生實際表現生成個性化分析"""
    try:
        weakness_clusters = []
        
        # 獲取學生分數和滿分
        student_score = result.get("final_score", 0)
        max_score = exam.get("max_score", 100)
        score_percentage = (student_score / max_score) * 100 if max_score > 0 else 0
        
        # 從批改結果中提取弱點信息
        gpt_feedback = result.get("gpt_feedback", "")
        claude_feedback = result.get("claude_feedback", "")
        final_feedback = result.get("final_feedback", "")
        
        # 分析常見的程式設計弱點
        all_feedback = f"{gpt_feedback} {claude_feedback} {final_feedback}".lower()
        
        # 根據分數決定分析策略
        if score_percentage >= 90:
            # 高分學生：專注於進階改進
            weakness_clusters.append({
                "topic": "進階程式設計技巧",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["程式碼優化", "演算法效率提升", "設計模式應用"],
                "why_it_matters": "進階技巧能讓您成為更優秀的程式設計師"
            })
            weakness_clusters.append({
                "topic": "程式碼架構設計",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["模組化設計", "可擴展性考量", "維護性提升"],
                "why_it_matters": "良好的架構設計是大型專案的基礎"
            })
        elif score_percentage >= 80:
            # 良好學生：專注於細節改進
            weakness_clusters.append({
                "topic": "程式碼品質優化",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["變數命名規範", "程式碼註解", "錯誤處理完善"],
                "why_it_matters": "細節決定成敗，高品質的程式碼更容易維護"
            })
        elif score_percentage >= 70:
            # 中等學生：專注於基礎鞏固
            if any(keyword in all_feedback for keyword in ["exception", "try-catch", "null", "錯誤", "例外"]):
                weakness_clusters.append({
                    "topic": "例外處理與程式穩定性",
                    "frequency": 1,
                    "evidence_qids": ["1"],
                    "evidence_snippets": ["缺少例外處理", "未使用try-catch結構", "可能出現NullReferenceException"],
                    "why_it_matters": "例外處理是程式穩定性的關鍵，能防止程式崩潰"
                })
            
            if any(keyword in all_feedback for keyword in ["邏輯", "迴圈", "條件", "邊界", "loop", "condition"]):
                weakness_clusters.append({
                    "topic": "邏輯準確性與核心語法理解",
                    "frequency": 1,
                    "evidence_qids": ["1"],
                    "evidence_snippets": ["迴圈條件錯誤", "邊界條件處理不當", "邏輯判斷有誤"],
                    "why_it_matters": "正確的邏輯是程式功能實現的基礎"
                })
            
            if not weakness_clusters:
                weakness_clusters.append({
                    "topic": "基礎概念鞏固",
                    "frequency": 1,
                    "evidence_qids": ["1"],
                    "evidence_snippets": ["語法熟練度", "邏輯思維", "問題分析"],
                    "why_it_matters": "扎實的基礎是進階學習的關鍵"
                })
        elif score_percentage >= 60:
            # 需要加強的學生：專注於基礎學習
            weakness_clusters.append({
                "topic": "基礎語法掌握",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["語法錯誤", "變數宣告", "基本操作"],
                "why_it_matters": "基礎語法是程式設計的根本"
            })
            weakness_clusters.append({
                "topic": "邏輯思維訓練",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["問題分解", "步驟規劃", "邏輯推理"],
                "why_it_matters": "邏輯思維是解決問題的核心能力"
            })
        else:
            # 需要緊急加強的學生：專注於基本概念
            weakness_clusters.append({
                "topic": "基本概念理解",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["程式設計概念", "基本語法", "簡單邏輯"],
                "why_it_matters": "基本概念是學習程式設計的第一步"
            })
            weakness_clusters.append({
                "topic": "學習方法改進",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["學習計劃", "練習方法", "尋求幫助"],
                "why_it_matters": "正確的學習方法能事半功倍"
            })
        
        return weakness_clusters
    except Exception as e:
        logger.error(f"分析弱點聚類失敗：{e}")
        return [
            {
                "topic": "程式碼品質與結構",
                "frequency": 1,
                "evidence_qids": ["1"],
                "evidence_snippets": ["程式碼結構需要優化", "變數命名可以更清晰"],
                "why_it_matters": "良好的程式碼品質是專業開發的基礎"
            }
        ]

def generate_prioritized_actions(weakness_clusters, subject):
    """生成優先修正行動 - 根據弱點分析生成個性化建議"""
    try:
        actions = []
        
        for cluster in weakness_clusters:
            topic = cluster["topic"]
            
            if "進階程式設計技巧" in topic:
                actions.append({
                    "action": "學習進階演算法：掌握排序、搜尋等經典演算法",
                    "mapping_topics": ["演算法", "進階技巧"],
                    "example_fix": "練習實作快速排序、二分搜尋等演算法，提升程式效率"
                })
                actions.append({
                    "action": "應用設計模式：學習並應用常見的設計模式",
                    "mapping_topics": ["設計模式", "架構設計"],
                    "example_fix": "學習單例模式、工廠模式等，提升程式碼的可維護性"
                })
            
            elif "程式碼架構設計" in topic:
                actions.append({
                    "action": "模組化設計：將程式分解為獨立的功能模組",
                    "mapping_topics": ["模組化", "架構設計"],
                    "example_fix": "將不同功能分離到不同的類別和方法中，提高程式碼的組織性"
                })
            
            elif "程式碼品質優化" in topic:
                actions.append({
                    "action": "完善錯誤處理：為所有可能出錯的操作添加適當的例外處理",
                    "mapping_topics": ["錯誤處理", "程式碼品質"],
                    "example_fix": "使用try-catch包圍檔案操作、網路請求等可能失敗的操作"
                })
                actions.append({
                    "action": "改善程式碼註解：為複雜邏輯添加清晰的註解",
                    "mapping_topics": ["程式碼品質", "可讀性"],
                    "example_fix": "為每個方法添加功能說明，為複雜邏輯添加行內註解"
                })
            
            elif "例外處理" in topic:
                actions.append({
                    "action": "空值檢查：在存取可能為null的物件成員前，總是加上if檢查",
                    "mapping_topics": ["例外處理", "空值檢查"],
                    "example_fix": "if (nameListBox.SelectedItem != null) { string selected = nameListBox.SelectedItem.ToString(); }"
                })
                actions.append({
                    "action": "使用try-catch：包圍可能出錯的程式碼區塊",
                    "mapping_topics": ["例外處理", "錯誤處理"],
                    "example_fix": "try { // 可能出錯的程式碼 } catch (Exception ex) { // 錯誤處理 }"
                })
            
            elif "邏輯準確性" in topic:
                actions.append({
                    "action": "迴圈邊界條件：仔細檢查for迴圈的起始值和結束條件",
                    "mapping_topics": ["邏輯準確性", "邊界條件"],
                    "example_fix": "for (int count = 0; count < 50; count++) 或 for (int count = 1; count <= 50; count++)"
                })
                actions.append({
                    "action": "條件判斷邏輯：確保if-else條件涵蓋所有可能情況",
                    "mapping_topics": ["邏輯準確性", "條件判斷"],
                    "example_fix": "使用if-else if-else結構，確保所有情況都被處理"
                })
            
            elif "基礎語法掌握" in topic:
                actions.append({
                    "action": "語法練習：多練習基本的語法結構",
                    "mapping_topics": ["基礎語法", "練習"],
                    "example_fix": "練習變數宣告、迴圈、條件判斷等基本語法"
                })
                actions.append({
                    "action": "程式碼除錯：學會使用除錯工具找出語法錯誤",
                    "mapping_topics": ["除錯", "語法錯誤"],
                    "example_fix": "使用IDE的除錯功能，逐步執行程式碼找出問題"
                })
            
            elif "邏輯思維訓練" in topic:
                actions.append({
                    "action": "問題分解：將複雜問題分解為簡單步驟",
                    "mapping_topics": ["邏輯思維", "問題分解"],
                    "example_fix": "用紙筆寫下解決問題的步驟，再轉換為程式碼"
                })
                actions.append({
                    "action": "演算法思維：學習基本的演算法概念",
                    "mapping_topics": ["邏輯思維", "演算法"],
                    "example_fix": "練習簡單的排序、搜尋演算法，理解其邏輯"
                })
            
            elif "基本概念理解" in topic:
                actions.append({
                    "action": "重新學習基礎：從最基本的程式設計概念開始",
                    "mapping_topics": ["基本概念", "重新學習"],
                    "example_fix": "重新閱讀教材，理解變數、函數、類別等基本概念"
                })
                actions.append({
                    "action": "尋求幫助：主動向老師或同學請教",
                    "mapping_topics": ["學習方法", "尋求幫助"],
                    "example_fix": "遇到不懂的概念時，及時向老師或同學請教"
                })
            
            elif "學習方法改進" in topic:
                actions.append({
                    "action": "制定學習計劃：為自己制定詳細的學習計劃",
                    "mapping_topics": ["學習方法", "計劃制定"],
                    "example_fix": "每天安排固定時間學習程式設計，循序漸進"
                })
                actions.append({
                    "action": "多練習：通過大量練習來鞏固所學知識",
                    "mapping_topics": ["學習方法", "練習"],
                    "example_fix": "每天至少完成一個簡單的程式設計練習"
                })
        
        # 如果沒有生成特定行動，提供通用的建議
        if not actions:
            actions = [
                {
                    "action": "加強程式碼結構設計",
                    "mapping_topics": ["程式碼品質", "結構設計"],
                    "example_fix": "建議先規劃程式架構，再開始編寫代碼。使用清晰的變數命名和適當的函數分割。"
                }
            ]
        
        return actions
    except Exception as e:
        logger.error(f"生成優先修正行動失敗：{e}")
        return [
            {
                "action": "加強程式碼結構設計",
                "mapping_topics": ["程式碼品質", "結構設計"],
                "example_fix": "建議先規劃程式架構，再開始編寫代碼。"
            }
        ]

def generate_practice_suggestions(weakness_clusters, subject):
    """生成練習建議 - 根據弱點分析生成個性化練習"""
    try:
        suggestions = []
        
        for cluster in weakness_clusters:
            topic = cluster["topic"]
            
            if "進階程式設計技巧" in topic:
                suggestions.append({
                    "title": "進階演算法練習",
                    "description": "挑戰更複雜的演算法問題，提升程式設計技巧",
                    "key_focus": [
                        "演算法效率：學習時間複雜度和空間複雜度分析",
                        "資料結構應用：熟練使用陣列、串列、樹等資料結構",
                        "動態規劃：學習動態規劃的基本概念和應用"
                    ],
                    "examples": [
                        "實作快速排序、合併排序等排序演算法",
                        "解決LeetCode中等難度題目",
                        "學習圖論演算法（BFS、DFS）"
                    ],
                    "pre_submission_check": "分析演算法複雜度，確保程式碼效率"
                })
                suggestions.append({
                    "title": "設計模式實作",
                    "description": "學習並實作常見的設計模式",
                    "key_focus": [
                        "單例模式：確保類別只有一個實例",
                        "工廠模式：創建物件的統一介面",
                        "觀察者模式：實現物件間的鬆耦合"
                    ],
                    "examples": [
                        "實作資料庫連接的單例模式",
                        "創建不同類型檔案的工廠類別",
                        "實現事件驅動的觀察者模式"
                    ],
                    "pre_submission_check": "確保設計模式的正確實作和應用場景"
                })
            
            elif "程式碼架構設計" in topic:
                suggestions.append({
                    "title": "模組化程式設計",
                    "description": "學習如何設計良好的程式架構",
                    "key_focus": [
                        "模組分離：將不同功能分離到不同模組",
                        "介面設計：定義清晰的類別和方法介面",
                        "依賴管理：管理模組間的依賴關係"
                    ],
                    "examples": [
                        "重構現有程式碼，分離業務邏輯和資料存取",
                        "設計一個簡單的圖書館管理系統",
                        "實作MVC架構的簡單應用"
                    ],
                    "pre_submission_check": "檢查模組間的耦合度，確保架構清晰"
                })
            
            elif "程式碼品質優化" in topic:
                suggestions.append({
                    "title": "程式碼品質提升",
                    "description": "專注於提升程式碼的品質和可維護性",
                    "key_focus": [
                        "錯誤處理：完善所有可能的錯誤情況處理",
                        "程式碼註解：為複雜邏輯添加清晰的註解",
                        "程式碼重構：改善現有程式碼的結構"
                    ],
                    "examples": [
                        "為現有程式碼添加完整的例外處理",
                        "重構長方法，分解為多個小方法",
                        "改善變數命名和程式碼格式"
                    ],
                    "pre_submission_check": "檢查程式碼的可讀性和維護性"
                })
            
            elif "例外處理" in topic:
                suggestions.append({
                    "title": "例外處理練習",
                    "description": "學習如何正確處理程式中的例外情況",
                    "key_focus": [
                        "try-catch使用：正確使用例外處理語法",
                        "空值檢查：避免NullReferenceException",
                        "資源管理：使用using語句管理資源"
                    ],
                    "examples": [
                        "實作檔案讀寫的例外處理",
                        "處理使用者輸入的驗證和例外",
                        "管理資料庫連接的例外處理"
                    ],
                    "pre_submission_check": "測試各種例外情況，確保程式不會崩潰"
                })
            
            elif "邏輯準確性" in topic:
                suggestions.append({
                    "title": "邏輯思維訓練",
                    "description": "加強邏輯思維和問題解決能力",
                    "key_focus": [
                        "迴圈邏輯：正確設計迴圈的起始和結束條件",
                        "條件判斷：確保所有情況都被正確處理",
                        "邊界條件：注意特殊情況和邊界值"
                    ],
                    "examples": [
                        "實作陣列排序演算法",
                        "解決數學計算問題",
                        "處理字串操作和搜尋"
                    ],
                    "pre_submission_check": "手動追蹤程式執行流程，檢查邏輯正確性"
                })
            
            elif "基礎語法掌握" in topic:
                suggestions.append({
                    "title": "基礎語法練習",
                    "description": "鞏固程式設計的基本語法知識",
                    "key_focus": [
                        "變數宣告：正確宣告和使用變數",
                        "基本語法：掌握if、for、while等基本語法",
                        "方法定義：學會定義和調用方法"
                    ],
                    "examples": [
                        "實作簡單的計算器程式",
                        "練習陣列的基本操作",
                        "實作簡單的迴圈和條件判斷"
                    ],
                    "pre_submission_check": "檢查語法錯誤，確保程式能正常編譯"
                })
            
            elif "邏輯思維訓練" in topic:
                suggestions.append({
                    "title": "問題解決思維",
                    "description": "培養分析和解決問題的能力",
                    "key_focus": [
                        "問題分解：將複雜問題分解為簡單步驟",
                        "演算法思維：學習基本的演算法概念",
                        "程式設計思維：將解決方案轉換為程式碼"
                    ],
                    "examples": [
                        "解決簡單的數學問題",
                        "實作基本的搜尋和排序",
                        "處理簡單的資料結構操作"
                    ],
                    "pre_submission_check": "確保解決方案邏輯清晰，步驟完整"
                })
            
            elif "基本概念理解" in topic:
                suggestions.append({
                    "title": "基礎概念學習",
                    "description": "重新學習程式設計的基本概念",
                    "key_focus": [
                        "程式設計概念：理解變數、函數、類別等基本概念",
                        "語法基礎：掌握基本的語法規則",
                        "簡單邏輯：理解基本的程式執行流程"
                    ],
                    "examples": [
                        "實作Hello World程式",
                        "練習變數的宣告和使用",
                        "實作簡單的輸入輸出操作"
                    ],
                    "pre_submission_check": "確保理解每個概念的基本含義"
                })
            
            elif "學習方法改進" in topic:
                suggestions.append({
                    "title": "學習方法優化",
                    "description": "改善學習方法和學習效率",
                    "key_focus": [
                        "學習計劃：制定合理的學習計劃",
                        "練習方法：找到適合自己的練習方式",
                        "尋求幫助：學會主動尋求幫助和指導"
                    ],
                    "examples": [
                        "每天完成一個簡單的程式設計練習",
                        "與同學討論程式設計問題",
                        "向老師請教不懂的概念"
                    ],
                    "pre_submission_check": "確保學習計劃的可行性和有效性"
                })
        
        # 如果沒有生成特定建議，提供通用的練習建議
        if not suggestions:
            suggestions = [
                {
                    "title": "程式碼品質提升練習",
                    "description": "專注於程式碼的可讀性和結構化",
                    "key_focus": ["變數命名規範", "函數設計原則", "程式碼註解"],
                    "examples": ["練習重構現有程式碼", "學習設計模式"],
                    "pre_submission_check": "檢查程式碼是否清晰易懂"
                }
            ]
        
        return suggestions
    except Exception as e:
        logger.error(f"生成練習建議失敗：{e}")
        return [
            {
                "title": "程式碼品質提升練習",
                "description": "專注於程式碼的可讀性和結構化",
                "key_focus": ["變數命名規範", "函數設計原則", "程式碼註解"],
                "examples": ["練習重構現有程式碼", "學習設計模式"],
                "pre_submission_check": "檢查程式碼是否清晰易懂"
            }
        ]

# ----------------------------------------------------------------------
# 路由
# ----------------------------------------------------------------------
@app.route("/teacher")
@app.route("/teacher/")
def dashboard():
    """教師儀表板"""
    teacher_id = get_teacher_id()
    exams = get_exams_by_teacher(teacher_id)
    
    # 統計資料
    total_exams = len(exams)
    active_exams = len([e for e in exams if e["status"] == "active"])
    completed_exams = len([e for e in exams if e["status"] == "completed"])
    
    return render_template("teacher/dashboard.html", 
                         exams=exams,
                         total_exams=total_exams,
                         active_exams=active_exams,
                         completed_exams=completed_exams)

@app.route("/teacher/exams")
def exams_list():
    """考試列表"""
    teacher_id = get_teacher_id()
    exams = get_exams_by_teacher(teacher_id)
    return render_template("teacher/exams_list.html", exams=exams)

@app.route("/teacher/exams/new", methods=["GET", "POST"])
def create_exam():
    """創建新考試"""
    if request.method == "POST":
        teacher_id = get_teacher_id()
        title = request.form.get("title", "").strip()
        subject = request.form.get("subject", "").strip()
        description = request.form.get("description", "").strip()
        max_score = int(request.form.get("max_score", 100))
        
        if not title or not subject:
            flash("請填寫考試標題和科目", "error")
            return redirect(url_for("create_exam"))
        
        # 處理題目檔案上傳
        question_file = request.files.get("question_file")
        question_filename = None
        
        if question_file and question_file.filename:
            if allowed_file(question_file.filename):
                original_filename = secure_filename(question_file.filename)
                question_filename = f"{uuid.uuid4()}_{original_filename}"
                question_path = os.path.join(app.config["UPLOAD_FOLDER"], question_filename)
                question_file.save(question_path)
            else:
                flash("不支援的檔案格式", "error")
                return redirect(url_for("create_exam"))
        
        # 創建考試
        exam = Exam(teacher_id, title, subject, description, max_score)
        exam.question_file = question_filename
        
        save_exam(exam)
        flash(f"考試「{title}」創建成功", "success")
        return redirect(url_for("exam_detail", exam_id=exam.exam_id))
    
    return render_template("teacher/create_exam.html")

@app.route("/teacher/exams/<exam_id>")
def exam_detail(exam_id):
    """考試詳情"""
    exam = get_exam(exam_id)
    if not exam:
        flash("考試不存在", "error")
        return redirect(url_for("exams_list"))
    
    submissions = get_submissions_by_exam(exam_id)
    grading_results = get_grading_results_by_exam(exam_id)
    
    # 統計資料
    total_submissions = len(submissions)
    completed_gradings = len([r for r in grading_results if r["status"] == "completed"])
    
    return render_template("teacher/exam_detail.html",
                         exam=exam,
                         submissions=submissions,
                         grading_results=grading_results,
                         total_submissions=total_submissions,
                         completed_gradings=completed_gradings)

@app.route("/teacher/exams/<exam_id>/upload", methods=["GET", "POST"])
def upload_answers(exam_id):
    """上傳學生答案"""
    exam = get_exam(exam_id)
    if not exam:
        flash("考試不存在", "error")
        return redirect(url_for("exams_list"))
    
    if request.method == "POST":
        # 處理多檔案上傳
        files = request.files.getlist("answer_files")
        uploaded_count = 0
        
        for file in files:
            if file and file.filename and allowed_file(file.filename):
                # 從檔名提取學生ID（假設格式為：學生ID_姓名.副檔名）
                filename = secure_filename(file.filename)
                student_id = filename.split('_')[0] if '_' in filename else filename.split('.')[0]
                
                # 儲存檔案
                file_path = os.path.join(app.config["UPLOAD_FOLDER"], 
                                       f"{uuid.uuid4()}_{filename}")
                file.save(file_path)
                
                # 創建提交記錄
                submission = Submission(exam_id, student_id, filename)
                save_submission(submission)
                uploaded_count += 1
        
        if uploaded_count > 0:
            flash(f"成功上傳 {uploaded_count} 個答案檔案", "success")
            # 如果有上傳檔案，將考試狀態改為active
            col_exams.update_one(
                {"exam_id": exam_id},
                {"$set": {"status": "active", "total_students": uploaded_count}}
            )
        else:
            flash("沒有成功上傳任何檔案", "error")
        
        return redirect(url_for("exam_detail", exam_id=exam_id))
    
    return render_template("teacher/upload_answers.html", exam=exam)

@app.route("/teacher/exams/<exam_id>/grade", methods=["POST"])
def start_grading(exam_id):
    """開始批改"""
    exam = get_exam(exam_id)
    if not exam:
        return jsonify({"success": False, "message": "考試不存在"})
    
    if not exam["question_file"]:
        return jsonify({"success": False, "message": "請先上傳題目檔案"})
    
    # 獲取所有提交
    submissions = get_submissions_by_exam(exam_id)
    if not submissions:
        return jsonify({"success": False, "message": "沒有找到學生答案"})
    
    # 獲取評分提詞
    prompt_doc = get_latest_prompt(exam["subject"])
    if not prompt_doc:
        return jsonify({"success": False, "message": f"請先為科目「{exam['subject']}」設定評分提詞"})
    
    # 讀取題目檔案
    question_filename = exam["question_file"]
    if not question_filename:
        return jsonify({"success": False, "message": "考試沒有題目檔案"})
    
    # 嘗試直接路徑
    question_path = os.path.join(app.config["UPLOAD_FOLDER"], question_filename)
    
    # 如果檔案不存在，嘗試尋找匹配的檔案
    if not os.path.exists(question_path):
        import glob
        # 尋找包含該檔案名的檔案
        pattern = os.path.join(app.config["UPLOAD_FOLDER"], f"*{question_filename}")
        matching_files = glob.glob(pattern)
        
        if matching_files:
            # 使用找到的第一個匹配檔案
            question_path = matching_files[0]
            logger.info(f"找到匹配的題目檔案: {question_path}")
        else:
            return jsonify({"success": False, "message": f"找不到題目檔案：{question_filename}"})
    
    try:
        exam_content = read_text(question_path)
    except Exception as e:
        return jsonify({"success": False, "message": f"讀取題目檔案失敗：{e}"})
    
    # 開始批改每個提交
    grading_tasks = []
    for submission in submissions:
        task = {
            "submission_id": submission["submission_id"],
            "student_id": submission["student_id"],
            "answer_file": submission["answer_file"]
        }
        grading_tasks.append(task)
    
    # 更新考試狀態
    col_exams.update_one(
        {"exam_id": exam_id},
        {"$set": {"status": "grading", "total_students": len(submissions)}}
    )
    
    # 啟動批改任務（異步處理）
    try:
        # 使用線程池異步執行批改任務
        from concurrent.futures import ThreadPoolExecutor
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(process_grading_tasks, exam_id, exam_content, prompt_doc, grading_tasks)
        
        # 立即返回成功響應，不等待批改完成
        return jsonify({"success": True, "message": f"已開始批改 {len(submissions)} 份答案，請稍後查看結果"})
    except Exception as e:
        logger.error(f"啟動批改任務失敗：{e}")
        return jsonify({"success": False, "message": f"啟動批改任務失敗：{e}"})

def process_grading_tasks(exam_id, exam_content, prompt_doc, grading_tasks):
    """處理批改任務"""
    logger.info(f"開始處理 {len(grading_tasks)} 個批改任務")
    
    completed_count = 0
    failed_count = 0
    
    for i, task in enumerate(grading_tasks):
        try:
            logger.info(f"處理任務 {i+1}/{len(grading_tasks)}: 學生 {task['student_id']}")
            
            # 讀取學生答案
            answer_filename = task["answer_file"]
            answer_path = os.path.join(app.config["UPLOAD_FOLDER"], answer_filename)
            
            # 如果檔案不存在，嘗試尋找匹配的檔案
            if not os.path.exists(answer_path):
                import glob
                # 尋找包含該檔案名的檔案
                pattern = os.path.join(app.config["UPLOAD_FOLDER"], f"*{answer_filename}")
                matching_files = glob.glob(pattern)
                
                if matching_files:
                    # 使用找到的第一個匹配檔案
                    answer_path = matching_files[0]
                    logger.info(f"找到匹配的答案檔案: {answer_path}")
                else:
                    logger.error(f"找不到答案檔案：{answer_filename}")
                    failed_count += 1
                    continue
            
            answer_content = read_text(answer_path)
            logger.info(f"成功讀取答案檔案，內容長度: {len(answer_content)}")
            
            # 安全檢查
            try:
                from 安全檢查代理人 import get_checker
                if get_checker is not None:
                    checker = get_checker()
                    security_result = checker.check(exam_content, answer_content)
                    logger.info(f"安全檢查結果：{'攻擊行為' if security_result.get('is_attack') else '沒有攻擊行為'}")
                    logger.info(f"安全檢查原因：{security_result.get('reason', '')}")
                    
                    # 如果檢測到攻擊行為，跳過批改
                    if security_result.get('is_attack'):
                        logger.warning(f"學生 {task['student_id']} 的答案被判定為攻擊行為，跳過批改")
                        failed_count += 1
                        continue
            except Exception as e:
                logger.warning(f"安全檢查失敗（將繼續批改）：{e}")
            
            # 執行批改（使用現有的批改系統）
            logger.info(f"開始批改學生 {task['student_id']} 的答案")
            result = grade_single_submission(exam_id, task["student_id"], 
                                           task["submission_id"], exam_content, 
                                           answer_content, prompt_doc)
            
            # 儲存結果
            save_grading_result(result)
            logger.info(f"批改完成，最終分數: {result.final_score}")
            
            # 更新提交狀態
            col_submissions.update_one(
                {"submission_id": task["submission_id"]},
                {"$set": {"status": "completed", "grading_result_id": result.result_id}}
            )
            
            completed_count += 1
            
        except Exception as e:
            logger.error(f"批改學生 {task['student_id']} 的答案時發生錯誤：{e}", exc_info=True)
            # 更新提交狀態為失敗
            col_submissions.update_one(
                {"submission_id": task["submission_id"]},
                {"$set": {"status": "failed"}}
            )
            failed_count += 1
    
    # 更新考試狀態
    if completed_count > 0:
        col_exams.update_one(
            {"exam_id": exam_id},
            {"$set": {"status": "completed", "graded_students": completed_count}}
        )
        logger.info(f"批改任務完成：成功 {completed_count} 個，失敗 {failed_count} 個")
    else:
        col_exams.update_one(
            {"exam_id": exam_id},
            {"$set": {"status": "failed"}}
        )
        logger.error(f"所有批改任務都失敗了")

def grade_single_submission(exam_id, student_id, submission_id, exam_content, answer_content, prompt_doc):
    """批改單一提交（完整版，整合自動更新題詞功能）"""
    # 生成 task_id
    task_id = str(uuid.uuid4())
    
    # 記錄批改開始
    log_prompt_blackboard(
        task_id, prompt_doc["subject"], "grading_start",
        f"開始批改學生 {student_id} 的答案",
        payload={"student_id": student_id, "exam_id": exam_id}
    )
    
    # 記錄使用的題詞
    log_prompt_blackboard(
        task_id, prompt_doc["subject"], "prompt_used",
        f"使用題詞版本 v{prompt_doc['version']}",
        payload={"version": prompt_doc["version"], "subject": prompt_doc["subject"]}
    )
    
    # 拆分題目和答案
    exam_q_enhanced = enhanced_split_by_question(exam_content)
    ans_q = split_by_question(answer_content)
    
    # 獲取題號交集
    qids = sorted(
        set(exam_q_enhanced.keys()) & set(ans_q.keys()),
        key=lambda x: int(re.findall(r"\d+", x)[0]) if re.findall(r"\d+", x) else 9999
    )
    
    if not qids:
        qids = ["1"]
        exam_q_enhanced = {"1": {"content": exam_content, "max_score": 10.0}}
        ans_q = {"1": answer_content}
    
    # 執行完整批改流程
    gpt_total = claude_total = final_total = 0
    gpt_items = []
    claude_items = []
    final_items = []
    
    # 用於自動更新題詞的追蹤變數
    consensus_round_qids = set()
    arbitration_qids = set()
    direct_consensus_qids = set()
    expected_scores = {}
    
    for qid in qids:
        q_exam = exam_q_enhanced[qid]["content"]
        q_ans = ans_q[qid]
        expected_max_score = int(exam_q_enhanced[qid]["max_score"])
        expected_scores[qid] = expected_max_score
        
        # 調用GPT和Claude批改
        per_q_prompt = (
            prompt_doc["prompt_content"] +
            f"\n\n【僅批改此題】請只針對『題目 {qid}』與其對應的學生答案評分，" +
            "不得參考其他題。rubric.items 僅需輸出此題一筆，item_id 請用題號。\n" +
            f"【重要】此題配分為 {expected_max_score} 分，請確保 max_score 設為 {expected_max_score}。"
        )
        
        try:
            logger.info(f"調用 GPT 批改題目 {qid}")
            gpt_res = call_gpt_grader(q_exam, q_ans, per_q_prompt)
            logger.info(f"GPT 批改完成，結果: {gpt_res}")
            
            # 記錄 GPT 批改到黑板
            log_prompt_blackboard(
                task_id, prompt_doc["subject"], "gpt_grade",
                f"GPT 批改題目 {qid}，得分：{gpt_res.get('score', 0)}",
                payload={"qid": qid, "score": gpt_res.get('score', 0), "feedback": gpt_res.get('feedback', '')}
            )
            
            # 檢查 GPT 結果格式
            if not isinstance(gpt_res, dict):
                logger.error(f"GPT 返回結果格式錯誤: {type(gpt_res)}")
                gpt_res = {"score": 0, "feedback": "GPT 批改失敗", "rubric": {"items": [], "total_score": 0}}
            
            logger.info(f"調用 Claude 批改題目 {qid}")
            claude_res = call_claude_grader(q_exam, q_ans, per_q_prompt, expected_item_ids=[qid])
            logger.info(f"Claude 批改完成，結果: {claude_res}")
            
            # 記錄 Claude 批改到黑板
            log_prompt_blackboard(
                task_id, prompt_doc["subject"], "claude_grade",
                f"Claude 批改題目 {qid}，得分：{claude_res.get('score', 0)}",
                payload={"qid": qid, "score": claude_res.get('score', 0), "feedback": claude_res.get('feedback', '')}
            )
            
            # 檢查 Claude 結果格式
            if not isinstance(claude_res, dict):
                logger.error(f"Claude 返回結果格式錯誤: {type(claude_res)}")
                claude_res = {"score": 0, "feedback": "Claude 批改失敗", "rubric": {"items": [], "total_score": 0}}
            
            # 處理結果 - 使用與舊頁面完全一致的邏輯
            gpt_score = int(gpt_res.get("score", 0))
            claude_score = int(claude_res.get("score", 0))
            
            # 語意相似度檢查
            sim = call_gemini_similarity(gpt_res, claude_res, threshold=0.90)
            
            # 分數差距計算
            gap_abs = abs(gpt_score - claude_score)
            gap_ratio = gap_abs / expected_max_score if expected_max_score > 0 else 0
            SCORE_GAP_RATIO = 0.30  # 30% 門檻
            
            # 記錄相似度檢查
            log_prompt_blackboard(
                task_id, prompt_doc["subject"], "similarity_check",
                f"[題目 {qid}] 語意相似度：{sim.get('score'):.2f} ｜ 分數差：{gap_abs} / {expected_max_score}（{gap_ratio:.2%}） ｜ 門檻：相似度≥0.90 且 差距<30%",
                payload={"qid": qid, **sim, "gap_abs": gap_abs, "gap_ratio": gap_ratio, "gap_ratio_threshold": SCORE_GAP_RATIO}
            )
            
            # 共識判斷：語意相似度 >= 90% 且分數差距 < 30%
            if sim.get("similar") and (gap_ratio < SCORE_GAP_RATIO):
                # 直接共識
                final_score = int((gpt_score + claude_score) / 2)
                direct_consensus_qids.add(qid)
                
                log_prompt_blackboard(
                    task_id, prompt_doc["subject"], "consensus",
                    f"[題目 {qid}] Gate 通過 → 直接共識（平均 {final_score}；g={gpt_score}, c={claude_score}）",
                    payload={"qid": qid, "avg_score": final_score, "g": gpt_score, "c": claude_score}
                )
            else:
                # 進入共識回合
                reason_enter = "語意差異" if not sim.get("similar") else f"分數差距 {gap_ratio:.2%} ≥ 30%"
                consensus_round_qids.add(qid)
                
                log_prompt_blackboard(
                    task_id, prompt_doc["subject"], "consensus_round_enter",
                    f"[題目 {qid}] 進入共識回合，原因：{reason_enter}",
                    payload={"qid": qid, "reason": reason_enter, "sim": sim, "gap_ratio": gap_ratio}
                )
                
                # 共識回合邏輯（最多2輪）
                agreed = False
                for round_idx in range(2):
                    # 生成同儕提示
                    g_cmt = gpt_res.get("feedback", "")
                    c_cmt = claude_res.get("feedback", "")
                    peer_notes = (
                        "你與同儕對此題評論差異如下，請盡量對齊語意（可換句話說，但應傳達同樣重點）；"
                        "若仍不同，請在 comment 清楚說明依據與你堅持的理由。\n"
                        f"- GPT：{g_cmt}\n"
                        f"- Claude：{c_cmt}\n"
                    )
                    
                    # 重新批改
                    try:
                        gpt_res_round = call_gpt_grader(q_exam, q_ans, per_q_prompt, peer_notes)
                        claude_res_round = call_claude_grader(q_exam, q_ans, per_q_prompt, expected_item_ids=[qid], peer_notes=peer_notes)
                        
                        # 重新計算分數和相似度
                        g_score_round = int(gpt_res_round.get("score", 0))
                        c_score_round = int(claude_res_round.get("score", 0))
                        sim_after = call_gemini_similarity(gpt_res_round, claude_res_round, threshold=0.90)
                        gap_abs_round = abs(g_score_round - c_score_round)
                        gap_ratio_round = gap_abs_round / expected_max_score if expected_max_score > 0 else 0
                        
                        if sim_after.get("similar") and (gap_ratio_round < SCORE_GAP_RATIO):
                            # 共識回合達成
                            final_score = int((g_score_round + c_score_round) / 2)
                            agreed = True
                            
                            log_prompt_blackboard(
                                task_id, prompt_doc["subject"], "consensus",
                                f"[題目 {qid}] 共識回合 {round_idx+1}：語意一致且分數差低於門檻 → 平均 {final_score}（g={g_score_round}, c={c_score_round}）",
                                payload={"qid": qid, **sim_after, "gap_abs": gap_abs_round, "gap_ratio": gap_ratio_round, "avg_score": final_score}
                            )
                            break
                        else:
                            log_prompt_blackboard(
                                task_id, prompt_doc["subject"], "disagreement",
                                f"[題目 {qid}] 共識回合 {round_idx+1}：尚未同時滿足語意一致與分數差門檻（相似度 {sim_after.get('score'):.2f}；差距 {gap_ratio_round:.2%}）",
                                payload={"qid": qid, **sim_after, "gap_abs": gap_abs_round, "gap_ratio": gap_ratio_round}
                            )
                    except Exception as e:
                        logger.warning(f"共識回合 {round_idx+1} 失敗：{e}")
                        continue
                
                if not agreed:
                    # 共識回合後仍不一致 → 仲裁
                    try:
                        arbitration_res = call_gemini_arbitration(q_exam, q_ans, per_q_prompt, gpt_res, claude_res)
                        final_score = int(arbitration_res.get("final_score", (gpt_score + claude_score) / 2))
                        arbitration_qids.add(qid)
                        
                        log_prompt_blackboard(
                            task_id, prompt_doc["subject"], "arbitration_summary",
                            f"[題目 {qid}] 交由仲裁，最終得分：{final_score}",
                            payload={"qid": qid, "decision": arbitration_res.get("decision"), "reason": arbitration_res.get("reason"), "final_score": final_score}
                        )
                    except Exception as e:
                        logger.warning(f"仲裁失敗，使用平均分：{e}")
                        final_score = int((gpt_score + claude_score) / 2)
                        
                        log_prompt_blackboard(
                            task_id, prompt_doc["subject"], "arbitration_failed",
                            f"[題目 {qid}] 仲裁失敗，使用平均分：{final_score}",
                            payload={"qid": qid, "final_score": final_score, "error": str(e)}
                        )
            
            gpt_total += gpt_score
            claude_total += claude_score
            final_total += final_score
            
            # 儲存逐題結果
            gpt_items.append({
                "item_id": qid,
                "max_score": expected_max_score,
                "final_score": gpt_score,
                "comment": gpt_res.get("feedback", "")
            })
            
            claude_items.append({
                "item_id": qid,
                "max_score": expected_max_score,
                "final_score": claude_score,
                "comment": claude_res.get("feedback", "")
            })
            
            final_items.append({
                "item_id": qid,
                "max_score": expected_max_score,
                "final_score": final_score,
                "comment": f"GPT: {gpt_score}, Claude: {claude_score}, 平均: {final_score}"
            })
            
        except Exception as e:
            logger.error(f"批改題目 {qid} 時發生錯誤：{e}", exc_info=True)
            # 給預設分數
            gpt_total += 0
            claude_total += 0
            final_total += 0
            
            # 儲存錯誤結果
            gpt_items.append({
                "item_id": qid,
                "max_score": expected_max_score,
                "final_score": 0,
                "comment": f"批改錯誤：{str(e)}"
            })
            
            claude_items.append({
                "item_id": qid,
                "max_score": expected_max_score,
                "final_score": 0,
                "comment": f"批改錯誤：{str(e)}"
            })
            
            final_items.append({
                "item_id": qid,
                "max_score": expected_max_score,
                "final_score": 0,
                "comment": f"批改錯誤：{str(e)}"
            })
    
    # 構建完整的批改結果
    gpt_res = {
        "score": gpt_total,
        "items": gpt_items,
        "feedback": f"GPT批改總分：{gpt_total}"
    }
    
    claude_res = {
        "score": claude_total,
        "items": claude_items,
        "feedback": f"Claude批改總分：{claude_total}"
    }
    
    arbitration = {
        "final_score": final_total,
        "reason": f"最終總分：{final_total}",
        "items": final_items
    }
    
    # === 自動更新題詞功能 ===
    try:
        entered_consensus_rounds = len(consensus_round_qids) > 0
        entered_arbitration = len(arbitration_qids) > 0
        
        if PROMPT_AUTOTUNE_MODE in ("suggest", "apply"):
            if not (entered_consensus_rounds or entered_arbitration):
                # 完全沒有分歧（沒有進入共識回合，也沒有仲裁）→ 跳過題詞修改
                log_prompt_blackboard(
                    task_id, prompt_doc["subject"], "quality_gate",
                    "本次所有題目皆未進入『共識回合』或『仲裁』 → 跳過題詞自動優化。",
                    payload={
                        "mode": PROMPT_AUTOTUNE_MODE,
                        "consensus_round_qids": [],
                        "arbitration_qids": [],
                        "direct_consensus_qids": sorted(list(direct_consensus_qids)),
                    }
                )
            else:
                ctx = {
                    "gpt": gpt_res,
                    "claude": claude_res,
                    "arbitration": arbitration,
                    "expected_scores": expected_scores,
                    # 聚焦題目清單
                    "consensus_round_qids": sorted(list(consensus_round_qids)),
                    "arbitration_qids": sorted(list(arbitration_qids)),
                    "direct_consensus_qids": sorted(list(direct_consensus_qids)),
                }
                auto = run_prompt_autotune(prompt_doc["subject"], prompt_doc["prompt_content"], ctx)
                if auto is not None:
                    proposed = (auto.get("updated_prompt") or "").strip()
                    reason = (auto.get("reason") or "").strip()
                    diff_summary = (auto.get("diff_summary") or "").strip()
                    
                    # 黑板：一定記錄一次建議（即使 proposed 為空，方便追蹤）
                    log_prompt_blackboard(
                        task_id, prompt_doc["subject"], "suggestion",
                        content=f"Gemini 題詞建議：{diff_summary or '（無摘要）'}",
                        payload={
                            "proposed": proposed,
                            "reason": reason,
                            "mode": PROMPT_AUTOTUNE_MODE,
                            "consensus_round_qids": sorted(list(consensus_round_qids)),
                            "arbitration_qids": sorted(list(arbitration_qids)),
                        }
                    )
                    
                    # 若是自動套用模式且有新題詞，直接升版
                    if PROMPT_AUTOTUNE_MODE == "apply" and proposed:
                        pr2 = create_or_bump_prompt(prompt_doc["subject"], proposed, updated_by="gemini_autotune")
                        log_prompt_blackboard(
                            task_id, prompt_doc["subject"], "updated",
                            content=f"Gemini 已自動套用題詞，版本升至 v{pr2['version']}",
                            payload={"source": "autotune_apply", "diff_summary": diff_summary}
                        )
                        # 讓後續儲存/頁面顯示用到最新版
                        prompt_doc["version"] = pr2["version"]
    except Exception as e:
        logger.warning(f"題詞自動優化流程失敗：{e}")
    
    # === 弱點分析 ===
    weakness_analysis = None
    try:
        matrix = build_comment_matrix_for_weakness(gpt_res, claude_res, arbitration)
        weakness_analysis = run_gemini_weakness_review(
            subject=prompt_doc["subject"],
            matrix=matrix,
            exam_text=exam_content,
            student_text=answer_content
        )
        
        if weakness_analysis:
            log_prompt_blackboard(
                task_id, prompt_doc["subject"], "weakness_analysis",
                content="弱點分析完成",
                payload=weakness_analysis
            )
    except Exception as e:
        logger.warning(f"弱點分析失敗：{e}")
    
    # 生成表格
    gpt_table = render_final_table(gpt_items, gpt_total)
    claude_table = render_final_table(claude_items, claude_total)
    final_table = render_final_table(final_items, final_total)
    
    # 創建批改結果
    result = GradingResult(exam_id, student_id, submission_id)
    
    # 設置 task_id
    result.task_id = task_id
    
    # 設置分數和反饋
    result.gpt_score = gpt_total
    result.claude_score = claude_total
    result.final_score = final_total
    result.gpt_feedback = gpt_res["feedback"]
    result.claude_feedback = claude_res["feedback"]
    result.final_feedback = arbitration["reason"]
    
    # 設置表格
    result.gpt_table = gpt_table
    result.claude_table = claude_table
    result.final_table = final_table
    
    # 設置弱點分析
    result.weakness_analysis = weakness_analysis
    
    # 記錄批改完成
    log_prompt_blackboard(
        task_id, prompt_doc["subject"], "grading_complete",
        f"批改完成 - GPT: {gpt_total}, Claude: {claude_total}, 最終: {final_total}",
        payload={
            "gpt_total": gpt_total,
            "claude_total": claude_total,
            "final_total": final_total,
            "arbitration_count": len(arbitration_qids),
            "consensus_count": len(direct_consensus_qids)
        }
    )
    
    return result

@app.route("/teacher/exams/<exam_id>/results")
def exam_results(exam_id):
    """考試結果"""
    exam = get_exam(exam_id)
    if not exam:
        flash("考試不存在", "error")
        return redirect(url_for("exams_list"))
    
    grading_results = get_grading_results_by_exam(exam_id)
    
    # 統計資料
    if grading_results:
        scores = [r["final_score"] for r in grading_results if r["status"] == "completed"]
        avg_score = sum(scores) / len(scores) if scores else 0
        max_score = max(scores) if scores else 0
        min_score = min(scores) if scores else 0
    else:
        avg_score = max_score = min_score = 0
    
    return render_template("teacher/exam_results.html",
                         exam=exam,
                         grading_results=grading_results,
                         avg_score=avg_score,
                         max_score=max_score,
                         min_score=min_score)

@app.route("/teacher/exams/<exam_id>/analysis")
def class_analysis(exam_id):
    """全班學習狀況分析"""
    exam = get_exam(exam_id)
    if not exam:
        flash("考試不存在", "error")
        return redirect(url_for("exams_list"))
    
    # 獲取分析數據
    class_stats = analyze_class_performance(exam_id)
    grading_results = get_grading_results_by_exam(exam_id)
    
    return render_template("teacher/class_analysis.html",
                         exam=exam,
                         class_stats=class_stats,
                         grading_results=grading_results)

@app.route("/teacher/exams/<exam_id>/results/<student_id>/<result_id>")
@app.route("/teacher/exams/<exam_id>/results/<student_id>")
def student_detail(exam_id, student_id, result_id=None):
    """學生詳細批改結果"""
    exam = get_exam(exam_id)
    if not exam:
        flash("考試不存在", "error")
        return redirect(url_for("exams_list"))
    
    # 獲取該學生的批改結果
    if result_id:
        # 如果有result_id，直接根據result_id查詢
        result = col_grading_results.find_one({"result_id": result_id})
    else:
        # 否則使用原來的查詢方式
        result = get_grading_result(exam_id, student_id)
    
    # 調試：直接查詢資料庫
    logger.info(f"直接查詢資料庫: exam_id={exam_id}, student_id={student_id}")
    direct_result = col_grading_results.find_one({"exam_id": exam_id, "student_id": student_id})
    logger.info(f"直接查詢結果: {direct_result}")
    
    if not result:
        flash("找不到該學生的批改結果", "error")
        return redirect(url_for("exam_results", exam_id=exam_id))
    
    # 獲取黑板訊息
    blackboard_messages = []
    logger.info(f"批改結果: {result}")
    logger.info(f"result.get('task_id'): {result.get('task_id')}")
    logger.info(f"result.get('task_id') 的類型: {type(result.get('task_id'))}")
    
    if result.get("task_id"):
        task_id = result["task_id"]
        logger.info(f"開始獲取黑板訊息，task_id: {task_id}")
        logger.info(f"task_id 類型: {type(task_id)}")
        
        # 直接測試資料庫查詢
        from pymongo import MongoClient
        mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
        client = MongoClient(mongodb_uri)
        db_blackboard = client["grading_blackboard"]
        col_bbmsgs = db_blackboard["blackboard_messages"]
        
        # 直接查詢
        direct_messages = list(col_bbmsgs.find({"task_id": task_id}))
        logger.info(f"直接查詢找到 {len(direct_messages)} 條訊息")
        
        # 直接構建訊息列表
        blackboard_messages = []
        for x in direct_messages:
            blackboard_messages.append({
                "type": x.get("type"),
                "action": x.get("action"),
                "content": x.get("content"),
                "payload": x.get("payload"),
                "timestamp": x.get("timestamp")
            })
        
        logger.info(f"構建的黑板訊息: {blackboard_messages}")
        
        client.close()
    else:
        logger.warning(f"批改結果沒有 task_id: {result}")
    
    logger.info(f"傳遞給模板的 blackboard_messages: {blackboard_messages}")
    logger.info(f"blackboard_messages 是否為空: {not blackboard_messages}")
    
    # 如果沒有找到黑板訊息，記錄警告
    if not blackboard_messages:
        logger.warning("沒有找到黑板訊息")
    
    # 生成個人學習建議
    logger.info(f"開始生成學習建議: exam_id={exam_id}, student_id={student_id}, result_id={result_id}")
    learning_suggestions = generate_learning_suggestions(exam_id, student_id, result_id)
    logger.info(f"生成的學習建議: {learning_suggestions}")
    
    return render_template("teacher/student_detail.html",
                         exam=exam,
                         result=result,
                         blackboard_messages=blackboard_messages,
                         learning_suggestions=learning_suggestions)

@app.route("/test_blackboard")
def test_blackboard():
    """測試黑板訊息功能"""
    try:
        # 直接測試 get_blackboard_messages 函數
        task_id = "fd732abc-e348-4eb5-8748-6086064a6a29"
        messages = get_blackboard_messages(task_id)
        
        return jsonify({
            "success": True,
            "task_id": task_id,
            "message_count": len(messages),
            "messages": messages
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"錯誤: {str(e)}"})

@app.route("/api/prompt/apply", methods=["POST"])
def api_prompt_apply():
    """套用建議的題詞"""
    try:
        data = request.get_json(silent=True) or {}
        subject = data.get("subject") or request.form.get("subject")
        content = data.get("prompt_content") or request.form.get("prompt_content")
        task_id = data.get("task_id") or request.form.get("task_id")

        if not subject or not content:
            return jsonify({"ok": False, "error": "subject 或 prompt_content 不可為空"}), 400

        pr = create_or_bump_prompt(subject, content, updated_by="user_apply_button")
        log_prompt_blackboard(
            task_id, subject, "updated",
            content=f"使用者套用題詞，版本升至 v{pr['version']}",
            payload={"source": "button_apply"}
        )
        return jsonify({"ok": True, "version": pr["version"]})
    except Exception as e:
        logger.error(f"套用題詞失敗：{e}")
        return jsonify({"ok": False, "error": str(e)}), 500

# === 舊批改頁面的所有API端點 ===

@app.get("/api/prompt/<subject>")
def api_prompt(subject):
    """獲取指定科目的最新題詞"""
    pr = get_latest_prompt(subject)
    if not pr: 
        return jsonify({"exists": False})
    return jsonify({
        "exists": True, 
        "subject": pr["subject"], 
        "version": pr["version"], 
        "prompt_content": pr["prompt_content"]
    })

@app.get("/api/blackboard/<task_id>")
def api_blackboard(task_id):
    """獲取指定任務的黑板訊息"""
    try:
        # 連接到黑板資料庫
        client = MongoClient(os.getenv("MONGODB_URI"))
        db = client["grading_blackboard"]
        col_bbmsgs = db["blackboard_messages"]
        
        cur = col_bbmsgs.find({"task_id": task_id}).sort("timestamp", 1)
        out = []
        for x in cur:
            out.append({
                "type": x.get("type"),
                "action": x.get("action"),
                "content": x.get("content"),
                "payload": x.get("payload"),
                "timestamp": x.get("timestamp").isoformat() if x.get("timestamp") else None
            })
        return jsonify(out)
    except Exception as e:
        logger.error(f"獲取黑板訊息失敗: {e}")
        return jsonify([])

@app.post("/api/security-check")
def api_security_check():
    """安全檢查 API - 檢查學生作答是否包含惡意提示詞注入"""
    try:
        data = request.get_json()
        question = data.get("question", "")
        answer = data.get("answer", "")
        
        if not answer:
            return jsonify({
                "success": True,
                "is_attack": False,
                "reason": "答案為空，跳過安全檢查",
                "check_time": datetime.now().isoformat()
            })
        
        # 導入安全檢查代理人
        try:
            from 安全檢查代理人 import get_checker
            checker = get_checker()
            
            if checker is None:
                logger.warning("安全檢查代理人未初始化，跳過檢查")
                return jsonify({
                    "success": True,
                    "is_attack": False,
                    "reason": "安全檢查代理人未啟用",
                    "check_time": datetime.now().isoformat()
                })
            
            # 執行安全檢查
            logger.info(f"開始安全檢查，答案長度: {len(answer)}")
            security_result = checker.check(question, answer)
            
            is_attack = security_result.get('is_attack', False)
            reason = security_result.get('reason', '未知')
            raw_reply = security_result.get('raw_reply', '')
            
            logger.info(f"安全檢查完成: {'攻擊行為' if is_attack else '安全'} - {reason}")
            
            return jsonify({
                "success": True,
                "is_attack": is_attack,
                "reason": reason,
                "raw_reply": raw_reply,
                "check_time": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"安全檢查執行失敗: {e}")
            # 安全檢查失敗時，允許繼續批改（不阻斷流程）
            return jsonify({
                "success": True,
                "is_attack": False,
                "reason": f"安全檢查執行失敗: {str(e)}",
                "error": str(e),
                "check_time": datetime.now().isoformat()
            })
            
    except Exception as e:
        logger.error(f"API 安全檢查失敗: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.get("/api/system-status")
def api_system_status():
    """獲取系統狀態"""
    try:
        # 檢查安全檢查代理
        agent_ok = False
        agent_msg = ""
        try:
            from 安全檢查代理人 import get_checker
            if get_checker is not None:
                c = get_checker()
                agent_ok = True if c is not None else False
        except Exception as e:
            agent_msg = f"{e}"
        
        return jsonify({
            "openai_api": bool(os.getenv("OPENAI_API_KEY")),
            "anthropic_api": bool(os.getenv("ANTHROPIC_API_KEY")),
            "gemini_api": bool(os.getenv("GEMINI_API_KEY")),
            "resolved_models": {
                "openai": "gpt-4o",  # 簡化版本
                "claude": "claude-3-5-sonnet-20241022",
                "gemini": "gemini-2.5-pro"
            },
            "security_agent": {
                "enabled": True,
                "loaded": agent_ok,
                "note": agent_msg
            },
            "ui": {"unify_table_style": True}
        })
    except Exception as e:
        logger.error(f"獲取系統狀態失敗: {e}")
        return jsonify({"error": str(e)}), 500

# === 舊批改頁面的主要路由 ===

@app.route("/")
def index():
    """重定向到教師版儀表板"""
    return redirect(url_for("dashboard"))

@app.route("/old")
def old_index():
    """舊批改頁面的首頁"""
    subject = request.args.get("subject", "C#")
    current = get_latest_prompt(subject)
    return render_template("index.html", subject=subject, current_prompt=current)

@app.post("/old/prompt/save")
def old_prompt_save():
    """保存題詞"""
    subject = request.form.get("subject", "C#")
    content = request.form.get("prompt_content", "").strip()
    if not content:
        flash("請輸入提詞內容", "error")
        return redirect(url_for("old_index", subject=subject))
    pr = create_or_bump_prompt(subject, content, updated_by="user")
    log_prompt_blackboard(task_id=None, subject=subject, action="initial_set", content=content)
    flash(f"已儲存 {subject} 提詞 v{pr['version']}", "ok")
    return redirect(url_for("old_index", subject=subject))

@app.post("/old/grade")
def old_grade():
    """舊批改頁面的批改功能"""
    subject = request.form.get("subject", "C#")
    exam_file = request.files.get("exam_file")
    ans_file = request.files.get("student_file")

    if not exam_file or not ans_file:
        flash("請同時上傳考題與學生答案", "error")
        return redirect(url_for("old_index", subject=subject))
    
    # 檢查檔案格式
    ALLOWED_EXT = {".txt", ".pdf", ".docx"}
    def allowed_file(filename):
        return "." in filename and filename.rsplit(".", 1)[1].lower() in {"txt", "pdf", "docx"}
    
    if not (allowed_file(exam_file.filename) and allowed_file(ans_file.filename)):
        exts = ", ".join(sorted(ALLOWED_EXT))
        flash(f"檔案格式僅支援 {exts}", "error")
        return redirect(url_for("old_index", subject=subject))

    prompt_doc = get_latest_prompt(subject)
    if not prompt_doc:
        flash("第一次使用請先設定評分提詞", "error")
        return redirect(url_for("old_index", subject=subject))

    task_id = str(uuid.uuid4())
    ex_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{task_id}_exam_{secure_filename(exam_file.filename)}")
    st_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{task_id}_student_{secure_filename(ans_file.filename)}")
    exam_file.save(ex_path)
    ans_file.save(st_path)

    try:
        exam_raw = read_text(ex_path)
        answer_raw = read_text(st_path)
    except Exception as e:
        flash(f"讀檔失敗：{e}", "error")
        return redirect(url_for("old_index", subject=subject))

    # 執行批改邏輯（簡化版本）
    try:
        # 這裡可以調用現有的批改邏輯
        # 為了簡化，我們直接重定向到任務詳情頁面
        return redirect(url_for("old_task_detail", task_id=task_id))
    except Exception as e:
        flash(f"批改失敗：{e}", "error")
        return redirect(url_for("old_index", subject=subject))

@app.get("/task/<task_id>")
def old_task_detail(task_id):
    """舊批改頁面的任務詳情"""
    # 這裡需要實現任務詳情邏輯
    # 為了簡化，我們返回一個基本的任務對象
    task = {
        "task_id": task_id,
        "subject": "C#",
        "final_score": 0,
        "gpt": {"score": 0, "feedback": "", "part4_table": ""},
        "claude": {"score": 0, "feedback": "", "part4_table": ""},
        "arbitration": {"final_score": 0, "reason": "", "final_table_html": ""},
        "weakness_review": None
    }
    return render_template("task.html", task=task)

@app.route("/teacher/exams/<exam_id>/export")
def export_results(exam_id):
    """匯出考試結果"""
    exam = get_exam(exam_id)
    if not exam:
        flash("考試不存在", "error")
        return redirect(url_for("exams_list"))
    
    grading_results = get_grading_results_by_exam(exam_id)
    
    # 創建Excel檔案
    data = []
    for result in grading_results:
        data.append({
            "學生ID": result["student_id"],
            "GPT分數": result["gpt_score"],
            "Claude分數": result["claude_score"],
            "最終分數": result["final_score"],
            "批改時間": result["graded_at"].strftime("%Y-%m-%d %H:%M:%S")
        })
    
    df = pd.DataFrame(data)
    
    # 創建Excel檔案在記憶體中
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='考試結果', index=False)
    
    output.seek(0)
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=f"{exam['title']}_結果.xlsx"
    )

# ----------------------------------------------------------------------
# API 端點已存在，無需重複定義
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# API 端點 - 用於外部系統整合
# ----------------------------------------------------------------------
@app.route("/api/grade_single", methods=["POST"])
def api_grade_single():
    """
    單個答案批改 API
    用於從 grading.html 等外部系統調用
    """
    try:
        data = request.get_json()
        
        # 驗證必要欄位
        required_fields = ["question", "answer", "subject", "max_score"]
        for field in required_fields:
            if field not in data:
                return jsonify({
                    "success": False,
                    "message": f"缺少必要欄位：{field}"
                }), 400
        
        question_text = data["question"]
        answer_text = data["answer"]
        subject = data["subject"]
        max_score = data.get("max_score", 100)
        student_name = data.get("student_name", "學生")
        
        # 獲取評分提詞
        prompt_doc = get_latest_prompt(subject)
        if not prompt_doc:
            return jsonify({
                "success": False,
                "message": f"科目「{subject}」沒有設定評分提詞"
            }), 400
        
        # 拆分題目
        try:
            questions_list = enhanced_split_by_question(question_text)
            if not questions_list:
                questions_list = split_by_question(question_text)
        except:
            questions_list = split_by_question(question_text)
        
        # 拆分答案
        try:
            answers_list = enhanced_split_by_question(answer_text)
            if not answers_list:
                answers_list = split_by_question(answer_text)
        except:
            answers_list = split_by_question(answer_text)
        
        # 執行批改
        gpt_results = []
        claude_results = []
        
        for q_item in questions_list:
            q_id = q_item["id"]
            q_text = q_item["text"]
            q_score = q_item.get("score", max_score // len(questions_list))
            
            # 找到對應的答案
            answer_item = next((a for a in answers_list if a["id"] == q_id), None)
            answer = answer_item["text"] if answer_item else ""
            
            # 調用 GPT 批改
            gpt_result = call_gpt_grader(
                question=q_text,
                answer=answer,
                max_score=q_score,
                prompt_text=prompt_doc["prompt"]
            )
            gpt_results.append({"id": q_id, **gpt_result})
            
            # 調用 Claude 批改
            claude_result = call_claude_grader(
                question=q_text,
                answer=answer,
                max_score=q_score,
                prompt_text=prompt_doc["prompt"]
            )
            claude_results.append({"id": q_id, **claude_result})
        
        # 計算總分
        gpt_total = sum(r.get("score", 0) for r in gpt_results)
        claude_total = sum(r.get("score", 0) for r in claude_results)
        
        # 簡單平均作為最終分數
        final_score = round((gpt_total + claude_total) / 2)
        
        # 生成回饋
        feedback_parts = []
        for i, q_item in enumerate(questions_list):
            q_id = q_item["id"]
            gpt_r = next((r for r in gpt_results if r["id"] == q_id), {})
            claude_r = next((r for r in claude_results if r["id"] == q_id), {})
            
            avg_score = round((gpt_r.get("score", 0) + claude_r.get("score", 0)) / 2)
            feedback_parts.append(f"Q{q_id}: {avg_score}/{q_item.get('score', 0)}分")
            
            if gpt_r.get("comment"):
                feedback_parts.append(f"  評語：{gpt_r['comment'][:100]}")
        
        feedback = "\n".join(feedback_parts)
        
        return jsonify({
            "success": True,
            "score": final_score,
            "max_score": max_score,
            "percentage": round((final_score / max_score) * 100, 2),
            "feedback": feedback,
            "details": {
                "gpt_score": gpt_total,
                "claude_score": claude_total,
                "questions_count": len(questions_list)
            }
        })
        
    except Exception as e:
        logger.error(f"API 批改失敗：{e}", exc_info=True)
        return jsonify({
            "success": False,
            "message": f"批改失敗：{str(e)}"
        }), 500

# ----------------------------------------------------------------------
# 入口
# ----------------------------------------------------------------------
if __name__ == "__main__":
    print("="*60)
    print("自動批改系統教師版 - 考試管理與自動批改系統")
    print("="*60)
    app.run(host=os.getenv("FLASK_HOST","0.0.0.0"),
            port=int(os.getenv("TEACHER_PORT","5001")),
            debug=os.getenv("FLASK_DEBUG","True").lower() == "true")
