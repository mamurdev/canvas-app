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

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
