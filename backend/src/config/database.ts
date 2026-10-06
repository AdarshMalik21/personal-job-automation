import mongoose from "mongoose";
import { env } from "./env.js";
import { errorText } from "./redact.js";

let connected = false;

mongoose.connection.on("connected", () => {
  connected = true;
});
mongoose.connection.on("disconnected", () => {
  connected = false;
});
mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", errorText(error));
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    console.info("MongoDB connected");
  } catch (error) {
    connected = false;
    const message = errorText(error);
    console.error("MongoDB unavailable:", message);
    if (env.production) throw new Error(`MongoDB connection failed: ${message}`);
  }
};

export const getDatabaseStatus = (): "connected" | "disconnected" =>
  connected ? "connected" : "disconnected";

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  connected = false;
  console.info("MongoDB disconnected");
};
