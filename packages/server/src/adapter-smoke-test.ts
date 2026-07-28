#!/usr/bin/env node
import { adapterNetworksUrl } from "./adapter-url.js";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: robono-adapter-test

Checks authentication, directory access, and optional CORS on your deployed
protected adapter.

Required environment variables:
  ROBONO_ADAPTER_URL              Full adapter mount URL, for example
                                  https://your-backend.example/robono
  ROBONO_ADAPTER_ACCESS_TOKEN

Optional:
  ROBONO_ADAPTER_EXPECTED_ORIGIN`);
  process.exit(0);
}

const baseUrl = requiredEnvironment("ROBONO_ADAPTER_URL").replace(/\/+$/, "");
const accessToken = requiredEnvironment("ROBONO_ADAPTER_ACCESS_TOKEN");
const expectedOrigin = process.env.ROBONO_ADAPTER_EXPECTED_ORIGIN?.trim();
const route = adapterNetworksUrl(baseUrl);

await check("Unauthenticated requests are rejected", async () => {
  const response = await request(route, {});
  if (response.status !== 401) {
    throw new Error(`expected HTTP 401, received ${response.status}`);
  }
});

await check("Authenticated directory request succeeds", async () => {
  const response = await request(route, {
    authorization: `Bearer ${accessToken}`,
  });
  const payload = await response.json().catch(() => ({})) as {
    directory?: unknown[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `received HTTP ${response.status}`,
    );
  }
  if (!Array.isArray(payload.directory)) {
    throw new Error("response does not contain a directory");
  }
});

if (expectedOrigin) {
  await check("Configured browser origin is allowed", async () => {
    const response = await fetchWithTimeout(route, {
      method: "OPTIONS",
      headers: {
        origin: expectedOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    const allowed = response.headers.get("access-control-allow-origin");
    if (allowed !== expectedOrigin) {
      throw new Error(
        `expected Access-Control-Allow-Origin ${expectedOrigin}, received ${
          allowed ?? "no header"
        }`,
      );
    }
  });
}

console.log("Robono adapter smoke test passed.");

async function request(url: string, headers: Record<string, string>) {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  });
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function check(label: string, operation: () => Promise<void>) {
  try {
    await operation();
    console.log(`PASS ${label}`);
  } catch (error) {
    console.error(
      `FAIL ${label}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    process.exitCode = 1;
    throw error;
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(1);
  }
  return value;
}
