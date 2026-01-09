// apps/commons-api/models/oauth-schema.ts
import {
  jsonb,
  pgTable,
  timestamp,
  uuid,
  text,
  integer,
  boolean as pgBoolean,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

/* ─────────────────────────  OAUTH PROVIDER  ───────────────────────── */

/**
 * OAuth Provider Configuration
 * Stores OAuth 2.0 provider settings (Google, GitHub, Slack, etc.)
 */
export const oauthProvider = pgTable(
  'oauth_provider',
  {
    providerId: uuid('provider_id')
      .default(sql`uuid_generate_v4()`)
      .primaryKey(),

    // Identity
    providerKey: text('provider_key').notNull().unique(), // 'google_workspace', 'github', 'slack'
    displayName: text('display_name').notNull(), // 'Google Workspace', 'GitHub'
    description: text('description'),
    logoUrl: text('logo_url'),

    // OAuth Configuration URLs
    authUrl: text('auth_url').notNull(), // Authorization endpoint
    tokenUrl: text('token_url').notNull(), // Token exchange endpoint
    revokeUrl: text('revoke_url'), // Token revocation endpoint (optional)
    userInfoUrl: text('user_info_url'), // User info endpoint (optional)

    // Encrypted Client Credentials
    clientId: text('client_id').notNull(),
    encryptedClientSecret: text('encrypted_client_secret').notNull(), // AES-256-GCM encrypted
    secretIv: text('secret_iv').notNull(), // Initialization vector
    secretTag: text('secret_tag').notNull(), // Authentication tag

    // Configuration
    scopes: jsonb('scopes')
      .notNull()
      .default(sql`'{}'`)
      .$type<{
        default: string[]; // Default scopes for basic auth
        [scopeGroup: string]: string[]; // Named scope groups (e.g., 'classroom', 'drive')
      }>(),
    authorizationParams: jsonb('authorization_params')
      .default(sql`'{}'`)
      .$type<Record<string, any>>(), // Extra params for auth URL (e.g., {access_type: 'offline'})
    tokenParams: jsonb('token_params')
      .default(sql`'{}'`)
      .$type<Record<string, any>>(), // Extra params for token exchange

    // Metadata
    isActive: pgBoolean('is_active').default(true),
    isPlatform: pgBoolean('is_platform').default(true), // Platform vs user-registered
    ownerId: text('owner_id'), // NULL for platform, userId for custom providers
    ownerType: text('owner_type'), // 'platform' | 'user' | 'agent'

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
  },
  (table) => ({
    providerKeyIdx: index('idx_oauth_provider_key').on(table.providerKey),
    isActiveIdx: index('idx_oauth_provider_active').on(table.isActive),
  }),
);

/* ─────────────────────────  OAUTH CONNECTION  ───────────────────────── */

/**
 * OAuth Connection
 * Stores user OAuth connections with encrypted tokens
 */
export const oauthConnection = pgTable(
  'oauth_connection',
  {
    connectionId: uuid('connection_id')
      .default(sql`uuid_generate_v4()`)
      .primaryKey(),

    // Ownership (wallet addresses like tool_key)
    ownerId: text('owner_id').notNull(), // User wallet address or agent ID
    ownerType: text('owner_type').notNull(), // 'user' | 'agent'

    // Provider Reference
    providerId: uuid('provider_id')
      .notNull()
      .references(() => oauthProvider.providerId, { onDelete: 'cascade' }),

    // Encrypted Access Token
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    accessTokenIv: text('access_token_iv').notNull(),
    accessTokenTag: text('access_token_tag').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),

    // Encrypted Refresh Token (CRITICAL for long-term access)
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    refreshTokenIv: text('refresh_token_iv').notNull(),
    refreshTokenTag: text('refresh_token_tag').notNull(),

    // Optional ID Token (OIDC providers like Google)
    encryptedIdToken: text('encrypted_id_token'),
    idTokenIv: text('id_token_iv'),
    idTokenTag: text('id_token_tag'),

    // Scopes granted by user
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    // Provider-specific user information
    providerUserId: text('provider_user_id'), // User's ID in provider system
    providerUserEmail: text('provider_user_email'), // User's email in provider
    providerUserName: text('provider_user_name'), // User's name in provider
    providerMetadata: jsonb('provider_metadata')
      .default(sql`'{}'`)
      .$type<Record<string, any>>(), // Additional provider-specific data

    // Status & Tracking
    status: text('status').default('active'), // 'active' | 'expired' | 'revoked' | 'error'
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    usageCount: integer('usage_count').default(0),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),

    // User-defined labels
    displayName: text('display_name'),
    description: text('description'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_oauth_connection_owner').on(
      table.ownerId,
      table.ownerType,
    ),
    providerIdx: index('idx_oauth_connection_provider').on(table.providerId),
    statusIdx: index('idx_oauth_connection_status').on(table.status),
    // Unique constraint: one connection per user per provider
    uniqueOwnerProvider: unique('unique_owner_provider').on(
      table.ownerId,
      table.ownerType,
      table.providerId,
    ),
  }),
);

/* ─────────────────────────  OAUTH STATE  ───────────────────────── */

/**
 * OAuth State
 * Temporary CSRF protection tokens for OAuth flows (short-lived)
 */
export const oauthState = pgTable(
  'oauth_state',
  {
    stateId: text('state_id').primaryKey(), // Random UUID for CSRF protection

    // Context
    ownerId: text('owner_id').notNull(), // User wallet address
    providerId: uuid('provider_id')
      .notNull()
      .references(() => oauthProvider.providerId, { onDelete: 'cascade' }),

    // PKCE (Proof Key for Code Exchange) for public clients
    codeVerifier: text('code_verifier'), // Optional: for PKCE flow

    // Redirect Context
    redirectUri: text('redirect_uri').notNull(),
    requestedScopes: text('requested_scopes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    // Security metadata
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),

    // Expiry (short-lived: 10 minutes)
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
  },
  (table) => ({
    expiryIdx: index('idx_oauth_state_expiry').on(table.expiresAt),
    ownerIdx: index('idx_oauth_state_owner').on(table.ownerId),
  }),
);

/* ─────────────────────────  RELATIONS  ───────────────────────── */

export const oauthProviderRelations = relations(oauthProvider, ({ many }) => ({
  connections: many(oauthConnection),
  states: many(oauthState),
}));

export const oauthConnectionRelations = relations(
  oauthConnection,
  ({ one }) => ({
    provider: one(oauthProvider, {
      fields: [oauthConnection.providerId],
      references: [oauthProvider.providerId],
    }),
  }),
);

export const oauthStateRelations = relations(oauthState, ({ one }) => ({
  provider: one(oauthProvider, {
    fields: [oauthState.providerId],
    references: [oauthProvider.providerId],
  }),
}));

/* ─────────────────────────  TYPES  ───────────────────────── */

export type OAuthProvider = typeof oauthProvider.$inferSelect;
export type NewOAuthProvider = typeof oauthProvider.$inferInsert;

export type OAuthConnection = typeof oauthConnection.$inferSelect;
export type NewOAuthConnection = typeof oauthConnection.$inferInsert;

export type OAuthState = typeof oauthState.$inferSelect;
export type NewOAuthState = typeof oauthState.$inferInsert;

/**
 * OAuth Provider Configuration Interface
 */
export interface OAuthProviderConfig {
  providerKey: string;
  displayName: string;
  description?: string;
  logoUrl?: string;
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  userInfoUrl?: string;
  clientId: string;
  clientSecret: string; // Plain text (will be encrypted)
  scopes: {
    default: string[];
    [scopeGroup: string]: string[];
  };
  authorizationParams?: Record<string, any>;
  tokenParams?: Record<string, any>;
  isPlatform?: boolean;
  ownerId?: string;
  ownerType?: string;
}

/**
 * OAuth Token Set (decrypted)
 */
export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt?: Date;
}

/**
 * OAuth Connection Status
 */
export type OAuthConnectionStatus = 'active' | 'expired' | 'revoked' | 'error';

/**
 * OAuth Owner Type
 */
export type OAuthOwnerType = 'user' | 'agent' | 'platform';
