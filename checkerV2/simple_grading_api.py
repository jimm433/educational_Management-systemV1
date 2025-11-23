# -*- coding: utf-8 -*-
"""
簡化版 AI 批改 API
不需要 MongoDB，直接使用內存臨時儲存
專門為 grading.html 提供批改服務
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
from dotenv import load_dotenv

# 導入現有的批改系統函數
try:
    from app import (
        call_gpt_grader, call_claude_grader,
        enhanced_split_by_question, split_by_question
    )
    HAS_APP = True
except ImportError as e:
    print(f"⚠️ 無法導入 app.py: {e}")
    print("將使用內建的批改函數")
    HAS_APP = False

load_dotenv()

# ----------------------------------------------------------------------
# Flask 應用
# ----------------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # 允許跨域請求
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(24))

# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("simple_grading_api")

# ----------------------------------------------------------------------
# API 端點 - 單個答案批改
# ----------------------------------------------------------------------
@app.route("/api/grade_single", methods=["POST", "OPTIONS"])
def api_grade_single():
    """
    單個答案批改 API
    用於從 grading.html 調用
    支援直接傳入評分提詞，無需依賴 Port 5000
    """
    # 處理 OPTIONS 請求（CORS 預檢）
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    
    try:
        data = request.get_json()
        
        # 驗證必要欄位
        required_fields = ["question", "answer", "max_score"]
        for field in required_fields:
            if field not in data:
                return jsonify({
                    "success": False,
                    "message": f"缺少必要欄位：{field}"
                }), 400
        
        question_text = data["question"]
        answer_text = data["answer"]
        subject = data.get("subject", "通識")
        max_score = data.get("max_score", 100)
        student_name = data.get("student_name", "學生")
        custom_prompt = data.get("prompt", None)  # 允許自訂評分提詞
        
        logger.info(f"收到批改請求 - 學生：{student_name}, 科目：{subject}, 滿分：{max_score}")
        
        # 優先使用自訂提詞，否則使用預設提詞
        if custom_prompt:
            prompt_text = custom_prompt
            logger.info("使用自訂評分提詞")
        else:
            # 使用預設評分提詞
            prompt_text = f"""請作為專業的{subject}教師進行評分。

評分標準：
1. 正確性（40%）：答案是否正確完整
2. 邏輯性（30%）：思路是否清晰合理
3. 完整性（20%）：是否涵蓋所有要點
4. 表達（10%）：語言是否流暢清楚

請給出具體分數和改進建議。"""
            logger.info(f"使用預設評分提詞（科目：{subject}）")
        
        # 拆分題目
        try:
            questions_list = enhanced_split_by_question(question_text)
            if not questions_list:
                questions_list = split_by_question(question_text)
        except:
            questions_list = split_by_question(question_text)
        
        logger.info(f"拆分出 {len(questions_list)} 個題目")
        
        # 拆分答案
        try:
            answers_list = enhanced_split_by_question(answer_text)
            if not answers_list:
                answers_list = split_by_question(answer_text)
        except:
            answers_list = split_by_question(answer_text)
        
        logger.info(f"拆分出 {len(answers_list)} 個答案")
        
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
            
            logger.info(f"批改題目 {q_id}，配分：{q_score}")
            
            # 調用 GPT 批改
            try:
                gpt_result = call_gpt_grader(
                    question=q_text,
                    answer=answer,
                    max_score=q_score,
                    prompt_text=prompt_text
                )
                gpt_results.append({"id": q_id, **gpt_result})
                logger.info(f"GPT 批改完成 Q{q_id}: {gpt_result.get('score', 0)}/{q_score}")
            except Exception as e:
                logger.error(f"GPT 批改失敗 Q{q_id}: {e}")
                gpt_results.append({"id": q_id, "score": 0, "comment": f"批改失敗：{e}"})
            
            # 調用 Claude 批改
            try:
                claude_result = call_claude_grader(
                    question=q_text,
                    answer=answer,
                    max_score=q_score,
                    prompt_text=prompt_text
                )
                claude_results.append({"id": q_id, **claude_result})
                logger.info(f"Claude 批改完成 Q{q_id}: {claude_result.get('score', 0)}/{q_score}")
            except Exception as e:
                logger.error(f"Claude 批改失敗 Q{q_id}: {e}")
                claude_results.append({"id": q_id, "score": 0, "comment": f"批改失敗：{e}"})
        
        # 計算總分
        gpt_total = sum(r.get("score", 0) for r in gpt_results)
        claude_total = sum(r.get("score", 0) for r in claude_results)
        
        # 簡單平均作為最終分數
        final_score = round((gpt_total + claude_total) / 2)
        
        logger.info(f"批改完成 - GPT: {gpt_total}, Claude: {claude_total}, 最終: {final_score}")
        
        # 生成回饋
        feedback_parts = []
        for i, q_item in enumerate(questions_list):
            q_id = q_item["id"]
            gpt_r = next((r for r in gpt_results if r["id"] == q_id), {})
            claude_r = next((r for r in claude_results if r["id"] == q_id), {})
            
            avg_score = round((gpt_r.get("score", 0) + claude_r.get("score", 0)) / 2)
            feedback_parts.append(f"📝 Q{q_id}: {avg_score}/{q_item.get('score', 0)}分")
            
            # GPT 評語
            if gpt_r.get("comment"):
                feedback_parts.append(f"   🤖 GPT: {gpt_r['comment'][:150]}")
            
            # Claude 評語
            if claude_r.get("comment"):
                feedback_parts.append(f"   🧠 Claude: {claude_r['comment'][:150]}")
            
            feedback_parts.append("")  # 空行分隔
        
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
                "questions_count": len(questions_list),
                "student_name": student_name
            }
        })
        
    except Exception as e:
        logger.error(f"API 批改失敗：{e}", exc_info=True)
        return jsonify({
            "success": False,
            "message": f"批改失敗：{str(e)}"
        }), 500

@app.route("/api/health", methods=["GET"])
def health_check():
    """健康檢查端點"""
    return jsonify({
        "status": "ok",
        "service": "Simple Grading API",
        "version": "1.0.0"
    })

@app.route("/", methods=["GET"])
def index():
    """根路徑"""
    return jsonify({
        "service": "Simple Grading API",
        "version": "1.0.0",
        "endpoints": {
            "grade": "POST /api/grade_single",
            "health": "GET /api/health"
        },
        "description": "AI 批改服務 - 整合 GPT + Claude 雙代理人批改"
    })

# ----------------------------------------------------------------------
# 入口
# ----------------------------------------------------------------------
if __name__ == "__main__":
    print("="*60)
    print("🤖 簡化版 AI 批改 API 服務")
    print("="*60)
    print()
    print("📡 服務地址: http://localhost:5001")
    print("📝 API 端點: POST /api/grade_single")
    print("💡 使用前請先在 http://localhost:5000 設定評分提詞")
    print()
    print("="*60)
    print()
    
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("GRADING_API_PORT", "5001")),
        debug=os.getenv("FLASK_DEBUG", "True").lower() == "true"
    )

