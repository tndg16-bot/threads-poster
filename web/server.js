/**
 * Threads Poster — Web UI Dashboard Server
 *
 * Express server providing:
 *   - Static file serving (web/public/)
 *   - Google Sheets API (web/api/sheets.js)
 *   - Threads API (web/api/threads.js)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import sheetsRouter from './api/sheets.js';
import threadsRouter from './api/threads.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.WEB_PORT, 10) || 3456;

// --- Middleware ---

// CORS — allow all origins in dev; tighten in production via CORS_ORIGIN env
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// JSON body parser (limit 1MB for safety)
app.use(express.json({ limit: '1mb' }));

// Static files from web/public/
app.use(express.static(join(__dirname, 'public')));

// --- API Routes ---

app.use('/api/sheets', sheetsRouter);
app.use('/api/threads', threadsRouter);

// --- Health check ---

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      sheetsConfigured: !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
        (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY)
      ),
      spreadsheetId: !!process.env.GOOGLE_SPREADSHEET_ID,
      threadsToken: !!process.env.THREADS_ACCESS_TOKEN,
    },
  });
});

// --- 404 fallback for unknown API routes ---

app.use('/api/*', (_req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found.' });
});

// --- SPA fallback: serve index.html for non-API routes ---

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      // If index.html doesn't exist yet, return a helpful message
      res.status(200).send(
        '<!DOCTYPE html><html><head><title>Threads Poster</title></head>' +
        '<body><h1>Threads Poster Dashboard</h1>' +
        '<p>Place your frontend files in <code>web/public/</code></p>' +
        '<p>API is live at <code>/api/</code></p></body></html>'
      );
    }
  });
});

// --- Global error handler ---

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// --- Start server ---

app.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  Threads Poster — Web Dashboard              │');
  console.log(`│  URL: http://localhost:${PORT}                  │`);
  console.log('│                                               │');
  console.log('│  API endpoints:                               │');
  console.log('│    GET  /api/health                           │');
  console.log('│    GET  /api/sheets/posts                     │');
  console.log('│    POST /api/sheets/posts                     │');
  console.log('│    PUT  /api/sheets/posts/:row                │');
  console.log('│    PATCH /api/sheets/posts/:row/status        │');
  console.log('│    POST /api/threads/post                     │');
  console.log('│    POST /api/threads/post-with-reply          │');
  console.log('│    GET  /api/threads/quota                    │');
  console.log('│    GET  /api/threads/insights/:postId         │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
});

export default app;
