# Pre-Release Versions

Pre-release builds (beta, alpha, rc) are published to separate npm dist-tags. They won't be installed by normal `npm update` or `mantis-ai init` — you have to opt in explicitly.

**Install the latest pre-release:**

```bash
mkdir my-agent && cd my-agent
npx mantis-ai@beta init
```

**Install a specific version:**

```bash
npx mantis-ai@1.3.0-beta.1 init
```

**Check available versions:**

```bash
npm info mantis-ai
```

**Go back to stable:**

```bash
npm install mantis-ai@latest
npx mantis-ai init
```

Pre-releases may contain breaking changes or incomplete features. Use them for testing and feedback — not production agents.
