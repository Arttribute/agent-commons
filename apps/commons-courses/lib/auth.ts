import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        await connectDB();
        const user = await User.findOne({ email: credentials.email }).select(
          "+password"
        );
        if (!user) return null;
        if (!user.password) return null;
        if (!user.emailVerifiedAt) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return true;

      const email = user.email || profile?.email;
      if (!email) return false;

      await connectDB();
      const existing = await User.findOne({ email });
      if (existing) {
        if (!existing.emailVerifiedAt) existing.emailVerifiedAt = new Date();
        existing.authProvider = "google";
        if (!existing.name && user.name) existing.name = user.name;
        await existing.save();
        user.id = existing._id.toString();
        user.role = existing.role;
        return true;
      }

      const created = await User.create({
        name: user.name || email.split("@")[0],
        email,
        role: "learner",
        authProvider: "google",
        emailVerifiedAt: new Date(),
      });
      user.id = created._id.toString();
      user.role = created.role;
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.emailVerifiedAt = (user as { emailVerifiedAt?: Date }).emailVerifiedAt;
      }
      const updatedRole = (
        session as
          | { user?: { role?: "learner" | "educator" | "admin" } }
          | undefined
      )?.user?.role;
      if (trigger === "update" && updatedRole) {
        token.role = updatedRole;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      if (token?.role) {
        session.user.role = token.role as "learner" | "educator" | "admin";
      }
      if (token?.emailVerifiedAt) {
        session.user.emailVerifiedAt = token.emailVerifiedAt as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: { strategy: "jwt" },
});
