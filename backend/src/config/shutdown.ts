export type RuntimeClosers = {
  closeHttpServer?: () => Promise<void>;
  disconnectDatabase: () => Promise<void>;
  disconnectRedis: () => Promise<void>;
};

export const shutdownRuntime = async (closers: RuntimeClosers): Promise<void> => {
  if (closers.closeHttpServer) await closers.closeHttpServer();
  await closers.disconnectDatabase();
  await closers.disconnectRedis();
};
