import { getRelevantMemories, insertMemories } from '../db/memories.js';

/**
 * Enrich a job prompt with relevant memories from previous jobs.
 * Non-blocking: returns the original prompt on any failure.
 *
 * @param {string} prompt - Original job description
 * @returns {string} Enriched prompt or original on failure
 */
export function enrichPromptWithMemory(prompt) {
  try {
    const relevant = getRelevantMemories(prompt, { limit: 5 });
    if (!relevant || relevant.length === 0) return prompt;

    const memoryBlock = relevant
      .map((m, i) => `${i + 1}. [${m.category}] ${m.content}`)
      .join('\n');

    return `## Context from Previous Jobs\n\n${memoryBlock}\n\n---\n\n${prompt}`;
  } catch (err) {
    console.error('[memory] Failed to enrich prompt:', err.message);
    return prompt;
  }
}

/**
 * Extract reusable learnings from a completed job using the LLM.
 * Fire-and-forget — failures are logged but not thrown.
 *
 * @param {string} jobId - The completed job's ID
 * @param {object} results - Job results from webhook payload
 */
export async function extractMemoriesFromJob(jobId, results) {
  try {
    const { getJobById } = await import('../db/jobs.js');
    const job = getJobById(jobId);

    const sections = [
      job?.prompt ? `## Job Description\n${job.prompt}` : '',
      job?.summary || results.commit_message ? `## Summary\n${job?.summary || results.commit_message}` : '',
      results.changed_files?.length ? `## Changed Files\n${results.changed_files.join('\n')}` : '',
      results.log ? `## Log Excerpt\n${results.log.slice(0, 2000)}` : '',
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
        : response.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const entries = parsed
      .filter((e) => e.content && typeof e.content === 'string')
      .map((e) => ({
        content: e.content,
        category: e.category || 'general',
        sourceJobId: jobId,
        relevance: Math.min(10, Math.max(1, Number(e.relevance) || 5)),
      }));

    if (entries.length > 0) {
      insertMemories(entries);
      console.log(`[memory] Extracted ${entries.length} memories from job ${jobId.slice(0, 8)}`);
    }
  } catch (err) {
    console.error('[memory] Failed to extract memories:', err.message);
  }
}
