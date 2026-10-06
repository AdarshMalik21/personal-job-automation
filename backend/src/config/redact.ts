const connectionString = /(?:mongodb(?:\+srv)?|rediss?):\/\/\S+/gi;

export const redactSecrets = (value: string): string => value.replace(connectionString, "[redacted-connection]");

export const errorText = (error: unknown): string =>
  redactSecrets(error instanceof Error ? error.message : String(error));
