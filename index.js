// Minimal dev entrypoint for example-project
// Provides a tiny HTTP server so `npm run dev` and `npm start` work immediately.

const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/ai/ping') {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      if (!process.env.OPENAI_API_KEY) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, provider: 'openai', available: false, reason: 'OPENAI_API_KEY not set', hint: 'Add OPENAI_API_KEY to .env (direnv loads it). Then restart server.' }));
        return;
      }
      try {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Reply with a single word: pong' }],
          max_tokens: 5,
        });
        const reply = (completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content || 'pong').trim();
        res.end(JSON.stringify({ ok: true, provider: 'openai', available: true, model: completion.model || (process.env.OPENAI_MODEL || 'gpt-4o-mini'), reply }));
      } catch (err) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: false, provider: 'openai', available: false, error: String(err) }));
      }
      return;
    }

    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Example Project is running. Node ${process.version}\n`);
  } catch (e) {
    res.statusCode = 500;
    res.end('Internal error');
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
  });
}

module.exports = server;