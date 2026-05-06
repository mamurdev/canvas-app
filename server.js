const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');

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

function getToken(req) {
  return req.headers['x-canvas-token'];
}

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

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
