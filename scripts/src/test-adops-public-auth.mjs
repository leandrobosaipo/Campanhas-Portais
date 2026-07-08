import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ENV_FILE = path.join(ROOT, "ops", "cloudflare-public-api", ".env.ops.local");
const BASE_URL = "https://adops-campanhas-portais.pages.dev";
const API_BASE = "https://adops-api-public.leandro471.workers.dev";
const TOKEN_KEY = "adops.ops.operator-token.v1";
const INSERTION_URL = `${BASE_URL}/insercoes/1179`;
const DELETE_URL_PATTERN = new RegExp(`^${API_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/api\\/evidences\\/\\d+$`);

function readOpsToken() {
  if (process.env.OPS_API_TOKEN) return process.env.OPS_API_TOKEN.trim();
  if (!fs.existsSync(ENV_FILE)) return "";
  const raw = fs.readFileSync(ENV_FILE, "utf8");
  const match = raw.match(/^OPS_API_TOKEN=(.*)$/m);
  return match?.[1]?.trim() ?? "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setStoredToken(page, value, { raw = false } = {}) {
  await page.addInitScript(
    ({ key, tokenValue, rawValue }) => {
      window.localStorage.removeItem(key);
      if (tokenValue === null) return;
      window.localStorage.setItem(key, rawValue ? tokenValue : JSON.stringify(tokenValue));
    },
    { key: TOKEN_KEY, tokenValue: value, rawValue: raw },
  );
}

async function gotoInsertion(page) {
  await page.goto(INSERTION_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.getByRole("heading", { name: /Inserção #1179/i }).waitFor({ timeout: 15000 });
}

function evidenceRow(page) {
  return page.locator("button", { hasText: "Apagar evidência" }).first();
}

async function deleteButton(page) {
  return evidenceRow(page);
}

async function dashboardPrintsButton(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  return page.getByRole("button", { name: "Prints do dia" });
}

async function syncApplyButton(page) {
  await page.goto(`${BASE_URL}/sincronizacao`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  return page.getByRole("button", { name: "Aplicar sync" });
}

async function main() {
  const opsToken = readOpsToken();
  assert(opsToken, "OPS_API_TOKEN ausente para o smoke com token válido");

  const browser = await chromium.launch({ headless: true });

  try {
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      page.on("request", (request) => {
        if (request.method() === "DELETE" && DELETE_URL_PATTERN.test(request.url())) requests.push(request);
      });

      await setStoredToken(page, null);
      await gotoInsertion(page);

      const button = await deleteButton(page);
      assert(await button.isDisabled(), "sem token o botão de apagar evidência deveria ficar desabilitado");
      assert(requests.length === 0, "sem token não deveria haver request DELETE");

      const dashboardButton = await dashboardPrintsButton(page);
      assert(await dashboardButton.isDisabled(), "sem token Prints do dia deveria ficar desabilitado");

      const syncButton = await syncApplyButton(page);
      assert(await syncButton.isDisabled(), "sem token Aplicar sync deveria ficar desabilitado");

      await context.close();
    }

    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      page.on("request", (request) => {
        if (request.method() === "DELETE" && DELETE_URL_PATTERN.test(request.url())) requests.push(request);
      });

      await setStoredToken(page, "", { raw: false });
      await gotoInsertion(page);

      const stored = await page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY);
      assert(stored === null, "token vazio serializado deveria ser removido na inicialização");

      const button = await deleteButton(page);
      assert(await button.isDisabled(), "token vazio não pode habilitar apagar evidência");
      assert(requests.length === 0, "token vazio não deveria disparar DELETE");

      await context.close();
    }

    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      page.on("dialog", (dialog) => dialog.accept());
      await context.route(DELETE_URL_PATTERN, async (route, request) => {
        requests.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      });

      await setStoredToken(page, opsToken, { raw: false });
      await gotoInsertion(page);

      const button = await deleteButton(page);
      assert((await button.isDisabled()) === false, "com token válido o botão deveria habilitar");
      await button.click();
      await page.waitForTimeout(2500);

      assert(requests.length > 0, "com token válido deveria enviar DELETE");
      const authHeader = requests[0].headers.authorization || requests[0].headers.Authorization;
      assert(authHeader === `Bearer ${opsToken}`, "DELETE deveria sair com Bearer válido");
      assert(requests[0].headers["x-adops-client-build"], "DELETE deveria incluir x-adops-client-build");
      assert(requests[0].headers["x-adops-auth-state"] === "present", "DELETE deveria incluir x-adops-auth-state=present");

      await context.close();
    }

    console.log(JSON.stringify({
      ok: true,
      checks: [
        "1179 sem token não envia DELETE",
        "1179 com token vazio não envia DELETE",
        "1179 com token válido envia DELETE com headers corretos",
        "Dashboard Prints do dia protegido sem token",
        "SyncCenter Aplicar sync protegido sem token",
      ],
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
