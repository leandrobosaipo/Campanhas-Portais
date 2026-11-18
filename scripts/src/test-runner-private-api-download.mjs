import assert from "node:assert/strict";
import http from "node:http";
import test, { after } from "node:test";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { httpDownloadBuffer } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const server = http.createServer((req, res) => {
  if (req.url === "/slow") {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/zip" });
      res.end(Buffer.from("zip-ok"));
    }, 120);
    return;
  }
  if (req.url === "/large") {
    res.writeHead(200, { "content-type": "application/zip" });
    res.end(Buffer.alloc(32, 1));
    return;
  }
  if (req.url === "/trickle") {
    res.writeHead(200, { "content-type": "application/zip" });
    const interval = setInterval(() => res.write("x"), 30);
    res.on("close", () => clearInterval(interval));
    setTimeout(() => {
      clearInterval(interval);
      res.end("done");
    }, 180);
    return;
  }
  res.writeHead(503, { "content-type": "text/plain" });
  res.end("unavailable");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
after(() => new Promise((resolve) => server.close(resolve)));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

test("download HTTP aguarda cabeçalhos dentro do timeout operacional", async () => {
  const result = await httpDownloadBuffer(`${baseUrl}/slow`, { timeoutMs: 500, maxBytes: 64 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.buffer.toString("utf8"), "zip-ok");
  assert.equal(result.contentType, "application/zip");
});

test("download HTTP falha fechado quando o artefato excede o limite", async () => {
  await assert.rejects(
    httpDownloadBuffer(`${baseUrl}/large`, { timeoutMs: 500, maxBytes: 16 }),
    /excede o limite de 16 bytes/,
  );
});

test("timeout é prazo absoluto mesmo quando o servidor envia bytes periódicos", async () => {
  await assert.rejects(
    httpDownloadBuffer(`${baseUrl}/trickle`, { timeoutMs: 50, maxBytes: 64 }),
    /Timeout após 50 ms/,
  );
});
