// SaaS Knowledge Copilot Frontend Application Logic

let currentSessionId = localStorage.getItem('copilot_session_id') || null;
let isGenerating = false;

// DOM Elements
const docList = document.getElementById('doc-list');
const docCounter = document.getElementById('doc-counter');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const btnLoadSamples = document.getElementById('btn-load-samples');
const emptyDocsState = document.getElementById('empty-docs-state');

const tabKnowledgeBtn = document.getElementById('tab-knowledge-btn');
const tabHistoryBtn = document.getElementById('tab-history-btn');
const tabKnowledge = document.getElementById('tab-knowledge');
const tabHistory = document.getElementById('tab-history');
const sessionsList = document.getElementById('sessions-list');

const statChunks = document.getElementById('stat-chunks');
const activeSessionTitle = document.getElementById('active-session-title');
const btnNewChat = document.getElementById('btn-new-chat');
const btnClearSession = document.getElementById('btn-clear-session');

const welcomeHero = document.getElementById('welcome-hero');
const messagesContainer = document.getElementById('messages-container');
const messagesList = document.getElementById('messages-list');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const toastEl = document.getElementById('toast');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupUpload();
  setupComposer();
  loadDocuments();
  loadSystemStats();
  initSession();

  // Keyboard shortcut Ctrl+K / Cmd+K for new chat
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      startNewChat();
    }
  });
});

/* ==========================================================================
   Tab Navigation
   ========================================================================== */
function setupTabs() {
  tabKnowledgeBtn.addEventListener('click', () => {
    tabKnowledgeBtn.classList.add('active');
    tabHistoryBtn.classList.remove('active');
    tabKnowledge.classList.add('active');
    tabHistory.classList.remove('active');
  });

  tabHistoryBtn.addEventListener('click', () => {
    tabHistoryBtn.classList.add('active');
    tabKnowledgeBtn.classList.remove('active');
    tabHistory.classList.add('active');
    tabKnowledge.classList.remove('active');
    loadSessions();
  });
}

/* ==========================================================================
   Toast Notifications
   ========================================================================== */
function showToast(message, duration = 3000) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

/* ==========================================================================
   Document Management (Upload & Ingestion)
   ========================================================================== */
function setupUpload() {
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      uploadFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  btnLoadSamples.addEventListener('click', loadSampleDocuments);
}

async function uploadFiles(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  showToast(`Uploading & embedding ${files.length} document(s)...`);

  try {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Successfully indexed ${data.count} document(s)!`);
      loadDocuments();
      loadSystemStats();
    } else {
      showToast(`Error: ${data.error || 'Upload failed'}`);
    }
  } catch (err) {
    showToast('Failed to upload files. Check server connection.');
  }
}

async function loadSampleDocuments() {
  btnLoadSamples.disabled = true;
  btnLoadSamples.textContent = 'Ingesting Samples...';
  showToast('Chunking & embedding sample manuals...');

  try {
    const res = await fetch('/api/documents/load-samples', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Indexed ${data.documents.length} sample manuals!`);
      loadDocuments();
      loadSystemStats();
    } else {
      showToast(`Error: ${data.error || 'Failed to load samples'}`);
    }
  } catch (err) {
    showToast('Error loading sample manuals');
  } finally {
    btnLoadSamples.disabled = false;
    btnLoadSamples.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2"></polygon>
      </svg>
      Load Sample Knowledge Docs
    `;
  }
}

async function loadDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    const docs = data.documents || [];

    docCounter.textContent = docs.length;

    if (docs.length === 0) {
      docList.innerHTML = '';
      docList.appendChild(emptyDocsState);
      return;
    }

    docList.innerHTML = '';
    docs.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      const sizeKb = (doc.size / 1024).toFixed(1);
      card.innerHTML = `
        <div class="doc-info">
          <div class="doc-name" title="${doc.originalName}">${doc.originalName}</div>
          <div class="doc-meta">
            <span>${doc.chunkCount} chunks</span>
            <span>&bull;</span>
            <span>${sizeKb} KB</span>
          </div>
        </div>
        <button class="doc-delete-btn" title="Delete document" data-id="${doc.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      card.querySelector('.doc-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDocument(doc.id, doc.originalName);
      });

      docList.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load documents:', err);
  }
}

async function deleteDocument(id, name) {
  if (!confirm(`Remove "${name}" from vector knowledge base?`)) return;

  try {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`Removed "${name}"`);
      loadDocuments();
      loadSystemStats();
    }
  } catch (err) {
    showToast('Failed to delete document');
  }
}

async function loadSystemStats() {
  try {
    const res = await fetch('/api/system/stats');
    const data = await res.json();
    if (data.vectorStore) {
      statChunks.textContent = data.vectorStore.totalChunks;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

/* ==========================================================================
   Chat Session Management
   ========================================================================== */
function initSession() {
  btnNewChat.addEventListener('click', startNewChat);
  btnClearSession.addEventListener('click', clearCurrentSession);

  // Setup prompt cards click
  document.querySelectorAll('.prompt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        chatInput.value = prompt;
        btnSend.disabled = false;
        sendMessage();
      }
    });
  });

  if (currentSessionId) {
    loadSessionMessages(currentSessionId);
  }
}

async function startNewChat() {
  currentSessionId = null;
  localStorage.removeItem('copilot_session_id');
  activeSessionTitle.textContent = 'New Conversation';
  messagesList.innerHTML = '';
  welcomeHero.style.display = 'flex';
  chatInput.value = '';
  chatInput.focus();
}

async function clearCurrentSession() {
  if (!currentSessionId) {
    startNewChat();
    return;
  }
  if (!confirm('Clear all messages in this conversation?')) return;

  try {
    await fetch(`/api/chat/sessions/${currentSessionId}`, { method: 'DELETE' });
    startNewChat();
    showToast('Conversation cleared');
  } catch (err) {
    showToast('Error clearing conversation');
  }
}

async function loadSessions() {
  try {
    const res = await fetch('/api/chat/sessions');
    const data = await res.json();
    const sessions = data.sessions || [];

    sessionsList.innerHTML = '';
    if (sessions.length === 0) {
      sessionsList.innerHTML = `<div class="empty-state"><p>No chat history yet</p></div>`;
      return;
    }

    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = `session-item ${s.id === currentSessionId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="session-title">${s.title}</span>
        <button class="doc-delete-btn" title="Delete conversation" data-id="${s.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      item.addEventListener('click', () => {
        currentSessionId = s.id;
        localStorage.setItem('copilot_session_id', s.id);
        activeSessionTitle.textContent = s.title;
        loadSessionMessages(s.id);
        loadSessions();
      });

      item.querySelector('.doc-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`/api/chat/sessions/${s.id}`, { method: 'DELETE' });
        if (currentSessionId === s.id) {
          startNewChat();
        }
        loadSessions();
      });

      sessionsList.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

async function loadSessionMessages(sessionId) {
  try {
    const res = await fetch(`/api/chat/sessions/${sessionId}`);
    const data = await res.json();
    if (data.session && data.session.messages) {
      messagesList.innerHTML = '';
      if (data.session.messages.length > 0) {
        welcomeHero.style.display = 'none';
        data.session.messages.forEach((msg) => {
          renderMessage(msg.role, msg.content, msg.citations);
        });
        scrollToBottom();
      } else {
        welcomeHero.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('Failed to load session messages:', err);
  }
}

/* ==========================================================================
   Composer & Chat Streaming Engine
   ========================================================================== */
let activeTopicPrefix = '';

function setupComposer() {
  const topicChips = document.querySelectorAll('.topic-chip');
  topicChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      topicChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const topic = chip.getAttribute('data-topic');
      if (topic === 'workflows') activeTopicPrefix = '[Focus Area: Dynamic Order & Proposal Statuses, State Machines & Workflows] ';
      else if (topic === 'billing') activeTopicPrefix = '[Focus Area: Invoicing, Pricing, Taxes & GST Routing] ';
      else if (topic === 'inventory') activeTopicPrefix = '[Focus Area: Inventory, Stock Deduction & Batch/Expiry Tracking] ';
      else if (topic === 'security') activeTopicPrefix = '[Focus Area: User Roles, Permissions, BFS Subordinate Hierarchy & Multi-Tenancy] ';
      else if (topic === 'frontend') activeTopicPrefix = '[Focus Area: React 19 Frontend Screens, Navigation & UI Components] ';
      else activeTopicPrefix = '';
      chatInput.focus();
    });
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 140)}px`;
    btnSend.disabled = chatInput.value.trim().length === 0 || isGenerating;
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!btnSend.disabled) {
        sendMessage();
      }
    }
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!btnSend.disabled) {
      sendMessage();
    }
  });
}

function scrollToBottom() {
  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: 'smooth',
  });
}

async function sendMessage() {
  const rawQuery = chatInput.value.trim();
  if (!rawQuery || isGenerating) return;

  const query = activeTopicPrefix ? `${activeTopicPrefix}${rawQuery}` : rawQuery;

  isGenerating = true;
  btnSend.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  welcomeHero.style.display = 'none';

  // 1. Render User Message (display clean user query)
  renderMessage('user', rawQuery);
  scrollToBottom();

  // 2. Create Placeholder for AI Message with Streaming indicator
  const { bubbleEl, statusEl, textEl, citationsContainer } = createAssistantMessagePlaceholder();
  scrollToBottom();

  let accumulatedResponse = '';
  let citations = [];

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: query,
        topK: 4,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Parse SSE event and data
        let eventType = 'message';
        let eventData = null;

        const eventMatch = line.match(/^event:\s*(.+)$/m);
        if (eventMatch) {
          eventType = eventMatch[1].trim();
        }

        const dataMatch = line.match(/^data:\s*(.+)$/m);
        if (dataMatch) {
          try {
            eventData = JSON.parse(dataMatch[1].trim());
          } catch {
            eventData = dataMatch[1].trim();
          }
        }

        // Handle Events
        if (eventType === 'status') {
          if (eventData.sessionId) {
            currentSessionId = eventData.sessionId;
            localStorage.setItem('copilot_session_id', currentSessionId);
          }
          statusEl.textContent = eventData.message || 'Processing...';
        } else if (eventType === 'citations') {
          citations = eventData.citations || [];
        } else if (eventType === 'chunk') {
          statusEl.style.display = 'none';
          accumulatedResponse += eventData.text || '';
          textEl.innerHTML = marked.parse(accumulatedResponse) + '<span class="streaming-cursor"></span>';
          scrollToBottom();
        } else if (eventType === 'done') {
          if (eventData.sessionId) {
            currentSessionId = eventData.sessionId;
            localStorage.setItem('copilot_session_id', currentSessionId);
          }
          citations = eventData.citations || citations;
        } else if (eventType === 'error') {
          statusEl.style.display = 'none';
          textEl.innerHTML = `<span style="color: var(--danger)">Error: ${eventData.message}</span>`;
        }
      }
    }

    // Extract follow-ups and clean up response
    const { cleanedText, followups } = extractFollowupsAndCleanText(accumulatedResponse);
    textEl.innerHTML = marked.parse(cleanedText || 'No response generated.');

    // Add Copy Button
    addCopyButtonToBubble(bubbleEl, cleanedText);

    // Append Citations Box if citations exist
    if (citations && citations.length > 0) {
      renderCitations(citationsContainer, citations);
    }

    // Append Clickable Follow-up Suggestions
    if (followups && followups.length > 0) {
      renderFollowupChips(citationsContainer, followups);
    }

    loadSystemStats();
  } catch (err) {
    console.error('Chat stream failed:', err);
    statusEl.style.display = 'none';
    textEl.innerHTML = `<span style="color: var(--danger)">Connection error: Unable to complete stream.</span>`;
  } finally {
    isGenerating = false;
    btnSend.disabled = chatInput.value.trim().length === 0;
    scrollToBottom();
  }
}

function extractFollowupsAndCleanText(markdownText) {
  const markerRegex = /###\s*(?:💡\s*)?Suggested Follow-ups?:?\s*([\s\S]*)$/i;
  const match = markdownText.match(markerRegex);
  if (!match) {
    return { cleanedText: markdownText, followups: [] };
  }

  const cleanedText = markdownText.replace(markerRegex, '').trim();
  const followupsBlock = match[1];
  const followups = [];
  const lines = followupsBlock.split('\n');
  for (const line of lines) {
    const cleanLine = line.replace(/^[\s*\-•\d.]+\s*/, '').trim();
    if (cleanLine.length > 5) {
      followups.push(cleanLine);
    }
  }

  return { cleanedText, followups: followups.slice(0, 3) };
}

function renderFollowupChips(container, followups) {
  if (!followups || followups.length === 0) return;
  const box = document.createElement('div');
  box.className = 'followup-box';
  box.innerHTML = `
    <div class="followup-title">
      <span>💡 Suggested Follow-ups</span>
    </div>
  `;
  const list = document.createElement('div');
  list.className = 'followup-list';
  followups.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'followup-btn';
    btn.innerHTML = `
      <span>${escapeHtml(f)}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    btn.addEventListener('click', () => {
      chatInput.value = f;
      btnSend.disabled = false;
      sendMessage();
    });
    list.appendChild(btn);
  });
  box.appendChild(list);
  container.appendChild(box);
}

function addCopyButtonToBubble(bubble, text) {
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-copy-bubble';
  copyBtn.title = 'Copy response';
  copyBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(text);
    showToast('Copied response to clipboard!');
  });
  bubble.appendChild(copyBtn);
}

function renderMessage(role, content, citations = []) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  if (role === 'user') {
    row.innerHTML = `
      <div class="message-bubble">${escapeHtml(content)}</div>
    `;
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    const { cleanedText, followups } = extractFollowupsAndCleanText(content);
    bubble.innerHTML = marked.parse(cleanedText);

    addCopyButtonToBubble(bubble, cleanedText);

    if (citations && citations.length > 0) {
      const citationsContainer = document.createElement('div');
      renderCitations(citationsContainer, citations);
      bubble.appendChild(citationsContainer);
    }

    if (followups && followups.length > 0) {
      const followupsContainer = document.createElement('div');
      renderFollowupChips(followupsContainer, followups);
      bubble.appendChild(followupsContainer);
    }

    row.innerHTML = `
      <div class="message-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="url(#ai-avatar-grad)" stroke="none"/>
          <defs>
            <linearGradient id="ai-avatar-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#38bdf8"/>
              <stop offset="0.5" stop-color="#818cf8"/>
              <stop offset="1" stop-color="#c084fc"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    `;
    row.appendChild(bubble);
  }

  messagesList.appendChild(row);
}

function createAssistantMessagePlaceholder() {
  const row = document.createElement('div');
  row.className = 'message-row model';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="url(#ai-avatar-grad)" stroke="none"/>
    </svg>
  `;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const statusEl = document.createElement('div');
  statusEl.className = 'generating-indicator';
  statusEl.textContent = 'Searching indexed knowledge...';

  const textEl = document.createElement('div');
  textEl.className = 'message-text';

  const citationsContainer = document.createElement('div');

  bubble.appendChild(statusEl);
  bubble.appendChild(textEl);
  bubble.appendChild(citationsContainer);

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesList.appendChild(row);

  return { bubbleEl: bubble, statusEl, textEl, citationsContainer };
}

function renderCitations(container, citations) {
  const box = document.createElement('div');
  box.className = 'citation-box';

  const header = document.createElement('div');
  header.className = 'citation-header';
  header.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
    <span>${citations.length} Verified Sources Grounded</span>
  `;

  const items = document.createElement('div');
  items.className = 'citation-items';

  citations.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'citation-card';
    const matchPct = Math.round(c.similarity * 100);
    card.innerHTML = `
      <div class="citation-meta">
        <span class="citation-doc-name">${c.documentName} (Chunk #${c.chunkIndex + 1})</span>
        <span class="citation-score">${matchPct}% Relevance</span>
      </div>
      <div class="citation-excerpt">"${escapeHtml(c.excerpt)}"</div>
    `;
    items.appendChild(card);
  });

  box.appendChild(header);
  box.appendChild(items);
  container.appendChild(box);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
