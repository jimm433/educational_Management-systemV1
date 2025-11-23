/**
 * 超簡化版 Google Forms 同步到 Firebase
 * 使用 Firebase REST API 直接寫入
 */

// Firebase 配置
// ⚠️ 安全提示：API Key 應儲存在 Google Apps Script 的 PropertiesService 中
// 請執行 setupFirebaseConfig() 函數來設定 API Key

/**
 * 取得 Firebase 配置
 * API Key 從 PropertiesService 安全取得，避免硬編碼
 */
function getFirebaseConfig() {
  return {
    projectId: "classhelper-aa6be",
    apiKey: getFirebaseApiKey()
  };
}

/**
 * 從 PropertiesService 取得 Firebase API Key
 * 如果未設定，返回空字串（需要先執行 setupFirebaseConfig）
 */
function getFirebaseApiKey() {
  const properties = PropertiesService.getScriptProperties();
  return properties.getProperty('FIREBASE_API_KEY') || '';
}

/**
 * 設定 Firebase API Key（只需執行一次）
 * 在 Google Apps Script 編輯器中執行此函數，並提供您的 API Key
 * 
 * 使用方式：
 * 1. 在 Google Apps Script 編輯器中開啟此檔案
 * 2. 執行 setupFirebaseConfig('YOUR_API_KEY_HERE') 函數
 * 3. 執行後請刪除或註解掉包含實際 API Key 的那行程式碼
 * 
 * 範例：
 * setupFirebaseConfig('YOUR_API_KEY_HERE')
 * 
 * ⚠️ 重要：執行後請立即刪除包含真實 API Key 的程式碼行
 */
function setupFirebaseConfig(apiKey) {
  if (!apiKey) {
    Logger.log('⚠️ 請提供 API Key 作為參數：setupFirebaseConfig("YOUR_API_KEY")');
    Logger.log('範例：setupFirebaseConfig("AIzaSy...")');
    return;
  }
  
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('FIREBASE_API_KEY', apiKey);
  Logger.log('✅ Firebase API Key 已安全儲存到 PropertiesService');
  Logger.log('⚠️ 請確保此 API Key 已設定適當的限制（在 Google Cloud Console 中）');
  Logger.log('⚠️ 請立即刪除或註解掉包含真實 API Key 的程式碼行');
}

/**
 * 取得 Firestore REST API 端點 URL
 */
function getFirestoreUrl() {
  const config = getFirebaseConfig();
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
}

/**
 * 設定表單提交觸發器
 */
function setupFormSubmitTrigger() {
  // 刪除現有觸發器
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 創建新的觸發器 - 每分鐘檢查一次
  ScriptApp.newTrigger('onFormSubmit')
    .timeBased()
    .everyMinutes(1)
    .create();

  console.log('✅ 表單提交觸發器已設定');
}

/**
 * 表單提交事件處理器
 */
function onFormSubmit() {
  try {
    console.log('🔍 檢查新的表單提交...');
    
    // 獲取所有表單
    const forms = DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
    let processedCount = 0;
    
    while (forms.hasNext()) {
      const file = forms.next();
      const formId = file.getId();
      const form = FormApp.openById(formId);
      const lastProcessed = getLastProcessedTime(formId);
      
      // 獲取所有回應
      const responses = form.getResponses();
      
      for (const response of responses) {
        const responseTime = response.getTimestamp();
        
        // 只處理新的回應
        if (responseTime > lastProcessed) {
          console.log(`📝 處理表單: ${form.getTitle()}`);
          processFormResponse(form, response);
          processedCount++;
        }
      }
      
      // 更新最後處理時間
      if (responses.length > 0) {
        const latestResponse = responses[responses.length - 1];
        setLastProcessedTime(formId, latestResponse.getTimestamp());
      }
    }
    
    console.log(`✅ 處理了 ${processedCount} 個新回應`);
    
  } catch (error) {
    console.error('❌ 處理表單提交時發生錯誤:', error);
  }
}

/**
 * 處理單個表單回應
 */
function processFormResponse(form, response) {
  try {
    const formId = form.getId();
    const formTitle = form.getTitle();
    const responseTime = response.getTimestamp();
    const respondentEmail = response.getRespondentEmail();
    
    // 檢查是否已存在該回應
    if (isResponseAlreadyProcessed(formId, responseTime, respondentEmail)) {
      console.log(`⏭️ 跳過已處理的回應: ${formTitle} - ${respondentEmail}`);
      return;
    }
    
    // 獲取學生答案和題目列表
    const answers = {};
    const questionTexts = [];
    const itemResponses = response.getItemResponses();
    
    itemResponses.forEach(itemResponse => {
      const question = itemResponse.getItem().getTitle();
      const item = itemResponse.getItem();
      let answer = itemResponse.getResponse();
      
      // 記錄題目文字（用於後續匹配標籤）
      questionTexts.push(question);
      
      // 處理不同類型的答案
      if (Array.isArray(answer)) {
        // 多選題或複選框
        answer = answer.join(', ');
      } else if (typeof answer === 'string' && answer.includes('（內容詳見檢視連結）')) {
        // 檔案上傳題或其他特殊題型
        answer = '[檔案上傳] ' + answer;
      } else if (typeof answer === 'string' && answer.trim() === '') {
        // 空白答案
        answer = '[未作答]';
      }
      
      // 根據題目類型處理答案（移除前綴以避免干擾 AI 批改）
      switch (item.getType()) {
        case FormApp.ItemType.MULTIPLE_CHOICE:
          answers[question] = answer;  // 直接儲存答案，不加前綴
          break;
        case FormApp.ItemType.CHECKBOX:
          answers[question] = answer;  // 多選答案已經用 join(', ') 處理過
          break;
        case FormApp.ItemType.TEXT:
          answers[question] = answer;  // 直接儲存答案
          break;
        case FormApp.ItemType.PARAGRAPH_TEXT:
          answers[question] = answer;  // 直接儲存答案
          break;
        case FormApp.ItemType.LIST:
          answers[question] = answer;  // 下拉選單也直接儲存
          break;
        case FormApp.ItemType.SCALE:
          answers[question] = answer;  // 評分也直接儲存
          break;
        case FormApp.ItemType.DATE:
          answers[question] = answer;  // 日期也直接儲存
          break;
        case FormApp.ItemType.TIME:
          answers[question] = answer;  // 時間也直接儲存
          break;
        case FormApp.ItemType.DURATION:
          answers[question] = answer;  // 時長也直接儲存
          break;
        case FormApp.ItemType.FILE_UPLOAD:
          answers[question] = `[檔案上傳] ${answer}`;  // 檔案上傳保留前綴（特殊情況）
          break;
        default:
          answers[question] = answer;
      }
    });
    
    // 構建預覽文字（將所有答案合併成一個字串）
    let previewText = '';
    for (const [question, answer] of Object.entries(answers)) {
      previewText += `【${question}】\n${answer}\n\n`;
    }
    
    // 如果沒有答案，顯示提示
    if (previewText.trim() === '') {
      previewText = '[無答案內容]';
    }
    
    // 從 Firestore 題庫查詢標籤
    const tags = getTagsForQuestions(questionTexts);
    console.log(`🏷️ 找到 ${tags.length} 個標籤:`, tags.join(', '));
    
    // 構建 Firestore 文檔資料
    const docId = generateDocId();
    const firestoreData = {
      fields: {
        form_id: { stringValue: formId },
        form_title: { stringValue: formTitle },
        student_email: { stringValue: respondentEmail || 'anonymous@example.com' },
        student_name: { stringValue: respondentEmail ? respondentEmail.split('@')[0] : '匿名學生' },
        answers: { 
          mapValue: { 
            fields: convertAnswersToFirestore(answers) 
          } 
        },
        preview: { stringValue: previewText },
        submission_time: { timestampValue: responseTime.toISOString() },
        created_at: { timestampValue: new Date().toISOString() },
        status: { stringValue: 'pending' },
        source: { stringValue: 'google-forms' },
        total_points: { integerValue: '100' },
        tags: {
          arrayValue: {
            values: tags.map(tag => ({ stringValue: tag }))
          }
        },
        ai_score: { nullValue: null },
        final_score: { nullValue: null },
        feedback: { nullValue: null }
      }
    };
    
    // 寫入 Firestore
    writeToFirestore('grading_events', docId, firestoreData);
    
    console.log(`✅ 成功同步: ${formTitle} - ${respondentEmail}`);
    
  } catch (error) {
    console.error('❌ 處理表單回應失敗:', error);
  }
}

/**
 * 從 Firestore 題庫查詢題目標籤
 */
function getTagsForQuestions(questionTexts) {
  try {
    if (!questionTexts || questionTexts.length === 0) {
      return [];
    }
    
    console.log(`🔍 查詢 ${questionTexts.length} 個題目的標籤...`);
    
    // 查詢 Firestore questions 集合
    const queryUrl = `${getFirestoreUrl()}/questions?pageSize=1000`;
    const response = UrlFetchApp.fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() !== 200) {
      console.warn('⚠️ 無法查詢題庫');
      return [];
    }
    
    const data = JSON.parse(response.getContentText());
    const allTags = [];
    
    if (data.documents) {
      // 遍歷題庫中的每個題目
      data.documents.forEach(doc => {
        const fields = doc.fields;
        if (!fields) return;
        
        const dbQuestion = fields.question?.stringValue || fields.title?.stringValue || '';
        const dbTags = fields.tags?.arrayValue?.values || [];
        
        // 檢查表單題目是否與題庫中的題目匹配
        questionTexts.forEach(formQuestion => {
          // 簡單的文字匹配（移除空白和標點後比較前50個字符）
          const cleanFormQ = formQuestion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').substring(0, 50);
          const cleanDbQ = dbQuestion.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').substring(0, 50);
          
          if (cleanFormQ && cleanDbQ && cleanFormQ === cleanDbQ) {
            // 找到匹配的題目，提取標籤
            dbTags.forEach(tagValue => {
              const tag = tagValue.stringValue;
              if (tag && !allTags.includes(tag)) {
                allTags.push(tag);
                console.log(`✅ 匹配題目「${formQuestion.substring(0, 30)}...」→ 標籤: ${tag}`);
              }
            });
          }
        });
      });
    }
    
    return allTags;
    
  } catch (error) {
    console.error('❌ 查詢標籤失敗:', error);
    return [];
  }
}

/**
 * 轉換答案為 Firestore 格式
 */
function convertAnswersToFirestore(answers) {
  const result = {};
  for (const [key, value] of Object.entries(answers)) {
    result[key] = { stringValue: String(value) };
  }
  return result;
}

/**
 * 寫入資料到 Firestore
 */
function writeToFirestore(collection, docId, data) {
  try {
    const url = `${getFirestoreUrl()}/${collection}/${docId}`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(data)
    });
    
    if (response.getResponseCode() === 200) {
      console.log(`✅ 成功寫入 Firestore: ${collection}/${docId}`);
    } else {
      console.error(`❌ Firestore 寫入失敗: ${response.getContentText()}`);
    }
    
  } catch (error) {
    console.error('❌ Firestore 寫入錯誤:', error);
  }
}

/**
 * 生成文檔 ID
 */
function generateDocId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 獲取最後處理時間
 */
function getLastProcessedTime(formId) {
  const properties = PropertiesService.getScriptProperties();
  const timeStr = properties.getProperty(`lastProcessed_${formId}`);
  return timeStr ? new Date(timeStr) : new Date(0);
}

/**
 * 設定最後處理時間
 */
function setLastProcessedTime(formId, time) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(`lastProcessed_${formId}`, time.toISOString());
}

/**
 * 測試 Firebase 連接
 */
function testFirebaseConnection() {
  try {
    console.log('🧪 測試 Firebase 連接...');
    
    const docId = generateDocId();
    const testData = {
      fields: {
        test: { booleanValue: true },
        timestamp: { timestampValue: new Date().toISOString() },
        message: { stringValue: 'Firebase 連接測試' },
        source: { stringValue: 'google-apps-script' }
      }
    };
    
    writeToFirestore('test_collection', docId, testData);
    
    console.log('✅ Firebase 連接測試完成');
    
  } catch (error) {
    console.error('❌ Firebase 連接測試失敗:', error);
  }
}

/**
 * 手動同步所有表單
 */
function manualSyncAllForms() {
  try {
    console.log('🚀 開始手動同步所有表單...');
    
    // 獲取所有表單
    const forms = DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
    let totalProcessed = 0;
    
    while (forms.hasNext()) {
      const file = forms.next();
      const formId = file.getId();
      const form = FormApp.openById(formId);
      
      console.log(`📝 同步表單: ${form.getTitle()}`);
      
      const responses = form.getResponses();
      
      for (const response of responses) {
        processFormResponse(form, response);
        totalProcessed++;
      }
    }
    
    console.log(`✅ 手動同步完成，共處理 ${totalProcessed} 個回應`);
    
  } catch (error) {
    console.error('❌ 手動同步失敗:', error);
  }
}

/**
 * 清理已刪除的回應（從 Firestore 中刪除）
 */
function cleanupDeletedResponses() {
  try {
    console.log('🧹 開始清理已刪除的回應...');
    
    // 獲取所有表單 ID
    const forms = DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
    const activeFormIds = [];
    
    while (forms.hasNext()) {
      const file = forms.next();
      activeFormIds.push(file.getId());
    }
    
    // 查詢所有 grading_events
    const queryUrl = `${getFirestoreUrl()}/grading_events?pageSize=1000`;
    const response = UrlFetchApp.fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      let deletedCount = 0;
      
      if (data.documents) {
        for (const doc of data.documents) {
          const fields = doc.fields;
          if (fields && fields.form_id) {
            const formId = fields.form_id.stringValue;
            
            // 如果表單已不存在，刪除該回應
            if (!activeFormIds.includes(formId)) {
              const docId = doc.name.split('/').pop();
              if (deleteResponseFromFirestore(docId)) {
                deletedCount++;
              }
            }
          }
        }
      }
      
      console.log(`✅ 清理完成，刪除了 ${deletedCount} 個無效回應`);
    }
    
  } catch (error) {
    console.error('❌ 清理失敗:', error);
  }
}

/**
 * 從 Firestore 刪除回應
 */
function deleteResponseFromFirestore(docId) {
  try {
    const url = `${getFirestoreUrl()}/grading_events/${docId}`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      console.log(`✅ 成功刪除回應: ${docId}`);
      return true;
    } else {
      console.error(`❌ 刪除回應失敗: ${response.getContentText()}`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ 刪除回應錯誤:', error);
    return false;
  }
}

/**
 * 檢查回應是否已處理
 */
function isResponseAlreadyProcessed(formId, responseTime, respondentEmail) {
  try {
    // 查詢 Firestore 中是否存在相同的回應
    const queryUrl = `${getFirestoreUrl()}/grading_events?pageSize=1000`;
    
    const response = UrlFetchApp.fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      
      if (data.documents) {
        for (const doc of data.documents) {
          const fields = doc.fields;
          if (fields && 
              fields.form_id && fields.form_id.stringValue === formId &&
              fields.student_email && fields.student_email.stringValue === respondentEmail &&
              fields.submission_time && fields.submission_time.timestampValue === responseTime.toISOString()) {
            return true;
          }
        }
      }
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ 檢查回應狀態失敗:', error);
    return false;
  }
}

/**
 * 從 Firestore 刪除回應
 */
function deleteResponseFromFirestore(docId) {
  try {
    const url = `${getFirestoreUrl()}/grading_events/${docId}`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      console.log(`✅ 成功刪除回應: ${docId}`);
      return true;
    } else {
      console.error(`❌ 刪除回應失敗: ${response.getContentText()}`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ 刪除回應錯誤:', error);
    return false;
  }
}

/**
 * 清理已刪除的回應
 */
function cleanupDeletedResponses() {
  try {
    console.log('🧹 開始清理已刪除的回應...');
    
    // 獲取所有表單
    const forms = DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
    const activeFormIds = [];
    
    while (forms.hasNext()) {
      const file = forms.next();
      activeFormIds.push(file.getId());
    }
    
    // 查詢所有 grading_events
    const queryUrl = `${getFirestoreUrl()}/grading_events?pageSize=1000`;
    const response = UrlFetchApp.fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      let deletedCount = 0;
      
      if (data.documents) {
        for (const doc of data.documents) {
          const fields = doc.fields;
          if (fields && fields.form_id) {
            const formId = fields.form_id.stringValue;
            
            // 如果表單已不存在，刪除該回應
            if (!activeFormIds.includes(formId)) {
              const docId = doc.name.split('/').pop();
              if (deleteResponseFromFirestore(docId)) {
                deletedCount++;
              }
            }
          }
        }
      }
      
      console.log(`✅ 清理完成，刪除了 ${deletedCount} 個無效回應`);
    }
    
  } catch (error) {
    console.error('❌ 清理失敗:', error);
  }
}

/**
 * 初始化設定
 */
function initializeSync() {
  try {
    console.log('🔧 初始化 Google Forms 同步設定...');
    
    // 設定觸發器
    setupFormSubmitTrigger();
    
    // 測試連接
    testFirebaseConnection();
    
    // 清理已刪除的回應
    cleanupDeletedResponses();
    
    // 手動同步現有表單
    manualSyncAllForms();
    
    console.log('✅ 初始化完成！');
    console.log('📋 使用說明：');
    console.log('1. Firebase 規則已設為完全開放（測試模式）');
    console.log('2. 觸發器會每分鐘檢查新的表單提交');
    console.log('3. 學生作答結果會自動同步到 grading_events 集合');
    console.log('4. 您可以在 grading.html 中查看和批改這些提交');
    console.log('5. 刪除的回應不會重新同步');
    
  } catch (error) {
    console.error('❌ 初始化失敗:', error);
  }
}
