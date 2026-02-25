/**
 * Edge-safe auth configuration — shared between middleware and server.
 * Contains only JWT/session/callbacks/pages config. No providers, no DB imports.
 * Both instances use the same AUTH_SECRET for JWT signing/verification.
 *
 * Official pattern: https://authjs.dev/guides/edge-compatibility
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  session: { strategy: 'jwt' as const },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        (token as Record<string, unknown>).role = (user as unknown as Record<string, unknown>).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as unknown as Record<string, unknown>).id = token.sub;
        (session.user as unknown as Record<string, unknown>).role = (token as Record<string, unknown>).role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
