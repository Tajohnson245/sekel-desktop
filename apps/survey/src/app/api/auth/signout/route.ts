import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
  const db = await createServerClient();
  await db.auth.signOut();
  return NextResponse.redirect(new URL("/dashboard/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002"));
}
