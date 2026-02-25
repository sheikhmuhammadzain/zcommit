import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".zcommit");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Load config from disk.
 * @returns {{ apiKey?: string }}
 */
export function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {
    // Corrupt config, start fresh
  }
  return {};
}

/**
 * Save config to disk.
 * @param {object} config
 */
export function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get the API key from config or environment.
 * @returns {string | null}
 */
export function getApiKey() {
  // Environment variable takes priority
  if (process.env.CEREBRAS_API_KEY) {
    return process.env.CEREBRAS_API_KEY;
  }
  const config = loadConfig();
  return config.apiKey || null;
}

/**
 * Store the API key to config.
 * @param {string} key
 */
export function setApiKey(key) {
  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);
}
