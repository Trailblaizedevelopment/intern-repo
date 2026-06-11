// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchCalendarEvents, refreshAccessToken } from '@/lib/google';

// ─── Employee ID → Name mapping ───────────────────────────────────────────────
const EMPLOYEE_ID_TO_NAME: Record<string, string> = {
  '33ab5810-4d9f-485e-babb-a99b650a09e1': 'Owen',
  '3853cd9d-0773-4d04-b23f-20eb51717e0f': 'Ford',
  '66952c26-316d-4e9c-8fe1-4dd5743926ef': 'Adam',
};

// ─── School abbreviation → Full name ─────────────────────────────────────────
const SCHOOL_ABBREVS: Record<string, string> = {
  'BAMA': 'University of Alabama',
  'BAMA Alabama': 'University of Alabama',
  'OLE MISS': 'University of Mississippi',
  'MIZZOU': 'University of Missouri',
  'OSU': 'Oklahoma State University',
  'PSU': 'Penn State University',
  'PENN STATE': 'Penn State University',
  'UW': 'University of Washington',
  'UCLA': 'UCLA',
  'USC': 'University of Southern California',
  'UNC': 'University of North Carolina',
  'UGA': 'University of Georgia',
  'LSU': 'Louisiana State University',
  'TCU': 'Texas Christian University',
  'SMU': 'Southern Methodist University',
  'VT': 'Virginia Tech',
  'INDIANA': 'Indiana University',
  'KENTUCKY': 'University of Kentucky',
  'OHIO STATE': 'Ohio State University',
  'MICHIGAN': 'University of Michigan',
  'FLORIDA': 'University of Florida',
  'GEORGIA': 'University of Georgia',
  'TENNESSEE': 'University of Tennessee',
  'TEXAS': 'University of Texas',
  'ARKANSAS': 'University of Arkansas',
  'CLEMSON': 'Clemson University',
  'AUBURN': 'Auburn University',
  'MISSISSIPPI STATE': 'Mississippi State University',
  'IOWA': 'University of Iowa',
  'IOWA STATE': 'Iowa State University',
  'PURDUE': 'Purdue University',
  'MICHIGAN STATE': 'Michigan State University',
  'MINNESOTA': 'University of Minnesota',
  'ILLINOIS': 'University of Illinois',
  'NORTHWESTERN': 'Northwestern University',
  'NEBRASKA': 'University of Nebraska',
  'WISCONSIN': 'University of Wisconsin',
  'RUTGERS': 'Rutgers University',
  'MARYLAND': 'University of Maryland',
  'PENN': 'University of Pennsylvania',
  'DUKE': 'Duke University',
  'WAKE FOREST': 'Wake Forest University',
  'VIRGINIA': 'University of Virginia',
  'NC STATE': 'North Carolina State University',
  'PITT': 'University of Pittsburgh',
  'SYRACUSE': 'Syracuse University',
  'BOSTON COLLEGE': 'Boston College',
  'LOUISVILLE': 'University of Louisville',
  'MIAMI': 'University of Miami',
  'FLORIDA STATE': 'Florida State University',
  'GEORGIA TECH': 'Georgia Tech',
  'VANDERBILT': 'Vanderbilt University',
  'SOUTH CAROLINA': 'University of South Carolina',
  'MISSISSIPPI': 'University of Mississippi',
  'COLORADO': 'University of Colorado',
  'UTAH': 'University of Utah',
  'ARIZONA': 'University of Arizona',
  'ARIZONA STATE': 'Arizona State University',
  'WASHINGTON STATE': 'Washington State University',
  'OREGON': 'University of Oregon',
  'OREGON STATE': 'Oregon State University',
  'STANFORD': 'Stanford University',
  'CAL': 'UC Berkeley',
  'BAYLOR': 'Baylor University',
  'TCU': 'Texas Christian University',
  'WEST VIRGINIA': 'West Virginia University',
  'KANSAS': 'University of Kansas',
  'KANSAS STATE': 'Kansas State University',
  'OKLAHOMA': 'University of Oklahoma',
  'OKLAHOMA STATE': 'Oklahoma State University',
  'TEXAS TECH': 'Texas Tech University',
  'CINCINNATI': 'University of Cincinnati',
  'UCF': 'University of Central Florida',
  'ECU': 'East Carolina University',
  'DELAWARE': 'University of Delaware',
  'ROBERT MORRIS': 'Robert Morris University',
  'SACRED HEART': 'Sacred Heart University',
  'EASTERN ILLINOIS': 'Eastern Illinois University',
  'WILLIAM AND MARY': 'College of William and Mary',
  'TULANE': 'Tulane University',
  'TEMPLE': 'Temple University',
  'DREXEL': 'Drexel University',
  'FORDHAM': 'Fordham University',
  'DEPAUL': 'DePaul University',
  'CHAPMAN': 'Chapman University',
  'SEWANEE': 'University of the South',
  'SWANEE': 'University of the South',
  'HOUSTON': 'University of Houston',
  'BYU': 'Brigham Young University',
};

// ─── National org abbreviation → Full name ────────────────────────────────────
const ORG_ABBREVS: Record<string, string> = {
  'ATO': 'Alpha Tau Omega',
  'DTD': 'Delta Tau Delta',
  'DELT': 'Delta Tau Delta',
  'DELT TAU DELT': 'Delta Tau Delta',
  'PHI DELT': 'Phi Delta Theta',
  'PHI DELTA THETA': 'Phi Delta Theta',
  'SIGEP': 'Sigma Phi Epsilon',
  'PHI KAP': 'Phi Kap',
  'PHI KAPPA SIGMA': 'Phi Kappa Sigma',
  'PHI KAPPA PSI': 'Phi Kappa Psi',
  'FIJI': 'Phi Gamma Delta',
  'PIKE': 'Pi Kappa Alpha',
  'KAPPA SIG': 'Kappa Sigma',
  'SAE': 'Sigma Alpha Epsilon',
  'TKE': 'Tau Kappa Epsilon',
  'KA': 'Kappa Alpha Order',
  'BETA': 'Beta Theta Pi',
  'LAMBDA CHI': 'Lambda Chi Alpha',
  'SIGMA CHI': 'Sigma Chi',
  'PI KAPPA PHI': 'Pi Kappa Phi',
  'PI KAPP': 'Pi Kappa Phi',
  'IFC': 'IFC',
  'PANHEL': 'Panhellenic',
  'PHI GAMMA DELTA': 'Phi Gamma Delta',
  'DELTA TAU DELTA': 'Delta Tau Delta',
  'KAPPA ALPHA': 'Kappa Alpha Order',
  'SIGMA NU': 'Sigma Nu',
  'DELTA SIG': 'Delta Sigma Phi',
  'DELTA SIGMA PHI': 'Delta Sigma Phi',
  'THETA CHI': 'Theta Chi',
  'PHI TAU': 'Phi Kappa Tau',
  'PHI SIG': 'Phi Sigma Kappa',
  'ACACIA': 'Acacia',
  'ALPHA SIG': 'Alpha Sigma Phi',
  'ZBT': 'Zeta Beta Tau',
  'PSI U': 'Psi Upsilon',
};

// Determine org type from name
function inferOrgType(name: string): string {
  const lower = name.toLowerCase();
  if (['ifc', 'panhel', 'panhellenic', 'npc', 'council'].some(k => lower.includes(k))) return 'council';
  if (['alpha chi omega', 'delta delta delta', 'tri delt', 'kappa kappa gamma', 'gamma phi', 'alpha phi', 'chi omega', 'kappa delta', 'pi beta phi', 'alpha delta pi', 'delta gamma', 'zeta tau alpha', 'sigma kappa', 'phi mu'].some(k => lower.includes(k))) return 'sorority';
  return 'fraternity';
}

// Normalize org name
function normalizeOrgName(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return ORG_ABBREVS[upper] || raw.trim();
}

// Normalize school name
function normalizeSchool(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return SCHOOL_ABBREVS[upper] || raw.trim();
}

// Parse calendar event title into org + school
// Handles multiple patterns:
//   "Sigma Chi @ Kentucky/Trailblaize"  (legacy slash format)
//   "Arizona Delta Chi + Trailblaize"   (new plus format used by Worth)
//   "IFC LSU/Trailblaize"               (council format)
//   "ECU Sigma Pi + Trailblaize"        (school-prefix format)
function parseEventTitle(title: string): { orgName: string; schoolName: string | null; orgType: string } | null {
  // Strip trailing separator + "Trailblaize" in all common forms:
  // "/Trailblaize", "+ Trailblaize", "— Trailblaize", "– Trailblaize"
  let clean = title.replace(/\s*(?:\/|\+|\u2013|\u2014)\s*trailblaize\s*$/i, '').trim();

  // Try "org @ school" pattern
  if (clean.includes(' @ ')) {
    const atIdx = clean.indexOf(' @ ');
    const orgPart = clean.slice(0, atIdx);
    const schoolPart = clean.slice(atIdx + 3);
    const orgName = normalizeOrgName(orgPart.trim());
    const schoolName = normalizeSchool(schoolPart.trim());
    const orgType = inferOrgType(orgName);
    return { orgName, schoolName, orgType };
  }

  // Try "IFC SCHOOL" or "council SCHOOL" pattern
  const councilMatch = clean.match(/^(IFC|PANHEL|PHC)\s+(.+)$/i);
  if (councilMatch) {
    const schoolName = normalizeSchool(councilMatch[2].trim());
    return { orgName: `${councilMatch[1]} ${schoolName}`, schoolName, orgType: 'council' };
  }

  // Try "[School abbreviation] [Org]" pattern — school key at the start
  // e.g. "Arizona Delta Chi" → Delta Chi @ University of Arizona
  //      "ECU Sigma Pi"      → Sigma Pi @ East Carolina University
  const words = clean.split(/\s+/);
  for (let i = 1; i <= Math.min(2, words.length - 1); i++) {
    const schoolKey = words.slice(0, i).join(' ').toUpperCase();
    if (SCHOOL_ABBREVS[schoolKey]) {
      const orgCandidate = words.slice(i).join(' ').trim();
      if (orgCandidate) {
        return {
          orgName: normalizeOrgName(orgCandidate),
          schoolName: SCHOOL_ABBREVS[schoolKey],
          orgType: inferOrgType(orgCandidate),
        };
      }
    }
  }

  return null;
}

// Check if all attendees are internal Trailblaize employees
function isInternalOnly(attendees: Array<{ email: string }> | undefined): boolean {
  if (!attendees || attendees.length === 0) return false;
  return attendees.every(a => a.email?.toLowerCase().endsWith('@trailblaize.net'));
}

// Match Granola note to a calendar event by date + org/school name
function matchGranolaNote(
  notes: any[],
  eventDate: Date,
  orgName: string,
  schoolName: string | null
): any | null {
  const eventDay = eventDate.toISOString().split('T')[0];
  const orgLower = orgName.toLowerCase();
  const schoolLower = schoolName?.toLowerCase() || '';

  return notes.find(note => {
    if (!note.title) return false;
    const titleLower = note.title.toLowerCase();
    const noteDate = note.created_at ? new Date(note.created_at).toISOString().split('T')[0] : null;

    // Date must be within 1 day
    if (noteDate) {
      const eventMs = new Date(eventDay).getTime();
      const noteMs = new Date(noteDate).getTime();
      const diffDays = Math.abs(eventMs - noteMs) / (1000 * 60 * 60 * 24);
      if (diffDays > 1) return false;
    }

    // Title must mention org or school
    return titleLower.includes(orgLower) || (schoolLower && titleLower.includes(schoolLower));
  }) || null;
}

// Extract contact info from Granola note or calendar attendees
function extractContact(
  note: any | null,
  attendees: Array<{ email: string; displayName?: string }> | undefined
): { name?: string; email?: string } {
  // From Granola note attendees
  if (note?.attendees) {
    const external = note.attendees.find((a: any) => a.email && !a.email.endsWith('@trailblaize.net'));
    if (external) return { name: external.name, email: external.email };
  }
  // From calendar attendees
  if (attendees) {
    const external = attendees.find(a => !a.email?.endsWith('@trailblaize.net'));
    if (external) return { name: external.displayName, email: external.email };
  }
  return {};
}

// Determine temperature based on Granola note content
function inferTemperature(note: any | null): string {
  if (!note) return 'warm';
  const text = (note.summary || note.transcript || note.content || note.title || '').toLowerCase();
  if (['strong interest', 'urgent', 'closing', 'ready to sign', 'very interested', 'move forward'].some(k => text.includes(k))) {
    return 'hot';
  }
  return 'warm';
}

// Get a valid access token for an employee, refreshing if needed
async function getAccessToken(supabase: any, tokenData: any, employeeId: string): Promise<string | null> {
  let accessToken = tokenData.access_token;
  const expiresAt = new Date(tokenData.expires_at);

  if (expiresAt <= new Date()) {
    if (!tokenData.refresh_token) return null;
    try {
      const newTokens = await refreshAccessToken(tokenData.refresh_token);
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
      await supabase
        .from('google_oauth_tokens')
        .update({ access_token: newTokens.access_token, expires_at: newExpiresAt.toISOString() })
        .eq('employee_id', employeeId);
      accessToken = newTokens.access_token;
    } catch {
      return null;
    }
  }

  return accessToken;
}

// Fetch all calendar events with pagination
async function fetchAllCalendarEvents(accessToken: string, timeMin: string, timeMax: string): Promise<any[]> {
  const allEvents: any[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: '2500',
      ...(pageToken ? { pageToken } : {}),
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) break;
    const data = await res.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allEvents;
}

// Fetch Granola notes directly
async function fetchGranolaNotesInternal(): Promise<any[]> {
  const keys = [
    process.env.GRANOLA_API_KEY,
    process.env.GRANOLA_API_KEY_FORD,
    process.env.GRANOLA_API_KEY_ADAM,
  ].filter(Boolean) as string[];

  if (!keys.length) return [];

  const results = await Promise.allSettled(
    keys.map(k =>
      fetch('https://public-api.granola.ai/v1/notes', {
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      }).then(r => r.ok ? r.json() : { notes: [] })
        .then(d => Array.isArray(d) ? d : (d.notes ?? []))
    )
  );

  const allNotes: any[] = [];
  const seenIds = new Set<string>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const note of r.value) {
        if (note.id && !seenIds.has(note.id)) {
          seenIds.add(note.id);
          allNotes.push(note);
        }
      }
    }
  }
  return allNotes;
}

export async function POST(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const dryRun = searchParams.get('dryRun') === 'true';
  const lookbackDays = parseInt(searchParams.get('days') || '120');

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

    // 1. Get all employees with connected Google accounts
    const { data: tokens, error: tokenErr } = await supabase
      .from('google_oauth_tokens')
      .select('*');

    if (tokenErr || !tokens?.length) {
      return NextResponse.json({ synced: 0, skipped: 0, errors: 0, details: [], message: 'No connected Google accounts found' });
    }

    // 2. Fetch calendar events for each employee
    const timeMin = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const allEvents: Array<{ event: any; employeeId: string; employeeName: string }> = [];

    for (const tokenData of tokens) {
      const employeeId = tokenData.employee_id;
      const employeeName = EMPLOYEE_ID_TO_NAME[employeeId] || employeeId;

      const accessToken = await getAccessToken(supabase, tokenData, employeeId);
      if (!accessToken) continue;

      try {
        const events = await fetchAllCalendarEvents(accessToken, timeMin, timeMax);
        for (const event of events) {
          allEvents.push({ event, employeeId, employeeName });
        }
      } catch {
        // Continue to next employee if this one fails
      }
    }

    // 3. Filter for Trailblaize demo events (deduplicate by event ID)
    const seenEventIds = new Set<string>();
    const demoEvents: Array<{ event: any; employeeId: string; employeeName: string }> = [];

    for (const { event, employeeId, employeeName } of allEvents) {
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);

      const title = event.summary || '';
      if (!title.toLowerCase().includes('trailblaize')) continue;
      if (isInternalOnly(event.attendees)) continue;

      demoEvents.push({ event, employeeId, employeeName });
    }

    // 4. Fetch Granola notes
    const granolaNotes = await fetchGranolaNotesInternal();

    // 5. Build ImportRows from events
    const importRows: any[] = [];
    const details: Array<{ title: string; status: string; reason?: string }> = [];

    for (const { event, employeeName } of demoEvents) {
      const title = event.summary || '';
      const parsed = parseEventTitle(title);

      if (!parsed) {
        details.push({ title, status: 'skipped', reason: 'Could not parse event title' });
        continue;
      }

      const { orgName, schoolName, orgType } = parsed;
      const eventStart = event.start?.dateTime || event.start?.date;
      const eventDate = eventStart ? new Date(eventStart) : new Date();
      const isFuture = eventDate > new Date();

      // Find matching Granola note
      const granolaNote = matchGranolaNote(granolaNotes, eventDate, orgName, schoolName);

      // Extract contact info
      const contact = extractContact(granolaNote, event.attendees);

      // Determine temperature
      const temperature = inferTemperature(granolaNote);

      // Build notes from Granola
      let notes: string | undefined;
      if (granolaNote) {
        const summary = granolaNote.summary || granolaNote.transcript?.slice(0, 500) || '';
        if (summary) notes = `[Granola] ${summary}`;
      }

      // Determine assigned_to (from organizer or the employee whose calendar had the event)
      let assignedTo = employeeName;
      if (event.organizer?.email) {
        // Check if organizer is one of our employees
        for (const [id, name] of Object.entries(EMPLOYEE_ID_TO_NAME)) {
          // We can't easily map email to employee here without a DB lookup, use calendar owner
          void id;
          void name;
        }
      }

      const row = {
        org_name: orgName,
        org_type: orgType,
        school_name: schoolName || undefined,
        national_org_name: orgType === 'fraternity' || orgType === 'sorority' ? orgName : undefined,
        stage: isFuture ? 'demo_booked' : 'first_demo',
        temperature,
        value: orgType === 'council' ? '0' : '3588',
        contact_name: contact.name || undefined,
        contact_email: contact.email || undefined,
        notes: notes || undefined,
        assigned_to: assignedTo,
      };

      importRows.push(row);
      details.push({ title, status: 'queued' });
    }

    if (dryRun) {
      return NextResponse.json({
        synced: 0,
        skipped: 0,
        errors: 0,
        dryRun: true,
        wouldImport: importRows.length,
        details,
        rows: importRows,
      });
    }

    if (!importRows.length) {
      return NextResponse.json({ synced: 0, skipped: 0, errors: 0, details, message: 'No Trailblaize demo events found' });
    }

    // 6. POST to /api/pipeline/import
    // Use req.nextUrl.origin so this works correctly in all environments
    // (avoids NEXT_PUBLIC_APP_URL / localhost fallback issues in production)
    const baseUrl = req.nextUrl.origin;
    const importRes = await fetch(`${baseUrl}/api/pipeline/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: importRows, skipDuplicates: true }),
    });

    if (!importRes.ok) {
      const err = await importRes.text();
      return NextResponse.json({ error: `Import failed: ${err}` }, { status: 500 });
    }

    const importResult = await importRes.json();

    return NextResponse.json({
      synced: importResult.created ?? 0,
      skipped: importResult.skipped ?? 0,
      errors: importResult.errors ?? 0,
      details: importResult.results || details,
      eventsFound: demoEvents.length,
      rowsBuilt: importRows.length,
    });
  } catch (err) {
    console.error('[sync-calendar] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
