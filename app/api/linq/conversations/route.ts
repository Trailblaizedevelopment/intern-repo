import { NextRequest, NextResponse } from 'next/server';
import { listChats, LinqChat } from '@/lib/linq';
import { getPlatformAdmin } from '@/lib/supabase-platform';

const LINES = [
  { number: 1, label: 'Owen', phone: '+16462408056' },
  { number: 2, label: 'Adam', phone: '+16462668785' },
  { number: 3, label: 'Ford', phone: '+16462442696' },
] as const;

export async function GET(request: NextRequest) {
  const supabase = getPlatformAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Platform Supabase not configured', code: 'CONFIG_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const lineFilter = searchParams.get('line');     // '1' | '2' | '3' | null
    const flaggedOnly = searchParams.get('flagged') === 'true';
    const search = searchParams.get('search') || '';

    // Fetch chats from relevant lines in parallel
    const targetLines = lineFilter
      ? LINES.filter(l => l.number === parseInt(lineFilter))
      : [...LINES];

    const results = await Promise.allSettled(
      targetLines.map(line => listChats(line.phone, 150).then(r => ({ line, chats: r.chats })))
    );

    // Flatten + attach line metadata
    const allChats: Array<{ chat: LinqChat; line: typeof LINES[number] }> = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const chat of result.value.chats) {
          allChats.push({ chat, line: result.value.line });
        }
      }
    }

    // Collect all recipient phone numbers
    const phones = [
      ...new Set(
        allChats.flatMap(({ chat }) =>
          chat.handles.filter(h => !h.is_me).map(h => h.handle)
        ).filter(Boolean)
      ),
    ];

    // Batch lookup alumni_contacts by phone
    // Gracefully handle if flagged columns don't exist yet
    let contacts: Array<{
      id: string;
      first_name: string;
      last_name: string;
      phone_primary: string | null;
      phone_secondary: string | null;
      chapter_id: string;
      flagged: boolean | null;
      flagged_reason: string | null;
      response_text: string | null;
      last_response_at: string | null;
    }> = [];

    if (phones.length > 0) {
      const orClauses = phones.map(p => `phone_primary.eq.${p},phone_secondary.eq.${p}`).join(',');
      const { data, error } = await supabase
        .from('alumni_contacts')
        .select('id, first_name, last_name, phone_primary, phone_secondary, chapter_id, flagged, flagged_reason, response_text, last_response_at')
        .or(orClauses);

      if (!error) {
        contacts = data || [];
      } else if (error.message?.includes('flagged')) {
        // Column doesn't exist yet — retry without flagged columns
        const { data: data2 } = await supabase
          .from('alumni_contacts')
          .select('id, first_name, last_name, phone_primary, phone_secondary, chapter_id, response_text, last_response_at')
          .or(orClauses);
        contacts = (data2 || []).map(c => ({ ...c, flagged: null, flagged_reason: null }));
      }
    }

    // Build phone → contact lookup
    const phoneToContact = new Map<string, typeof contacts[0]>();
    for (const c of contacts) {
      if (c.phone_primary) phoneToContact.set(c.phone_primary, c);
      if (c.phone_secondary) phoneToContact.set(c.phone_secondary, c);
    }

    // Fetch chapter names
    const chapterIds = [...new Set(contacts.map(c => c.chapter_id).filter(Boolean))];
    const chapterMap = new Map<string, string>();
    if (chapterIds.length > 0) {
      const { data: chapters } = await supabase
        .from('chapters')
        .select('id, chapter_name')
        .in('id', chapterIds);
      for (const ch of chapters || []) chapterMap.set(ch.id, ch.chapter_name);
    }

    // Build enriched conversation objects
    const enriched = allChats.map(({ chat, line }) => {
      const recipientHandle = chat.handles.find(h => !h.is_me);
      const phone = recipientHandle?.handle || null;
      const contact = phone ? (phoneToContact.get(phone) ?? null) : null;

      return {
        chat_id: chat.id,
        line_number: line.number,
        line_label: line.label,
        phone,
        service: recipientHandle?.service ?? null,
        contact_id: contact?.id ?? null,
        contact_name: contact
          ? `${contact.first_name} ${contact.last_name}`.trim()
          : null,
        chapter_id: contact?.chapter_id ?? null,
        chapter_name: contact?.chapter_id ? (chapterMap.get(contact.chapter_id) ?? null) : null,
        flagged: contact?.flagged ?? false,
        flagged_reason: contact?.flagged_reason ?? null,
        last_response_text: contact?.response_text ?? null,
        last_response_at: contact?.last_response_at ?? null,
        updated_at: chat.updated_at,
        is_archived: chat.is_archived,
      };
    });

    // Apply flagged filter
    let filtered = flaggedOnly ? enriched.filter(c => c.flagged) : enriched;

    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        c =>
          (c.contact_name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.chapter_name || '').toLowerCase().includes(q)
      );
    }

    // Sort: most recent first; within 'all' view flagged float to top
    filtered.sort((a, b) => {
      if (!flaggedOnly) {
        if (a.flagged && !b.flagged) return -1;
        if (!a.flagged && b.flagged) return 1;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return NextResponse.json({ data: filtered, error: null });
  } catch (err) {
    console.error('[linq/conversations] error:', err);
    return NextResponse.json(
      { data: null, error: { message: String(err), code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
