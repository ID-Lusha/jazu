import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.NODE_ENV === "development" ? "info" : "info",
  base: { service: "jobs" }
});
