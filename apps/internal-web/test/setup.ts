import "@testing-library/jest-dom/vitest";
import "../../../tests/setup-browser-storage";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
