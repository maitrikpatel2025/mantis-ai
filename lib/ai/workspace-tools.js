import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Create workspace tools for the LLM agent.
 * Returns an empty array when WORKSPACE_ENABLED is not set,
 * so the agent simply doesn't get these tools.
 *
 * Each tool lazy-imports the workspace manager to avoid circular deps
 * and calls workspace.fetch() which auto-starts the container.
 *
 * @returns {Array} Array of LangChain tool instances
 */
export function createWorkspaceTools() {
  if (process.env.WORKSPACE_ENABLED !== 'true' && process.env.WORKSPACE_ENABLED !== '1') {
    return [];
  }

  const runCommandTool = tool(
    async ({ command, cwd, timeout }) => {
      try {
        const { getWorkspace } = await import('../execution/workspace.js');
        const ws = getWorkspace();
        if (!ws) return JSON.stringify({ error: 'Workspace not enabled' });
        const result = await ws.fetch('/exec', { command, cwd, timeout });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    },
    {
      name: 'run_command',
      description:
        'Execute a shell command instantly in your persistent workspace (a Docker container with Node.js, git, Chrome, and common tools). ' +
        'Use for quick tasks: downloading files, running scripts, data processing, API calls, git operations, web scraping. ' +
        'The workspace persists between calls — installed packages, created files, and environment state all remain. ' +
        'For heavy autonomous coding tasks that should produce a PR, use create_job instead.',
      schema: z.object({
        command: z.string().describe('Shell command to execute (runs in bash)'),
        cwd: z.string().optional().describe('Working directory relative to /workspace. Defaults to /workspace.'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default 300000, max 600000)'),
      }),
    }
  );

  const readFileTool = tool(
    async ({ path }) => {
      try {
        const { getWorkspace } = await import('../execution/workspace.js');
        const ws = getWorkspace();
        if (!ws) return JSON.stringify({ error: 'Workspace not enabled' });
        const result = await ws.fetch('/read-file', { path });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    },
    {
      name: 'workspace_read_file',
      description:
        'Read a file from the workspace container. Path is relative to /workspace. ' +
        'Use to inspect command outputs, check configs, or read downloaded files.',
      schema: z.object({
        path: z.string().describe('File path relative to /workspace'),
      }),
    }
  );

  const writeFileTool = tool(
    async ({ path, content }) => {
      try {
        const { getWorkspace } = await import('../execution/workspace.js');
        const ws = getWorkspace();
        if (!ws) return JSON.stringify({ error: 'Workspace not enabled' });
        const result = await ws.fetch('/write-file', { path, content });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    },
    {
      name: 'workspace_write_file',
      description:
        'Write a file to the workspace container. Path is relative to /workspace. ' +
        'Directories are created automatically. Use to create scripts, configs, or data files.',
      schema: z.object({
        path: z.string().describe('File path relative to /workspace'),
        content: z.string().describe('File content to write'),
      }),
    }
  );

  const installPackageTool = tool(
    async ({ packages, type }) => {
      try {
        const { getWorkspace } = await import('../execution/workspace.js');
        const ws = getWorkspace();
        if (!ws) return JSON.stringify({ error: 'Workspace not enabled' });
        const result = await ws.fetch('/install', { packages, type: type || 'npm' });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    },
    {
      name: 'install_package',
      description:
        'Install packages in the workspace container. Supports npm packages (default) and apt system packages. ' +
        'Installed packages persist for the lifetime of the workspace. Use when a command needs a tool that is not pre-installed.',
      schema: z.object({
        packages: z.array(z.string()).describe('Package names to install'),
        type: z.enum(['npm', 'apt']).optional().describe('Package manager: "npm" (default) or "apt" for system packages'),
      }),
    }
  );

  return [runCommandTool, readFileTool, writeFileTool, installPackageTool];
}
