import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { authenticate } from "./auth.middleware";
import { login } from "./auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const authRoutes = Router();

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    res.json(login(body.email, body.password));
  })
);

authRoutes.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});
