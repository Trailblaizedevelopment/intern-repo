import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/sendgrid';

export async function POST(req: NextRequest) {
  const { to, subject, htmlBody } = await req.json();
  const result = await sendEmail({ to, subject, htmlBody });
  return NextResponse.json(result);
}
