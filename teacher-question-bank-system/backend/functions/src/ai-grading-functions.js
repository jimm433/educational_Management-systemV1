/**
 * AI 批改功能
 * 使用 Gemini API 進行自動批改
 */

const functions = require('firebase-functions');
// const admin = require('firebase-admin'); // 未使用
const cors = require('cors')({ origin: true });

// Gemini API 配置
// ⚠️ 重要：請使用環境變數設定 API 金鑰
// 在 Firebase Functions 中設定：firebase functions:config:set gemini.api_key="YOUR_API_KEY"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || functions.config().gemini ? .api_key || 'YOUR_GEMINI_API_KEY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

/**
 * 單個作業 AI 批改
 */
exports.aiGradeSingle = functions.https.onRequest(async(req, res) => {
    return cors(req, res, async() => {
        try {
            // 只接受 POST 請求
            if (req.method !== 'POST') {
                return res.status(405).json({ error: '只支援 POST 請求' });
            }

            const { question, answer, subject, maxScore, studentName, customPrompt } = req.body;

            // 驗證必要參數
            if (!question || !answer) {
                return res.status(400).json({ error: '缺少必要參數：question, answer' });
            }

            console.log('🤖 開始 AI 批改:', { studentName, subject, maxScore });

            // 構建批改提示詞
            const gradingPrompt = customPrompt || buildDefaultPrompt(subject);
            const fullPrompt = `${gradingPrompt}

**題目：**
${question}

**學生答案：**
${answer}

**滿分：**
${maxScore || 100} 分

請以 JSON 格式回應，包含以下欄位：
{
  "score": 分數(數字),
  "feedback": "詳細評語",
  "strengths": ["優點1", "優點2"],
  "improvements": ["改進建議1", "改進建議2"]
}`;

            // 調用 Gemini API
            const aiResponse = await callGeminiAPI(fullPrompt);

            // 解析 JSON 回應
            let result;
            try {
                // 嘗試提取 JSON
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                } else {
                    // 如果沒有 JSON，使用整段文字作為評語
                    result = {
                        score: extractScore(aiResponse, maxScore),
                        feedback: aiResponse,
                        strengths: [],
                        improvements: [],
                    };
                }
            } catch (parseError) {
                console.warn('⚠️ JSON 解析失敗，使用文字回應:', parseError);
                result = {
                    score: extractScore(aiResponse, maxScore),
                    feedback: aiResponse,
                    strengths: [],
                    improvements: [],
                };
            }

            // 確保分數在合理範圍內
            result.score = Math.max(0, Math.min(maxScore || 100, result.score || 0));

            console.log('✅ AI 批改完成:', result);

            return res.status(200).json({
                success: true,
                score: result.score,
                feedback: result.feedback,
                strengths: result.strengths,
                improvements: result.improvements,
                gradedBy: 'Gemini AI',
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error('❌ AI 批改失敗:', error);
            return res.status(500).json({
                error: 'AI 批改失敗',
                message: error.message,
            });
        }
    });
});

/**
 * 批量 AI 批改
 */
exports.aiGradeBatch = functions.https.onRequest(async(req, res) => {
    return cors(req, res, async() => {
        try {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: '只支援 POST 請求' });
            }

            const { submissions } = req.body;

            if (!Array.isArray(submissions) || submissions.length === 0) {
                return res.status(400).json({ error: '請提供作業陣列' });
            }

            console.log(`🤖 開始批量批改 ${submissions.length} 份作業`);

            const results = [];

            // 逐一批改（避免 API 限流）
            for (let i = 0; i < submissions.length; i++) {
                const submission = submissions[i];

                try {
                    const gradingPrompt = buildDefaultPrompt(submission.subject);
                    const fullPrompt = `${gradingPrompt}

**題目：**
${submission.question}

**學生答案：**
${submission.answer}

**滿分：**
${submission.maxScore || 100} 分

請給出分數(0-${submission.maxScore || 100})和簡短評語。`;

                    const aiResponse = await callGeminiAPI(fullPrompt);
                    const score = extractScore(aiResponse, submission.maxScore);

                    results.push({
                        id: submission.id,
                        success: true,
                        score: score,
                        feedback: aiResponse,
                    });

                    // 延遲避免 API 限流
                    if (i < submissions.length - 1) {
                        await delay(1000); // 1秒延遲
                    }
                } catch (error) {
                    console.error(`❌ 批改失敗 (${submission.id}):`, error);
                    results.push({
                        id: submission.id,
                        success: false,
                        error: error.message,
                    });
                }
            }

            console.log(`✅ 批量批改完成: ${results.filter((r) => r.success).length}/${results.length}`);

            return res.status(200).json({
                success: true,
                results: results,
                total: submissions.length,
                succeeded: results.filter((r) => r.success).length,
                failed: results.filter((r) => !r.success).length,
            });
        } catch (error) {
            console.error('❌ 批量批改失敗:', error);
            return res.status(500).json({
                error: '批量批改失敗',
                message: error.message,
            });
        }
    });
});

/**
 * 調用 Gemini API
 * @param {string} prompt 提示詞
 * @return {Promise<string>} AI 生成的文字
 */
async function callGeminiAPI(prompt) {
    const fetch = require('node-fetch');

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt,
                }],
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API 錯誤 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const aiText = result.candidates && result.candidates[0] &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text;

    if (!aiText) {
        throw new Error('Gemini API 回應格式錯誤');
    }

    return aiText;
}

/**
 * 構建預設批改提示詞
 * @param {string} subject 科目名稱
 * @return {string} 批改提示詞
 */
function buildDefaultPrompt(subject) {
    const prompts = {
        'programming': `你是一位專業的程式設計教師。請批改以下程式題目：
- 檢查程式邏輯是否正確
- 評估程式碼品質和可讀性
- 指出語法錯誤或邏輯問題
- 給予建設性的改進建議`,

        'csharp': `你是一位 C# 程式設計教師。請批改以下 C# 題目：
- 檢查語法是否正確
- 評估程式邏輯
- 檢查是否符合 C# 最佳實踐
- 給予具體的改進建議`,

        'python': `你是一位 Python 程式設計教師。請批改以下 Python 題目：
- 檢查語法和邏輯
- 評估程式碼風格（PEP 8）
- 檢查效率和可讀性
- 給予改進建議`,

        'math': `你是一位數學教師。請批改以下數學題目：
- 檢查計算過程是否正確
- 評估解題步驟的完整性
- 指出錯誤並解釋正確做法
- 給予學習建議`,

        'default': `你是一位專業教師。請批改以下題目：
- 評估答案的正確性
- 檢查理解程度
- 指出優點和需改進的地方
- 給予具體的學習建議`,
    };

    return prompts[subject && subject.toLowerCase()] || prompts['default'];
}

/**
 * 從 AI 回應中提取分數
 * @param {string} text AI 回應文字
 * @param {number} maxScore 滿分
 * @return {number} 提取的分數
 */
function extractScore(text, maxScore = 100) {
    // 嘗試匹配各種分數格式
    const patterns = [
        /分數[：:]\s*(\d+)/,
        /score[：:]\s*(\d+)/i,
        /得分[：:]\s*(\d+)/,
        /(\d+)\s*分/,
        /(\d+)\s*\/\s*\d+/,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const score = parseInt(match[1]);
            return Math.max(0, Math.min(maxScore, score));
        }
    }

    // 如果找不到分數，根據關鍵字推測
    if (text.includes('優秀') || text.includes('完全正確')) return maxScore;
    if (text.includes('良好') || text.includes('大致正確')) return Math.floor(maxScore * 0.8);
    if (text.includes('及格') || text.includes('基本正確')) return Math.floor(maxScore * 0.6);
    if (text.includes('不及格') || text.includes('錯誤')) return Math.floor(maxScore * 0.4);

    // 預設給 60%
    return Math.floor(maxScore * 0.6);
}

/**
 * 延遲函數
 * @param {number} ms 延遲毫秒數
 * @return {Promise<void>} Promise
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}