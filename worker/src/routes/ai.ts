import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const aiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

aiRoutes.get("/capabilities", (c) => {
  return c.json({
    google: !!c.env.GOOGLE_API_KEY,
    openai: !!c.env.OPENAI_API_KEY,
    anthropic: !!c.env.ANTHROPIC_API_KEY,
    deepgram: !!c.env.DEEPGRAM_API_KEY,
  });
});
