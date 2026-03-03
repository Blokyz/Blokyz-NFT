import "express-session";

// Extend express-session with our custom fields
declare module "express-session" {
    interface SessionData {
        wallet?: string;
        nonce?: string;
    }
}

export { };
