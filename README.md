# github-mcp-wrapper

This utility intercepts the Model Context Protocol (MCP) startup routine to seamlessly generate a short-lived GitHub Installation Access Token from a GitHub App credential stack, mutates the local execution environment, and natively spawns the compiled Go github-mcp-server binary using direct OS file-descriptor mapping.


#### Usage

```toml
[mcp.servers.github]
  url = "https://github.com"
  transport = "stdio
  command = "bunx"
  args = ["@susyabashti/github-mcp-wrapper"]
  env = { "GITHUB_APP_ID": "", "GITHUB_PRIVATE_KEY": "", "GITHUB_INSTALLATION_ID": "" }
```

Just translate it to whatever configuration format your MCP client supports.
