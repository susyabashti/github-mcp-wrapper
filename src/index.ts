// github-mcp-wrapper.ts
import { createPrivateKey, createSign } from "crypto";

const { GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_INSTALLATION_ID } = Bun.env;

if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_INSTALLATION_ID) {
  console.error(
    "❌ Missing required GitHub configuration environment variables.",
  );
  process.exit(1);
}

// 1. Instantly parse private key into internal CryptoKey reference object
const privateKey = createPrivateKey({
  key: GITHUB_PRIVATE_KEY,
  format: "pem",
});

// 2. Generate optimized JWT structures (Single-pass inline stringification)
const now = Math.floor(Date.now() / 1000);
const part1 = Buffer.from(
  JSON.stringify({ alg: "RS256", typ: "JWT" }),
).toString("base64url");
const part2 = Buffer.from(
  JSON.stringify({
    iat: now - 30, // 30s clock-skew buffer
    exp: now + 300,
    iss: GITHUB_APP_ID,
  }),
).toString("base64url");

const tokenInput = `${part1}.${part2}`;

// 3. Perform atomic signature generation
const sign = createSign("RSA-SHA256");
sign.update(tokenInput);
const jwtToken = `${tokenInput}.${sign.sign(privateKey, "base64url")}`;

// 4. Secure network exchange
const response = await fetch(
  `https://api.github.com/app/installations/${GITHUB_INSTALLATION_ID}/access_tokens`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ZeroClaw-MCP-App",
    },
  },
);

if (!response.ok) {
  console.error(
    "❌ Failed to fetch installation token:",
    await response.text(),
  );
  process.exit(1);
}

const { token } = (await response.json()) as { token: string };

// 5. Hard memory scrubbing of secrets before launching the child binary
delete Bun.env.GITHUB_PRIVATE_KEY;
delete Bun.env.GITHUB_APP_ID;
delete Bun.env.GITHUB_INSTALLATION_ID;

// Mirror the token to all variables the native Go binary checks
Bun.env.GH_TOKEN = token;
Bun.env.GITHUB_TOKEN = token;
Bun.env.GITHUB_PERSONAL_ACCESS_TOKEN = token;

// 6. Spawn the Go binary natively via Bun with zero streaming overhead
const mcp = Bun.spawn(["github-mcp-server", "stdio"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: Bun.env,
});

// Await completion cleanly to handle process exit codes correctly
process.exit(await mcp.exited);
