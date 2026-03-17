/**
 * Threads投稿マネージャー - Client-side Application
 *
 * Vanilla JS dashboard for managing Threads posts.
 * Communicates with the backend API endpoints:
 *   GET    /api/sheets/posts
 *   POST   /api/sheets/posts
 *   PATCH  /api/sheets/posts/:row/status
 *   DELETE /api/sheets/posts/:row
 *   POST   /api/threads/post-with-reply
 *   GET    /api/threads/quota
 *   GET    /api/threads/status
 *   GET    /api/sheets/status
 *   GET    /api/settings
 *   PATCH  /api/settings
 */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  posts: [],
  filteredPosts: [],
  currentFilter: 'all',
  dateFrom: '',
  dateTo: '',
  selectedPostIds: new Set(),
  currentTab: 'posts',
  pollingTimer: null,
  settings: {
    webhookUrl: '',
    autoPost: false,
  },
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = window.location.origin;

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };

  try {
    const response = await fetch(url, {
      headers: { ...defaultHeaders, ...options.headers },
      ...options,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || errorBody.message || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return null;
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error('サーバーに接続できません。バックエンドが起動しているか確認してください。');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = {
    success: 'bg-emerald-600 border-emerald-500',
    error: 'bg-red-600 border-red-500',
    info: 'bg-threads-600 border-threads-500',
    warning: 'bg-amber-600 border-amber-500',
  };

  const icons = {
    success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
    error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>',
  };

  const toast = document.createElement('div');
  toast.className = `toast-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${colors[type] || colors.info} text-white text-sm max-w-sm`;
  toast.innerHTML = `
    <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icons[type] || icons.info}</svg>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const cancelBtn = document.getElementById('confirm-cancel');
    const okBtn = document.getElementById('confirm-ok');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.remove('hidden');

    function cleanup(result) {
      modal.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      resolve(result);
    }

    function onCancel() { cleanup(false); }
    function onOk() { cleanup(true); }

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '--';
  return timeStr;
}

function truncate(str, len = 100) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function statusLabel(status) {
  const labels = {
    draft: '下書き',
    approved: '承認済み',
    posted: '投稿済み',
    error: 'エラー',
    pending: '待機中',
    published: '投稿済み',
    failed: 'エラー',
  };
  return labels[status] || status || '不明';
}

function statusColor(status) {
  const colors = {
    draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    posted: 'bg-threads-500/20 text-threads-400 border-threads-500/30',
    published: 'bg-threads-500/20 text-threads-400 border-threads-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };
  return colors[status] || colors.draft;
}

function categoryEmoji(category) {
  const emojis = {
    'マインドセット': '&#129504;',
    'AI': '&#129302;',
    'テクノロジー': '&#128187;',
    'ビジネス': '&#128188;',
    'コーチング': '&#127919;',
    '学習': '&#128218;',
    'ライフスタイル': '&#127968;',
  };
  return emojis[category] || '&#10024;';
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const indicator = document.getElementById('tab-indicator');

  function activateTab(tabName) {
    state.currentTab = tabName;

    // Update buttons
    tabBtns.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('text-white', isActive);
      btn.classList.toggle('text-gray-400', !isActive);
    });

    // Update indicator position
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn && indicator) {
      indicator.style.left = activeBtn.offsetLeft + 'px';
      indicator.style.width = activeBtn.offsetWidth + 'px';
    }

    // Show/hide content
    document.querySelectorAll('.tab-content').forEach((section) => {
      section.classList.toggle('hidden', section.id !== `tab-${tabName}`);
    });
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Initialize
  activateTab('posts');

  // Recalculate indicator on resize
  window.addEventListener('resize', () => {
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${state.currentTab}"]`);
    if (activeBtn && indicator) {
      indicator.style.left = activeBtn.offsetLeft + 'px';
      indicator.style.width = activeBtn.offsetWidth + 'px';
    }
  });
}

// ---------------------------------------------------------------------------
// Posts: Fetch & Render
// ---------------------------------------------------------------------------

async function fetchPosts() {
  try {
    const data = await api('/api/sheets/posts');
    state.posts = Array.isArray(data) ? data : (data?.posts || []);
    applyFilters();
    renderPosts();
    updateLastRefreshed();
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    // Show empty state without error toast on initial load if server is not running
    state.posts = [];
    applyFilters();
    renderPosts();
  }
}

function applyFilters() {
  let posts = [...state.posts];

  // Status filter
  if (state.currentFilter !== 'all') {
    posts = posts.filter((p) => {
      const s = (p.status || '').toLowerCase();
      if (state.currentFilter === 'posted') return s === 'posted' || s === 'published';
      if (state.currentFilter === 'error') return s === 'error' || s === 'failed';
      return s === state.currentFilter;
    });
  }

  // Date range filter
  if (state.dateFrom) {
    const from = new Date(state.dateFrom);
    posts = posts.filter((p) => new Date(p.date || p.scheduledDate || 0) >= from);
  }
  if (state.dateTo) {
    const to = new Date(state.dateTo);
    to.setHours(23, 59, 59, 999);
    posts = posts.filter((p) => new Date(p.date || p.scheduledDate || 0) <= to);
  }

  state.filteredPosts = posts;
}

function renderPosts() {
  const grid = document.getElementById('posts-grid');
  const emptyEl = document.getElementById('posts-empty');

  // Remove skeleton cards
  grid.querySelectorAll('.skeleton-card').forEach((el) => el.remove());

  if (state.filteredPosts.length === 0) {
    grid.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  grid.innerHTML = state.filteredPosts
    .map((post, index) => renderPostCard(post, index))
    .join('');

  // Attach event listeners
  attachPostCardListeners();
  updateBulkActionsBar();
}

function renderPostCard(post, index) {
  const rowId = post.row ?? post.id ?? index;
  const status = (post.status || 'draft').toLowerCase();
  const isSelected = state.selectedPostIds.has(String(rowId));
  const text = post.text || post.threadContent || post.content || '';
  const category = post.category || '';
  const topicTag = post.topicTag || post.topic_tag || '';
  const articleUrl = post.articleUrl || post.url || '';
  const date = post.date || post.scheduledDate || '';
  const time = post.time || post.scheduledTime || '';

  return `
    <div class="card-hover rounded-2xl bg-slate-800/50 border border-slate-700/30 p-5 flex flex-col" data-row="${escapeHtml(String(rowId))}">
      <!-- Header -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <input type="checkbox" class="post-checkbox w-4 h-4 rounded bg-slate-700 border-slate-600 text-threads-500 focus:ring-threads-500"
            data-row="${escapeHtml(String(rowId))}" ${isSelected ? 'checked' : ''}>
          <span class="text-xs text-gray-500">${escapeHtml(formatDate(date))}</span>
          ${time ? `<span class="text-xs text-gray-600">${escapeHtml(formatTime(time))}</span>` : ''}
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full border ${statusColor(status)}">
          ${escapeHtml(statusLabel(status))}
        </span>
      </div>

      <!-- Text -->
      <div class="flex-1 mb-3">
        <div class="post-text-display cursor-pointer group" data-row="${escapeHtml(String(rowId))}">
          <p class="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words group-hover:text-white transition-colors">${escapeHtml(text)}</p>
          <span class="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">クリックで編集</span>
        </div>
        <div class="post-text-edit hidden" data-row="${escapeHtml(String(rowId))}">
          <textarea class="edit-textarea w-full px-3 py-2 rounded-lg bg-slate-900 border border-threads-500 text-sm text-gray-200 resize-none scrollbar-thin" rows="4" maxlength="500">${escapeHtml(text)}</textarea>
          <div class="flex items-center justify-between mt-1.5">
            <span class="edit-char-count text-xs text-gray-500">${text.length}/500</span>
            <div class="flex gap-1.5">
              <button class="edit-cancel px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 transition-colors">キャンセル</button>
              <button class="edit-save px-2 py-1 text-xs rounded bg-threads-600 hover:bg-threads-500 transition-colors font-medium">保存</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Badges -->
      <div class="flex flex-wrap gap-1.5 mb-3">
        ${category ? `<span class="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-gray-300 border border-slate-600/30">${categoryEmoji(category)} ${escapeHtml(category)}</span>` : ''}
        ${topicTag ? `<span class="text-xs px-2 py-0.5 rounded-full bg-threads-500/10 text-threads-400 border border-threads-500/20">#${escapeHtml(topicTag)}</span>` : ''}
      </div>

      <!-- Article URL -->
      ${articleUrl ? `
        <a href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener noreferrer"
          class="text-xs text-threads-400 hover:text-threads-300 truncate block mb-3 transition-colors">
          ${escapeHtml(truncate(articleUrl, 50))}
        </a>
      ` : ''}

      <!-- Actions -->
      <div class="flex gap-1.5 mt-auto pt-2 border-t border-slate-700/30">
        ${status === 'draft' ? `
          <button class="action-approve flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors" data-row="${escapeHtml(String(rowId))}">
            承認
          </button>
        ` : ''}
        ${status === 'draft' || status === 'approved' ? `
          <button class="action-edit flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-slate-700/50 text-gray-300 hover:bg-slate-700 transition-colors" data-row="${escapeHtml(String(rowId))}">
            編集
          </button>
        ` : ''}
        ${status === 'approved' ? `
          <button class="action-post flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-threads-600/20 text-threads-400 hover:bg-threads-600/30 transition-colors" data-row="${escapeHtml(String(rowId))}">
            投稿
          </button>
        ` : ''}
        <button class="action-delete px-2 py-1.5 text-xs font-medium rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-colors" data-row="${escapeHtml(String(rowId))}">
          削除
        </button>
      </div>
    </div>
  `;
}

function attachPostCardListeners() {
  // Checkbox selection
  document.querySelectorAll('.post-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const row = e.target.dataset.row;
      if (e.target.checked) {
        state.selectedPostIds.add(row);
      } else {
        state.selectedPostIds.delete(row);
      }
      updateBulkActionsBar();
    });
  });

  // Click-to-edit text
  document.querySelectorAll('.post-text-display').forEach((el) => {
    el.addEventListener('click', () => {
      const row = el.dataset.row;
      el.classList.add('hidden');
      const editEl = document.querySelector(`.post-text-edit[data-row="${row}"]`);
      editEl?.classList.remove('hidden');
      const textarea = editEl?.querySelector('.edit-textarea');
      textarea?.focus();
    });
  });

  // Edit textarea char counter
  document.querySelectorAll('.edit-textarea').forEach((textarea) => {
    textarea.addEventListener('input', () => {
      const counter = textarea.closest('.post-text-edit')?.querySelector('.edit-char-count');
      if (counter) {
        counter.textContent = `${textarea.value.length}/500`;
        counter.classList.toggle('text-red-400', textarea.value.length >= 490);
        counter.classList.toggle('text-gray-500', textarea.value.length < 490);
      }
    });
  });

  // Edit cancel
  document.querySelectorAll('.edit-cancel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const editEl = btn.closest('.post-text-edit');
      const row = editEl?.dataset.row;
      editEl?.classList.add('hidden');
      document.querySelector(`.post-text-display[data-row="${row}"]`)?.classList.remove('hidden');
    });
  });

  // Edit save
  document.querySelectorAll('.edit-save').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const editEl = btn.closest('.post-text-edit');
      const row = editEl?.dataset.row;
      const textarea = editEl?.querySelector('.edit-textarea');
      const newText = textarea?.value;

      if (!row || !newText) return;

      try {
        await api(`/api/sheets/posts/${row}`, {
          method: 'PATCH',
          body: JSON.stringify({ text: newText }),
        });
        showToast('投稿文を更新しました', 'success');
        await fetchPosts();
      } catch (error) {
        showToast(`更新に失敗しました: ${error.message}`, 'error');
      }
    });
  });

  // Approve
  document.querySelectorAll('.action-approve').forEach((btn) => {
    btn.addEventListener('click', () => approvePost(btn.dataset.row));
  });

  // Edit (triggers inline edit)
  document.querySelectorAll('.action-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.dataset.row;
      const displayEl = document.querySelector(`.post-text-display[data-row="${row}"]`);
      displayEl?.click();
    });
  });

  // Post to Threads
  document.querySelectorAll('.action-post').forEach((btn) => {
    btn.addEventListener('click', () => postToThreads(btn.dataset.row));
  });

  // Delete
  document.querySelectorAll('.action-delete').forEach((btn) => {
    btn.addEventListener('click', () => deletePost(btn.dataset.row));
  });
}

// ---------------------------------------------------------------------------
// Bulk Actions
// ---------------------------------------------------------------------------

function updateBulkActionsBar() {
  const bar = document.getElementById('bulk-actions');
  const countEl = document.getElementById('selected-count');
  const selectAllCb = document.getElementById('select-all');
  const count = state.selectedPostIds.size;

  countEl.textContent = count;

  if (count > 0) {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }

  if (selectAllCb) {
    selectAllCb.checked = count > 0 && count === state.filteredPosts.length;
  }
}

function initBulkActions() {
  const selectAllCb = document.getElementById('select-all');
  selectAllCb?.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.filteredPosts.forEach((p) => {
        const rowId = String(p.row ?? p.id ?? '');
        if (rowId) state.selectedPostIds.add(rowId);
      });
    } else {
      state.selectedPostIds.clear();
    }
    renderPosts();
  });

  document.getElementById('bulk-approve')?.addEventListener('click', async () => {
    if (state.selectedPostIds.size === 0) return;
    const confirmed = await showConfirm('一括承認', `${state.selectedPostIds.size}件の投稿を承認しますか？`);
    if (!confirmed) return;

    let successCount = 0;
    for (const row of state.selectedPostIds) {
      try {
        await api(`/api/sheets/posts/${row}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' }),
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to approve row ${row}:`, error);
      }
    }

    showToast(`${successCount}件を承認しました`, 'success');
    state.selectedPostIds.clear();
    await fetchPosts();
  });

  document.getElementById('bulk-post')?.addEventListener('click', async () => {
    if (state.selectedPostIds.size === 0) return;
    const confirmed = await showConfirm('一括投稿', `${state.selectedPostIds.size}件の投稿をThreadsに投稿しますか？`);
    if (!confirmed) return;

    let successCount = 0;
    for (const row of state.selectedPostIds) {
      try {
        await postToThreadsSingle(row);
        successCount++;
      } catch (error) {
        console.error(`Failed to post row ${row}:`, error);
      }
    }

    showToast(`${successCount}件を投稿しました`, 'success');
    state.selectedPostIds.clear();
    await fetchPosts();
  });
}

// ---------------------------------------------------------------------------
// Post Actions
// ---------------------------------------------------------------------------

async function approvePost(row) {
  try {
    await api(`/api/sheets/posts/${row}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    showToast('投稿を承認しました', 'success');
    await fetchPosts();
  } catch (error) {
    showToast(`承認に失敗しました: ${error.message}`, 'error');
  }
}

async function postToThreads(row) {
  const post = state.posts.find((p) => String(p.row ?? p.id) === String(row));
  if (!post) return;

  const confirmed = await showConfirm('Threadsに投稿', 'この投稿をThreadsに投稿しますか？');
  if (!confirmed) return;

  await postToThreadsSingle(row);
  await fetchPosts();
}

async function postToThreadsSingle(row) {
  const post = state.posts.find((p) => String(p.row ?? p.id) === String(row));
  if (!post) throw new Error('投稿が見つかりません');

  try {
    const text = post.text || post.threadContent || post.content || '';
    const articleUrl = post.articleUrl || post.url || '';
    const topicTag = post.topicTag || post.topic_tag || '';

    await api('/api/threads/post-with-reply', {
      method: 'POST',
      body: JSON.stringify({
        text,
        articleUrl,
        topicTag,
        row,
      }),
    });

    showToast('Threadsに投稿しました', 'success');
  } catch (error) {
    showToast(`投稿に失敗しました: ${error.message}`, 'error');
    throw error;
  }
}

async function deletePost(row) {
  const confirmed = await showConfirm('投稿を削除', 'この投稿を削除しますか？この操作は取り消せません。');
  if (!confirmed) return;

  try {
    await api(`/api/sheets/posts/${row}`, {
      method: 'DELETE',
    });
    showToast('投稿を削除しました', 'success');
    await fetchPosts();
  } catch (error) {
    showToast(`削除に失敗しました: ${error.message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function initFilters() {
  // Status filter buttons
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => {
        b.classList.remove('active', 'bg-threads-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-gray-400');
      });
      btn.classList.add('active', 'bg-threads-600', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-gray-400');

      state.currentFilter = btn.dataset.status;
      state.selectedPostIds.clear();
      applyFilters();
      renderPosts();
    });
  });

  // Date range filters
  document.getElementById('filter-date-from')?.addEventListener('change', (e) => {
    state.dateFrom = e.target.value;
    applyFilters();
    renderPosts();
  });

  document.getElementById('filter-date-to')?.addEventListener('change', (e) => {
    state.dateTo = e.target.value;
    applyFilters();
    renderPosts();
  });
}

// ---------------------------------------------------------------------------
// Create Form
// ---------------------------------------------------------------------------

function initCreateForm() {
  const textArea = document.getElementById('create-text');
  const charCount = document.getElementById('char-count');
  const dateInput = document.getElementById('create-date');
  const timeInput = document.getElementById('create-time');
  const imageUrlInput = document.getElementById('create-image-url');
  const imagePreview = document.getElementById('image-preview');
  const imagePreviewImg = document.getElementById('image-preview-img');

  // Set default date to today
  if (dateInput) {
    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];
  }

  // Character counter
  textArea?.addEventListener('input', () => {
    const count = textArea.value.length;
    charCount.textContent = count;

    if (count >= 490) {
      charCount.classList.add('text-red-400');
      charCount.classList.remove('text-gray-500');
    } else if (count >= 400) {
      charCount.classList.add('text-amber-400');
      charCount.classList.remove('text-gray-500', 'text-red-400');
    } else {
      charCount.classList.remove('text-red-400', 'text-amber-400');
      charCount.classList.add('text-gray-500');
    }
  });

  // Time presets
  document.querySelectorAll('.time-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-preset').forEach((b) => {
        b.classList.remove('border-threads-500', 'text-threads-400');
        b.classList.add('border-slate-700', 'text-gray-400');
      });
      btn.classList.add('border-threads-500', 'text-threads-400');
      btn.classList.remove('border-slate-700', 'text-gray-400');
      if (timeInput) {
        timeInput.value = btn.dataset.time;
      }
    });
  });

  // Image preview
  let imageDebounce = null;
  imageUrlInput?.addEventListener('input', () => {
    clearTimeout(imageDebounce);
    imageDebounce = setTimeout(() => {
      const url = imageUrlInput.value.trim();
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        imagePreviewImg.src = url;
        imagePreviewImg.onload = () => imagePreview.classList.remove('hidden');
        imagePreviewImg.onerror = () => imagePreview.classList.add('hidden');
      } else {
        imagePreview.classList.add('hidden');
      }
    }, 500);
  });

  // Save Draft
  document.getElementById('save-draft')?.addEventListener('click', () => {
    submitCreateForm('draft');
  });

  // Save Approved
  document.getElementById('save-approved')?.addEventListener('click', () => {
    submitCreateForm('approved');
  });
}

async function submitCreateForm(status) {
  const text = document.getElementById('create-text')?.value?.trim();
  if (!text) {
    showToast('投稿文を入力してください', 'warning');
    return;
  }

  const payload = {
    date: document.getElementById('create-date')?.value || '',
    time: document.getElementById('create-time')?.value || '',
    text,
    category: document.getElementById('create-category')?.value || '',
    topicTag: document.getElementById('create-topic-tag')?.value?.replace(/[.&]/g, '')?.slice(0, 50) || '',
    articleUrl: document.getElementById('create-url')?.value?.trim() || '',
    imageUrl: document.getElementById('create-image-url')?.value?.trim() || '',
    status,
  };

  try {
    await api('/api/sheets/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    showToast(status === 'draft' ? '下書きを保存しました' : '承認済みとして保存しました', 'success');
    resetCreateForm();

    // Switch to posts tab to see the new post
    document.querySelector('.tab-btn[data-tab="posts"]')?.click();
    await fetchPosts();
  } catch (error) {
    showToast(`保存に失敗しました: ${error.message}`, 'error');
  }
}

function resetCreateForm() {
  document.getElementById('create-text').value = '';
  document.getElementById('create-category').value = '';
  document.getElementById('create-topic-tag').value = '';
  document.getElementById('create-url').value = '';
  document.getElementById('create-image-url').value = '';
  document.getElementById('image-preview')?.classList.add('hidden');
  document.getElementById('char-count').textContent = '0';
  document.getElementById('char-count').classList.remove('text-red-400', 'text-amber-400');
  document.getElementById('char-count').classList.add('text-gray-500');

  // Reset time presets
  document.querySelectorAll('.time-preset').forEach((b) => {
    b.classList.remove('border-threads-500', 'text-threads-400');
    b.classList.add('border-slate-700', 'text-gray-400');
  });
}

// ---------------------------------------------------------------------------
// Buzz Template
// ---------------------------------------------------------------------------

function initBuzzTemplates() {
  document.querySelectorAll('.buzz-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const template = btn.dataset.template?.replace(/\\n/g, '\n') || '';

      // Switch to create tab
      document.querySelector('.tab-btn[data-tab="create"]')?.click();

      // Fill in the template
      const textarea = document.getElementById('create-text');
      if (textarea) {
        textarea.value = template;
        textarea.dispatchEvent(new Event('input'));
        textarea.focus();
        textarea.setSelectionRange(0, 0);
      }

      showToast('テンプレートを挿入しました', 'info');
    });
  });
}

// ---------------------------------------------------------------------------
// Analytics / Performance
// ---------------------------------------------------------------------------

async function fetchPerformance() {
  const grid = document.getElementById('performance-grid');

  // Find posted items from current posts
  const postedPosts = state.posts.filter((p) => {
    const s = (p.status || '').toLowerCase();
    return s === 'posted' || s === 'published';
  });

  if (postedPosts.length === 0) {
    grid.innerHTML = `
      <div class="text-center py-12 col-span-full">
        <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-800 flex items-center justify-center">
          <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
        </div>
        <p class="text-sm text-gray-500">投稿済みの投稿があるとパフォーマンスデータが表示されます</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = postedPosts
    .map((post) => {
      const text = post.text || post.threadContent || post.content || '';
      const views = post.metrics?.views ?? post.views ?? '--';
      const likes = post.metrics?.likes ?? post.likes ?? '--';
      const replies = post.metrics?.replies ?? post.replies ?? '--';
      const date = post.date || post.scheduledDate || '';

      return `
        <div class="rounded-2xl bg-slate-800/50 border border-slate-700/30 p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs text-gray-500">${escapeHtml(formatDate(date))}</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-threads-500/20 text-threads-400 border border-threads-500/30">投稿済み</span>
          </div>
          <p class="text-sm text-gray-300 mb-4 line-clamp-3">${escapeHtml(truncate(text, 120))}</p>
          <div class="grid grid-cols-3 gap-3">
            <div class="text-center p-2 rounded-lg bg-slate-900/50">
              <div class="text-lg font-bold text-gray-200">${escapeHtml(String(views))}</div>
              <div class="text-xs text-gray-500">表示</div>
            </div>
            <div class="text-center p-2 rounded-lg bg-slate-900/50">
              <div class="text-lg font-bold text-red-400">${escapeHtml(String(likes))}</div>
              <div class="text-xs text-gray-500">いいね</div>
            </div>
            <div class="text-center p-2 rounded-lg bg-slate-900/50">
              <div class="text-lg font-bold text-blue-400">${escapeHtml(String(replies))}</div>
              <div class="text-xs text-gray-500">リプライ</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

async function fetchQuota() {
  try {
    const data = await api('/api/threads/quota');
    const remaining = data?.remaining ?? data?.data?.[0]?.config?.quota_total
      ? (data.data[0].config.quota_total - (data.data[0].quota_usage || 0))
      : null;

    if (remaining !== null && remaining !== undefined) {
      const total = data?.total ?? data?.data?.[0]?.config?.quota_total ?? 250;
      updateQuotaDisplay(remaining, total);
    }
  } catch (error) {
    console.error('Failed to fetch quota:', error);
  }
}

function updateQuotaDisplay(remaining, total = 250) {
  const quotaEl = document.getElementById('quota-display');
  const remainingEl = document.getElementById('quota-remaining');

  quotaEl?.classList.remove('hidden');
  quotaEl?.classList.add('sm:flex');

  if (remainingEl) {
    remainingEl.textContent = remaining;
    if (remaining < 10) {
      remainingEl.classList.remove('text-emerald-400');
      remainingEl.classList.add('text-red-400');
    } else if (remaining < 50) {
      remainingEl.classList.remove('text-emerald-400');
      remainingEl.classList.add('text-amber-400');
    } else {
      remainingEl.classList.remove('text-red-400', 'text-amber-400');
      remainingEl.classList.add('text-emerald-400');
    }
  }

  // Update settings page quota
  const settingsQuotaText = document.getElementById('settings-quota-text');
  const settingsQuotaBar = document.getElementById('settings-quota-bar');
  const quotaDetailEl = document.getElementById('threads-quota-detail');

  if (settingsQuotaText) {
    settingsQuotaText.textContent = `${total - remaining} / ${total}`;
  }
  if (settingsQuotaBar) {
    const percent = ((total - remaining) / total) * 100;
    settingsQuotaBar.style.width = `${percent}%`;

    if (percent > 80) {
      settingsQuotaBar.classList.remove('from-threads-500', 'to-threads-400');
      settingsQuotaBar.classList.add('from-red-500', 'to-red-400');
    } else if (percent > 60) {
      settingsQuotaBar.classList.remove('from-threads-500', 'to-threads-400');
      settingsQuotaBar.classList.add('from-amber-500', 'to-amber-400');
    }
  }
  quotaDetailEl?.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function initSettings() {
  // Check Sheets connection
  document.getElementById('check-sheets')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('sheets-status');
    statusEl.innerHTML = `
      <div class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></div>
      <span class="text-xs text-amber-400">確認中...</span>
    `;

    try {
      await api('/api/sheets/status');
      statusEl.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
        <span class="text-xs text-emerald-400">接続済み</span>
      `;
      showToast('Google Sheetsに接続できました', 'success');
    } catch (error) {
      statusEl.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-red-400"></div>
        <span class="text-xs text-red-400">接続エラー</span>
      `;
      showToast(`Google Sheets接続エラー: ${error.message}`, 'error');
    }
  });

  // Check Threads connection
  document.getElementById('check-threads')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('threads-status');
    statusEl.innerHTML = `
      <div class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></div>
      <span class="text-xs text-amber-400">確認中...</span>
    `;

    try {
      const data = await api('/api/threads/status');
      statusEl.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
        <span class="text-xs text-emerald-400">接続済み${data?.username ? ` (@${data.username})` : ''}</span>
      `;
      showToast('Threads APIに接続できました', 'success');

      // Also fetch quota
      await fetchQuota();
    } catch (error) {
      statusEl.innerHTML = `
        <div class="w-2.5 h-2.5 rounded-full bg-red-400"></div>
        <span class="text-xs text-red-400">接続エラー</span>
      `;
      showToast(`Threads API接続エラー: ${error.message}`, 'error');
    }
  });

  // Save webhook URL
  document.getElementById('save-webhook')?.addEventListener('click', async () => {
    const url = document.getElementById('n8n-webhook-url')?.value?.trim() || '';

    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ webhookUrl: url }),
      });
      state.settings.webhookUrl = url;
      showToast('Webhook URLを保存しました', 'success');
    } catch (error) {
      showToast(`保存に失敗しました: ${error.message}`, 'error');
    }
  });

  // Auto-post toggle
  const autoPostToggle = document.getElementById('auto-post-toggle');
  const scheduleInfo = document.getElementById('schedule-info');

  autoPostToggle?.addEventListener('change', async () => {
    const enabled = autoPostToggle.checked;

    if (scheduleInfo) {
      scheduleInfo.classList.toggle('hidden', !enabled);
    }

    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ autoPost: enabled }),
      });
      state.settings.autoPost = enabled;
      showToast(enabled ? '自動投稿を有効にしました' : '自動投稿を無効にしました', 'success');
    } catch (error) {
      showToast(`設定の更新に失敗しました: ${error.message}`, 'error');
      // Revert toggle
      autoPostToggle.checked = !enabled;
      scheduleInfo?.classList.toggle('hidden', enabled);
    }
  });

  // Load settings
  loadSettings();
}

async function loadSettings() {
  try {
    const data = await api('/api/settings');
    if (data) {
      state.settings = { ...state.settings, ...data };

      const webhookInput = document.getElementById('n8n-webhook-url');
      if (webhookInput && data.webhookUrl) {
        webhookInput.value = data.webhookUrl;
      }

      const autoPostToggle = document.getElementById('auto-post-toggle');
      if (autoPostToggle) {
        autoPostToggle.checked = !!data.autoPost;
        document.getElementById('schedule-info')?.classList.toggle('hidden', !data.autoPost);
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// ---------------------------------------------------------------------------
// Polling & Refresh
// ---------------------------------------------------------------------------

function startPolling() {
  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
  }

  state.pollingTimer = setInterval(async () => {
    if (document.hidden) return; // Don't poll when tab is not visible
    await fetchPosts();
    if (state.currentTab === 'analytics') {
      await fetchPerformance();
    }
  }, 30000);
}

function updateLastRefreshed() {
  const el = document.getElementById('last-refreshed');
  if (el) {
    const now = new Date();
    el.textContent = `最終更新: ${now.toLocaleTimeString('ja-JP')}`;
  }
}

// ---------------------------------------------------------------------------
// Refresh button
// ---------------------------------------------------------------------------

function initRefreshButton() {
  const btn = document.getElementById('refresh-btn');
  btn?.addEventListener('click', async () => {
    const svg = btn.querySelector('svg');
    svg?.classList.add('animate-spin');

    await fetchPosts();
    await fetchQuota();

    if (state.currentTab === 'analytics') {
      await fetchPerformance();
    }

    setTimeout(() => svg?.classList.remove('animate-spin'), 500);
    showToast('データを更新しました', 'info');
  });
}

// ---------------------------------------------------------------------------
// Visibility change handler
// ---------------------------------------------------------------------------

function initVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchPosts();
    }
  });
}

// ---------------------------------------------------------------------------
// Tab change handlers for analytics
// ---------------------------------------------------------------------------

function initTabChangeHandlers() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'analytics') {
        fetchPerformance();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFilters();
  initCreateForm();
  initBulkActions();
  initBuzzTemplates();
  initSettings();
  initRefreshButton();
  initVisibilityHandler();
  initTabChangeHandlers();

  // Initial data fetch
  fetchPosts();
  fetchQuota();

  // Start polling
  startPolling();
});
