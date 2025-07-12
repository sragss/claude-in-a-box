import { betterAuth } from "better-auth";

export const auth = betterAuth({
  baseURL: process.env.BASE_URL || "http://localhost:8080",
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-key-change-in-production",
  
  trustedOrigins: ["http://localhost:5173"], // Add frontend URL
  
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ["user:email"], // Required by Better Auth, allows reading public repos
      redirectTo: "http://localhost:5173" // Redirect back to frontend after OAuth
    }
  },
  
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7 // 7 days
    }
  },
  
  // Trust proxy for deployment behind reverse proxies
  advanced: {
    trustProxy: true
  }
});

export type User = typeof auth.$Infer.User;
export type Session = typeof auth.$Infer.Session;