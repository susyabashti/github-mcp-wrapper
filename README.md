# github-mcp-wrapper

This utility intercepts the Model Context Protocol (MCP) startup routine to seamlessly generate a short-lived GitHub Installation Access Token from a GitHub App credential stack, mutates the local execution environment, and natively spawns the compiled Go github-mcp-server binary using direct OS file-descriptor mapping.
