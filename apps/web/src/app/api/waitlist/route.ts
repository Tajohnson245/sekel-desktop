import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';

const resend = new Resend(process.env.RESEND_API_KEY);

const schema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? 'Invalid email.' },
        { status: 400 },
      );
    }

    const { email } = result.data;

    const { error } = await resend.emails.send({
      to: [email],
      template: { id: process.env.RESEND_TEMPLATE_ID! },
    });

    if (error) {
      console.error('Resend emails.send error:', error);
      return NextResponse.json({ error: 'Failed to send email.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Waitlist API error:', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
