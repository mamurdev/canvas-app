const BACKEND = 'https://canvas-app-production-32ea.up.railway.app';

let token = localStorage.getItem('canvas_token') || '';
let currentPage = 'dashboard';
let courses = [];
let profile = {};

async function api(endpoint) {
  const res = await fetch(`${BACKEND}${endpoint}`, {
    headers: { 'x-canvas-token': token }
  });
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${BACKEND}${endpoint}`, {
    method: 'POST',
    headers: { 'x-canvas-token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function login() {
  const input = document.getElementById('token-input').value.trim();
  if (!input) return alert('Please enter your password');
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  try {
    const loginRes = await fetch(`${BACKEND}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input })
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      token = data.token;
    } else {
      token = input; // fallback: treat input as API token directly
    }
    profile = await api('/api/profile');
    if (profile.errors || !profile.name) throw new Error('Invalid');
    localStorage.setItem('canvas_token', token);
    showApp();
  } catch (e) {
    alert('Could not connect. Please check your credentials.');
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

function logout() {
  localStorage.removeItem('canvas_token');
  token = '';
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  const name = profile.name || 'Student';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-avatar').textContent = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  try {
    const data = await api('/api/courses');
    courses = Array.isArray(data) ? data.filter(c => c.name) : [];
  } catch (e) { courses = []; }
  navigate('dashboard');
}

function navigate(page, e) {
  if (e) e.preventDefault();
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const idx = ['dashboard', 'courses', 'assignments', 'grades', 'messages'].indexOf(page);
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems[idx]) navItems[idx].classList.add('active');
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  ({ dashboard: renderDashboard, courses: renderCourses, assignments: renderAssignments, grades: renderGrades, messages: renderMessages })[page]?.();
}

function formatDate(d) {
  if (!d) return 'No due date';
  const date = new Date(d), now = new Date(), diff = date - now, days = Math.floor(diff / 86400000);
  if (diff < 0) return `Overdue (${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function dateClass(d) {
  if (!d) return '';
  const diff = new Date(d) - new Date();
  if (diff < 0) return 'overdue';
  if (diff < 172800000) return 'due-soon';
  return '';
}

function badge(sub) {
  if (!sub || sub.workflow_state === 'unsubmitted') return '<span class="badge badge-pending">Pending</span>';
  if (sub.workflow_state === 'submitted') return '<span class="badge badge-submitted">Submitted</span>';
  if (sub.workflow_state === 'graded') return '<span class="badge badge-graded">Graded</span>';
  if (sub.missing) return '<span class="badge badge-missing">Missing</span>';
  return '<span class="badge badge-pending">Pending</span>';
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `
    <div class="page-header"><h2>Dashboard</h2><p>Welcome back, ${profile.name?.split(' ')[0] || 'Student'}</p></div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Active Courses</div><div class="stat-value">${courses.length}</div></div>
      <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" id="s-pending">—</div></div>
      <div class="stat-card"><div class="stat-label">Due Soon</div><div class="stat-value" id="s-due">—</div></div>
    </div>
    <div class="section-title">Upcoming Assignments</div>
    <div id="dash-assignments"><div class="loading"><div class="spinner"></div><span>Loading...</span></div></div>`;
  const all = [];
  await Promise.all(courses.slice(0, 8).map(async c => {
    try {
      const a = await api(`/api/courses/${c.id}/assignments`);
      if (Array.isArray(a)) { a.forEach(x => { x._courseName = c.name; x._courseId = c.id; }); all.push(...a); }
    } catch (e) {}
  }));
  const now = new Date();
  const upcoming = all.filter(a => a.due_at && new Date(a.due_at) > now).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)).slice(0, 10);
  const pending = all.filter(a => !a.submission || (a.submission.workflow_state !== 'submitted' && a.submission.workflow_state !== 'graded'));
  const dueSoon = all.filter(a => { if (!a.due_at) return false; const d = new Date(a.due_at) - now; return d > 0 && d < 259200000; });
  document.getElementById('s-pending').textContent = pending.length;
  document.getElementById('s-due').textContent = dueSoon.length;
  const c = document.getElementById('dash-assignments');
  if (!upcoming.length) { c.innerHTML = '<div class="empty-state"><p>No upcoming assignments 🎉</p></div>'; return; }
  c.innerHTML = upcoming.map(a => `
    <div class="assignment-item" onclick="openAssignmentDetail(${a._courseId}, ${a.id})">
      <div class="assignment-info">
        <div class="assignment-title">${a.name}</div>
        <div class="assignment-course">${a._courseName}</div>
      </div>
      <div class="assignment-meta">
        <div class="due-date ${dateClass(a.due_at)}">${formatDate(a.due_at)}</div>
        ${badge(a.submission)}
      </div>
    </div>`).join('');
}

// ─── Courses ────────────────────────────────────────────────────────────────
function renderCourses() {
  const el = document.getElementById('page-courses');
  if (!courses.length) { el.innerHTML = '<div class="page-header"><h2>Courses</h2></div><div class="empty-state"><p>No active courses found.</p></div>'; return; }
  el.innerHTML = `
    <div class="page-header"><h2>My Courses</h2><p>${courses.length} active courses this semester</p></div>
    <div class="card-grid">
      ${courses.map((c, i) => `
        <div class="course-card" onclick="selectAndNavigate(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
          <div class="course-card-bar c${i % 8}"></div>
          <div class="course-card-body">
            <div class="course-card-name">${c.name}</div>
            <div class="course-card-code">${c.course_code || ''}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function selectAndNavigate(id, name) {
  window._selectedCourse = { id, name };
  navigate('assignments');
}

// ─── Assignments ────────────────────────────────────────────────────────────
async function renderAssignments() {
  const el = document.getElementById('page-assignments');
  const sel = window._selectedCourse || (courses[0] ? { id: courses[0].id, name: courses[0].name } : null);
  if (!sel) { el.innerHTML = '<div class="empty-state"><p>No courses found.</p></div>'; return; }
  el.innerHTML = `
    <div class="page-header"><h2>Assignments</h2><p>Select a course to view its assignments</p></div>
    <div class="course-selector">
      ${courses.map(c => `<div class="course-chip ${c.id === sel.id ? 'active' : ''}" onclick="switchCourse(${c.id}, '${c.name.replace(/'/g, "\\'")}', this)">${c.name.length > 28 ? c.name.slice(0, 28) + '…' : c.name}</div>`).join('')}
    </div>
    <div id="assignment-list"><div class="loading"><div class="spinner"></div><span>Loading...</span></div></div>`;
  loadAssignments(sel.id);
}

function switchCourse(id, name, el) {
  window._selectedCourse = { id, name };
  document.querySelectorAll('.course-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('assignment-list').innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading...</span></div>';
  loadAssignments(id);
}

async function loadAssignments(courseId) {
  try {
    const data = await api(`/api/courses/${courseId}/assignments`);
    const c = document.getElementById('assignment-list');
    if (!Array.isArray(data) || !data.length) { c.innerHTML = '<div class="empty-state"><p>No assignments for this course.</p></div>'; return; }
    const sorted = [...data].sort((a, b) => !a.due_at ? 1 : !b.due_at ? -1 : new Date(a.due_at) - new Date(b.due_at));
    c.innerHTML = sorted.map(a => `
      <div class="assignment-item" onclick="openAssignmentDetail(${courseId}, ${a.id})">
        <div class="assignment-info">
          <div class="assignment-title">${a.name}</div>
          <div class="assignment-course">${a.points_possible != null ? a.points_possible + ' pts' : 'Ungraded'}</div>
        </div>
        <div class="assignment-meta">
          <div class="due-date ${dateClass(a.due_at)}">${formatDate(a.due_at)}</div>
          ${badge(a.submission)}
        </div>
      </div>`).join('');
  } catch (e) { document.getElementById('assignment-list').innerHTML = '<div class="empty-state"><p>Could not load assignments.</p></div>'; }
}

// ─── Assignment Detail Modal ────────────────────────────────────────────────
async function openAssignmentDetail(courseId, assignmentId) {
  document.getElementById('assign-detail-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'assign-detail-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal modal-large">
      <div class="modal-header">
        <div style="flex:1;min-width:0;">
          <h3 id="ad-title" style="margin-bottom:4px;">Loading...</h3>
          <p id="ad-meta" style="color:var(--text-secondary);font-size:13px;"></p>
        </div>
        <button class="btn btn-secondary" onclick="document.getElementById('assign-detail-modal').remove()">✕</button>
      </div>
      <div id="ad-content" class="assignment-description">
        <div class="loading"><div class="spinner"></div><span>Loading...</span></div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end;">
        <button class="btn btn-primary" id="ad-submit-btn" style="display:none;" onclick="openSubmitPanel(${courseId}, ${assignmentId})">Submit Assignment</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  try {
    const a = await api(`/api/courses/${courseId}/assignments/${assignmentId}`);
    document.getElementById('ad-title').textContent = a.name || 'Assignment';
    const metaParts = [];
    if (a.due_at) metaParts.push(`Due: ${new Date(a.due_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
    if (a.points_possible != null) metaParts.push(`${a.points_possible} pts`);
    if (a.submission_types?.length) metaParts.push(`Submitting via: ${a.submission_types.join(', ').replace(/_/g, ' ')}`);
    document.getElementById('ad-meta').textContent = metaParts.join(' · ');

    const content = document.getElementById('ad-content');
    content.innerHTML = a.description || '<p style="color:var(--text-secondary);">No description provided.</p>';

    const submitBtn = document.getElementById('ad-submit-btn');
    const nonSubmittable = ['none', 'not_graded', 'on_paper', 'external_tool'];
    if (a.submission_types && !a.submission_types.every(t => nonSubmittable.includes(t))) {
      submitBtn.style.display = 'inline-flex';
      submitBtn.dataset.types = a.submission_types.join(',');
    }
  } catch (e) {
    document.getElementById('ad-content').innerHTML = '<p>Could not load assignment details.</p>';
  }
}

// ─── Submit Panel ───────────────────────────────────────────────────────────
function openSubmitPanel(courseId, assignmentId) {
  document.getElementById('submit-panel')?.remove();
  const btn = document.getElementById('ad-submit-btn');
  const types = (btn?.dataset.types || 'online_text_entry').split(',');
  const has = { text: types.includes('online_text_entry'), url: types.includes('online_url'), file: types.includes('online_upload') };
  const firstActive = has.text ? 'text' : has.url ? 'url' : 'file';

  const m = document.createElement('div');
  m.id = 'submit-panel';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal">
      <h3 style="margin-bottom:12px;">Submit Assignment</h3>
      <div class="tab-bar">
        ${has.text ? `<button class="tab-btn ${firstActive === 'text' ? 'active' : ''}" onclick="switchTab('text',this)">Text Entry</button>` : ''}
        ${has.url ? `<button class="tab-btn ${firstActive === 'url' ? 'active' : ''}" onclick="switchTab('url',this)">Website URL</button>` : ''}
        ${has.file ? `<button class="tab-btn ${firstActive === 'file' ? 'active' : ''}" onclick="switchTab('file',this)">File Upload</button>` : ''}
      </div>

      <div id="tab-text" class="tab-content" style="display:${firstActive === 'text' ? 'block' : 'none'}">
        <textarea id="submit-text" placeholder="Type your submission here..." style="width:100%;height:160px;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;outline:none;margin-bottom:12px;"></textarea>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('submit-panel').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="submitText(${courseId},${assignmentId})">Submit</button>
        </div>
      </div>

      <div id="tab-url" class="tab-content" style="display:${firstActive === 'url' ? 'block' : 'none'}">
        <input id="submit-url" type="url" placeholder="https://..." style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;outline:none;margin-bottom:12px;">
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('submit-panel').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="submitUrl(${courseId},${assignmentId})">Submit</button>
        </div>
      </div>

      <div id="tab-file" class="tab-content" style="display:${firstActive === 'file' ? 'block' : 'none'}">
        <div onclick="document.getElementById('file-input').click()" style="border:2px dashed var(--border);border-radius:8px;padding:32px;text-align:center;cursor:pointer;margin-bottom:12px;">
          <p style="color:var(--text-secondary);margin-bottom:6px;">📎 Click to choose a file</p>
          <p id="file-name-display" style="font-size:12px;color:var(--text-secondary);">No file selected</p>
        </div>
        <input type="file" id="file-input" style="display:none" onchange="document.getElementById('file-name-display').textContent=this.files[0]?.name||'No file selected'">
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('submit-panel').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="submitFile(${courseId},${assignmentId})">Submit</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function switchTab(tab, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = 'block';
}

async function doSubmit(fn) {
  const btns = document.querySelectorAll('#submit-panel .btn-primary');
  btns.forEach(b => { b.disabled = true; b.textContent = 'Submitting...'; });
  try {
    await fn();
    document.getElementById('submit-panel')?.remove();
    document.getElementById('assign-detail-modal')?.remove();
    alert('✅ Submitted successfully!');
  } catch (e) {
    alert('Submission failed. Try a different submission type.');
    btns.forEach(b => { b.disabled = false; b.textContent = 'Submit'; });
  }
}

async function submitText(courseId, assignmentId) {
  const text = document.getElementById('submit-text').value.trim();
  if (!text) return alert('Please enter your submission.');
  await doSubmit(() => apiPost(`/api/courses/${courseId}/assignments/${assignmentId}/submit`, { text }));
}

async function submitUrl(courseId, assignmentId) {
  const url = document.getElementById('submit-url').value.trim();
  if (!url) return alert('Please enter a URL.');
  await doSubmit(() => apiPost(`/api/courses/${courseId}/assignments/${assignmentId}/submit-url`, { url }));
}

async function submitFile(courseId, assignmentId) {
  const file = document.getElementById('file-input').files[0];
  if (!file) return alert('Please select a file.');
  await doSubmit(async () => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BACKEND}/api/courses/${courseId}/assignments/${assignmentId}/submit-file`, {
      method: 'POST',
      headers: { 'x-canvas-token': token },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
  });
}

// ─── Grades ─────────────────────────────────────────────────────────────────
async function renderGrades() {
  const el = document.getElementById('page-grades');
  el.innerHTML = `<div class="page-header"><h2>Grades</h2><p>Your grades across all courses</p></div><div id="grades-content"><div class="loading"><div class="spinner"></div><span>Loading grades...</span></div></div>`;
  const rows = await Promise.all(courses.slice(0, 10).map(async c => {
    try {
      const e = await api(`/api/courses/${c.id}/grades`);
      const g = Array.isArray(e) ? e[0]?.grades : null;
      return { name: c.name, g };
    } catch { return { name: c.name, g: null }; }
  }));
  document.getElementById('grades-content').innerHTML = `
    <table class="grades-table">
      <thead><tr><th>Course</th><th>Current Score</th><th>Final Score</th><th>Grade</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td>${r.g?.current_score != null ? r.g.current_score + '%' : '—'}</td>
          <td>${r.g?.final_score != null ? r.g.final_score + '%' : '—'}</td>
          <td><strong>${r.g?.current_grade || r.g?.final_grade || '—'}</strong></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── Messages ───────────────────────────────────────────────────────────────
async function renderMessages() {
  const el = document.getElementById('page-messages');
  el.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div><h2>Messages</h2><p>Your Canvas inbox</p></div>
      <button class="btn btn-primary" onclick="openCompose()">✏️ New Message</button>
    </div>
    <div id="msg-content"><div class="loading"><div class="spinner"></div><span>Loading messages...</span></div></div>`;
  try {
    const convs = await api('/api/conversations');
    const c = document.getElementById('msg-content');
    if (!Array.isArray(convs) || !convs.length) { c.innerHTML = '<div class="empty-state"><p>No messages yet.</p></div>'; return; }
    c.innerHTML = convs.map(conv => {
      const initials = (conv.participants?.[0]?.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const time = conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return `
        <div class="message-item ${conv.workflow_state === 'unread' ? 'unread' : ''}" onclick="openConversation(${conv.id})">
          <div class="message-avatar">${initials}</div>
          <div class="message-body">
            <div class="message-subject">${conv.subject || '(No subject)'}</div>
            <div class="message-preview">${conv.last_message || ''}</div>
          </div>
          <div class="message-time">${time}</div>
        </div>`;
    }).join('');
  } catch (e) { document.getElementById('msg-content').innerHTML = '<div class="empty-state"><p>Could not load messages.</p></div>'; }
}

async function openConversation(id) {
  document.getElementById('conv-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'conv-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal modal-large">
      <div class="modal-header">
        <h3 id="conv-subject" style="flex:1;">Loading...</h3>
        <button class="btn btn-secondary" onclick="document.getElementById('conv-modal').remove()">✕</button>
      </div>
      <div id="conv-messages" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;margin-top:16px;padding:4px;">
        <div class="loading"><div class="spinner"></div><span>Loading...</span></div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  try {
    const conv = await api(`/api/conversations/${id}`);
    document.getElementById('conv-subject').textContent = conv.subject || '(No subject)';
    const msgs = conv.messages || [];
    const container = document.getElementById('conv-messages');
    if (!msgs.length) { container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">No messages found.</p>'; return; }
    container.innerHTML = msgs.reverse().map(msg => {
      const author = conv.participants?.find(p => p.id === msg.author_id);
      const authorName = author?.name || 'Unknown';
      const isMe = msg.author_id === profile.id;
      const time = msg.created_at ? new Date(msg.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return `
        <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};">
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;padding:0 4px;">${authorName} · ${time}</div>
          <div style="background:${isMe ? 'var(--primary)' : 'var(--bg)'};color:${isMe ? 'white' : 'var(--text)'};padding:10px 14px;border-radius:12px;max-width:80%;font-size:13.5px;line-height:1.6;word-break:break-word;">
            ${msg.body || ''}
          </div>
        </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    document.getElementById('conv-messages').innerHTML = '<p>Could not load conversation.</p>';
  }
}

async function openCompose() {
  document.getElementById('compose-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'compose-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal">
      <h3 style="margin-bottom:16px;">New Message</h3>
      <label class="form-label">Course</label>
      <select id="compose-course" class="form-input" onchange="loadCourseTeachers(this.value)" style="margin-bottom:10px;">
        <option value="">Select a course...</option>
        ${courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
      <label class="form-label">Professor</label>
      <select id="compose-recipient" class="form-input" disabled style="margin-bottom:10px;">
        <option>Select a course first</option>
      </select>
      <label class="form-label">Subject</label>
      <input id="compose-subject" type="text" class="form-input" placeholder="Message subject..." style="margin-bottom:10px;">
      <label class="form-label">Message</label>
      <textarea id="compose-body" class="form-input" placeholder="Write your message here..." style="height:130px;resize:vertical;margin-bottom:16px;"></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('compose-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="sendMessage()">Send</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function loadCourseTeachers(courseId) {
  const sel = document.getElementById('compose-recipient');
  if (!courseId) { sel.innerHTML = '<option>Select a course first</option>'; sel.disabled = true; return; }
  sel.innerHTML = '<option>Loading...</option>';
  sel.disabled = true;
  try {
    const users = await api(`/api/courses/${courseId}/users`);
    if (!Array.isArray(users) || !users.length) { sel.innerHTML = '<option>No professors found</option>'; return; }
    sel.innerHTML = users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    sel.disabled = false;
  } catch (e) { sel.innerHTML = '<option>Could not load</option>'; }
}

async function sendMessage() {
  const recipientId = document.getElementById('compose-recipient').value;
  const subject = document.getElementById('compose-subject').value.trim();
  const body = document.getElementById('compose-body').value.trim();
  if (!recipientId || recipientId === 'Select a course first' || !body) return alert('Please select a professor and write a message.');
  const btn = document.querySelector('#compose-modal .btn-primary');
  btn.textContent = 'Sending...'; btn.disabled = true;
  try {
    await apiPost('/api/conversations', { recipients: [String(recipientId)], subject: subject || '(No subject)', body });
    document.getElementById('compose-modal').remove();
    alert('✅ Message sent!');
    renderMessages();
  } catch (e) {
    alert('Could not send. Please try again.');
    btn.textContent = 'Send'; btn.disabled = false;
  }
}

// ─── Auto-login ──────────────────────────────────────────────────────────────
if (token) {
  api('/api/profile').then(p => {
    if (p?.name) { profile = p; showApp(); }
    else localStorage.removeItem('canvas_token');
  }).catch(() => localStorage.removeItem('canvas_token'));
}
