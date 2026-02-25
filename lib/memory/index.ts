import { getRelevantMemories, insertMemories } from '../db/memories.js';
import type { MemoryInsert } from '../types.js';

/**
 * Enrich a job prompt with relevant memories from previous jobs.
 * Non-blocking: returns the original prompt on any failure.
 */
export function enrichPromptWithMemory(prompt: string): string {
  try {
    const relevant = getRelevantMemories(prompt, { limit: 5 });
    if (!relevant || relevant.length === 0) return prompt;

    const memoryBlock = relevant
      .map((m, i) => `${i + 1}. [${m.category}] ${m.content}`)
      .join('\n');

    return `## Context from Previous Jobs\n\n${memoryBlock}\n\n---\n\n${prompt}`;
  } catch (err: unknown) {
    console.error('[memory] Failed to enrich prompt:', (err as Error).message);
    return prompt;
  }
}

/**
 * Extract reusable learnings from a completed job using the LLM.
 * Fire-and-forget — failures are logged but not thrown.
 */
export async function extractMemoriesFromJob(jobId: string, results: Record<string, unknown>): Promise<void> {
  try {
    const { getJobById } = await import('../db/jobs.js');
    const job = getJobById(jobId);

    const sections = [
      job?.prompt ? `## Job Description\n${job.prompt}` : '',
      job?.summary || results.commit_message ? `## Summary\n${job?.summary || results.commit_message}` : '',
      (results.changed_files as string[])?.length ? `## Changed Files\n${(results.changed_files as string[]).join('\n')}` : '',
      results.log ? `## Log Excerpt\n${(results.log as string).slice(0, 2000)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!sections) return;

    const { createModel } = await import('../ai/model.js');
    const model = await createModel({ maxTokens: 1024 });

    const response = await model.invoke([
      [
        'system',
        `You extract reusable learnings from completed agent jobs. Analyze the job and extract 0-5 key facts, preferences, or lessons that would be useful for future jobs. Return a JSON array of objects with "content" (the learning), "category" (one of: general, project, skill, preference, lesson), and "relevance" (1-10, how broadly useful). Return an empty array [] if there's nothing worth remembering. Return ONLY valid JSON, no markdown fences.`,
      ],
      ['human', sections],
    ]);

    const text =
      typeof response.content === 'string'
        ? response.content
        : (response.content as Array<{ type: string; text?: string }>)
            .filter((b) => b.type === 'text')
            .map((b) => b.text || '')
            .join('');

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const entries: MemoryInsert[] = parsed
      .filter((e: Record<string, unknown>) => e.content && typeof e.content === 'string')
      .map((e: Record<string, unknown>) => ({
        content: e.content as string,
        category: (e.category as string) || 'general',
        sourceJobId: jobId,
        relevance: Math.min(10, Math.max(1, Number(e.relevance) || 5)),
      }));

    if (entries.length > 0) {
      insertMemories(entries);
      console.log(`[memory] Extracted ${entries.length} memories from job ${jobId.slice(0, 8)}`);
    }
  } catch (err: unknown) {
    console.error('[memory] Failed to extract memories:', (err as Error).message);
  }
}
