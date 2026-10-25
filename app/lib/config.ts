import type { DataMode } from "./types";

export const DATA_MODE: DataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "mock";

export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337";
