export type AppEnv = {
  nodeEnv: string;
  production: boolean;
  port: number;
  mongodbUri: string;
  redisUrl: string;
  jwtSecret: string;
  adminEmail: string;
  adminPassword: string;
  frontendUrl: string;
};

const developmentDefaults = {
  mongodbUri: "mongodb://127.0.0.1:27017/personal_job_automation",
  redisUrl: "redis://127.0.0.1:6379",
  frontendUrl: "http://localhost:3000",
};

export const mongoDatabaseName = (uri: string): string | undefined => {
  try {
    const name = new URL(uri).pathname.split("/").filter(Boolean)[0];
    return name || undefined;
  } catch {
    return undefined;
  }
};

export const readEnv = (source: Record<string, string | undefined>): AppEnv => {
  const nodeEnv = source.NODE_ENV?.trim() || "development";
  const production = nodeEnv === "production";
  const required = (name: string): string => {
    const value = source[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  const requiredInProduction = (name: string, developmentValue: string): string => {
    const value = source[name]?.trim();
    if (value) return value;
    if (production) throw new Error(`Missing required environment variable: ${name}`);
    return developmentValue;
  };

  const portText = source.PORT?.trim();
  const port = portText ? Number(portText) : 5000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const frontendUrl = requiredInProduction("FRONTEND_URL", developmentDefaults.frontendUrl);
  if (production && frontendUrl === "*") {
    throw new Error("FRONTEND_URL cannot be a wildcard in production");
  }
  const mongodbUri = requiredInProduction("MONGODB_URI", developmentDefaults.mongodbUri);
  if (production && !mongoDatabaseName(mongodbUri)) {
    throw new Error("MONGODB_URI must include a database name");
  }

  return {
    nodeEnv,
    production,
    port,
    mongodbUri,
    redisUrl: requiredInProduction("REDIS_URL", developmentDefaults.redisUrl),
    jwtSecret: required("JWT_SECRET"),
    adminEmail: required("ADMIN_EMAIL"),
    adminPassword: required("ADMIN_PASSWORD"),
    frontendUrl,
  };
};
