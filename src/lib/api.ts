import { NextResponse } from "next/server";

interface HttpishError {
  status: number;
  message: string;
}
function isHttpish(err: unknown): err is HttpishError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { status?: unknown }).status === "number" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Wrap a route handler so thrown AuthErrors become the right status and
 * unexpected errors are logged and returned as a generic 500 (never leaked).
 */
export function route<Args extends unknown[]>(
  fn: (req: Request, ...args: Args) => Promise<Response>
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      return await fn(req, ...args);
    } catch (err) {
      // AuthError, RegError, and any error carrying a numeric status map to it.
      if (isHttpish(err)) return jsonError(err.message, err.status);
      // eslint-disable-next-line no-console
      console.error("route error:", err);
      return jsonError("Something went wrong. Please try again.", 500);
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
