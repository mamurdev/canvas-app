const BACKEND = 'https://canvas-app-production-32ea.up.railway.app';
let token = localStorage.getItem('canvas_token') || '';
let currentPage = 'dashboard';
let courses = [];
let profile = {};

// ─── Gemini AI (direct frontend call) ────────────────────────────────────────
const GEMINI_KEY = 'AIzaSyDAY5yuI5NR2meBPgNyyCdZeQrn0bxegY4'; // paste your key here

async function askGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── API Helper ───────────────────────────────────────────────────────────────
async function api(endpoint) {
  const res = await fetch(`${BACKEND}${endpoint}`, {
    headers: { 'x-canvas-token': token }
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (token) {
    showApp();
    loadApp();
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
  }

  document.getElementById('login-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('token-input').value.trim();
    if (!input) return;
    token = input;
    localStorage.setItem('canvas_token', token);
    showApp();
    await loadApp();
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    token = '';
    localStorage.removeItem('canvas_token');
    location.reload();
  });

  document.getElementById('menu-toggle')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
});

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

async function loadApp() {
  try {
    profile = await api('/api/profile');
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = profile.name || 'Student';
    if (avatarEl && profile.avatar_url) avatarEl.src = profile.avatar_url;
    courses = await api('/api/courses');
    if (!Array.isArray(courses)) courses = [];
    navigate('dashboard');
  } catch (e) {
    alert('Could not load. Check your Canvas token.');
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(page, e) {
  if (e) e.preventDefault();
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));

  const navMap = ['dashboard', 'courses', 'assignments', 'grades', 'messages', 'ai', 'course-detail'];
  const idx = navMap.indexOf(page);
  document.querySelectorAll('.nav-item')[idx]?.classList.add('active');
  document.querySelectorAll('.bottom-nav-item')[idx]?.classList.add('active');

  const renderers = {
    dashboard: renderDashboard,
    courses: renderCourses,
    assignments: renderAssignments,
    grades: renderGrades,
    messages: renderMessages,
    ai: renderAI,
    'course-detail': renderCourseDetail
  };
  renderers[page]?.();
  window.scrollTo(0, 0);
}

function setBottomNav(id) {
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`bn-${id}`)?.classList.add('active');
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return 'No due date';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0) return `Due ${Math.abs(diff)}d ago`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function dateClass(dateStr) {
  if (!dateStr) return '';
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 2) return 'due-soon';
  return '';
}

function badge(submission) {
  if (!submission) return '<span class="badge badge-pending">Not submitted</span>';
  const s = submission.workflow_state;
  if (s === 'submitted' || s === 'graded') return '<span class="badge badge-submitted">Submitted</span>';
  if (s === 'unsubmitted') return '<span class="badge badge-pending">Not submitted</span>';
  return `<span class="badge">${s}</span>`;
}

function selectAndNavigate(id, name) {
  window._selectedCourse = { id, name };
  navigate('course-detail');
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Welcome back, ${profile.name?.split(' ')[0] || 'Student'} 👋</p>
    </div>
    <div id="dash-upcoming"></div>
    <div class="section-title" style="margin-top:20px;">My Courses</div>
    <div id="dash-courses" class="courses-grid"></div>`;

  // Upcoming assignments
  try {
    const upcomingEl = document.getElementById('dash-upcoming');
    const allAssignments = [];
    await Promise.all(courses.slice(0, 6).map(async c => {
      try {
        const a = await api(`/api/courses/${c.id}/assignments?per_page=10`);
        if (Array.isArray(a)) a.forEach(x => allAssignments.push({ ...x, courseName: c.name }));
      } catch (e) {}
    }));
    const now = new Date();
    const upcoming = allAssignments
      .filter(a => a.due_at && new Date(a.due_at) > now && a.submission?.workflow_state !== 'submitted')
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
      .slice(0, 5);

    if (upcoming.length) {
      upcomingEl.innerHTML = `
        <div class="section-title">⏰ Upcoming Deadlines</div>
        ${upcoming.map(a => `
          <div class="assignment-item">
            <div class="assignment-info">
              <div class="assignment-title">${a.name}</div>
              <div class="assignment-course">${a.courseName}</div>
            </div>
            <div class="assignment-meta">
              <div class="due-date ${dateClass(a.due_at)}">${formatDate(a.due_at)}</div>
              ${badge(a.submission)}
            </div>
          </div>`).join('')}`;
    }
  } catch (e) {}

  // Courses grid
  const coursesEl = document.getElementById('dash-courses');
  if (!courses.length) {
    coursesEl.innerHTML = '<p class="empty-state">No courses found.</p>';
    return;
  }
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
  coursesEl.innerHTML = courses.map((c, i) => `
    <div class="course-card" onclick="selectAndNavigate(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
      <div class="course-card-top" style="background:${colors[i % colors.length]}">
        <div class="course-card-initial">${c.course_code?.slice(0, 2) || c.name?.slice(0, 2)}</div>
      </div>
      <div class="course-card-body">
        <div class="course-card-name">${c.name}</div>
        <div class="course-card-code">${c.course_code || ''}</div>
      </div>
    </div>`).join('');
}

// ─── Courses ──────────────────────────────────────────────────────────────────
function renderCourses() {
  const el = document.getElementById('page-courses');
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
  el.innerHTML = `
    <div class="page-header"><h2>My Courses</h2></div>
    <div class="courses-grid">
      ${courses.map((c, i) => `
        <div class="course-card" onclick="selectAndNavigate(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
          <div class="course-card-top" style="background:${colors[i % colors.length]}">
            <div class="course-card-initial">${c.course_code?.slice(0, 2) || c.name?.slice(0, 2)}</div>
          </div>
          <div class="course-card-body">
            <div class="course-card-name">${c.name}</div>
            <div class="course-card-code">${c.course_code || ''}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

// ─── Assignments ──────────────────────────────────────────────────────────────
async function renderAssignments() {
  const el = document.getElementById('page-assignments');
  el.innerHTML = `
    <div class="page-header"><h2>All Assignments</h2></div>
    <div class="loading"><div class="spinner"></div><span>Loading assignments...</span></div>`;
  try {
    const all = [];
    await Promise.all(courses.map(async c => {
      try {
        const a = await api(`/api/courses/${c.id}/assignments?per_page=30`);
        if (Array.isArray(a)) a.forEach(x => all.push({ ...x, courseName: c.name, courseId: c.id }));
      } catch (e) {}
    }));
    const now = new Date();
    const sorted = all.sort((a, b) => !a.due_at ? 1 : !b.due_at ? -1 : new Date(a.due_at) - new Date(b.due_at));
    el.innerHTML = `
      <div class="page-header"><h2>All Assignments</h2><p>${all.length} assignments across ${courses.length} courses</p></div>
      ${sorted.map(a => `
        <div class="assignment-item" onclick="openAssignmentDetail(${a.courseId}, ${a.id})">
          <div class="assignment-info">
            <div class="assignment-title">${a.name}</div>
            <div class="assignment-course">${a.courseName} · ${a.points_possible != null ? a.points_possible + ' pts' : 'Ungraded'}</div>
          </div>
          <div class="assignment-meta">
            <div class="due-date ${dateClass(a.due_at)}">${formatDate(a.due_at)}</div>
            ${badge(a.submission)}
          </div>
        </div>`).join('')}`;
  } catch (e) {
    el.innerHTML = `<div class="page-header"><h2>All Assignments</h2></div><p class="empty-state">Could not load assignments.</p>`;
  }
}

// ─── Grades ───────────────────────────────────────────────────────────────────
async function renderGrades() {
  const el = document.getElementById('page-grades');
  el.innerHTML = `
    <div class="page-header"><h2>Grades</h2></div>
    <div class="loading"><div class="spinner"></div><span>Loading grades...</span></div>`;
  try {
    const gradeData = await Promise.all(courses.map(async c => {
      try {
        const e = await api(`/api/courses/${c.id}/grades`);
        const g = Array.isArray(e) ? e[0]?.grades : e?.grades;
        return { course: c, grades: g };
      } catch (e) { return { course: c, grades: null }; }
    }));
    el.innerHTML = `
      <div class="page-header"><h2>Grades</h2></div>
      ${gradeData.map(({ course, grades }) => `
        <div class="grade-card">
          <div class="grade-course-name">${course.name}</div>
          <div class="grade-row">
            <span class="grade-label">Current Score</span>
            <span class="grade-value">${grades?.current_score != null ? grades.current_score + '%' : '—'}</span>
          </div>
          <div class="grade-row">
            <span class="grade-label">Final Score</span>
            <span class="grade-value">${grades?.final_score != null ? grades.final_score + '%' : '—'}</span>
          </div>
          <div class="grade-row">
            <span class="grade-label">Grade</span>
            <span class="grade-value">${grades?.current_grade || grades?.final_grade || '—'}</span>
          </div>
        </div>`).join('')}`;
  } catch (e) {
    el.innerHTML = `<div class="page-header"><h2>Grades</h2></div><p class="empty-state">Could not load grades.</p>`;
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────
async function renderMessages() {
  const el = document.getElementById('page-messages');
  el.innerHTML = `
    <div class="page-header"><h2>Messages</h2></div>
    <div class="loading"><div class="spinner"></div><span>Loading messages...</span></div>`;
  try {
    const data = await api('/api/conversations?per_page=20');
    if (!Array.isArray(data) || !data.length) {
      el.innerHTML = `<div class="page-header"><h2>Messages</h2></div><div class="empty-state"><p>No messages.</p></div>`;
      return;
    }
    el.innerHTML = `
      <div class="page-header"><h2>Messages</h2></div>
      ${data.map(m => `
        <div class="message-item ${!m.workflow_state || m.workflow_state === 'unread' ? 'unread' : ''}">
          <div class="message-avatar">${(m.participants?.[0]?.name || 'U').charAt(0)}</div>
          <div class="message-body">
            <div class="message-subject">${m.subject || '(No subject)'}</div>
            <div class="message-preview">${m.last_message?.slice(0, 80) || ''}...</div>
            <div class="message-date">${m.last_message_at ? new Date(m.last_message_at).toLocaleDateString() : ''}</div>
          </div>
        </div>`).join('')}`;
  } catch (e) {
    el.innerHTML = `<div class="page-header"><h2>Messages</h2></div><p class="empty-state">Could not load messages.</p>`;
  }
}

// ─── Assignment Detail Modal ──────────────────────────────────────────────────
async function openAssignmentDetail(courseId, assignmentId) {
  document.getElementById('assignment-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'assignment-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="max-width:680px;border-radius:12px;">
      <div class="modal-header">
        <h3 style="flex:1;">Loading...</h3>
        <button class="btn btn-secondary" onclick="document.getElementById('assignment-modal').remove()">✕</button>
      </div>
      <div id="assignment-modal-body" class="loading" style="padding:30px;">
        <div class="spinner"></div><span>Loading assignment...</span>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  try {
    const a = await api(`/api/courses/${courseId}/assignments/${assignmentId}`);
    m.querySelector('h3').textContent = a.name;
    document.getElementById('assignment-modal-body').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <span class="badge">${a.points_possible != null ? a.points_possible + ' pts' : 'Ungraded'}</span>
        <span class="due-date ${dateClass(a.due_at)}">${formatDate(a.due_at)}</span>
        ${badge(a.submission)}
      </div>
      <div class="assignment-description">${a.description || '<p>No description provided.</p>'}</div>
      ${a.html_url ? `<div style="margin-top:16px;"><a href="${a.html_url}" target="_blank" class="btn btn-primary">Open in Canvas ↗</a></div>` : ''}`;
  } catch (e) {
    document.getElementById('assignment-modal-body').innerHTML = '<p style="color:var(--danger)">Could not load assignment details.</p>';
  }
}

// ─── AI Assistant ─────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/## (.*?)(\n|$)/g, '</p><h3 class="ai-heading">$1</h3><p>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.*)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="ai-list">$1</ul>')
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
    </div>`;
}

async function loadAIAssignments(courseId) {
  const sel = document.getElementById('ai-assignment-select');
  if (!courseId) { sel.innerHTML = '<option>Select a course first...</option>'; sel.disabled = true; return; }
  sel.innerHTML = '<option>Loading...</option>'; sel.disabled = true;
  try {
    const data = await api(`/api/courses/${courseId}/assignments`);
    window._aiAssignments = Array.isArray(data) ? data : [];
    if (!data.length) { sel.innerHTML = '<option>No assignments found</option>'; return; }
    sel.innerHTML = data.map(a =>
      `<option value="${a.id}" data-desc="${encodeURIComponent(a.description || '')}">${a.name}</option>`
    ).join('');
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
    const pending = all.filter(a => a.status !== 'submitted' && a.status !== 'graded');
    const result = await askGemini(`You are an academic advisor. A student has these pending assignments. Tell them exactly what to focus on today and this week.

Assignments:
${pending.map(a => `- "${a.name}" | Course: ${a.course} | Due: ${a.due_at || 'No due date'} | Points: ${a.points ?? 'N/A'} | Status: ${a.status}`).join('\n')}

Today: ${new Date().toDateString()}

Format:
## 🎯 Do Today
[Top 2-3 assignments with specific reasons]

## 📅 Do This Week
[Rest ranked by priority]

## 💡 Strategy Tip
[One specific actionable tip]`);
    resultEl.innerHTML = `<p>${renderMarkdown(result)}</p>`;
    resultEl.classList.remove('hidden');
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
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
    const result = await askGemini(`Generate clear study notes for this assignment.

Course: ${courseName}
Assignment: ${assignmentName}
Description: ${description || 'No description provided'}

## 📚 Key Concepts
## ✅ What To Do
## 💡 Tips For Success
## ⚠️ Watch Out For`);
    resultEl.innerHTML = `<p>${renderMarkdown(result)}</p>`;
    resultEl.classList.remove('hidden');
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
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
    const result = await askGemini(`Summarize this for a student.
Assignment: ${name || 'Assignment'}
Content: ${content}

## 📝 Summary
## 🔑 Key Points
## 🎯 What To Focus On`);
    resultEl.innerHTML = `<p>${renderMarkdown(result)}</p>`;
    resultEl.classList.remove('hidden');
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
    resultEl.classList.remove('hidden');
  }
  btn.textContent = 'Summarize'; btn.disabled = false;
}

async function summarizeLTI(title) {
  const resultEl = document.getElementById('lti-ai-result');
  resultEl.innerHTML = '<div class="loading" style="padding:12px;"><div class="spinner"></div><span>Thinking...</span></div>';
  resultEl.classList.remove('hidden');
  try {
    const result = await askGemini(`This is a university lecture video: "${title}" from the course "${window._selectedCourse?.name}". Based on the title, what topics does this lecture likely cover? What should a student focus on and take notes about? Be specific and practical.`);
    resultEl.innerHTML = `<p>${renderMarkdown(result)}</p>`;
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
  }
}

// ─── Course Detail ────────────────────────────────────────────────────────────
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
    </div>`;

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
      const due = item.content_details?.due_at;
      const dueDate = due ? new Date(due) : null;
      const now = new Date();
      const pts = item.content_details?.points_possible;
      const completed = item.completion_requirement?.completed;

      let statusBadge = '';
      if (completed) {
        statusBadge = '<span class="mod-badge mod-badge-done">✓ Done</span>';
      } else if (dueDate) {
        if (dueDate < now) {
          statusBadge = '<span class="mod-badge mod-badge-closed">Closed</span>';
        } else {
          const days = Math.ceil((dueDate - now) / 86400000);
          if (days <= 7) statusBadge = `<span class="mod-badge mod-badge-due">D-${days}</span>`;
          else statusBadge = '<span class="mod-badge mod-badge-upcoming">Upcoming</span>';
        }
      }

      const attendanceBadge = isVideo ? '<span class="mod-badge mod-badge-attend">Attendance</span>' : '';
      let dateStr = due ? `Due ${new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';

      return `
        <div class="cd-item-row clickable" onclick="handleModuleItem(${courseId}, ${JSON.stringify(item).replace(/"/g, '&quot;')})">
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
  if (type === 'ExternalTool') return '🎬';
  if (type === 'File') {
    const mime = details?.content_type || '';
    if (mime.startsWith('video/') || mime.includes('mp4')) return '🎬';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('zip')) return '📦';
    return '📎';
  }
  return '📄';
}

async function handleModuleItem(courseId, item) {
  if (item.type === 'Assignment') {
    openAssignmentDetail(courseId, item.content_id);
  } else if (item.type === 'ExternalTool') {
    openLTIViewer(item.title, item.html_url, item);
  } else if (item.type === 'File') {
    const mime = item.content_details?.content_type || '';
    if (mime.startsWith('video/') || mime.includes('mp4') || mime.includes('webm')) {
      try {
        const file = await api(`/api/files/${item.content_id}`);
        openVideoPlayer(item.title, file.url);
      } catch (e) { window.open(item.html_url, '_blank'); }
    } else {
      window.open(item.html_url, '_blank');
    }
  } else if (item.type === 'Page') {
    try {
      const page = await api(`/api/courses/${courseId}/pages/${item.page_url}`);
      openPageModal(item.title, page.body);
    } catch (e) { window.open(item.html_url, '_blank'); }
  } else if (item.type === 'ExternalUrl') {
    window.open(item.external_url, '_blank');
  } else {
    window.open(item.html_url, '_blank');
  }
}

// ─── LTI / Video Viewer ───────────────────────────────────────────────────────
function openLTIViewer(title, canvasUrl, item) {
  document.getElementById('lti-modal')?.remove();
  const due = item.content_details?.due_at;
  const dueStr = due ? new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const m = document.createElement('div');
  m.id = 'lti-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;border-radius:12px;text-align:center;">
      <div style="width:64px;height:64px;background:#111;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;">🎬</div>
      <h3 style="margin-bottom:6px;">${title}</h3>
      ${dueStr ? `<p style="color:var(--text-secondary);margin-bottom:4px;font-size:13px;">Due: ${dueStr}</p>` : ''}
      <p style="color:var(--text-secondary);margin-bottom:24px;font-size:13px;">Hosted on Dong-A LMS — opens in Canvas where you're already logged in.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="${canvasUrl}" target="_blank" class="btn btn-primary" style="display:block;text-decoration:none;">▶ Watch Video in Canvas</a>
        <button class="btn btn-secondary" onclick="summarizeLTI('${title.replace(/'/g, "\\'")}')">🤖 What is this lecture about?</button>
        <button class="btn btn-secondary" onclick="document.getElementById('lti-modal').remove()">Close</button>
      </div>
      <div id="lti-ai-result" class="ai-result hidden" style="margin-top:14px;text-align:left;"></div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function openVideoPlayer(title, url) {
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
        <video controls style="width:100%;border-radius:8px;background:#000;max-height:480px;">
          <source src="${url}">
          Your browser does not support video playback.
        </video>
      </div>
      <div style="margin-top:12px;text-align:right;">
        <a href="${url}" target="_blank" class="btn btn-secondary">↗ Open in new tab</a>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
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

// ─── Course Detail: Assignments & Grades ──────────────────────────────────────
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
    const g = Array.isArray(e) ? e[0]?.grades : e?.grades;
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
