import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";


const app: Express = express();

const internalApiToken = process.env["ADOPS_INTERNAL_API_TOKEN"]?.trim() ?? "";
const operatorApiToken = process.env["OPS_API_TOKEN"]?.trim() ?? "";

function internalApiGuard(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
    next();
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", internalApiGuard, router);

export default app;
