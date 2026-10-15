import { generateId } from 'better-auth';
import { Pool } from 'pg';
import { auth } from './src/lib/auth.js';

type DBFieldAttribute = { type: string; required: boolean; input: boolean };

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  batchSize: 5000,
  resumeFromId: null as string | null,
  tempEmailDomain: 'temp.better-auth.com',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type MigrationStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

type MigrationState = {
  status: MigrationStatus;
  totalUsers: number;
  processedUsers: number;
  successCount: number;
  failureCount: number;
  skipCount: number;
  currentBatch: number;
  totalBatches: number;
  startedAt: Date | null;
  completedAt: Date | null;
  lastProcessedId: string | null;
  errors: Array<{ userId: string; error: string }>;
};

type UserInsertData = {
  id: string;
  email: string | null;
  name: string;
  emailVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  image?: string;
  [key: string]: any;
};

type AccountInsertData = {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  password: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type SupabaseIdentityFromDB = {
  id: string;
  provider_id: string;
  user_id: string;
  identity_data: Record<string, any>;
  provider: string;
  last_sign_in_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  email: string | null;
};

type SupabaseUserFromDB = {
  instance_id: string | null;
  id: string;
  aud: string | null;
  role: string | null;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: string | null;
  invited_at: string | null;
  confirmation_token: string | null;
  confirmation_sent_at: string | null;
  recovery_token: string | null;
  recovery_sent_at: string | null;
  email_change_token_new: string | null;
  email_change: string | null;
  email_change_sent_at: string | null;
  last_sign_in_at: string | null;
  raw_app_meta_data: Record<string, any> | null;
  raw_user_meta_data: Record<string, any> | null;
  is_super_admin: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  phone: string | null;
  phone_confirmed_at: string | null;
  phone_change: string | null;
  phone_change_token: string | null;
  phone_change_sent_at: string | null;
  confirmed_at: string | null;
  email_change_token_current: string | null;
  email_change_confirm_status: number | null;
  banned_until: string | null;
  reauthentication_token: string | null;
  reauthentication_sent_at: string | null;
  is_sso_user: boolean;
  deleted_at: string | null;
  is_anonymous: boolean;
  identities: SupabaseIdentityFromDB[];
};

// ============================================================================
// MIGRATION STATE MANAGER
// ============================================================================

class MigrationStateManager {
  private state: MigrationState = {
    status: 'idle',
    totalUsers: 0,
    processedUsers: 0,
    successCount: 0,
    failureCount: 0,
    skipCount: 0,
    currentBatch: 0,
    totalBatches: 0,
    startedAt: null,
    completedAt: null,
    lastProcessedId: null,
    errors: [],
  };

  start(totalUsers: number, batchSize: number) {
    this.state = {
      status: 'running',
      totalUsers,
      processedUsers: 0,
      successCount: 0,
      failureCount: 0,
      skipCount: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(totalUsers / batchSize),
      startedAt: new Date(),
      completedAt: null,
      lastProcessedId: null,
      errors: [],
    };
  }

  updateProgress(
    processed: number,
    success: number,
    failure: number,
    skip: number,
    lastId: string | null,
  ) {
    this.state.processedUsers += processed;
    this.state.successCount += success;
    this.state.failureCount += failure;
    this.state.skipCount += skip;
    this.state.currentBatch++;
    if (lastId) {
      this.state.lastProcessedId = lastId;
    }
  }

  addError(userId: string, error: string) {
    if (this.state.errors.length < 100) {
      this.state.errors.push({ userId, error });
    }
  }

  complete() {
    this.state.status = 'completed';
    this.state.completedAt = new Date();
  }

  fail() {
    this.state.status = 'failed';
    this.state.completedAt = new Date();
  }

  getState(): MigrationState {
    return { ...this.state };
  }

  getProgress(): number {
    if (this.state.totalUsers === 0) return 0;
    return Math.round((this.state.processedUsers / this.state.totalUsers) * 100);
  }

  getETA(): string | null {
    if (!this.state.startedAt || this.state.processedUsers === 0) {
      return null;
    }

    const elapsed = Date.now() - this.state.startedAt.getTime();
    const avgTimePerUser = elapsed / this.state.processedUsers;
    const remainingUsers = this.state.totalUsers - this.state.processedUsers;
    const remainingMs = avgTimePerUser * remainingUsers;

    const seconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// ============================================================================
// DATABASE CONNECTIONS
// ============================================================================

const fromDB = new Pool({
  connectionString: process.env.FROM_DATABASE_URL || process.env.DATABASE_URL,
});

const toDB = new Pool({
  connectionString: process.env.TO_DATABASE_URL || process.env.DATABASE_URL,
});

// ============================================================================
// BETTER AUTH VALIDATION
// ============================================================================

async function validateAuthConfig() {
  const ctx = await auth.$context;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ctx.options.emailAndPassword?.enabled) {
    errors.push('emailAndPassword.enabled must be true');
  }

  const additionalFields = ctx.options.user?.additionalFields || {};
  const requiredFields: Record<string, DBFieldAttribute> = {
    userMetadata: { type: 'json', required: false, input: false },
    appMetadata: { type: 'json', required: false, input: false },
    invitedAt: { type: 'date', required: false, input: false },
    lastSignInAt: { type: 'date', required: false, input: false },
  };

  for (const [fieldName, expectedConfig] of Object.entries(requiredFields)) {
    const fieldConfig = additionalFields[fieldName];
    if (!fieldConfig) {
      errors.push(`Missing required user.additionalFields: ${fieldName}`);
    } else {
      if (fieldConfig.type !== expectedConfig.type) {
        errors.push(`user.additionalFields.${fieldName} must have type: '${expectedConfig.type}' (got '${fieldConfig.type}')`);
      }
      if (fieldConfig.required !== expectedConfig.required) {
        errors.push(`user.additionalFields.${fieldName} must have required: ${expectedConfig.required}`);
      }
      if (fieldConfig.input !== expectedConfig.input) {
        errors.push(`user.additionalFields.${fieldName} must have input: ${expectedConfig.input}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Migration Warnings:\n');
    warnings.forEach((warn) => console.warn(`   ${warn}`));
    console.warn('\n   Add plugins for features you used in Supabase to migrate that data.\n');
  }

  if (errors.length > 0) {
    console.error('\n🟧 Better Auth Configuration Errors:\n');
    errors.forEach((err) => console.error(`   ${err}`));
    console.error('\n🟧 Please update your Better Auth configuration.\n');
    process.exit(1);
  }

  return ctx;
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

const stateManager = new MigrationStateManager();

let ctxCache: {
  hasAnonymousPlugin: boolean;
  hasAdminPlugin: boolean;
  hasPhoneNumberPlugin: boolean;
  supportedProviders: string[];
} | null = null;

async function processBatch(
  users: SupabaseUserFromDB[],
  ctx: any,
): Promise<{
  success: number;
  failure: number;
  skip: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  const stats = {
    success: 0,
    failure: 0,
    skip: 0,
    errors: [] as Array<{ userId: string; error: string }>,
  };

  if (!ctxCache) {
    ctxCache = {
      hasAdminPlugin: ctx.options.plugins?.some((p: any) => p.id === 'admin') || false,
      hasAnonymousPlugin: ctx.options.plugins?.some((p: any) => p.id === 'anonymous') || false,
      hasPhoneNumberPlugin: ctx.options.plugins?.some((p: any) => p.id === 'phone-number') || false,
      supportedProviders: Object.keys(ctx.options.socialProviders || {}),
    };
  }

  const { hasAdminPlugin, hasAnonymousPlugin, hasPhoneNumberPlugin, supportedProviders } = ctxCache;

  const validUsersData: Array<{ user: SupabaseUserFromDB; userData: UserInsertData }> = [];

  for (const user of users) {
    if (!user.email && !user.phone) {
      stats.skip++;
      continue;
    }
    if (!user.email && !hasPhoneNumberPlugin) {
      stats.skip++;
      continue;
    }
    if (user.deleted_at) {
      stats.skip++;
      continue;
    }
    if (user.banned_until && !hasAdminPlugin) {
      stats.skip++;
      continue;
    }

    const getTempEmail = (phone: string) =>
      `${phone.replace(/[^0-9]/g, '')}@${CONFIG.tempEmailDomain}`;

    const getName = (): string => {
      if (user.raw_user_meta_data?.name) return user.raw_user_meta_data.name;
      if (user.raw_user_meta_data?.full_name) return user.raw_user_meta_data.full_name;
      if (user.raw_user_meta_data?.username) return user.raw_user_meta_data.username;
      if (user.raw_user_meta_data?.user_name) return user.raw_user_meta_data.user_name;

      const firstId = user.identities?.[0];
      if (firstId?.identity_data?.name) return firstId.identity_data.name;
      if (firstId?.identity_data?.full_name) return firstId.identity_data.full_name;
      if (firstId?.identity_data?.username) return firstId.identity_data.username;
      if (firstId?.identity_data?.preferred_username)
        return firstId.identity_data.preferred_username;

      if (user.email) return user.email.split('@')[0]!;
      if (user.phone) return user.phone;

      return 'Unknown';
    };

    const getImage = (): string | undefined => {
      if (user.raw_user_meta_data?.avatar_url) return user.raw_user_meta_data.avatar_url;
      if (user.raw_user_meta_data?.picture) return user.raw_user_meta_data.picture;
      const firstId = user.identities?.[0];
      if (firstId?.identity_data?.avatar_url) return firstId.identity_data.avatar_url;
      if (firstId?.identity_data?.picture) return firstId.identity_data.picture;
      return undefined;
    };

    const userData: UserInsertData = {
      id: user.id,
      email: user.email || (user.phone ? getTempEmail(user.phone) : null),
      emailVerified: !!user.email_confirmed_at,
      name: getName(),
      image: getImage(),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    if (hasAnonymousPlugin) userData.isAnonymous = user.is_anonymous;
    if (hasPhoneNumberPlugin && user.phone) {
      userData.phoneNumber = user.phone;
      userData.phoneNumberVerified = !!user.phone_confirmed_at;
    }

    if (hasAdminPlugin) {
      userData.role = user.is_super_admin ? 'admin' : user.role || 'user';
      if (user.banned_until) {
        const banExpires = new Date(user.banned_until);
        if (banExpires > new Date()) {
          userData.banned = true;
          userData.banExpires = banExpires;
          userData.banReason = 'Migrated from Supabase (banned)';
        } else {
          userData.banned = false;
        }
      } else {
        userData.banned = false;
      }
    }

    if (user.raw_user_meta_data && Object.keys(user.raw_user_meta_data).length > 0) {
      userData.userMetadata = user.raw_user_meta_data;
    }
    if (user.raw_app_meta_data && Object.keys(user.raw_app_meta_data).length > 0) {
      userData.appMetadata = user.raw_app_meta_data;
    }
    if (user.invited_at) userData.invitedAt = user.invited_at;
    if (user.last_sign_in_at) userData.lastSignInAt = user.last_sign_in_at;

    validUsersData.push({ user, userData });
  }

  if (validUsersData.length === 0) {
    return stats;
  }

  try {
    await toDB.query('BEGIN');

    const allFields = new Set<string>();
    validUsersData.forEach(({ userData }) => {
      Object.keys(userData).forEach((key) => allFields.add(key));
    });
    const fields = Array.from(allFields);

    const maxParamsPerQuery = 65000;
    const fieldsPerUser = fields.length;
    const usersPerChunk = Math.floor(maxParamsPerQuery / fieldsPerUser);

    for (let i = 0; i < validUsersData.length; i += usersPerChunk) {
      const chunk = validUsersData.slice(i, i + usersPerChunk);

      const placeholders: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const { userData } of chunk) {
        const userPlaceholders = fields.map((field) => {
          values.push(userData[field] ?? null);
          return `$${paramIndex++}`;
        });
        placeholders.push(`(${userPlaceholders.join(', ')})`);
      }

      await toDB.query(
        `
        INSERT INTO "user" (${fields.map((f) => `"${f}"`).join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT ("id") DO NOTHING
      `,
        values,
      );
    }

    const accountsData: AccountInsertData[] = [];

    for (const { user } of validUsersData) {
      for (const identity of user.identities ?? []) {
        if (identity.provider === 'email') {
          accountsData.push({
            id: generateId(),
            userId: user.id,
            providerId: 'credential',
            accountId: user.id,
            password: user.encrypted_password || null,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          });
        }

        if (supportedProviders.includes(identity.provider)) {
          accountsData.push({
            id: generateId(),
            userId: user.id,
            providerId: identity.provider,
            accountId: identity.identity_data?.sub || identity.provider_id,
            password: null,
            createdAt: identity.created_at ?? user.created_at,
            updatedAt: identity.updated_at ?? user.updated_at,
          });
        }
      }
    }

    if (accountsData.length > 0) {
      const maxParamsPerQuery = 65000;
      const fieldsPerAccount = 7;
      const accountsPerChunk = Math.floor(maxParamsPerQuery / fieldsPerAccount);

      for (let i = 0; i < accountsData.length; i += accountsPerChunk) {
        const chunk = accountsData.slice(i, i + accountsPerChunk);

        const accountPlaceholders: string[] = [];
        const accountValues: any[] = [];
        let paramIndex = 1;

        for (const acc of chunk) {
          accountPlaceholders.push(
            `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
          );
          accountValues.push(
            acc.id,
            acc.userId,
            acc.providerId,
            acc.accountId,
            acc.password,
            acc.createdAt,
            acc.updatedAt,
          );
        }

        await toDB.query(
          `
          INSERT INTO "account" ("id", "userId", "providerId", "accountId", "password", "createdAt", "updatedAt")
          VALUES ${accountPlaceholders.join(', ')}
          ON CONFLICT ("id") DO NOTHING
        `,
          accountValues,
        );
      }
    }

    await toDB.query('COMMIT');
    stats.success = validUsersData.length;
  } catch (error: any) {
    await toDB.query('ROLLBACK');
    console.error('[TRANSACTION] Batch failed, rolled back:', error.message);
    stats.failure = validUsersData.length;
    if (stats.errors.length < 100) {
      stats.errors.push({ userId: 'bulk', error: error.message });
    }
  }

  return stats;
}

async function migrateFromSupabase() {
  const { batchSize, resumeFromId } = CONFIG;

  console.log('[MIGRATION] Starting migration with config:', CONFIG);

  const ctx = await validateAuthConfig();

  try {
    const countResult = await fromDB.query<{ count: string }>(
      `
      SELECT COUNT(*) as count FROM auth.users
      ${resumeFromId ? 'WHERE id > $1' : ''}
    `,
      resumeFromId ? [resumeFromId] : [],
    );

    const totalUsers = parseInt(countResult.rows[0]?.count || '0', 10);

    console.log(`[MIGRATION] Starting migration for ${totalUsers.toLocaleString()} users`);
    console.log(`[MIGRATION] Batch size: ${batchSize}\n`);

    stateManager.start(totalUsers, batchSize);

    let lastProcessedId: string | null = resumeFromId;
    let hasMore = true;
    let batchNumber = 0;

    while (hasMore) {
      batchNumber++;
      const batchStart = Date.now();

      const result: { rows: SupabaseUserFromDB[] } = await fromDB.query<SupabaseUserFromDB>(
        `
        SELECT 
          u.*,
          COALESCE(
            json_agg(
              i.* ORDER BY i.id
            ) FILTER (WHERE i.id IS NOT NULL),
            '[]'::json
          ) as identities
        FROM auth.users u
        LEFT JOIN auth.identities i ON u.id = i.user_id
        ${lastProcessedId ? 'WHERE u.id > $1' : ''}
        GROUP BY u.id
        ORDER BY u.id ASC
        LIMIT $${lastProcessedId ? '2' : '1'}
      `,
        lastProcessedId ? [lastProcessedId, batchSize] : [batchSize],
      );

      const batch: SupabaseUserFromDB[] = result.rows;
      hasMore = batch.length === batchSize;

      if (batch.length === 0) break;

      console.log(
        `\nBatch ${batchNumber}/${Math.ceil(totalUsers / batchSize)} (${batch.length} users)`,
      );

      const stats = await processBatch(batch, ctx);

      lastProcessedId = batch[batch.length - 1]!.id;
      stateManager.updateProgress(
        batch.length,
        stats.success,
        stats.failure,
        stats.skip,
        lastProcessedId,
      );

      stats.errors.forEach((err) => stateManager.addError(err.userId, err.error));

      const batchTime = ((Date.now() - batchStart) / 1000).toFixed(2);
      const usersPerSec = (batch.length / parseFloat(batchTime)).toFixed(0);

      const state = stateManager.getState();
      console.log(`Success: ${stats.success} | Skip: ${stats.skip} | Failure: ${stats.failure}`);
      console.log(
        `Progress: ${stateManager.getProgress()}% (${state.processedUsers.toLocaleString()}/${state.totalUsers.toLocaleString()})`,
      );
      console.log(`Speed: ${usersPerSec} users/sec (${batchTime}s for this batch)`);

      const eta = stateManager.getETA();
      if (eta) {
        console.log(`ETA: ${eta}`);
      }
    }

    stateManager.complete();
    const finalState = stateManager.getState();

    console.log('\n🎉 Migration completed');
    console.log(`   - Success: ${finalState.successCount.toLocaleString()}`);
    console.log(`   - Skipped: ${finalState.skipCount.toLocaleString()}`);
    console.log(`   - Failed: ${finalState.failureCount.toLocaleString()}`);

    const totalTime =
      finalState.completedAt && finalState.startedAt
        ? ((finalState.completedAt.getTime() - finalState.startedAt.getTime()) / 1000 / 60).toFixed(1)
        : '0';
    console.log(`   Total time: ${totalTime} minutes`);

    if (finalState.errors.length > 0) {
      console.log(`\nFirst ${Math.min(10, finalState.errors.length)} errors:`);
      finalState.errors.slice(0, 10).forEach((err) => {
        console.log(`- User ${err.userId}: ${err.error}`);
      });
    }

    return finalState;
  } catch (error) {
    stateManager.fail();
    console.error('\nMigration failed:', error);
    throw error;
  } finally {
    await fromDB.end();
    await toDB.end();
  }
}

async function main() {
  console.log('🚀 Supabase Auth → Better Auth Migration\n');

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  try {
    await migrateFromSupabase();
    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  }
}

main();