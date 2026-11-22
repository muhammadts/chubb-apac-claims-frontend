const express = require('express');

const app = express();
const port = Number(process.env.MOCK_API_PORT || 4301);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_request, response) => {
  response.json({ status: 'Healthy', mode: 'mock' });
});

app.use((_request, response) => {
  response
    .status(404)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'The mock API foundation only implements the health endpoint.',
    });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Claims mock API listening at http://localhost:${port}`);
});
