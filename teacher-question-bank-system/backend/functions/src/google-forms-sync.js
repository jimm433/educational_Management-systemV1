/**
 * Google Forms 同步到 Firebase 的 Cloud Function
 * 處理來自 Google Apps Script 的同步請求
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// 初始化 Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 接收 Google Forms 同步請求
 * 這個函數可以被 Google Apps Script 調用
 */
exports.syncFormSubmission = functions.https.onRequest(async (req, res) => {
  // 設定 CORS 標頭
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // 處理 OPTIONS 請求
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  try {
    // 驗證請求方法
    if (req.method !== 'POST') {
      res.status(405).json({ error: '只允許 POST 請求' });
      return;
    }

    // 獲取請求資料
    const submissionData = req.body;

    // 驗證必要欄位
    if (!submissionData.form_id || !submissionData.student_email) {
      res.status(400).json({ error: '缺少必要欄位' });
      return;
    }

    // 生成文檔 ID
    const docId = generateDocId();

    // 準備 Firestore 資料
    const firestoreData = {
      form_id: submissionData.form_id,
      form_title: submissionData.form_title || '未命名表單',
      student_email: submissionData.student_email,
      student_name: submissionData.student_name || submissionData.student_email.split('@')[0],
      answers: submissionData.answers || {},
      submission_time: admin.firestore.Timestamp.fromDate(new Date(submissionData.submission_time || new Date())),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      source: 'google-forms',
      total_points: submissionData.total_points || 100,
      ai_score: null,
      final_score: null,
      feedback: null,
    };

    // 寫入 Firestore
    await db.collection('grading_events').doc(docId).set(firestoreData);

    console.log(`✅ 成功同步表單提交: ${submissionData.form_title} - ${submissionData.student_email}`);

    // 回傳成功回應
    res.status(200).json({
      success: true,
      message: '表單提交同步成功',
      docId: docId,
      formId: submissionData.form_id,
      studentEmail: submissionData.student_email,
    });
  } catch (error) {
    console.error('❌ 同步表單提交失敗:', error);
    res.status(500).json({
      success: false,
      error: '同步失敗',
      message: error.message,
    });
  }
});

/**
 * 批量同步多個表單提交
 */
exports.batchSyncFormSubmissions = functions.https.onRequest(async (req, res) => {
  // 設定 CORS 標頭
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: '只允許 POST 請求' });
      return;
    }

    const submissions = req.body.submissions || [];

    if (!Array.isArray(submissions) || submissions.length === 0) {
      res.status(400).json({ error: '請提供提交資料陣列' });
      return;
    }

    const batch = db.batch();
    const results = [];

    for (const submission of submissions) {
      const docId = generateDocId();

      const firestoreData = {
        form_id: submission.form_id,
        form_title: submission.form_title || '未命名表單',
        student_email: submission.student_email,
        student_name: submission.student_name || submission.student_email.split('@')[0],
        answers: submission.answers || {},
        submission_time: admin.firestore.Timestamp.fromDate(new Date(submission.submission_time || new Date())),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        source: 'google-forms',
        total_points: submission.total_points || 100,
        ai_score: null,
        final_score: null,
        feedback: null,
      };

      batch.set(db.collection('grading_events').doc(docId), firestoreData);
      results.push({ docId, formId: submission.form_id, studentEmail: submission.student_email });
    }

    await batch.commit();

    console.log(`✅ 批量同步成功: ${submissions.length} 個提交`);

    res.status(200).json({
      success: true,
      message: `成功同步 ${submissions.length} 個表單提交`,
      results: results,
    });
  } catch (error) {
    console.error('❌ 批量同步失敗:', error);
    res.status(500).json({
      success: false,
      error: '批量同步失敗',
      message: error.message,
    });
  }
});

/**
 * 獲取表單提交統計
 */
exports.getFormSubmissionStats = functions.https.onRequest(async (req, res) => {
  // 設定 CORS 標頭
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  try {
    const formId = req.query.formId;

    let query = db.collection('grading_events');

    if (formId) {
      query = query.where('form_id', '==', formId);
    }

    const snapshot = await query.get();
    const submissions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const stats = {
      total: submissions.length,
      pending: submissions.filter((s) => s.status === 'pending').length,
      completed: submissions.filter((s) => s.status === 'completed').length,
      byForm: {},
    };

    // 按表單分組統計
    submissions.forEach((submission) => {
      const formId = submission.form_id;
      if (!stats.byForm[formId]) {
        stats.byForm[formId] = {
          formTitle: submission.form_title,
          total: 0,
          pending: 0,
          completed: 0,
        };
      }
      stats.byForm[formId].total++;
      if (submission.status === 'pending') {
        stats.byForm[formId].pending++;
      } else if (submission.status === 'completed') {
        stats.byForm[formId].completed++;
      }
    });

    res.status(200).json({
      success: true,
      stats: stats,
      submissions: submissions,
    });
  } catch (error) {
    console.error('❌ 獲取統計失敗:', error);
    res.status(500).json({
      success: false,
      error: '獲取統計失敗',
      message: error.message,
    });
  }
});

/**
 * 生成文檔 ID
 * @return {string} 隨機生成的 20 字元 ID
 */
function generateDocId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
