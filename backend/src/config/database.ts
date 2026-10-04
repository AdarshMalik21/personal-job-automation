import mongoose from "mongoose";
import { env } from "./env.js";

let connected = false;

mongoose.connection.on("connected", () => {
  connected = true;
});
mongoose.connection.on("disconnected", () => {
  connected = false;
});
mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error.message);
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    console.info("MongoDB connected");
  } catch (error) {
    connected = false;
    console.error(
      "MongoDB unavailable:",
      error instanceof Error ? error.message : error,
    );
  }
};

export const getDatabaseStatus = (): "connected" | "disconnected" =>
  connected ? "connected" : "disconnected";

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};
