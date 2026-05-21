import { z } from 'zod';

export const qboEnvironmentSchema = z.enum(['sandbox', 'production']);
export type QboEnvironment = z.infer<typeof qboEnvironmentSchema>;

export const qboCredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  realmId: z.string(),
  expiresAt: z.string().datetime(),
});
export type QboCredentials = z.infer<typeof qboCredentialsSchema>;

export const QBO_API_BASE = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
} as const;
