const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');

const multer = require('multer');
const FormData = require('form-data');
const upload = multer({ storage: multer.memoryStorage() });

const CANVAS_TOKEN = process.env.CANVAS_TOKEN || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CANVAS_BASE = 'https://canvas.donga.ac.kr';

async function canvasRequest(token, endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${CANVAS_BASE}/api/v1${endpoint}`, options);
  return response.json();
}

function getToken(req) { return req.headers['x-canvas-token'] || CANVAS_TOKEN; }

app.get('/api/profile', async (req, res) => {
  try {
    res.json(await canvasRequest(getToken(req), '/users/self/profile'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    res.json(
      await canvasRequest(
        getToken(req),
        '/courses?enrollment_state=active&include[]=total_scores&per_page=50'
      )
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/courses/:id/assignments', async (req, res) => {
  try {
    res.json(
      await canvasRequest(
        getToken(req),
        `/courses/${req.params.id}/assignments?include[]=submission&per_page=50&order_by=due_at`
      )
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/courses/:id/grades', async (req, res) => {
  try {
    res.json(
      await canvasRequest(
        getToken(req),
        `/courses/${req.params.id}/enrollments?user_id=self`
      )
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    res.json(
      await canvasRequest(
        getToken(req),
        '/conversations?per_page=30&scope=inbox'
      )
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post(
  '/api/courses/:courseId/assignments/:assignmentId/submit',
  async (req, res) => {
    try {
      const data = await canvasRequest(
        getToken(req),
        `/courses/${req.params.courseId}/assignments/${req.params.assignmentId}/submissions`,
        'POST',
        {
          submission: {
            submission_type: 'online_text_entry',
            body: req.body.text,
          },
        }
      );
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// Password login — returns canvas token to frontend
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (APP_PASSWORD && password === APP_PASSWORD && CANVAS_TOKEN) {
    res.json({ token: CANVAS_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Individual assignment detail
app.get('/api/courses/:courseId/assignments/:assignmentId', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/courses/${req.params.courseId}/assignments/${req.params.assignmentId}?include[]=submission`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Individual conversation detail
app.get('/api/conversations/:id', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/conversations/${req.params.id}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Send a new message
app.post('/api/conversations', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), '/conversations', 'POST', req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Get teachers in a course (for composing messages)
app.get('/api/courses/:id/users', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/courses/${req.params.id}/users?enrollment_type[]=teacher&per_page=50`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// URL submission
app.post('/api/courses/:courseId/assignments/:assignmentId/submit-url', async (req, res) => {
  try {
    res.json(await canvasRequest(getToken(req), `/courses/${req.params.courseId}/assignments/${req.params.assignmentId}/submissions`, 'POST', {
      submission: { submission_type: 'online_url', url: req.body.url }
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// File upload submission
app.post('/api/courses/:courseId/assignments/:assignmentId/submit-file', upload.single('file'), async (req, res) => {
  try {
    const token = getToken(req);
    const { courseId, assignmentId } = req.params;

    // Step 1: Request upload slot from Canvas
    const uploadParams = await fetch(
      `${CANVAS_BASE}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: req.file.originalname, size: req.file.size, content_type: req.file.mimetype })
      }
    ).then(r => r.json());

    // Step 2: Upload file bytes
    const formData = new FormData();
    Object.entries(uploadParams.upload_params || {}).forEach(([k, v]) => formData.append(k, v));
    formData.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    const uploadRes = await fetch(uploadParams.upload_url, { method: 'POST', body: formData });
    const fileData = await uploadRes.json();

    // Step 3: Submit with file ID
    res.json(await canvasRequest(token, `/courses/${courseId}/assignments/${assignmentId}/submissions`, 'POST', {
      submission: { submission_type: 'online_upload', file_ids: [fileData.id] }
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Gemini AI Routes ────────────────────────────────────────────────────────
async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in environment variables');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const data = await response.json();
  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

app.post('/api/ai/prioritize', async (req, res) => {
  try {
    const { assignments } = req.body;
    const prompt = `You are an academic advisor AI. A student has these assignments. Tell them exactly what to focus on today and this week, ranked by priority. Consider: urgency, points/grade impact, and submission status.

Assignments:
${assignments.map(a => `- "${a.name}" | Course: ${a.course} | Due: ${a.due_at || 'No due date'} | Points: ${a.points ?? 'N/A'} | Status: ${a.status}`).join('\n')}

Today: ${new Date().toDateString()}

Respond in this format:
## 🎯 Do Today
[Top 2-3 assignments to tackle TODAY with specific reasons]

## 📅 Do This Week
[Remaining assignments ranked by priority]

## 💡 Strategy Tip
[One specific actionable tip based on their workload]

Be direct, specific, and encouraging. Keep it concise.`;

    res.json({ result: await askGemini(prompt) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/study-notes', async (req, res) => {
  try {
    const { assignmentName, description, courseName } = req.body;
    const prompt = `You are a study assistant. Generate clear, structured study notes for this assignment.

Course: ${courseName}
Assignment: ${assignmentName}
Description: ${description || 'No description provided'}

Format:
## 📚 Key Concepts
[Main topics to understand]

## ✅ What You Need To Do
[Clear checklist of tasks]

## 💡 Tips For Success
[Specific advice for this assignment]

## ⚠️ Watch Out For
[Common mistakes or important details]

Be specific. If no description, give smart advice based on the assignment name.`;

    res.json({ result: await askGemini(prompt) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/summarize', async (req, res) => {
  try {
    const { content, assignmentName, courseName } = req.body;
    const prompt = `Summarize this assignment content clearly for a student.

Course: ${courseName}
Assignment: ${assignmentName}
Content: ${content}

Format:
## 📝 Summary
[2-3 sentence overview]

## 🔑 Key Points
[Bullet points of main ideas]

## 🎯 What To Focus On
[Most important things to understand or do]`;

    res.json({ result: await askGemini(prompt) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Course announcements
app.get('/api/courses/:id/announcements', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/courses/${req.params.id}/discussion_topics?only_announcements=true&per_page=10`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Course modules with items included
app.get('/api/courses/:id/modules', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/courses/${req.params.id}/modules?include[]=items&per_page=50`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Module items with content details (for file URLs, video links)
app.get('/api/courses/:id/modules/:moduleId/items', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/courses/${req.params.id}/modules/${req.params.moduleId}/items?include[]=content_details&per_page=50`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// File details (download URL for videos/files)
app.get('/api/files/:fileId', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/files/${req.params.fileId}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Page content
app.get('/api/courses/:id/pages/:pageUrl', async (req, res) => {
  try { res.json(await canvasRequest(getToken(req), `/courses/${req.params.id}/pages/${encodeURIComponent(req.params.pageUrl)}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
