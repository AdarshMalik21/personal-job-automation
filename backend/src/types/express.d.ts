import type { AuthSession } from "../../../shared/types/index.js";

declare global {
  namespace Express {
    interface Request {
      session?: AuthSession["user"];
    }
  }
}

export {};
