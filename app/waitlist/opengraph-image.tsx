import { readFileSync } from 'fs';
import { join } from 'path';

export const alt = 'The Next Social Network — Won\'t create connections, it will reveal them.';
export const size = { width: 1200, height: 1500 };
export const contentType = 'image/jpeg';

export default function Image() {
  const buffer = readFileSync(join(process.cwd(), 'public', 'og-waitlist.jpg'));
  return new Response(buffer, {
    headers: { 'Content-Type': 'image/jpeg' },
  });
}
