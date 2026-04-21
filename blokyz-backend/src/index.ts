import "dotenv/config";
import express from "express";
import session = require("express-session");
import cors from "cors";
import helmet from "helmet";

import { authRouter } from "./routes/auth.js";
import { mintRouter } from "./routes/mint.js";
import { eligibilityRouter } from "./routes/eligibility.js";
import { profileRouter } from "./routes/profile.js";

import { adminRouter } from "./routes/admin.js";
import { rateLimiter } from "./middleware/rateLimit.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "http://localhost:3001")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
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
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
app.use("/eligibility", eligibilityRouter);
app.use("/mint", mintRouter); // /mint/phase is public; individual routes enforce auth via requireAuth
app.use("/profile", profileRouter);

app.use("/admin", adminRouter);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Blokyz backend running on port ${PORT}`);
});

export default app;
