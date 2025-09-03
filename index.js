// Minimal dev entrypoint for example-project
// Provides a tiny HTTP server so `npm run dev` and `npm start` work immediately.

const http = require("http");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Observability: request context
  const startAt = Date.now();
  const reqId = req.headers["x-request-id"] || randomUUID();
  res.setHeader("x-request-id", reqId);
  const url = new URL(req.url, "http://localhost");

  function log(level, data) {
    const base = {
      ts: new Date().toISOString(),
      level,
      service: "example-project",
      env: process.env.NODE_ENV || "development",
      reqId,
    };
    try {
      console.log(JSON.stringify({ ...base, ...data }));
    } catch {
      // no-op
    }
  }

  // Per-request timeout with 504
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
  const t = setTimeout(() => {
    if (!res.writableEnded) {
      res.statusCode = 504;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Request timeout", reqId }));
      log("warn", {
        msg: "timeout",
        method: req.method,
        path: url.pathname,
        durationMs: Date.now() - startAt,
        timeoutMs,
      });
    }
  }, timeoutMs);

  res.on("finish", () => {
    clearTimeout(t);
    log("info", {
      msg: "request",
      method: req.method,
      path: url.pathname,
      status: res.statusCode,
      durationMs: Date.now() - startAt,
    });
  });

  try {
    // Health & readiness endpoints
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === "GET" && url.pathname === "/ready") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      const ready = true; // no external deps required in this seed
      return res.end(JSON.stringify({ ready }));
    }
    if (req.method === "GET" && url.pathname === "/ai/ping") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      if (!process.env.OPENAI_API_KEY) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: true,
            provider: "openai",
            available: false,
            reason: "OPENAI_API_KEY not set",
            hint: "Add OPENAI_API_KEY to .env (direnv loads it). Then restart server.",
          }),
        );
        return;
      }
      try {
        const OpenAI = require("openai");
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            { role: "user", content: "Reply with a single word: pong" },
          ],
          max_tokens: 5,
        });
        const reply = (
          (completion.choices &&
            completion.choices[0] &&
            completion.choices[0].message &&
            completion.choices[0].message.content) ||
          "pong"
        ).trim();
        res.end(
          JSON.stringify({
            ok: true,
            provider: "openai",
            available: true,
            model:
              completion.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
            reply,
          }),
        );
      } catch (err) {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: false,
            provider: "openai",
            available: false,
            error: String(err),
          }),
        );
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/ai/chat") {
      return handleChat(req, res);
    }
    if (req.method === "POST" && url.pathname === "/ai/solve") {
      return handleSolve(req, res);
    }

    // Unknown routes fallback
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Example Project is running. Node ${process.version}\n`);
  } catch (e) {
    res.statusCode = 500;
    log("error", { msg: "unhandled", error: String(e) });
    res.end("Internal error");
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
  });
}

module.exports = server;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  const { prompt = "Olá" } = await readJson(req).catch(() => ({}));
  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: true,
        provider: "openai",
        available: false,
        reason: "OPENAI_API_KEY not set",
        hint: "Defina OPENAI_API_KEY em .env e reinicie o servidor.",
      }),
    );
  }
  try {
    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: String(prompt) }],
      max_tokens: 256,
    });
    const reply = (completion.choices?.[0]?.message?.content || "").trim();
    return res.end(
      JSON.stringify({
        ok: true,
        provider: "openai",
        available: true,
        model: completion.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
        reply,
      }),
    );
  } catch (err) {
    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: false,
        provider: "openai",
        available: false,
        error: String(err),
      }),
    );
  }
}

async function handleSolve(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  const { task = "Resolver tarefa complexa" } = await readJson(req).catch(
    () => ({}),
  );
  const baseURL = process.env.MOONSHOT_BASE_URL; // Ex.: https://api.moonshot.ai/v1 (ajuste conforme provedor)
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey || !baseURL) {
    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: true,
        provider: "moonshot",
        available: false,
        reason: "MOONSHOT_API_KEY/BaseURL not set",
        hint: "Defina MOONSHOT_API_KEY e MOONSHOT_BASE_URL em .env e reinicie o servidor.",
      }),
    );
  }
  try {
    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey, baseURL });
    const completion = await client.chat.completions.create({
      model: process.env.MOONSHOT_MODEL || "moonshot-large",
      messages: [
        {
          role: "system",
          content:
            "Você é um agente executor para tarefas complexas. Responda de forma estruturada e objetiva.",
        },
        { role: "user", content: String(task) },
      ],
      max_tokens: 512,
      temperature: 0.2,
    });
    const reply = (completion.choices?.[0]?.message?.content || "").trim();
    return res.end(
      JSON.stringify({
        ok: true,
        provider: "moonshot",
        available: true,
        model:
          completion.model || process.env.MOONSHOT_MODEL || "moonshot-large",
        reply,
      }),
    );
  } catch (err) {
    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: false,
        provider: "moonshot",
        available: false,
        error: String(err),
      }),
    );
  }
}

// Patch server handler to include new routes
