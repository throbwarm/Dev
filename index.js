// Minimal dev entrypoint for example-project
// Provides a tiny HTTP server so `npm run dev` and `npm start` work immediately.

const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`Example Project is running. Node ${process.version}\n`);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
  });
}

module.exports = server;