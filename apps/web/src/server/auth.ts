import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq, and, isNull } from 'drizzle-orm';
import { users, userRoles } from '@gm/db';
import { z } from 'zod';
import { db } from './db';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, parsed.data.email), isNull(users.deletedAt)))
          .limit(1);
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        const roles = await db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, user.id));

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          companyId: user.companyId,
          roles: roles.map((r) => r.role),
          locale: user.preferredLocale,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.companyId = (user as { companyId: string }).companyId;
        token.roles = (user as { roles: string[] }).roles;
        token.locale = (user as { locale: string }).locale;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
        (session.user as { companyId?: string }).companyId = token.companyId as string;
        (session.user as { roles?: string[] }).roles = token.roles as string[];
        (session.user as { locale?: string }).locale = token.locale as string;
      }
      return session;
    },
  },
});
