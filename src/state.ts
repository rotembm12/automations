import fs from "fs";
import path from "path";
import { State } from "./types";

const STATE_FILE = path.join(__dirname, "..", "state.json");

export function readState(): State {
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data) as State;
  } catch {
    // First run: start checking from now so we don't flood Slack with old videos
    return {
      lastChecked: new Date().toISOString(),
      seenIds: [],
    };
  }
}

export function writeState(state: State): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}
