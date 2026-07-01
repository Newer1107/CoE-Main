import { OAuth2Client } from 'google-auth-library';

export type GoogleTokenPayload = {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google ID token and returns the verified payload.
 *
 * Validates:
 *  - Token signature (library handles cert caching/rotation)
 *  - aud matches GOOGLE_CLIENT_ID (library does this)
 *  - iss is accounts.google.com (library does this)
 *  - exp is in the future (library does this)
 *
 * Caller is responsible for:
 *  - Checking email_verified === true
 *  - Checking email domain === ALLOWED_EMAIL_DOMAIN
 *
 * Throws on invalid/expired/malformed tokens.
 */
export async function verifyGoogleToken(
  credential: string,
): Promise<GoogleTokenPayload> {
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Google token payload is empty');
  }

  if (!payload.sub || !payload.email) {
    throw new Error('Google token missing required claims (sub, email)');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    email_verified: payload.email_verified === true,
  };
}
