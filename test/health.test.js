// Minimal healthcheck test using built-in node:test (self-contained)
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { once } = require("node:events");

const server = require(".."); // exports http.Server from index.js

function request(port, pathname = "/health") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "GET",
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.end();
  });
}

test("GET /health responds ok:true", async () => {
  // Start server on ephemeral port 0
  const srv = server.listen(0);
  await once(srv, "listening");
  const { port } = srv.address();

  try {
    const { statusCode, body } = await request(port, "/health");
    assert.equal(statusCode, 200);
    const json = JSON.parse(body);
    assert.equal(json.ok, true);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});
