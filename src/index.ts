// github-mcp-wrapper.ts
//
// Exchanges a GitHub App private key for a short-lived installation token,
// injects it into the env vars the Go github-mcp-server binary expects,
// and execs it over stdio.

import { createPrivateKey, createSign } from "crypto";

const { GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_INSTALLATION_ID } = Bun.env;

if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_INSTALLATION_ID) {
  console.error(
    "❌ Missing required GitHub configuration environment variables.",
  );
  process.exit(1);
}

function buildAppJwt(appId: string, privateKeyPem: string): string {
  const privateKey = createPrivateKey({ key: privateKeyPem, format: "pem" });

  const now = Math.floor(Date.now() / 1000);
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({
      iat: now - 30, // allow for clock skew
      exp: now + 300, // GitHub caps app JWTs at 10 minutes; 5 is plenty here
      iss: appId,
    }),
  ).toString("base64url");

  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

async function fetchInstallationToken(
  jwt: string,
  installationId: string,
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "github-mcp-connector",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    throw new Error("GitHub response did not include a token");
  }
  return body.token;
}

function installTokenIntoEnv(token: string): void {
  // Drop the App credentials so they aren't inherited by the child process.
  // Note: this only removes the env var reference, it does not zero out
  // the string in memory — Bun/V8 give no such guarantee.
  delete Bun.env.GITHUB_PRIVATE_KEY;
  delete Bun.env.GITHUB_APP_ID;
  delete Bun.env.GITHUB_INSTALLATION_ID;

  // Mirror the token to every variable the Go binary checks.
  Bun.env.GH_TOKEN = token;
  Bun.env.GITHUB_TOKEN = token;
  Bun.env.GITHUB_PERSONAL_ACCESS_TOKEN = token;
}

async function main() {
  const jwt = buildAppJwt(GITHUB_APP_ID!, GITHUB_PRIVATE_KEY!);

  let token: string;
  try {
    token = await fetchInstallationToken(jwt, GITHUB_INSTALLATION_ID!);
  } catch (err) {
    console.error("❌ Failed to fetch installation token:", err);
    process.exit(1);
  }

  installTokenIntoEnv(token);

  const mcp = Bun.spawn(["github-mcp-server", "stdio"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: Bun.env,
  });

  const exitCode = await mcp.exited;
  process.exit(exitCode ?? 1);
}

await main();
