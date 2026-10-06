import "dotenv/config";
import { readEnv } from "./envConfig.js";

export const env = readEnv(process.env);
