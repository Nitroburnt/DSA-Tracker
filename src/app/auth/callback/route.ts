import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/auth?error=config_missing`);
  }

  if (code) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[oauth-callback] exchangeCodeForSession failed:', error.message);
      return NextResponse.redirect(`${origin}/auth?error=oauth_failed&intent=signin`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
