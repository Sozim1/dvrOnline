import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { getDb } from "../../db/database";
import { HttpError } from "../../shared/http";

type UserRow = {
  id: number;
  email: string;
  password_hash: string;
};

export type AuthUser = {
  id: number;
  email: string;
};

type TokenPayload = {
  sub: string;
  email: string;
};

export function login(email: string, password: string): { token: string; user: AuthUser } {
  const user = getDb()
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, "Credenciais invalidas.");
  }

  const authUser = { id: user.id, email: user.email };
  const token = jwt.sign(
    { sub: String(user.id), email: user.email } satisfies TokenPayload,
    env.jwtSecret,
    { expiresIn: "12h" }
  );

  return { token, user: authUser };
}

export function verifyToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    return {
      id: Number(payload.sub),
      email: payload.email
    };
  } catch {
    throw new HttpError(401, "Token invalido ou expirado.");
  }
}
