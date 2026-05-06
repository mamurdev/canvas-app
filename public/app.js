const CANVAS = 'https://canvas.donga.ac.kr/api/v1';

let token = localStorage.getItem('canvas_token') || '';
let currentPage = 'dashboard';
let courses = [];
let profile = {};

async function api(endpoint) {
  const res = await fetch(`${CANVAS}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${CANVAS}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function login() {
  const input = document.getElementById('token-input').value.trim();
  if (!input) return alert('Please enter your API token');
  token = input;
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Connecting...';
  btn.disabled = true;
  try {
    profile = await api('/users/self/profile');
    if (profile.errors || !profile.name) throw new Error('Invalid token');
    localStorage.setItem('canvas_token', token);
    showApp();
  } catch (e) {
    alert('Could not connect. Please check your token.');
    btn.textContent = 'Connect to Canvas';
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
  document.getElementById('user-avatar').textContent = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  try {
    const data = await api(
      '/courses?enrollment_state=active&include[]=total_scores&per_page=50'
    );
    courses = Array.isArray(data) ? data.filter((c) => c.name) : [];
  } catch (e) {
    courses = [];
  }
  navigate('dashboard');
}

function navigate(page, e) {
  if (e) e.preventDefault();
  currentPage = page;
  document
    .querySelectorAll('.nav-item')
    .forEach((el) => el.classList.remove('active'));
  const idx = [
    'dashboard',
    'courses',
    'assignments',
    'grades',
    'messages',
  ].indexOf(page);
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems[idx]) navItems[idx].classList.add('active');
  document
    .querySelectorAll('.page')
    .forEach((el) => el.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  ({
    dashboard: renderDashboard,
    courses: renderCourses,
    assignments: renderAssignments,
    grades: renderGrades,
    messages: renderMessages,
  })[page]?.();
}

function formatDate(d) {
  if (!d) return 'No due date';
  const date = new Date(d),
    now = new Date(),
    diff = date - now,
    days = Math.floor(diff / 86400000);
  if (diff < 0)
    return `Overdue (${date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })})`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return `Due ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

function dateClass(d) {
  if (!d) return '';
  const diff = new Date(d) - new Date();
  if (diff < 0) return 'overdue';
  if (diff < 172800000) return 'due-soon';
  return '';
}

function badge(sub) {
  if (!sub || sub.workflow_state === 'unsubmitted')
    return '<span class="badge badge-pending">Pending</span>';
  if (sub.workflow_state === 'submitted')
    return '<span class="badge badge-submitted">Submitted</span>';
  if (sub.workflow_state === 'graded')
    return '<span class="badge badge-graded">Graded</span>';
  if (sub.missing) return '<span class="badge badge-missing">Missing</span>';
  return '<span class="badge badge-pending">Pending</span>';
}

async function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `
    <div class="page-header"><h2>Dashboard</h2><p>Welcome back, ${
      profile.name?.split(' ')[0] || 'Student'
    }</p></div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Active Courses</div><div class="stat-value">${
        courses.length
      }</div></div>
      <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" id="s-pending">—</div></div>
      <div class="stat-card"><div class="stat-label">Due Soon</div><div class="stat-value" id="s-due">—</div></div>
    </div>
    <div class="section-title">Upcoming Assignments</div>
    <div id="dash-assignments"><div class="loading"><div class="spinner"></div><span>Loading...</span></div></div>`;
  const all = [];
  await Promise.all(
    courses.slice(0, 8).map(async (c) => {
      try {
        const a = await api(
          `/courses/${c.id}/assignments?include[]=submission&per_page=50`
        );
        a.forEach((x) => {
          x._courseName = c.name;
          x._courseId = c.id;
        });
        all.push(...a);
      } catch (e) {}
    })
  );
  const now = new Date();
  const upcoming = all
    .filter((a) => a.due_at && new Date(a.due_at) > now)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 10);
  const pending = all.filter(
    (a) =>
      !a.submission ||
      (a.submission.workflow_state !== 'submitted' &&
        a.submission.workflow_state !== 'graded')
  );
  const dueSoon = all.filter((a) => {
    if (!a.due_at) return false;
    const d = new Date(a.due_at) - now;
    return d > 0 && d < 259200000;
  });
  document.getElementById('s-pending').textContent = pending.length;
  document.getElementById('s-due').textContent = dueSoon.length;
  const c = document.getElementById('dash-assignments');
  if (!upcoming.length) {
    c.innerHTML =
      '<div class="empty-state"><p>No upcoming assignments 🎉</p></div>';
    return;
  }
  c.innerHTML = upcoming
    .map(
      (a) => `
    <div class="assignment-item" onclick="openSubmit(${a._courseId}, ${
        a.id
      }, '${a.name.replace(/'/g, "\\'")}')">
      <div class="assignment-info">
        <div class="assignment-title">${a.name}</div>
        <div class="assignment-course">${a._courseName}</div>
      </div>
      <div class="assignment-meta">
        <div class="due-date ${dateClass(a.due_at)}">${formatDate(
        a.due_at
      )}</div>
        ${badge(a.submission)}
      </div>
    </div>`
    )
    .join('');
}

function renderCourses() {
  const el = document.getElementById('page-courses');
  if (!courses.length) {
    el.innerHTML =
      '<div class="page-header"><h2>Courses</h2></div><div class="empty-state"><p>No active courses found.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="page-header"><h2>My Courses</h2><p>${
      courses.length
    } active courses this semester</p></div>
    <div class="card-grid">
      ${courses
        .map(
          (c, i) => `
        <div class="course-card" onclick="selectAndNavigate(${
          c.id
        }, '${c.name.replace(/'/g, "\\'")}')">
          <div class="course-card-bar c${i % 8}"></div>
          <div class="course-card-body">
            <div class="course-card-name">${c.name}</div>
            <div class="course-card-code">${c.course_code || ''}</div>
          </div>
        </div>`
        )
        .join('')}
    </div>`;
}

function selectAndNavigate(id, name) {
  window._selectedCourse = { id, name };
  navigate('assignments');
}

async function renderAssignments() {
  const el = document.getElementById('page-assignments');
  const sel =
    window._selectedCourse ||
    (courses[0] ? { id: courses[0].id, name: courses[0].name } : null);
  if (!sel) {
    el.innerHTML = '<div class="empty-state"><p>No courses found.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="page-header"><h2>Assignments</h2><p>Select a course to view its assignments</p></div>
    <div class="course-selector">
      ${courses
        .map(
          (c) =>
            `<div class="course-chip ${
              c.id === sel.id ? 'active' : ''
            }" onclick="switchCourse(${c.id}, '${c.name.replace(
              /'/g,
              "\\'"
            )}', this)">${
              c.name.length > 28 ? c.name.slice(0, 28) + '…' : c.name
            }</div>`
        )
        .join('')}
    </div>
    <div id="assignment-list"><div class="loading"><div class="spinner"></div><span>Loading...</span></div></div>`;
  loadAssignments(sel.id);
}

function switchCourse(id, name, el) {
  window._selectedCourse = { id, name };
  document
    .querySelectorAll('.course-chip')
    .forEach((c) => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('assignment-list').innerHTML =
    '<div class="loading"><div class="spinner"></div><span>Loading...</span></div>';
  loadAssignments(id);
}

async function loadAssignments(courseId) {
  try {
    const data = await api(
      `/courses/${courseId}/assignments?include[]=submission&per_page=50`
    );
    const c = document.getElementById('assignment-list');
    if (!data.length) {
      c.innerHTML =
        '<div class="empty-state"><p>No assignments for this course.</p></div>';
      return;
    }
    const sorted = [...data].sort((a, b) =>
      !a.due_at ? 1 : !b.due_at ? -1 : new Date(a.due_at) - new Date(b.due_at)
    );
    c.innerHTML = sorted
      .map(
        (a) => `
      <div class="assignment-item" onclick="openSubmit(${courseId}, ${
          a.id
        }, '${a.name.replace(/'/g, "\\'")}')">
        <div class="assignment-info">
          <div class="assignment-title">${a.name}</div>
          <div class="assignment-course">${
            a.points_possible != null ? a.points_possible + ' pts' : 'Ungraded'
          }</div>
        </div>
        <div class="assignment-meta">
          <div class="due-date ${dateClass(a.due_at)}">${formatDate(
          a.due_at
        )}</div>
          ${badge(a.submission)}
        </div>
      </div>`
      )
      .join('');
  } catch (e) {
    document.getElementById('assignment-list').innerHTML =
      '<div class="empty-state"><p>Could not load assignments.</p></div>';
  }
}

function openSubmit(courseId, assignmentId, name) {
  document.getElementById('submit-modal')?.remove();
  const m = document.createElement('div');
  m.id = 'submit-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal">
      <h3>Submit Assignment</h3>
      <p>${name}</p>
      <textarea id="submit-text" placeholder="Type your submission here..."></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="document.getElementById('submit-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAssignment(${courseId}, ${assignmentId})">Submit</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

async function submitAssignment(courseId, assignmentId) {
  const text = document.getElementById('submit-text').value.trim();
  if (!text) return alert('Please enter your submission.');
  const btn = document.querySelector('#submit-modal .btn-primary');
  btn.textContent = 'Submitting...';
  btn.disabled = true;
  try {
    await apiPost(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        submission: { submission_type: 'online_text_entry', body: text },
      }
    );
    document.getElementById('submit-modal').remove();
    alert('✅ Submitted successfully!');
  } catch (e) {
    alert('Submission failed. This assignment may not allow text submissions.');
    btn.textContent = 'Submit';
    btn.disabled = false;
  }
}

async function renderGrades() {
  const el = document.getElementById('page-grades');
  el.innerHTML = `<div class="page-header"><h2>Grades</h2><p>Your grades across all courses</p></div><div id="grades-content"><div class="loading"><div class="spinner"></div><span>Loading grades...</span></div></div>`;
  const rows = await Promise.all(
    courses.slice(0, 10).map(async (c) => {
      try {
        const e = await api(`/courses/${c.id}/enrollments?user_id=self`);
        const g = Array.isArray(e) ? e[0]?.grades : null;
        return { name: c.name, g };
      } catch {
        return { name: c.name, g: null };
      }
    })
  );
  document.getElementById('grades-content').innerHTML = `
    <table class="grades-table">
      <thead><tr><th>Course</th><th>Current Score</th><th>Final Score</th><th>Grade</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.g?.current_score != null ? r.g.current_score + '%' : '—'}</td>
          <td>${r.g?.final_score != null ? r.g.final_score + '%' : '—'}</td>
          <td><strong>${
            r.g?.current_grade || r.g?.final_grade || '—'
          }</strong></td>
        </tr>`
        )
        .join('')}
      </tbody>
    </table>`;
}

async function renderMessages() {
  const el = document.getElementById('page-messages');
  el.innerHTML = `<div class="page-header"><h2>Messages</h2><p>Your Canvas inbox</p></div><div id="msg-content"><div class="loading"><div class="spinner"></div><span>Loading messages...</span></div></div>`;
  try {
    const convs = await api('/conversations?per_page=30');
    const c = document.getElementById('msg-content');
    if (!convs.length) {
      c.innerHTML = '<div class="empty-state"><p>No messages yet.</p></div>';
      return;
    }
    c.innerHTML = convs
      .map((conv) => {
        const initials = (conv.participants?.[0]?.name || 'U')
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const time = conv.last_message_at
          ? new Date(conv.last_message_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : '';
        return `
        <div class="message-item ${
          conv.workflow_state === 'unread' ? 'unread' : ''
        }">
          <div class="message-avatar">${initials}</div>
          <div class="message-body">
            <div class="message-subject">${conv.subject || '(No subject)'}</div>
            <div class="message-preview">${conv.last_message || ''}</div>
          </div>
          <div class="message-time">${time}</div>
        </div>`;
      })
      .join('');
  } catch (e) {
    document.getElementById('msg-content').innerHTML =
      '<div class="empty-state"><p>Could not load messages.</p></div>';
  }
}

if (token) {
  api('/users/self/profile')
    .then((p) => {
      if (p?.name) {
        profile = p;
        showApp();
      } else localStorage.removeItem('canvas_token');
    })
    .catch(() => localStorage.removeItem('canvas_token'));
}
