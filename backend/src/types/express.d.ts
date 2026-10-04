import type { AuthSession } from "@personal-job-automation/shared/types";

declare global {
  namespace Express {
    interface Request {
      session?: AuthSession["user"];
    }
  }
}

export {};
