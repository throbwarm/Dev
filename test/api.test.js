// Extended API tests using built-in node:test
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const server = require("..");

// helper to issue requests and buffer response body
function request({ port, method = "GET", path = "/", headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode,
            body: data,
            headers: res.headers,
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    if (body !== undefined) {
      if (typeof body === "string") req.write(body);
      else req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function withServer(fn) {
  const srv = server.listen(0);
  await once(srv, "listening");
  const { port } = srv.address();
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
}

function temporarilyUnsetEnv(keys, fn) {
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  const restore = () => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  return fn().finally(restore);
}

// Adiciona utilitário para setar temporariamente variáveis de ambiente
function temporarilySetEnv(pairs, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(pairs)) {
    prev[k] = process.env[k];
    process.env[k] = v;
  }
  const restore = () => {
    for (const [k, _] of Object.entries(pairs)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  return Promise.resolve().then(fn).finally(restore);
}

// Stub do módulo 'openai' para evitar chamadas externas e cobrir caminhos de sucesso
async function withStubbedOpenAI(fn) {
  const path = require.resolve("openai");
  // Classe stub compatível com `new OpenAI({ ... })`
  class OpenAIStub {
    constructor(opts) {
      this.opts = opts || {};
      this.chat = {
        completions: {
          create: async ({ model, messages, max_tokens }) => {
            return {
              model: model || "stub-model",
              choices: [{ message: { content: "pong" } }],
            };
          },
        },
      };
    }
  }
  const prev = require.cache[path];
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: OpenAIStub,
  };
  try {
    return await fn();
  } finally {
    if (prev) require.cache[path] = prev;
    else delete require.cache[path];
  }
}

// Stub que lança exceção para cobrir caminhos de erro (catch)
async function withThrowingOpenAI(fn) {
  const path = require.resolve("openai");
  class OpenAIThrowingStub {
    constructor(opts) {
      this.opts = opts || {};
      this.chat = {
        completions: {
          create: async () => {
            throw new Error("stubbed openai error");
          },
        },
      };
    }
  }
  const prev = require.cache[path];
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: OpenAIThrowingStub,
  };
  try {
    return await fn();
  } finally {
    if (prev) require.cache[path] = prev;
    else delete require.cache[path];
  }
}

// Stub que retorna choices vazio para acionar fallback de reply = 'pong' em /ai/ping
async function withEmptyChoicesOpenAI(fn) {
  const path = require.resolve("openai");
  class OpenAIEmptyChoicesStub {
    constructor(opts) {
      this.opts = opts || {};
      this.chat = {
        completions: {
          create: async () => {
            return {};
          },
        },
      };
    }
  }
  const prev = require.cache[path];
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: OpenAIEmptyChoicesStub,
  };
  try {
    return await fn();
  } finally {
    if (prev) require.cache[path] = prev;
    else delete require.cache[path];
  }
}

// Novo stub: retorna uma Promise pendente para simular chamada "pendurada" e acionar timeout 504
async function withHangingOpenAI(fn) {
  const path = require.resolve("openai");
  class OpenAIHangingStub {
    constructor(opts) {
      this.opts = opts || {};
      this.chat = {
        completions: {
          create: async () => new Promise(() => {}), // nunca resolve
        },
      };
    }
  }
  const prev = require.cache[path];
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: OpenAIHangingStub,
  };
  try {
    return await fn();
  } finally {
    if (prev) require.cache[path] = prev;
    else delete require.cache[path];
  }
}

// Novo stub: respostas sem a propriedade `model` para cobrir ramos de fallback de modelo
async function withNoModelChoicesOpenAI(fn) {
  const path = require.resolve("openai");
  class OpenAINoModelChoicesStub {
    constructor(opts) {
      this.opts = opts || {};
      this.chat = {
        completions: {
          create: async () => {
            return {
              // sem `model`
              choices: [{ message: { content: "ok" } }],
            };
          },
        },
      };
    }
  }
  const prev = require.cache[path];
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: OpenAINoModelChoicesStub,
  };
  try {
    return await fn();
  } finally {
    if (prev) require.cache[path] = prev;
    else delete require.cache[path];
  }
}

test("GET /ready responds ready:true and sets x-request-id", async () => {
  await withServer(async (port) => {
    const res = await request({ port, path: "/ready" });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ready, true);
    assert.ok(res.headers["x-request-id"], "x-request-id should be set");
  });
});

test("GET / echoes provided x-request-id header", async () => {
  await withServer(async (port) => {
    const xid = "test-req-id-123";
    const res = await request({
      port,
      path: "/",
      headers: { "x-request-id": xid },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["x-request-id"], xid);
    assert.match(res.body, /Example Project is running/);
  });
});

test("GET /ai/ping without OPENAI_API_KEY returns available:false", async () => {
  await temporarilyUnsetEnv(["OPENAI_API_KEY"], async () => {
    await withServer(async (port) => {
      const res = await request({ port, path: "/ai/ping" });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.ok, true);
      assert.equal(json.provider, "openai");
      assert.equal(json.available, false);
      assert.ok(json.hint);
    });
  });
});

test("POST /ai/chat with invalid JSON gracefully handles error and returns available:false", async () => {
  await temporarilyUnsetEnv(["OPENAI_API_KEY"], async () => {
    await withServer(async (port) => {
      const res = await request({
        port,
        method: "POST",
        path: "/ai/chat",
        // Intentionally malformed JSON
        body: "{invalid",
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.ok, true);
      assert.equal(json.provider, "openai");
      assert.equal(json.available, false);
    });
  });
});

test("POST /ai/chat with JSON body but without OPENAI_API_KEY returns available:false", async () => {
  await temporarilyUnsetEnv(["OPENAI_API_KEY"], async () => {
    await withServer(async (port) => {
      const res = await request({
        port,
        method: "POST",
        path: "/ai/chat",
        body: { prompt: "Olá" },
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.ok, true);
      assert.equal(json.provider, "openai");
      assert.equal(json.available, false);
    });
  });
});

test("POST /ai/chat without body and without OPENAI_API_KEY returns available:false", async () => {
  await temporarilyUnsetEnv(["OPENAI_API_KEY"], async () => {
    await withServer(async (port) => {
      const res = await request({ port, method: "POST", path: "/ai/chat" });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.ok, true);
      assert.equal(json.provider, "openai");
      assert.equal(json.available, false);
    });
  });
});

// Exercita o ramo catch do logger: força console.log a lançar durante o evento 'finish'
// para cobrir o try/catch em `log()` sem afetar a resposta
test("logger captura erro quando console.log lança", async () => {
  const original = console.log;
  console.log = () => {
    throw new Error("forced log error");
  };
  try {
    await withServer(async (port) => {
      const res = await request({ port, path: "/ready" });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.ready, true);
    });
  } finally {
    console.log = original;
  }
});

test("POST /ai/solve with invalid JSON and missing env returns available:false", async () => {
  await temporarilyUnsetEnv(
    ["MOONSHOT_API_KEY", "MOONSHOT_BASE_URL"],
    async () => {
      await withServer(async (port) => {
        const res = await request({
          port,
          method: "POST",
          path: "/ai/solve",
          body: "{not-json",
        });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, true);
        assert.equal(json.provider, "moonshot");
        assert.equal(json.available, false);
      });
    },
  );
});

// Caminhos de sucesso com stubs (sem dependências externas)

test("GET /ai/ping with OPENAI_API_KEY and stubbed OpenAI returns available:true", async () => {
  await temporarilySetEnv({ OPENAI_API_KEY: "test-key" }, () =>
    withStubbedOpenAI(async () => {
      await withServer(async (port) => {
        const res = await request({ port, path: "/ai/ping" });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, true);
        assert.equal(json.provider, "openai");
        assert.equal(json.available, true);
        assert.ok(json.reply);
      });
    }),
  );
});

test("POST /ai/chat with OPENAI_API_KEY and stubbed OpenAI returns available:true", async () => {
  await temporarilySetEnv({ OPENAI_API_KEY: "test-key" }, () =>
    withStubbedOpenAI(async () => {
      await withServer(async (port) => {
        const res = await request({
          port,
          method: "POST",
          path: "/ai/chat",
          body: { prompt: "Olá" },
        });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, true);
        assert.equal(json.provider, "openai");
        assert.equal(json.available, true);
        assert.ok(typeof json.reply === "string");
      });
    }),
  );
});

test("POST /ai/solve with MOONSHOT env and stubbed OpenAI returns available:true", async () => {
  await temporarilySetEnv(
    { MOONSHOT_API_KEY: "moonshot-key", MOONSHOT_BASE_URL: "http://stub" },
    () =>
      withStubbedOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({
            port,
            method: "POST",
            path: "/ai/solve",
            body: { task: "Teste" },
          });
          assert.equal(res.statusCode, 200);
          const json = JSON.parse(res.body);
          assert.equal(json.ok, true);
          assert.equal(json.provider, "moonshot");
          assert.equal(json.available, true);
          assert.ok(typeof json.reply === "string");
        });
      }),
  );
});

test("GET unknown route returns default message", async () => {
  await withServer(async (port) => {
    const res = await request({ port, path: "/nao-existe" });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Example Project is running/);
  });
});

// Cobre caminho de erro (catch) em /ai/ping quando OpenAI lança exceção
test("GET /ai/ping with throwing OpenAI returns ok:false available:false", async () => {
  await temporarilySetEnv({ OPENAI_API_KEY: "dummy-key" }, async () => {
    await withThrowingOpenAI(async () => {
      await withServer(async (port) => {
        const res = await request({ port, path: "/ai/ping" });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, false);
        assert.equal(json.provider, "openai");
        assert.equal(json.available, false);
        assert.match(String(json.error), /stubbed openai error/);
      });
    });
  });
});

// Cobre o branch do main-guard: if (require.main === module)
// Inicia o servidor via processo filho de node index.js e encerra em seguida
test("node index.js (main) inicia servidor e imprime listening", async () => {
  const child = spawn(process.execPath, ["index.js"], {
    cwd: require("node:path").join(__dirname, ".."),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const gotListening = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const s = chunk.toString();
      if (s.includes("Server listening")) {
        resolve(true);
      }
    };
    child.stdout.on("data", onData);
    child.on("error", reject);
    setTimeout(() => resolve(false), 1500);
  });
  const seen = await gotListening;
  // Mata o processo filho para não ficar rodando
  child.kill();
  assert.equal(seen, true, "esperava ver log de listening do servidor");
});

// Garante cobertura dos dois ramos de process.env.NODE_ENV || "development" dentro do logger
test("logger com NODE_ENV=production", async () => {
  await temporarilySetEnv({ NODE_ENV: "production" }, async () => {
    await withServer(async (port) => {
      const res = await request({ port, path: "/health" });
      assert.equal(res.statusCode, 200);
    });
  });
});

test("logger com NODE_ENV não definido (fallback)", async () => {
  await temporarilyUnsetEnv(["NODE_ENV"], async () => {
    await withServer(async (port) => {
      const res = await request({ port, path: "/health" });
      assert.equal(res.statusCode, 200);
    });
  });
});

test("POST /ai/chat with throwing OpenAI returns ok:false available:false", async () => {
  await temporarilySetEnv({ OPENAI_API_KEY: "test-key" }, () =>
    withThrowingOpenAI(async () => {
      await withServer(async (port) => {
        const res = await request({
          port,
          method: "POST",
          path: "/ai/chat",
          body: { prompt: "Olá" },
        });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, false);
        assert.equal(json.provider, "openai");
        assert.equal(json.available, false);
        assert.match(json.error, /stubbed openai error/);
      });
    }),
  );
});

test("POST /ai/solve with throwing OpenAI returns ok:false available:false", async () => {
  await temporarilySetEnv(
    { MOONSHOT_API_KEY: "moonshot-key", MOONSHOT_BASE_URL: "http://stub" },
    () =>
      withThrowingOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({
            port,
            method: "POST",
            path: "/ai/solve",
            body: { task: "Teste" },
          });
          assert.equal(res.statusCode, 200);
          const json = JSON.parse(res.body);
          assert.equal(json.ok, false);
          assert.equal(json.provider, "moonshot");
          assert.equal(json.available, false);
          assert.match(json.error, /stubbed openai error/);
        });
      }),
  );
});

test("GET unknown route returns default message", async () => {
  await withServer(async (port) => {
    const res = await request({ port, path: "/nao-existe" });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Example Project is running/);
    assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
  });
});

test("GET /ai/ping with stubbed empty choices falls back to 'pong'", async () => {
  await temporarilySetEnv({ OPENAI_API_KEY: "test-key" }, async () => {
    await withEmptyChoicesOpenAI(async () => {
      await withServer(async (port) => {
        const res = await request({ port, path: "/ai/ping" });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, true);
        assert.equal(json.available, true);
        assert.equal(json.reply, "pong");
        // quando OPENAI_MODEL não está definido e a resposta não tem `model`, deve cair no default
        assert.equal(json.model, "gpt-4o-mini");
      });
    });
  });
});

// Cobre ramo: quando OPENAI_MODEL estiver definido, e a resposta não tiver `model`, usar o valor do env
test("GET /ai/ping with OPENAI_MODEL set and empty choices uses env model and reply fallback", async () => {
  await temporarilySetEnv(
    { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-4o-smart" },
    async () => {
      await withEmptyChoicesOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({ port, path: "/ai/ping" });
          assert.equal(res.statusCode, 200);
          const json = JSON.parse(res.body);
          assert.equal(json.ok, true);
          assert.equal(json.available, true);
          assert.equal(json.model, "gpt-4o-smart");
          assert.equal(json.reply, "pong");
        });
      });
    },
  );
});

// Cobre ramo: /ai/chat usando OPENAI_MODEL do env quando a resposta não tem `model`
test("POST /ai/chat with OPENAI_MODEL set and stubbed OpenAI without model uses env model", async () => {
  await temporarilySetEnv(
    { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-4o-smart" },
    async () => {
      await withNoModelChoicesOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({
            port,
            method: "POST",
            path: "/ai/chat",
            body: { prompt: "Olá" },
          });
          assert.equal(res.statusCode, 200);
          const json = JSON.parse(res.body);
          assert.equal(json.ok, true);
          assert.equal(json.available, true);
          assert.equal(json.model, "gpt-4o-smart");
          assert.equal(typeof json.reply, "string");
        });
      });
    },
  );
});

// Cobre ramos: /ai/solve usa default quando MOONSHOT_MODEL não está definido e o stub não retorna `model`
test("POST /ai/solve with MOONSHOT env and stub without model uses default model", async () => {
  await temporarilySetEnv(
    {
      MOONSHOT_API_KEY: "ms-key",
      MOONSHOT_BASE_URL: "https://moonshot.local/v1",
      // sem MOONSHOT_MODEL
    },
    async () => {
      await withNoModelChoicesOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({
            port,
            method: "POST",
            path: "/ai/solve",
            body: { task: "Diga oi" },
          });
          assert.equal(res.statusCode, 200);
          const json = JSON.parse(res.body);
          assert.equal(json.ok, true);
          assert.equal(json.available, true);
          assert.equal(json.model, "moonshot-large");
          assert.equal(typeof json.reply, "string");
        });
      });
    },
  );
});

// Cobre ramo: /ai/solve usa MOONSHOT_MODEL do env quando definido e stub não retorna `model`
test("POST /ai/solve with MOONSHOT_MODEL set and stub without model uses env model", async () => {
  await temporarilySetEnv(
    {
      MOONSHOT_API_KEY: "ms-key",
      MOONSHOT_BASE_URL: "https://moonshot.local/v1",
      MOONSHOT_MODEL: "moonshot-pro",
    },
    async () => {
      await withNoModelChoicesOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({
            port,
            method: "POST",
            path: "/ai/solve",
            body: { task: "Diga oi" },
          });
          assert.equal(res.statusCode, 200);
          const json = JSON.parse(res.body);
          assert.equal(json.ok, true);
          assert.equal(json.available, true);
          assert.equal(json.model, "moonshot-pro");
          assert.equal(typeof json.reply, "string");
        });
      });
    },
  );
});

// Novo stub: timeout 504 em /ai/chat quando OpenAI "não responde"
test("POST /ai/chat com OPENAI_API_KEY e OpenAI pendurado responde 504 (timeout)", async () => {
  await temporarilySetEnv(
    { OPENAI_API_KEY: "test", REQUEST_TIMEOUT_MS: "20" },
    async () => {
      await withHangingOpenAI(async () => {
        await withServer(async (port) => {
          const res = await request({
            port,
            method: "POST",
            path: "/ai/chat",
            body: { prompt: "demorar" },
          });
          assert.equal(
            res.statusCode,
            504,
            `esperava 504, recebeu ${res.statusCode}: ${res.body}`,
          );
          const json = JSON.parse(res.body);
          assert.equal(json.ok, false);
          assert.equal(json.error, "Request timeout");
          assert.ok(
            res.headers["x-request-id"],
            "x-request-id deve estar presente",
          );
        });
      });
    },
  );
});

test("GET unknown route triggers top-level catch (500) when writeHead throws", async () => {
  // Monkeypatch writeHead to throw only for the unknown-route fallback signature
  const origWriteHead = http.ServerResponse.prototype.writeHead;
  http.ServerResponse.prototype.writeHead = function (
    statusCode,
    headers,
    ...rest
  ) {
    if (
      statusCode === 200 &&
      headers &&
      headers["content-type"] === "text/plain; charset=utf-8"
    ) {
      throw new Error("stub writeHead error");
    }
    return origWriteHead.call(this, statusCode, headers, ...rest);
  };
  try {
    await withServer(async (port) => {
      const res = await request({ port, path: "/__trigger-catch__" });
      assert.equal(res.statusCode, 500);
      assert.equal(res.body, "Internal error");
    });
  } finally {
    http.ServerResponse.prototype.writeHead = origWriteHead;
  }
});
