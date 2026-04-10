import { SENDING_LINES } from './supabase';
import { getSupabaseAdmin } from './supabase-admin';

const PAGE_SIZE = 1000;

/**
 * Auto-assigns all alumni contacts with a phone_primary that are
 * not yet in the outreach_queue. First run does a sequential split
 * across lines; subsequent runs append to the shortest lines.
 */
export async function autoAssignQueue(chapterId: string): Promise<{ assigned: number; total_in_queue: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Database not connected');

  // Fetch ALL contacts with phone (paginated past 1000-row limit)
  const allContacts: { id: string }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('alumni_contacts')
      .select('id')
      .eq('chapter_id', chapterId)
      .not('phone_primary', 'is', null)
      .eq('is_imessage', true)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    allContacts.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allContacts.length === 0) {
    return { assigned: 0, total_in_queue: 0 };
  }

  // Fetch ALL existing queue entries (paginated)
  const existingQueue: { contact_id: string; line_number: number; queue_position: number }[] = [];
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('outreach_queue')
      .select('contact_id, line_number, queue_position')
      .eq('chapter_id', chapterId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    existingQueue.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const assignedContactIds = new Set(existingQueue.map(q => q.contact_id));
  const newContacts = allContacts.filter(c => !assignedContactIds.has(c.id));

  if (newContacts.length === 0) {
    return { assigned: 0, total_in_queue: assignedContactIds.size };
  }

  const lineCount = SENDING_LINES.length;
  const toInsert: { chapter_id: string; contact_id: string; line_number: number; queue_position: number }[] = [];

  if (existingQueue.length === 0) {
    const base = Math.floor(newContacts.length / lineCount);
    const remainder = newContacts.length % lineCount;
    let idx = 0;

    for (let ln = 0; ln < lineCount; ln++) {
      const count = base + (ln < remainder ? 1 : 0);
      for (let pos = 0; pos < count; pos++) {
        toInsert.push({
          chapter_id: chapterId,
          contact_id: newContacts[idx].id,
          line_number: ln + 1,
          queue_position: pos + 1,
        });
        idx++;
      }
    }
  } else {
    const lineCounts = new Array(lineCount).fill(0);
    const lineMaxPos = new Array(lineCount).fill(0);

    for (const q of existingQueue) {
      const idx = q.line_number - 1;
      if (idx >= 0 && idx < lineCount) {
        lineCounts[idx]++;
        if (q.queue_position > lineMaxPos[idx]) lineMaxPos[idx] = q.queue_position;
      }
    }

    for (const contact of newContacts) {
      const minIdx = lineCounts.indexOf(Math.min(...lineCounts));
      lineCounts[minIdx]++;
      lineMaxPos[minIdx]++;
      toInsert.push({
        chapter_id: chapterId,
        contact_id: contact.id,
        line_number: minIdx + 1,
        queue_position: lineMaxPos[minIdx],
      });
    }
  }

  const batchSize = 500;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const { error } = await supabase
      .from('outreach_queue')
      .insert(toInsert.slice(i, i + batchSize));
    if (error) {
      console.error('Queue assignment batch error:', error.message);
    }
  }

  return { assigned: toInsert.length, total_in_queue: assignedContactIds.size + toInsert.length };
}
