import { Mem0MemoryHit } from './client';

/** Format Mem0 hits for the Brain system prompt. */
export function formatMemoriesForSystemPrompt(memories: Mem0MemoryHit[]): string | null {
  if (memories.length === 0) return null;

  const lines = [
    'Persistent memory (Mem0) — use when relevant; do not invent memories:',
    ...memories.slice(0, 10).map((m, i) => {
      const score =
        typeof m.score === 'number' ? ` (score ${m.score.toFixed(2)})` : '';
      return `${i + 1}. ${m.memory}${score}`;
    }),
  ];

  return lines.join('\n');
}

/** Append Mem0 block to an existing systemAppend string. */
export function mergeMemoryIntoSystemAppend(
  systemAppend: string | undefined,
  memories: Mem0MemoryHit[]
): string | undefined {
  const block = formatMemoriesForSystemPrompt(memories);
  if (!block) return systemAppend;
  if (!systemAppend?.trim()) return block;
  return `${systemAppend.trim()}\n\n${block}`;
}
