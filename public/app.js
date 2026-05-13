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
  const idx = ['dashboard','courses','assignments','grades','messages','ai','course-detail'].indexOf(page);
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems[idx]) navItems[idx].classList.add('active');
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  ({ dashboard: renderDashboard, courses: renderCourses, assignments: renderAssignments, grades: renderGrades, messages: renderMessages, ai: renderAI, 'course-detail': renderCourseDetail })[page]?.();
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
  navigate('course-detail');
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

// ─── AI Assistant ────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/## (.*?)(\n|$)/g, '</p><h3 class="ai-heading">$1</h3><p>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>)/gs, '<ul class="ai-list">$1</ul>')
    .replace(/\n/g, '<br>');
}

async function renderAI() {
  const el = document.getElementById('page-ai');
  el.innerHTML = `
    <div class="page-header">
      <h2>🤖 AI Assistant</h2>
      <p>Powered by Google Gemini — your personal academic advisor</p>
    </div>

    <div class="ai-card">
      <div class="ai-card-header">
        <div class="ai-card-icon">🎯</div>
        <div>
          <div class="ai-card-title">Priority Engine</div>
          <div class="ai-card-desc">Analyzes all your assignments and tells you exactly what to work on today</div>
        </div>
      </div>
      <button class="btn btn-primary" onclick="runPrioritizer(this)" style="width:100%;margin-top:14px;">Analyze My Workload</button>
      <div id="ai-priority-result" class="ai-result hidden"></div>
    </div>

    <div class="ai-card">
      <div class="ai-card-header">
        <div class="ai-card-icon">📚</div>
        <div>
          <div class="ai-card-title">Study Notes Generator</div>
          <div class="ai-card-desc">Pick any assignment and get structured study notes instantly</div>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
        <select id="ai-course-select" class="form-input" onchange="loadAIAssignments(this.value)">
          <option value="">Select a course...</option>
          ${courses.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`).join('')}
        </select>
        <select id="ai-assignment-select" class="form-input" disabled>
          <option>Select a course first...</option>
        </select>
        <button class="btn btn-primary" onclick="runStudyNotes(this)" style="width:100%;">Generate Study Notes</button>
      </div>
      <div id="ai-notes-result" class="ai-result hidden"></div>
    </div>

    <div class="ai-card">
      <div class="ai-card-header">
        <div class="ai-card-icon">⚡</div>
        <div>
          <div class="ai-card-title">Quick Summarizer</div>
          <div class="ai-card-desc">Paste any assignment description and get an instant summary</div>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
        <input id="ai-sum-name" class="form-input" placeholder="Assignment name...">
        <textarea id="ai-sum-content" class="form-input" style="height:100px;resize:vertical;" placeholder="Paste the assignment description or content here..."></textarea>
        <button class="btn btn-primary" onclick="runSummarizer(this)" style="width:100%;">Summarize</button>
      </div>
      <div id="ai-sum-result" class="ai-result hidden"></div>
    </div>
  `;
}

async function loadAIAssignments(courseId) {
  const sel = document.getElementById('ai-assignment-select');
  if (!courseId) { sel.innerHTML = '<option>Select a course first...</option>'; sel.disabled = true; return; }
  sel.innerHTML = '<option>Loading...</option>'; sel.disabled = true;
  try {
    const data = await api(`/api/courses/${courseId}/assignments`);
    window._aiAssignments = Array.isArray(data) ? data : [];
    sel.innerHTML = data.map(a => `<option value="${a.id}" data-desc="${encodeURIComponent(a.description || '')}">${a.name}</option>`).join('');
    sel.disabled = false;
  } catch (e) { sel.innerHTML = '<option>Could not load</option>'; }
}

async function runPrioritizer(btn) {
  const resultEl = document.getElementById('ai-priority-result');
  btn.textContent = 'Analyzing...'; btn.disabled = true;
  resultEl.classList.add('hidden');
  try {
    const all = [];
    await Promise.all(courses.slice(0, 8).map(async c => {
      try {
        const a = await api(`/api/courses/${c.id}/assignments`);
        if (Array.isArray(a)) a.forEach(x => all.push({
          name: x.name, course: c.name, due_at: x.due_at,
          points: x.points_possible,
          status: x.submission?.workflow_state || 'not submitted'
        }));
      } catch (e) {}
    }));
    const now = new Date();
    const pending = all.filter(a => a.status !== 'submitted' && a.status !== 'graded');
    const res = await fetch(`${BACKEND}/api/ai/prioritize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-canvas-token': token },
      body: JSON.stringify({ assignments: pending })
    });
    const data = await res.json();
    resultEl.innerHTML = `<p>${renderMarkdown(data.result)}</p>`;
    resultEl.classList.remove('hidden');
  } catch (e) {
    resultEl.innerHTML = '<p style="color:var(--danger)">Could not analyze. Please try again.</p>';
    resultEl.classList.remove('hidden');
  }
  btn.textContent = 'Analyze My Workload'; btn.disabled = false;
}

async function runStudyNotes(btn) {
  const courseSelect = document.getElementById('ai-course-select');
  const assignSelect = document.getElementById('ai-assignment-select');
  const resultEl = document.getElementById('ai-notes-result');
  if (!courseSelect.value || assignSelect.disabled) return alert('Please select a course and assignment.');
  const courseName = courseSelect.options[courseSelect.selectedIndex].dataset.name;
  const assignmentName = assignSelect.options[assignSelect.selectedIndex].text;
  const description = decodeURIComponent(assignSelect.options[assignSelect.selectedIndex].dataset.desc || '');
  btn.textContent = 'Generating...'; btn.disabled = true;
  resultEl.classList.add('hidden');
  try {
    const res = await fetch(`${BACKEND}/api/ai/study-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-canvas-token': token },
      body: JSON.stringify({ assignmentName, description, courseName })
    });
    const data = await res.json();
    resultEl.innerHTML = `<p>${renderMarkdown(data.result)}</p>`;
    resultEl.classList.remove('hidden');
  } catch (e) {
    resultEl.innerHTML = '<p style="color:var(--danger)">Could not generate notes. Please try again.</p>';
    resultEl.classList.remove('hidden');
  }
  btn.textContent = 'Generate Study Notes'; btn.disabled = false;
}

async function runSummarizer(btn) {
  const name = document.getElementById('ai-sum-name').value.trim();
  const content = document.getElementById('ai-sum-content').value.trim();
  const resultEl = document.getElementById('ai-sum-result');
  if (!content) return alert('Please paste some content to summarize.');
  btn.textContent = 'Summarizing...'; btn.disabled = true;
  resultEl.classList.add('hidden');
  try {
    const res = await fetch(`${BACKEND}/api/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-canvas-token': token },
      body: JSON.stringify({ assignmentName: name || 'Assignment', content, courseName: 'General' })
    });
    const data = await res.json();
    resultEl.innerHTML = `<p>${renderMarkdown(data.result)}</p>`;
    resultEl.classList.remove('hidden');
  } catch (e) {
    resultEl.innerHTML = '<p style="color:var(--danger)">Could not summarize. Please try again.</p>';
    resultEl.classList.remove('hidden');
  }
  btn.textContent = 'Summarize'; btn.disabled = false;
}

// ─── Course Detail ───────────────────────────────────────────────────────────
async function renderCourseDetail() {
  const course = window._selectedCourse;
  if (!course) { navigate('courses'); return; }
  const el = document.getElementById('page-course-detail');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <button class="btn btn-secondary" onclick="navigate('courses')" style="padding:8px 14px;">← Back</button>
      <h2 style="font-size:18px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${course.name}</h2>
    </div>
    <div class="cd-tabs">
      <button class="cd-tab active" onclick="switchCDTab('announcements',this)">📢 Announcements</button>
      <button class="cd-tab" onclick="switchCDTab('modules',this)">📁 Modules</button>
      <button class="cd-tab" onclick="switchCDTab('assignments',this)">📝 Assignments</button>
      <button class="cd-tab" onclick="switchCDTab('grades',this)">📊 Grades</button>
    </div>
    <div id="cd-announcements" class="cd-panel">
      <div class="loading"><div class="spinner"></div><span>Loading announcements...</span></div>
    </div>
    <div id="cd-modules" class="cd-panel hidden">
      <div class="loading"><div class="spinner"></div><span>Loading modules...</span></div>
    </div>
    <div id="cd-assignments" class="cd-panel hidden">
      <div class="loading"><div class="spinner"></div><span>Loading assignments...</span></div>
    </div>
    <div id="cd-grades" class="cd-panel hidden">
      <div class="loading"><div class="spinner"></div><span>Loading grades...</span></div>
    </div>
  `;

  loadCDAnnouncements(course.id);
}

function switchCDTab(tab, el) {
  document.querySelectorAll('.cd-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.cd-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`cd-${tab}`).classList.remove('hidden');

  const course = window._selectedCourse;
  const loaders = {
    announcements: () => loadCDAnnouncements(course.id),
    modules: () => loadCDModules(course.id),
    assignments: () => loadCDAssignments(course.id),
    grades: () => loadCDGrades(course.id)
  };
  const panel = document.getElementById(`cd-${tab}`);
  if (panel.dataset.loaded !== 'true') loaders[tab]?.();
}

async function loadCDAnnouncements(courseId) {
  const el = document.getElementById('cd-announcements');
  try {
    const data = await api(`/api/courses/${courseId}/announcements`);
    el.dataset.loaded = 'true';
    if (!Array.isArray(data) || !data.length) {
      el.innerHTML = '<div class="empty-state"><p>No announcements.</p></div>'; return;
    }
    el.innerHTML = data.map(a => `
      <div class="cd-announcement">
        <div class="cd-ann-dot ${!a.read_state || a.read_state === 'unread' ? 'unread' : ''}"></div>
        <div style="flex:1;min-width:0;">
          <div class="cd-ann-title">${a.title}</div>
          <div class="cd-ann-meta">${a.author?.display_name || 'Instructor'} · ${a.posted_at ? new Date(a.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
          <div class="cd-ann-body">${a.message ? a.message.replace(/<[^>]*>/g, '').slice(0, 200) + (a.message.length > 200 ? '…' : '') : ''}</div>
        </div>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Could not load announcements.</p></div>';
  }
}

async function loadCDModules(courseId) {
  const el = document.getElementById('cd-modules');
  try {
    const modules = await api(`/api/courses/${courseId}/modules`);
    el.dataset.loaded = 'true';
    if (!Array.isArray(modules) || !modules.length) {
      el.innerHTML = '<div class="empty-state"><p>No modules found.</p></div>'; return;
    }
    el.innerHTML = modules.map(m => `
      <div class="cd-module">
        <div class="cd-module-header" onclick="toggleModule(this, ${courseId}, ${m.id})">
          <span class="cd-module-arrow">▶</span>
          <span class="cd-module-name">${m.name}</span>
          <span class="cd-module-count">${m.items_count || 0} items</span>
        </div>
        <div class="cd-module-items hidden" id="module-items-${m.id}">
          <div class="loading" style="padding:20px;"><div class="spinner"></div><span>Loading...</span></div>
        </div>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Could not load modules.</p></div>';
  }
}

async function toggleModule(headerEl, courseId, moduleId) {
  const itemsEl = document.getElementById(`module-items-${moduleId}`);
  const arrow = headerEl.querySelector('.cd-module-arrow');
  const isOpen = !itemsEl.classList.contains('hidden');
  if (isOpen) {
    itemsEl.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
    return;
  }
  itemsEl.classList.remove('hidden');
  arrow.style.transform = 'rotate(90deg)';
  if (itemsEl.dataset.loaded === 'true') return;

  try {
    const items = await api(`/api/courses/${courseId}/modules/${moduleId}/items`);
    itemsEl.dataset.loaded = 'true';
    if (!Array.isArray(items) || !items.length) {
      itemsEl.innerHTML = '<div style="padding:12px 16px;color:var(--text-secondary);font-size:13px;">No items.</div>';
      return;
    }
    itemsEl.innerHTML = items.map(item => {
      if (item.type === 'SubHeader') return `<div class="cd-subheader">${item.title}</div>`;
      const icon = getItemIcon(item.type, item.content_details);
      const isVideo = item.type === 'ExternalTool';
      const isAssignment = item.type === 'Assignment';
      const due = item.content_details?.due_at;
      const dueDate = due ? new Date(due) : null;
      const now = new Date();
      const pts = item.content_details?.points_possible;
      const completed = item.completion_requirement?.completed;

      // Status badge
      let statusBadge = '';
      if (completed) {
        statusBadge = '<span class="mod-badge mod-badge-done">✓ Done</span>';
      } else if (dueDate) {
        if (dueDate < now) {
          statusBadge = '<span class="mod-badge mod-badge-closed">Closed</span>';
        } else {
          const days = Math.ceil((dueDate - now) / 86400000);
          if (days <= 7) statusBadge = `<span class="mod-badge mod-badge-due">D-${days}</span>`;
          else statusBadge = `<span class="mod-badge mod-badge-upcoming">Upcoming</span>`;
        }
      }

      // Attendance badge for LTI tools (동영상강의)
      const attendanceBadge = isVideo ? '<span class="mod-badge mod-badge-attend">Attendance</span>' : '';

      // Date string
      let dateStr = '';
      if (due) dateStr = `Due ${new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

      return ` 
        <div class="cd-item-row clickable" onclick="handleModuleItem(${courseId}, ${JSON.stringify(item).replace(/"/g,'&quot;')})">
          <div class="cd-item-left">
            <span class="cd-item-icon">${icon}</span>
            <div class="cd-item-info">
              <div class="cd-item-title">${item.title}</div>
              <div class="cd-item-sub">
                ${isVideo ? '<span style="color:var(--text-secondary);font-size:11px;">동영상강의 (LMS)</span>' : ''}
                ${pts != null ? `<span style="color:var(--text-secondary);font-size:11px;">${pts} pts</span>` : ''}
                ${dateStr ? `<span style="color:var(--text-secondary);font-size:11px;">${dateStr}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="cd-item-right">
            ${attendanceBadge}
            ${statusBadge}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    itemsEl.innerHTML = '<div style="padding:12px 16px;color:var(--danger);font-size:13px;">Could not load items.</div>';
  }
}

function getItemIcon(type, details) {
  if (type === 'Assignment') return '📝';
  if (type === 'Quiz') return '✅';
  if (type === 'Discussion') return '💬';
  if (type === 'ExternalUrl') return '🔗';
  if (type === 'Page') return '📄';
  if (type === 'SubHeader') return '';
  if (type === 'File' || type === 'ExternalTool') {
    const mime = details?.content_type || '';
    if (mime.startsWith('video/') || mime.includes('mp4')) return '🎬';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('zip')) return '📦';
    return '📎';
  }
  return '📄';
}

function isVideoFile(item) {
  const mime = item.content_details?.content_type || '';
  return mime.startsWith('video/') || mime.includes('mp4') || item.type === 'ExternalTool';
}

async function handleModuleItem(courseId, item) {
  if (item.type === 'Assignment') {
    openAssignmentDetail(courseId, item.content_id);
  } else if (item.type === 'ExternalTool') {
    // LTI videos — open in Canvas where user is authenticated
    openLTIViewer(item.title, item.html_url, item);
  } else if (item.type === 'File') {
    const mime = item.content_details?.content_type || '';
    if (mime.startsWith('video/') || mime.includes('mp4')) {
      try {
        const file = await api(`/api/files/${item.content_id}`);
        openVideoPlayer(item.title, file.url);
      } catch(e) { window.open(item.html_url, '_blank'); }
    } else {
      window.open(item.html_url, '_blank');
    }
  } else if (item.type === 'Page') {
    try {
      const page = await api(`/api/courses/${courseId}/pages/${item.page_url}`);
      openPageModal(item.title, page.body);
    } catch(e) { window.open(item.html_url, '_blank'); }
  } else if (item.type === 'ExternalUrl') {
    window.open(item.external_url, '_blank');
  } else {
    window.open(item.html_url, '_blank');
  }
}

async function openLTIViewer(title, canvasUrl, item) {
  document.getElementById('lti-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'lti-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal modal-large" style="max-width:900px;border-radius:12px;padding:20px;">
      <div class="modal-header" style="margin-bottom:14px;">
        <h3 style="flex:1;font-size:15px;">🎬 ${title}</h3>
        <button class="btn btn-secondary" onclick="document.getElementById('lti-modal').remove()">✕</button>
      </div>
      <div id="lti-video-area" class="video-container" style="background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;">
        <div class="loading" style="color:white;"><div class="spinner" style="border-top-color:white;"></div><span>Loading video...</span></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="summarizeLTI('${title.replace(/'/g,"\\'")}')">🤖 What is this lecture about?</button>
        <a href="${canvasUrl}" target="_blank" class="btn btn-secondary">↗ Open in Canvas</a>
      </div>
      <div id="lti-ai-result" class="ai-result hidden" style="margin-top:12px;"></div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  // Try to get authenticated sessionless launch URL
  try {
    const courseId = window._selectedCourse?.id;
    const params = new URLSearchParams();
    if (item.url) params.append('url', item.url);
    if (item.id) params.append('module_item_id', item.id);

    const res = await fetch(`${BACKEND}/api/courses/${courseId}/lti-launch?${params.toString()}`, {
      headers: { 'x-canvas-token': token }
    });
    const data = await res.json();

    const area = document.getElementById('lti-video-area');
    if (data.url) {
      area.innerHTML = `<iframe src="${data.url}" frameborder="0" allowfullscreen
        style="width:100%;height:100%;border-radius:8px;"
        allow="autoplay; fullscreen; camera; microphone"></iframe>`;
    } else {
      // Sessionless launch didn't return a URL — fall back to Canvas link
      area.innerHTML = `
        <div style="text-align:center;padding:40px;color:white;">
          <div style="font-size:48px;margin-bottom:16px;">🎬</div>
          <p style="margin-bottom:20px;opacity:0.8;">This video is hosted on Dong-A's LMS.<br>Click below to watch it — you're already logged in.</p>
          <a href="${canvasUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;">▶ Watch on Canvas</a>
        </div>`;
    }
  } catch(e) {
    const area = document.getElementById('lti-video-area');
    area.innerHTML = `
      <div style="text-align:center;padding:40px;color:white;">
        <div style="font-size:48px;margin-bottom:16px;">🎬</div>
        <p style="margin-bottom:20px;opacity:0.8;">Open this video in Canvas where you're already logged in.</p>
        <a href="${canvasUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;">▶ Watch on Canvas</a>
      </div>`;
  }
}

async function summarizeLTI(title) {
  const resultEl = document.getElementById('lti-ai-result');
  resultEl.innerHTML = '<div class="loading" style="padding:12px;"><div class="spinner"></div><span>Thinking...</span></div>';
  resultEl.classList.remove('hidden');
  const course = window._selectedCourse;
  try {
    const res = await fetch(`${BACKEND}/api/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-canvas-token': token },
      body: JSON.stringify({
        assignmentName: title,
        content: `This is a university lecture video titled "${title}" from the course "${course?.name || 'Unknown'}". Based on the title, explain what topics this lecture likely covers, what key concepts a student should focus on, and what notes to take.`,
        courseName: course?.name || 'Unknown'
      })
    });
    const data = await res.json();
    resultEl.innerHTML = `<p>${renderMarkdown(data.result)}</p>`;
  } catch(e) {
    resultEl.innerHTML = '<p style="color:var(--danger)">AI unavailable right now.</p>';
  }
}

function openVideoPlayer(title, url, isEmbed = false) {
  document.getElementById('video-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'video-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal modal-large" style="max-width:860px;border-radius:12px;padding:20px;">
      <div class="modal-header" style="margin-bottom:14px;">
        <h3 style="flex:1;font-size:15px;">${title}</h3>
        <button class="btn btn-secondary" onclick="document.getElementById('video-modal').remove()">✕</button>
      </div>
      <div class="video-container">
        ${isEmbed
          ? `<iframe src="${url}" frameborder="0" allowfullscreen style="width:100%;height:100%;border-radius:8px;"></iframe>`
          : `<video controls style="width:100%;border-radius:8px;background:#000;max-height:480px;">
               <source src="${url}">
               Your browser does not support video playback.
             </video>`
        }
      </div>
      <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
        <button class="btn btn-secondary" onclick="summarizeVideo('${title.replace(/'/g,"\\'")}')">🤖 AI Summarize This</button>
        <a href="${url}" target="_blank" class="btn btn-secondary">↗ Open in new tab</a>
      </div>
      <div id="video-ai-result" class="ai-result hidden" style="margin-top:12px;"></div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function summarizeVideo(title) {
  const resultEl = document.getElementById('video-ai-result');
  resultEl.innerHTML = '<div class="loading" style="padding:16px;"><div class="spinner"></div><span>AI is analyzing...</span></div>';
  resultEl.classList.remove('hidden');
  const course = window._selectedCourse;
  try {
    const res = await fetch(`${BACKEND}/api/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-canvas-token': token },
      body: JSON.stringify({
        assignmentName: title,
        content: `This is a lecture video titled "${title}" from the course "${course?.name || 'Unknown course'}". Provide what a student should expect to learn from this video, key concepts it likely covers, and how to best prepare notes while watching.`,
        courseName: course?.name || 'Unknown'
      })
    });
    const data = await res.json();
    resultEl.innerHTML = `<p>${renderMarkdown(data.result)}</p>`;
  } catch(e) {
    resultEl.innerHTML = '<p style="color:var(--danger)">Could not generate summary.</p>';
  }
}

function openPageModal(title, body) {
  document.getElementById('page-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'page-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal modal-large" style="max-width:760px;border-radius:12px;">
      <div class="modal-header">
        <h3 style="flex:1;">${title}</h3>
        <button class="btn btn-secondary" onclick="document.getElementById('page-modal').remove()">✕</button>
      </div>
      <div class="assignment-description" style="margin-top:16px;max-height:60vh;">${body || 'No content.'}</div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function loadCDAssignments(courseId) {
  const el = document.getElementById('cd-assignments');
  try {
    const data = await api(`/api/courses/${courseId}/assignments`);
    el.dataset.loaded = 'true';
    if (!Array.isArray(data) || !data.length) {
      el.innerHTML = '<div class="empty-state"><p>No assignments.</p></div>'; return;
    }
    const sorted = [...data].sort((a, b) => !a.due_at ? 1 : !b.due_at ? -1 : new Date(a.due_at) - new Date(b.due_at));
    el.innerHTML = sorted.map(a => `
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
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Could not load assignments.</p></div>';
  }
}

async function loadCDGrades(courseId) {
  const el = document.getElementById('cd-grades');
  try {
    const e = await api(`/api/courses/${courseId}/grades`);
    el.dataset.loaded = 'true';
    const g = Array.isArray(e) ? e[0]?.grades : null;
    el.innerHTML = g ? `
      <div class="stats-row" style="margin-top:8px;">
        <div class="stat-card"><div class="stat-label">Current Score</div><div class="stat-value">${g.current_score != null ? g.current_score + '%' : '—'}</div></div>
        <div class="stat-card"><div class="stat-label">Final Score</div><div class="stat-value">${g.final_score != null ? g.final_score + '%' : '—'}</div></div>
        <div class="stat-card"><div class="stat-label">Grade</div><div class="stat-value">${g.current_grade || g.final_grade || '—'}</div></div>
      </div>` : '<div class="empty-state"><p>No grade data available.</p></div>';
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><p>Could not load grades.</p></div>';
  }
}