import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./auth.service";
import { HttpError } from "../../shared/http";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const token = bearerToken ?? queryToken;

  if (!token) {
    next(new HttpError(401, "Autenticacao obrigatoria."));
    return;
  }

  req.user = verifyToken(token);
  next();
}
