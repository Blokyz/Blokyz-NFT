import "dotenv/config";
import express from "express";
import session = require("express-session");
import cors from "cors";
import helmet from "helmet";

import { authRouter } from "./routes/auth.js";
import { mintRouter } from "./routes/mint.js";
import { eligibilityRouter } from "./routes/eligibility.js";

import { adminRouter } from "./routes/admin.js";
import { requireAuth } from "./middleware/auth.js";
import { rateLimiter } from "./middleware/rateLimit.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3001",
    credentials: true,
}));

// ── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json());

// ── Session ─────────────────────────────────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: Number(process.env.SESSION_TTL ?? 86400) * 1000,
    },
}));

// ── Rate Limiting ────────────────────────────────────────────────────────────
app.use(rateLimiter);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/eligibility", requireAuth, eligibilityRouter);
app.use("/mint", requireAuth, mintRouter);

app.use("/admin", adminRouter);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Blokyz backend running on port ${PORT}`);
});

export default app;
