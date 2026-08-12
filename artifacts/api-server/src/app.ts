import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";


const app: Express = express();

const internalApiToken = process.env["ADOPS_INTERNAL_API_TOKEN"]?.trim() ?? "";
const operatorApiToken = process.env["OPS_API_TOKEN"]?.trim() ?? "";
const fastApiDocsBaseUrl = (process.env["ADOPS_FASTAPI_DOCS_URL"]?.trim() || "http://127.0.0.1:4013").replace(/\/+$/, "");
const fastApiDocsPaths = new Set(["/api/docs", "/api/docs/", "/api/redoc", "/api/openapi.json"]);
const fastApiDocsAssetPrefix = "/api/docs-assets/";

function internalApiGuard(req: Request, res: Response, next: NextFunction) {
  const protectedInternalRead = req.path.startsWith("/internal/");
  const publicAsyncCampaignExportPost = req.method.toUpperCase() === "POST" && (
    req.path === "/campaign-evidence-exports/jobs"
  );
  if (publicAsyncCampaignExportPost) {
    next();
    return;
  }
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) && !protectedInternalRead) {
    next();
    return;
  }

  if (protectedInternalRead && !internalApiToken) {
    res.status(503).json({
      error: "internal_api_token_not_configured",
      details: "A rota interna não está disponível sem ADOPS_INTERNAL_API_TOKEN.",
    });
    return;
  }

  if (!internalApiToken && !operatorApiToken) {
    next();
    return;
  }

  const providedInternal = req.header("x-adops-api-token")?.trim() ?? "";
  if (internalApiToken && providedInternal && providedInternal === internalApiToken) {
    next();
    return;
  }

  if (protectedInternalRead) {
    res.status(401).json({ error: "unauthorized", details: "ADOPS internal API token inválido ou ausente." });
    return;
  }

  const authorization = req.header("authorization")?.trim() ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (operatorApiToken && bearer && bearer === operatorApiToken) {
    next();
    return;
  }

  res.status(401).json({
    error: "unauthorized",
    details: "ADOPS API token inválido ou ausente.",
  });
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.get(
  [...Array.from(fastApiDocsPaths), `${fastApiDocsAssetPrefix}:asset`],
  async (req: Request, res: Response): Promise<void> => {
  if (!fastApiDocsPaths.has(req.path) && !req.path.startsWith(fastApiDocsAssetPrefix)) {
    res.status(404).json({ error: "docs_asset_not_found" });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const upstream = await fetch(`${fastApiDocsBaseUrl}${req.path}`, {
      signal: controller.signal,
      headers: { accept: req.header("accept") || "*/*" },
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.status(503).json({
      error: "fastapi_docs_unavailable",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
  },
);

app.use("/api", internalApiGuard, router);

export default app;
