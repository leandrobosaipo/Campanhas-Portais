import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type InsertionDetail = {
  id: number;
  campanhaId: number;
  campanhaName: string | null;
  siteSigla: string | null;
  localFormatoNormalizado: string | null;
  mediaUrl: string | null;
  competencia: string | null;
  evidences?: Array<{ id: number; titulo: string | null; arquivoUrl: string | null }>;
};

type Mapping = {
  pageUrl: string;
  slotSelector: string;
  contextSelector?: string;
};

type SpacesEnv = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
};

function buildApiHeaders(extra = {}) {
  const token = process.env.ADOPS_CAPTURE_API_TOKEN || process.env.ADOPS_INTERNAL_API_TOKEN || "";
  return {
    ...(token ? { "x-adops-api-token": token } : {}),
    ...extra,
  };
}

function parseArgs(argv: string[]) {
  const options: Record<string, string | boolean> = {
    apiBase: "http://127.0.0.1:4011/api",
    spacesBucket: "cod5",
    spacesBasePath: "adops-prints",
    upload: true,
    saveEvidence: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  if (!options.insertionId) {
    throw new Error("Use --insertionId <id>.");
  }
  return {
    insertionId: Number(options.insertionId),
    apiBase: String(options.apiBase),
    spacesEnv: options.spacesEnv ? String(options.spacesEnv) : null,
    spacesBucket: String(options.spacesBucket),
    spacesBasePath: String(options.spacesBasePath),
    upload: options.upload !== "false" && options.upload !== false,
    saveEvidence: options.saveEvidence !== "false" && options.saveEvidence !== false,
  };
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    const candidateRoots = [
      process.cwd(),
      path.resolve(__dirname, ".."),
      path.resolve(__dirname, "../.."),
    ];
    for (const root of candidateRoots) {
      try {
        return require(path.join(root, "node_modules/playwright"));
      } catch {
        // tenta o próximo caminho
      }
    }
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "playwright"));
  }
}

function parseEnvFile(filePath: string): SpacesEnv {
  const raw = readFileSync(filePath, "utf8");
  const map = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    map.set(key, value);
  }
  const accessKeyId = map.get("DO_SPACES_ACCESS_KEY_ID");
  const secretAccessKey = map.get("DO_SPACES_SECRET_ACCESS_KEY");
  const endpoint = map.get("DO_SPACES_ENDPOINT");
  const region = map.get("DO_SPACES_REGION");
  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    throw new Error(`Arquivo de Spaces incompleto: ${filePath}`);
  }
  return { accessKeyId, secretAccessKey, endpoint, region };
}

function getMapping(insertion: InsertionDetail): Mapping {
  if (insertion.siteSigla === "PERRENGUE" && insertion.localFormatoNormalizado === "MEGABANNER TOPO") {
    return {
      pageUrl: "https://perrenguematogrosso.com/",
      slotSelector: ".g.g-1",
      contextSelector: "#header-ads-row",
    };
  }
  throw new Error(`Não há mapping configurado para ${insertion.siteSigla} / ${insertion.localFormatoNormalizado}.`);
}

function getMediaBasename(urlString: string) {
  const url = new URL(urlString);
  return path.basename(url.pathname);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getDateLabel(date = new Date()) {
  const isoDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const titleDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  }).format(date);
  return { isoDate, titleDate };
}

async function fetchInsertion(apiBase: string, insertionId: number): Promise<InsertionDetail> {
  const response = await fetch(`${apiBase}/insertions/${insertionId}`, { headers: buildApiHeaders() });
  if (!response.ok) {
    throw new Error(`Falha ao buscar inserção ${insertionId}: ${response.status}`);
  }
  return await response.json() as InsertionDetail;
}

async function upsertEvidence(apiBase: string, insertion: InsertionDetail, arquivoUrl: string, title: string) {
  const existing = insertion.evidences?.find((item) => item.titulo?.includes(title.split(" - ")[0] ?? ""));
  if (existing?.id) {
    const response = await fetch(`${apiBase}/evidences/${existing.id}`, {
      method: "PATCH",
      headers: buildApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ tipo: "print", titulo: title, arquivoUrl }),
    });
    if (!response.ok) {
      throw new Error(`Falha ao atualizar evidência ${existing.id}: ${response.status}`);
    }
    return response.json();
  }

  const response = await fetch(`${apiBase}/insertions/${insertion.id}/evidences`, {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ tipo: "print", titulo: title, arquivoUrl }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao criar evidência: ${response.status}`);
  }
  return response.json();
}

function uploadToSpaces(env: SpacesEnv, bucket: string, key: string, localFile: string) {
  execFileSync("aws", [
    "--endpoint-url",
    env.endpoint,
    "s3",
    "cp",
    localFile,
    `s3://${bucket}/${key}`,
    "--acl",
    "public-read",
    "--content-type",
    "image/png",
  ], {
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: env.accessKeyId,
      AWS_SECRET_ACCESS_KEY: env.secretAccessKey,
      AWS_DEFAULT_REGION: env.region,
    },
    stdio: "pipe",
  });

  return `https://${bucket}.${env.region}.digitaloceanspaces.com/${key}`;
}

async function main() {
  const { chromium } = loadPlaywright();
  const args = parseArgs(process.argv.slice(2));
  const insertion = await fetchInsertion(args.apiBase, args.insertionId);

  if (!insertion.mediaUrl) {
    throw new Error(`A inserção ${insertion.id} não tem mediaUrl configurada.`);
  }

  const mapping = getMapping(insertion);
  const mediaBasename = getMediaBasename(insertion.mediaUrl);
  const { isoDate, titleDate } = getDateLabel(new Date());

  const outDir = path.join(
    "/Users/leandrobosaipo/Projetos/AdOps/tmp/generated-prints",
    isoDate,
    String(insertion.id),
  );
  mkdirSync(outDir, { recursive: true });

  const slotPng = path.join(outDir, `${isoDate}-slot.png`);
  const contextPng = path.join(outDir, `${isoDate}-context.png`);
  const metaJson = path.join(outDir, `${isoDate}-meta.json`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 2 });

  try {
    await page.goto(mapping.pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(mapping.slotSelector, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const match = await page.evaluate(({ slotSelector, mediaBasename }: { slotSelector: string; mediaBasename: string }) => {
      const slot = document.querySelector(slotSelector);
      if (!slot) return { ok: false, reason: "slot_not_found" };

      const items = Array.prototype.slice.call(slot.querySelectorAll(":scope > .g-dyn, :scope > .g-single"));
      function collect(element: Element) {
        const values: string[] = [];
        const nested = [element].concat(Array.prototype.slice.call(element.querySelectorAll("*")));
        for (let i = 0; i < nested.length; i += 1) {
          const node = nested[i];
          if (!(node instanceof HTMLElement)) continue;
          const style = node.getAttribute("style");
          if (style) values.push(style);
          const attrs = ["src", "data-lazy-src", "data-src", "srcset", "data-lazy-srcset", "href"];
          for (let j = 0; j < attrs.length; j += 1) {
            const value = node.getAttribute(attrs[j]);
            if (value) values.push(value);
          }
        }
        return values.join(" | ");
      }

      let matched = null as HTMLElement | null;
      const available: string[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] as HTMLElement;
        const payload = collect(item);
        available.push(payload);
        if (!matched && payload.includes(mediaBasename)) {
          matched = item;
        }
      }

      if (!matched) {
        return { ok: false, reason: "creative_not_found", available };
      }

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] as HTMLElement;
        const isMatch = item === matched;
        item.style.display = isMatch ? "block" : "none";
        item.style.opacity = isMatch ? "1" : "0";
        item.style.visibility = isMatch ? "visible" : "hidden";
        item.style.position = isMatch ? "relative" : "absolute";
        item.style.inset = isMatch ? "auto" : "0";
      }

      (slot as HTMLElement).style.overflow = "visible";
      (slot as HTMLElement).style.height = `${matched.getBoundingClientRect().height || 120}px`;

      let adClass = null;
      for (let i = 0; i < matched.classList.length; i += 1) {
        const name = matched.classList[i];
        if (name && name.indexOf("a-") === 0) {
          adClass = name;
          break;
        }
      }
      return { ok: true, adClass };
    }, { slotSelector: mapping.slotSelector, mediaBasename });

    if (!match.ok) {
      throw new Error(`Não foi possível identificar o criativo correto: ${JSON.stringify(match)}`);
    }

    const slot = page.locator(mapping.slotSelector);
    await slot.screenshot({ path: slotPng });

    const context = page.locator(mapping.contextSelector ?? mapping.slotSelector);
    await context.screenshot({ path: contextPng });

    const metadata = {
      insertionId: insertion.id,
      campaignId: insertion.campanhaId,
      campaignName: insertion.campanhaName,
      siteSigla: insertion.siteSigla,
      format: insertion.localFormatoNormalizado,
      pageUrl: mapping.pageUrl,
      slotSelector: mapping.slotSelector,
      contextSelector: mapping.contextSelector ?? mapping.slotSelector,
      mediaUrl: insertion.mediaUrl,
      mediaBasename,
      capturedAt: new Date().toISOString(),
      isoDate,
      adClass: (match as { adClass?: string | null }).adClass ?? null,
      slotPng,
      contextPng,
    };
    writeFileSync(metaJson, JSON.stringify(metadata, null, 2));

    let publicUrl: string | null = null;

    if (args.upload) {
      if (!args.spacesEnv) {
        throw new Error("Use --spacesEnv para subir o print ao Spaces.");
      }
      const spacesEnv = parseEnvFile(args.spacesEnv);
      const competenciaSlug = slugify(insertion.competencia ?? "sem-competencia").toUpperCase();
      const key = `${args.spacesBasePath}/${competenciaSlug}/${insertion.campanhaId}/${insertion.id}/${isoDate}-slot.png`;
      publicUrl = uploadToSpaces(spacesEnv, args.spacesBucket, key, slotPng);
    }

    if (args.saveEvidence && publicUrl) {
      const title = `Print ${isoDate} - ${titleDate} [semi-auto]`;
      await upsertEvidence(args.apiBase, insertion, publicUrl, title);
    }

    console.log(JSON.stringify({
      ok: true,
      insertionId: insertion.id,
      slotPng,
      contextPng,
      uploadedUrl: publicUrl,
      metadata: metaJson,
    }, null, 2));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
