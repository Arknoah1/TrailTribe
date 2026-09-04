import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { recordUnhandledServerError } from "./lib/serverErrorAlerts";

const app: Express = express();

// Trust one hop of reverse-proxy forwarding so req.ip resolves to the real
// client address. Replit's infrastructure terminates TLS and adds one
// X-Forwarded-For hop before requests reach this server.
app.set("trust proxy", 1);

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

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Security headers
app.use(helmet());

// CORS — lock to an explicit origin allowlist; falls back to the Replit dev domain in development
const allowedOrigins: string[] = [];
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(
    ...process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  );
}
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}

app.use(
  cors({
    credentials: true,
    origin:
      allowedOrigins.length > 0
        ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow same-origin and server-to-server requests (no Origin header)
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(null, false);
            }
          }
        : true, // No env vars configured — open during early local dev only
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware());

app.use("/api", router);

export const globalErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const candidateStatus =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : 500;
  const status =
    Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;

  if (req.log) {
    req.log.error({ err }, "Unhandled error");
  } else {
    logger.error({ err }, "Unhandled error");
  }

  if (status >= 500) {
    recordUnhandledServerError(err, req);
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(status).json({
    error: status >= 500 ? "Internal server error" : (err?.message || "Request failed"),
  });
};

// Keep this last so errors forwarded by any route or middleware are sanitized
// consistently instead of relying on Express's environment-dependent default.
app.use(globalErrorHandler);

export default app;
