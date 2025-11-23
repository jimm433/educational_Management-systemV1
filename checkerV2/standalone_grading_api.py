# -*- coding: utf-8 -*-
"""
獨立版 AI 批改 API
完全獨立運行，不需要任何外部依賴（除了 AI SDK）
專門為 grading.html 提供批改服務
"""

from flask import Flask, request, jsonify
import os
import logging
import json
import re
from dotenv import load_dotenv

# 導入 AI SDK
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    print("⚠️ OpenAI SDK 未安裝")

try:
    from anthropic import Anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    print("⚠️ Anthropic SDK 未安裝")

load_dotenv()

# ----------------------------------------------------------------------
# Flask 應用
# ----------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(24))

# CORS 支援（手動實作，避免依賴 flask-cors）
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("grading_api")

# ----------------------------------------------------------------------
# AI 客戶端初始化
# ----------------------------------------------------------------------
openai_client = None
anthropic_client = None

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

if HAS_OPENAI and OPENAI_API_KEY:
    try:
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        logger.info("✅ OpenAI 客戶端初始化成功")
    except Exception as e:
        logger.error(f"OpenAI 初始化失敗: {e}")

if HAS_ANTHROPIC and ANTHROPIC_API_KEY:
    try:
        anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)
        logger.info("✅ Anthropic 客戶端初始化成功")
    except Exception as e:
        logger.error(f"Anthropic 初始化失敗: {e}")

# ----------------------------------------------------------------------
# 簡化的題目拆分函數
# ----------------------------------------------------------------------
def simple_split_questions(text):
    """簡單的題目拆分"""
    lines = text.strip().split('\n')
    questions = []
    current_q = None
    current_text = []
    
    for line in lines:
        # 檢查是否是題目標題
        match = re.match(r'^\s*(?:Q|題目|Question|Problem)\s*(\d+)', line, re.IGNORECASE)
        if match:
            # 儲存前一題
            if current_q is not None:
                questions.append({
                    "id": current_q,
                    "text": '\n'.join(current_text).strip(),
                    "score": 10  # 預設分數
                })
            # 開始新題
            current_q = match.group(1)
            current_text = [line]
        elif current_q is not None:
            current_text.append(line)
    
    # 儲存最後一題
    if current_q is not None:
        questions.append({
            "id": current_q,
            "text": '\n'.join(current_text).strip(),
            "score": 10
        })
    
    # 如果沒有拆分出題目，當作單一題目
    if not questions:
        questions.append({
            "id": "1",
            "text": text.strip(),
            "score": 100
        })
    
    return questions

# ----------------------------------------------------------------------
# AI 批改函數
# ----------------------------------------------------------------------
def call_openai_grader(question, answer, max_score, prompt_text):
    """調用 OpenAI GPT 批改"""
    if not openai_client:
        return {"score": 0, "comment": "OpenAI 未配置"}
    
    try:
        messages = [
            {"role": "system", "content": prompt_text},
            {"role": "user", "content": f"""題目：
{question}

學生答案：
{answer}

請評分（滿分{max_score}分）並給出評語。
請以 JSON 格式回覆：{{"score": 分數, "comment": "評語"}}"""}
        ]
        
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.0,
            max_tokens=1000
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # 嘗試解析 JSON
        try:
            result = json.loads(result_text)
            return {
                "score": min(float(result.get("score", 0)), max_score),
                "comment": result.get("comment", "")
            }
        except:
            # 如果不是 JSON，嘗試提取分數
            score_match = re.search(r'(\d+(?:\.\d+)?)\s*分', result_text)
            score = float(score_match.group(1)) if score_match else max_score * 0.7
            return {
                "score": min(score, max_score),
                "comment": result_text[:200]
            }
    
    except Exception as e:
        logger.error(f"GPT 批改失敗: {e}")
        return {"score": 0, "comment": f"批改失敗：{str(e)}"}

def call_anthropic_grader(question, answer, max_score, prompt_text):
    """調用 Anthropic Claude 批改"""
    if not anthropic_client:
        return {"score": 0, "comment": "Claude 未配置"}
    
    try:
        message = anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            temperature=0.0,
            system=prompt_text,
            messages=[
                {"role": "user", "content": f"""題目：
{question}

學生答案：
{answer}

請評分（滿分{max_score}分）並給出評語。
請以 JSON 格式回覆：{{"score": 分數, "comment": "評語"}}"""}
            ]
        )
        
        result_text = message.content[0].text.strip()
        
        # 嘗試解析 JSON
        try:
            result = json.loads(result_text)
            return {
                "score": min(float(result.get("score", 0)), max_score),
                "comment": result.get("comment", "")
            }
        except:
            # 如果不是 JSON，嘗試提取分數
            score_match = re.search(r'(\d+(?:\.\d+)?)\s*分', result_text)
            score = float(score_match.group(1)) if score_match else max_score * 0.7
            return {
                "score": min(score, max_score),
                "comment": result_text[:200]
            }
    
    except Exception as e:
        logger.error(f"Claude 批改失敗: {e}")
        return {"score": 0, "comment": f"批改失敗：{str(e)}"}

# ----------------------------------------------------------------------
# API 端點
# ----------------------------------------------------------------------
@app.route("/api/grade_single", methods=["POST", "OPTIONS"])
def api_grade_single():
    """單個答案批改 API"""
    # 處理 OPTIONS 請求（CORS 預檢）
    if request.method == "OPTIONS":
        return jsonify({"success": True}), 200
    
    try:
        data = request.get_json()
        
        # 驗證必要欄位
        if not data:
            return jsonify({"success": False, "message": "無效的請求資料"}), 400
        
        question_text = data.get("question", "")
        answer_text = data.get("answer", "")
        subject = data.get("subject", "通識")
        max_score = data.get("max_score", 100)
        student_name = data.get("student_name", "學生")
        custom_prompt = data.get("prompt", None)
        
        if not question_text or not answer_text:
            return jsonify({
                "success": False,
                "message": "缺少題目或答案"
            }), 400
        
        logger.info(f"📝 收到批改請求 - 學生：{student_name}, 科目：{subject}, 滿分：{max_score}")
        
        # 設定評分提詞
        if custom_prompt:
            prompt_text = custom_prompt
            logger.info("✅ 使用自訂評分提詞")
        else:
            prompt_text = f"""請作為專業的{subject}教師進行評分。

評分標準：
1. 正確性（40%）：答案是否正確完整
2. 邏輯性（30%）：思路是否清晰合理
3. 完整性（20%）：是否涵蓋所有要點
4. 表達（10%）：語言是否流暢清楚

請給出具體分數和改進建議。"""
            logger.info(f"✅ 使用預設評分提詞（科目：{subject}）")
        
        # 拆分題目
        questions_list = simple_split_questions(question_text)
        answers_list = simple_split_questions(answer_text)
        
        logger.info(f"📊 拆分出 {len(questions_list)} 個題目, {len(answers_list)} 個答案")
        
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
            
            logger.info(f"🔍 批改題目 Q{q_id}，配分：{q_score}")
            
            # 調用 GPT 批改
            if openai_client:
                gpt_result = call_openai_grader(q_text, answer, q_score, prompt_text)
                gpt_results.append({"id": q_id, **gpt_result})
                logger.info(f"✅ GPT 批改完成 Q{q_id}: {gpt_result.get('score', 0)}/{q_score}")
            
            # 調用 Claude 批改
            if anthropic_client:
                claude_result = call_anthropic_grader(q_text, answer, q_score, prompt_text)
                claude_results.append({"id": q_id, **claude_result})
                logger.info(f"✅ Claude 批改完成 Q{q_id}: {claude_result.get('score', 0)}/{q_score}")
        
        # 計算總分
        gpt_total = sum(r.get("score", 0) for r in gpt_results)
        claude_total = sum(r.get("score", 0) for r in claude_results)
        
        # 計算平均分數
        if gpt_results and claude_results:
            final_score = round((gpt_total + claude_total) / 2, 1)
        elif gpt_results:
            final_score = round(gpt_total, 1)
        elif claude_results:
            final_score = round(claude_total, 1)
        else:
            return jsonify({
                "success": False,
                "message": "沒有可用的 AI 服務"
            }), 500
        
        logger.info(f"📊 批改完成 - GPT: {gpt_total}, Claude: {claude_total}, 最終: {final_score}")
        
        # 生成回饋
        feedback_parts = []
        for q_item in questions_list:
            q_id = q_item["id"]
            gpt_r = next((r for r in gpt_results if r["id"] == q_id), {}) if gpt_results else {}
            claude_r = next((r for r in claude_results if r["id"] == q_id), {}) if claude_results else {}
            
            # 計算平均分
            if gpt_r and claude_r:
                avg_score = round((gpt_r.get("score", 0) + claude_r.get("score", 0)) / 2, 1)
            elif gpt_r:
                avg_score = round(gpt_r.get("score", 0), 1)
            else:
                avg_score = round(claude_r.get("score", 0), 1)
            
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
                "gpt_score": round(gpt_total, 1) if gpt_results else 0,
                "claude_score": round(claude_total, 1) if claude_results else 0,
                "questions_count": len(questions_list),
                "student_name": student_name
            }
        })
        
    except Exception as e:
        logger.error(f"❌ API 批改失敗：{e}", exc_info=True)
        return jsonify({
            "success": False,
            "message": f"批改失敗：{str(e)}"
        }), 500

@app.route("/api/health", methods=["GET"])
def health_check():
    """健康檢查端點"""
    return jsonify({
        "status": "ok",
        "service": "Standalone Grading API",
        "version": "1.0.0",
        "ai_services": {
            "openai": openai_client is not None,
            "anthropic": anthropic_client is not None
        }
    })

@app.route("/", methods=["GET"])
def index():
    """根路徑"""
    return jsonify({
        "service": "Standalone Grading API",
        "version": "1.0.0",
        "description": "獨立 AI 批改服務 - GPT + Claude",
        "endpoints": {
            "grade": "POST /api/grade_single",
            "health": "GET /api/health"
        },
        "ai_status": {
            "openai": "✅ 已配置" if openai_client else "❌ 未配置",
            "anthropic": "✅ 已配置" if anthropic_client else "❌ 未配置"
        }
    })

# ----------------------------------------------------------------------
# 入口
# ----------------------------------------------------------------------
if __name__ == "__main__":
    print("="*60)
    print("🤖 獨立版 AI 批改 API 服務")
    print("="*60)
    print()
    print("📡 服務地址: http://localhost:5001")
    print("📝 API 端點: POST /api/grade_single")
    print()
    print("🔑 AI 服務狀態：")
    print(f"   • OpenAI GPT:  {'✅ 已配置' if openai_client else '❌ 未配置'}")
    print(f"   • Claude:      {'✅ 已配置' if anthropic_client else '❌ 未配置'}")
    print()
    if not openai_client and not anthropic_client:
        print("⚠️  警告：沒有可用的 AI 服務！")
        print("   請在 .env 檔案中設定 API 金鑰")
        print()
    print("="*60)
    print()
    
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("GRADING_API_PORT", "5001")),
        debug=os.getenv("FLASK_DEBUG", "True").lower() == "true"
    )

