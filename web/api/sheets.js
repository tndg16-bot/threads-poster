/**
 * Google Sheets API Router
 *
 * 投稿スケジュールのスプレッドシートに対するCRUD操作を提供
 * Columns: A=日付, B=投稿時間, C=投稿文, D=カテゴリ, E=トピックタグ,
 *          F=記事URL, G=画像URL, H=ステータス, I=投稿ID, J=メモ
 */

import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();

// --- Column mapping ---
const COLUMNS = {
  date: 0,        // A: 日付
  time: 1,        // B: 投稿時間
  text: 2,        // C: 投稿文
  category: 3,    // D: カテゴリ
  topicTag: 4,    // E: トピックタグ
  articleUrl: 5,   // F: 記事URL
  imageUrl: 6,    // G: 画像URL
  status: 7,      // H: ステータス
  postId: 8,      // I: 投稿ID
  memo: 9,        // J: メモ
};

const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const TOTAL_COLUMNS = COLUMN_LETTERS.length;

// --- Auth helper ---

/**
 * Google Sheets APIクライアントを生成する
 * 認証方法:
 *   1. GOOGLE_SERVICE_ACCOUNT_PATH — サービスアカウントJSONファイルパス
 *   2. GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY — インライン認証情報
 */
async function getSheetsClient() {
  let auth;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    // File-based service account auth
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    // Inline credentials auth
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n');
    auth = new google.auth.JWT(
      process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    await auth.authorize();
  } else {
    throw new Error(
      'Google Sheets auth not configured. Set GOOGLE_SERVICE_ACCOUNT_PATH or ' +
      'GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY environment variables.'
    );
  }

  return google.sheets({ version: 'v4', auth });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable is required.');
  }
  return id;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_NAME || '投稿スケジュール';
}

/**
 * スプレッドシートの1行を構造化オブジェクトに変換する
 * @param {string[]} row - セル値の配列
 * @param {number} rowIndex - 0-based index (ヘッダー行を含むシート内の行番号)
 * @returns {Object}
 */
function rowToPost(row, rowIndex) {
  return {
    row: rowIndex + 1, // 1-based sheet row number (for API reference)
    date: row[COLUMNS.date] || '',
    time: row[COLUMNS.time] || '',
    text: row[COLUMNS.text] || '',
    category: row[COLUMNS.category] || '',
    topicTag: row[COLUMNS.topicTag] || '',
    articleUrl: row[COLUMNS.articleUrl] || '',
    imageUrl: row[COLUMNS.imageUrl] || '',
    status: row[COLUMNS.status] || '',
    postId: row[COLUMNS.postId] || '',
    memo: row[COLUMNS.memo] || '',
  };
}

/**
 * 構造化オブジェクトをスプレッドシート行の配列に変換する
 * @param {Object} post
 * @returns {string[]}
 */
function postToRow(post) {
  const row = new Array(TOTAL_COLUMNS).fill('');
  if (post.date !== undefined) row[COLUMNS.date] = post.date;
  if (post.time !== undefined) row[COLUMNS.time] = post.time;
  if (post.text !== undefined) row[COLUMNS.text] = post.text;
  if (post.category !== undefined) row[COLUMNS.category] = post.category;
  if (post.topicTag !== undefined) row[COLUMNS.topicTag] = post.topicTag;
  if (post.articleUrl !== undefined) row[COLUMNS.articleUrl] = post.articleUrl;
  if (post.imageUrl !== undefined) row[COLUMNS.imageUrl] = post.imageUrl;
  if (post.status !== undefined) row[COLUMNS.status] = post.status;
  if (post.postId !== undefined) row[COLUMNS.postId] = post.postId;
  if (post.memo !== undefined) row[COLUMNS.memo] = post.memo;
  return row;
}

// --- Routes ---

/**
 * GET /api/sheets/posts
 * 全投稿をスプレッドシートから読み込んでJSON配列で返す
 * ヘッダー行（1行目）はスキップする
 */
router.get('/posts', async (_req, res) => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const sheetName = getSheetName();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:J`,
    });

    const rows = response.data.values || [];

    // Skip header row (row 1)
    const posts = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Skip completely empty rows
      if (!row || row.every((cell) => !cell || cell.trim() === '')) {
        continue;
      }
      // Pad row to TOTAL_COLUMNS so missing trailing cells become ''
      while (row.length < TOTAL_COLUMNS) {
        row.push('');
      }
      posts.push(rowToPost(row, i));
    }

    res.json({ success: true, posts });
  } catch (error) {
    console.error('GET /api/sheets/posts error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/sheets/posts/:row
 * 指定行を丸ごと更新する（部分更新も可、未指定フィールドは現在値を維持）
 * :row は1-basedのシート行番号
 *
 * Body: { date?, time?, text?, category?, topicTag?, articleUrl?, imageUrl?, status?, postId?, memo? }
 */
router.put('/posts/:row', async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row, 10);
    if (isNaN(rowNum) || rowNum < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid row number. Must be >= 2 (row 1 is the header).',
      });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const sheetName = getSheetName();

    // Read current row to merge with incoming data
    const range = `${sheetName}!A${rowNum}:J${rowNum}`;
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const currentRow = (current.data.values && current.data.values[0]) || new Array(TOTAL_COLUMNS).fill('');
    while (currentRow.length < TOTAL_COLUMNS) {
      currentRow.push('');
    }

    // Build the merged row — only overwrite fields present in request body
    const body = req.body;
    const updatedRow = [...currentRow];

    if (body.date !== undefined) updatedRow[COLUMNS.date] = body.date;
    if (body.time !== undefined) updatedRow[COLUMNS.time] = body.time;
    if (body.text !== undefined) updatedRow[COLUMNS.text] = body.text;
    if (body.category !== undefined) updatedRow[COLUMNS.category] = body.category;
    if (body.topicTag !== undefined) updatedRow[COLUMNS.topicTag] = body.topicTag;
    if (body.articleUrl !== undefined) updatedRow[COLUMNS.articleUrl] = body.articleUrl;
    if (body.imageUrl !== undefined) updatedRow[COLUMNS.imageUrl] = body.imageUrl;
    if (body.status !== undefined) updatedRow[COLUMNS.status] = body.status;
    if (body.postId !== undefined) updatedRow[COLUMNS.postId] = body.postId;
    if (body.memo !== undefined) updatedRow[COLUMNS.memo] = body.memo;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [updatedRow],
      },
    });

    res.json({
      success: true,
      row: rowNum,
      post: rowToPost(updatedRow, rowNum - 1),
    });
  } catch (error) {
    console.error(`PUT /api/sheets/posts/${req.params.row} error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sheets/posts
 * 新しい行を末尾に追加する
 *
 * Body: { date?, time?, text, category?, topicTag?, articleUrl?, imageUrl?, status?, postId?, memo? }
 */
router.post('/posts', async (req, res) => {
  try {
    const body = req.body;

    if (!body.text || body.text.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'text field is required.',
      });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const sheetName = getSheetName();

    const newRow = postToRow({
      date: body.date || new Date().toISOString().split('T')[0],
      time: body.time || '',
      text: body.text,
      category: body.category || '',
      topicTag: body.topicTag || '',
      articleUrl: body.articleUrl || '',
      imageUrl: body.imageUrl || '',
      status: body.status || '下書き',
      postId: body.postId || '',
      memo: body.memo || '',
    });

    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [newRow],
      },
    });

    // Extract the actual row number from the updatedRange
    // updatedRange looks like "'投稿スケジュール'!A5:J5"
    const updatedRange = appendResponse.data.updates.updatedRange;
    const rowMatch = updatedRange.match(/!A(\d+):/);
    const appendedRow = rowMatch ? parseInt(rowMatch[1], 10) : null;

    res.status(201).json({
      success: true,
      row: appendedRow,
      post: rowToPost(newRow, appendedRow ? appendedRow - 1 : 0),
    });
  } catch (error) {
    console.error('POST /api/sheets/posts error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/sheets/posts/:row/status
 * ステータス列（H列）のみを更新する
 *
 * Body: { status: "下書き" | "承認済み" | "投稿済み" | "エラー" }
 */
router.patch('/posts/:row/status', async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row, 10);
    if (isNaN(rowNum) || rowNum < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid row number. Must be >= 2 (row 1 is the header).',
      });
    }

    const { status } = req.body;
    const validStatuses = ['下書き', '承認済み', '投稿済み', 'エラー'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const sheetName = getSheetName();

    // H column = column 8 (1-based)
    const range = `${sheetName}!H${rowNum}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status]],
      },
    });

    res.json({
      success: true,
      row: rowNum,
      status,
    });
  } catch (error) {
    console.error(`PATCH /api/sheets/posts/${req.params.row}/status error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
