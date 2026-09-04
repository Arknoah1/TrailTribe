import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { globalErrorHandler } from "./app";

function createContext(headersSent = false) {
  const requestLog = { error: vi.fn() };
  const req = { log: requestLog } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { headersSent, status } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, requestLog, status, json };
}

describe("globalErrorHandler", () => {
  it("hides server error details while logging the real error", () => {
    const context = createContext();
    const error = Object.assign(new Error("database credentials leaked"), { status: 503 });

    globalErrorHandler(error, context.req, context.res, context.next);

    expect(context.requestLog.error).toHaveBeenCalledWith({ err: error }, "Unhandled error");
    expect(context.status).toHaveBeenCalledWith(503);
    expect(context.json).toHaveBeenCalledWith({ error: "Internal server error" });
    expect(context.next).not.toHaveBeenCalled();
  });

  it("preserves intentional client-error messages", () => {
    const context = createContext();

    globalErrorHandler(
      Object.assign(new Error("Invalid invitation code"), { statusCode: 422 }),
      context.req,
      context.res,
      context.next,
    );

    expect(context.status).toHaveBeenCalledWith(422);
    expect(context.json).toHaveBeenCalledWith({ error: "Invalid invitation code" });
  });

  it.each([200, 399, 600, 500.5, Number.NaN])(
    "normalizes invalid error status %s to 500",
    (invalidStatus) => {
      const context = createContext();

      globalErrorHandler(
        Object.assign(new Error("internal detail"), { status: invalidStatus }),
        context.req,
        context.res,
        context.next,
      );

      expect(context.status).toHaveBeenCalledWith(500);
      expect(context.json).toHaveBeenCalledWith({ error: "Internal server error" });
    },
  );

  it("delegates to Express when response headers were already sent", () => {
    const context = createContext(true);
    const error = new Error("stream failed");

    globalErrorHandler(error, context.req, context.res, context.next);

    expect(context.next).toHaveBeenCalledWith(error);
    expect(context.status).not.toHaveBeenCalled();
    expect(context.json).not.toHaveBeenCalled();
  });
});