import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, `Rota nao encontrada: ${req.method} ${req.path}`));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Dados invalidos.",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      message: error.message,
      details: error.details
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno";
  console.error(error);
  res.status(500).json({ message });
}
