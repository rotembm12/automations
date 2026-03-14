import { readState, writeState } from "../state";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import fs from "fs";
const mockReadFileSync = jest.mocked(fs.readFileSync);
const mockWriteFileSync = jest.mocked(fs.writeFileSync);

describe("readState", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns default state when file does not exist", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });
    const state = readState();
    expect(state.seenIds).toEqual([]);
    expect(new Date(state.lastChecked).getTime()).toBeGreaterThan(0);
  });

  it("returns parsed state from file", () => {
    const stored = { lastChecked: "2024-01-01T00:00:00.000Z", seenIds: ["vid1", "vid2"] };
    mockReadFileSync.mockReturnValue(JSON.stringify(stored) as any);
    expect(readState()).toEqual(stored);
  });
});

describe("writeState", () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes formatted JSON to state.json", () => {
    const state = { lastChecked: "2024-01-01T00:00:00.000Z", seenIds: ["vid1"] };
    writeState(state);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content, encoding] = mockWriteFileSync.mock.calls[0] as any[];
    expect(filePath).toContain("state.json");
    expect(content).toBe(JSON.stringify(state, null, 2));
    expect(encoding).toBe("utf-8");
  });
});
