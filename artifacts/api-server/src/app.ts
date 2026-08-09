import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

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

export default app;
