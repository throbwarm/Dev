// Extended API tests using built-in node:test
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { once } = require("node:events");

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
    assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
  });
});

// Simula erro interno levantando no handler por input específico
// Para provocar um erro, enviamos uma rota especial que dispara exceção via query
// Observação: como não há branch explícito para isso, simulamos enviando um header
// que o servidor não usa e validamos que o servidor lida com 500 se ocorrer exceção.
// Aqui, em vez de hackear o server, vamos validar o caminho já existente com JSON inválido
// que pode lançar em locais não capturados (já temos esse teste para /ai/chat). Vamos
// criar um para GET com URL malformada não é possível pois URL já é parseada. Logo,
// cobrimos um 500 artificialmente usando um header de tamanho absurdo não é prático.
// Como fallback, garantimos a cobertura do fallback de rota acima.

test("GET /ai/ping with stubbed empty choices falls back to 'pong'", async () => {
  await temporarilySetEnv({ OPENAI_API_KEY: "test-key" }, () =>
    withEmptyChoicesOpenAI(async () => {
      await withServer(async (port) => {
        const res = await request({ port, path: "/ai/ping" });
        assert.equal(res.statusCode, 200);
        const json = JSON.parse(res.body);
        assert.equal(json.ok, true);
        assert.equal(json.provider, "openai");
        assert.equal(json.available, true);
        assert.equal(json.reply, "pong");
      });
    }),
  );
});

// Caminhos de erro (catch) com stub que lança

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
