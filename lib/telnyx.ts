/**
 * Telnyx Number Lookup — carrier type detection at upload time.
 * Classifies phone numbers as mobile, landline, voip, or unknown
 * so non-mobile numbers are permanently excluded from iMessage outreach.
 */

const TELNYX_BASE = 'https://api.telnyx.com/v2';

function getToken(): string {
  const token = process.env.TELNYX_API_KEY;
  if (!token) throw new Error('TELNYX_API_KEY env var not set');
  return token;
}

export type PhoneType = 'mobile' | 'landline' | 'voip' | 'unknown';

export interface TelnyxLookupResult {
  phone: string;
  phoneType: PhoneType;
  carrier?: string;
  valid: boolean;
}

/**
 * Look up a single phone number's carrier type.
 */
export async function lookupPhoneType(phone: string): Promise<TelnyxLookupResult> {
  const encoded = encodeURIComponent(phone);
  const res = await fetch(`${TELNYX_BASE}/number_lookup/${encoded}?type=carrier`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[telnyx] lookup failed for ${phone} (${res.status}): ${text}`);
    return { phone, phoneType: 'unknown', valid: false };
  }

  const data = await res.json();
  const lineType = data?.data?.carrier?.line_type?.toLowerCase() || 'unknown';

  let phoneType: PhoneType = 'unknown';
  if (lineType === 'mobile' || lineType === 'cell') {
    phoneType = 'mobile';
  } else if (lineType === 'landline' || lineType === 'fixed' || lineType === 'local') {
    phoneType = 'landline';
  } else if (lineType === 'voip' || lineType === 'virtual') {
    phoneType = 'voip';
  }

  return {
    phone,
    phoneType,
    carrier: data?.data?.carrier?.name,
    valid: true,
  };
}

/**
 * Batch lookup — processes up to N phones, returns map of phone → type.
 * Adds 100ms delay between calls to respect rate limits.
 */
export async function batchLookupPhoneTypes(
  phones: string[],
  delayMs = 100
): Promise<Map<string, PhoneType>> {
  const results = new Map<string, PhoneType>();

  for (const phone of phones) {
    const result = await lookupPhoneType(phone);
    results.set(phone, result.phoneType);
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  return results;
}
