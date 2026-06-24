import { randomBytes, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { MongoClient, ObjectId } from "mongodb";
import { Pool, PoolClient } from "pg";

type Source = "courses" | "privy" | "agent_commons" | "common_os";

type LegacyIdentity = {
  key: string;
  source: Source;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  passwordHash?: string | null;
  walletAddresses: string[];
  metadata: Record<string, unknown>;
};

type Overrides = {
  canonicalEmails?: Record<
    string,
    {
      coursesUserIds?: string[];
      privyUserIds?: string[];
      walletAddresses?: string[];
      commonOsTenantIds?: string[];
    }
  >;
};

const APPLY = process.argv.includes("--apply");
const REQUIRED_CONFIRMATION = "APPLY_COMMONS_IDENTITY_MIGRATION";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function normalizeWallet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const wallet = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

function slugForEmail(email: string) {
  const base = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "user"}-${randomBytes(4).toString("hex")}`;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(value: string) {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.parent.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

async function readJson(path: string | undefined): Promise<unknown> {
  if (!path) return null;
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function loadCourses(): Promise<LegacyIdentity[]> {
  const uri = process.env.COURSES_MONGODB_URI;
  if (!uri) return [];
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const users = await client
      .db()
      .collection("users")
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            image: 1,
            password: 1,
            authProvider: 1,
            emailVerifiedAt: 1,
          },
        },
      )
      .toArray();
    return users.map((user) => ({
      key: `courses:${user._id}`,
      source: "courses",
      subject: String(user._id),
      email: normalizeEmail(user.email),
      emailVerified: Boolean(user.emailVerifiedAt),
      name: typeof user.name === "string" ? user.name : null,
      image: typeof user.image === "string" ? user.image : null,
      passwordHash: typeof user.password === "string" ? user.password : null,
      walletAddresses: [],
      metadata: {
        authProvider: user.authProvider ?? null,
        emailVerifiedAt: user.emailVerifiedAt ?? null,
      },
    }));
  } finally {
    await client.close();
  }
}

async function loadCommonOs(): Promise<LegacyIdentity[]> {
  const uri = process.env.COMMON_OS_MONGODB_URI;
  if (!uri) return [];
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const tenants = await client.db().collection("tenants").find({}).toArray();
    return tenants.map((tenant) => ({
      key: `common_os:${tenant._id}`,
      source: "common_os",
      subject: String(tenant._id),
      email: normalizeEmail(tenant.email),
      emailVerified: Boolean(tenant.email),
      name: typeof tenant.name === "string" ? tenant.name : null,
      image: null,
      walletAddresses: [normalizeWallet(tenant.walletAddress)].filter(
        (wallet): wallet is string => Boolean(wallet),
      ),
      metadata: {
        privyUserId: tenant.privyUserId ?? null,
        plan: tenant.plan ?? null,
      },
    }));
  } finally {
    await client.close();
  }
}

async function loadAgentCommonsOwners(): Promise<LegacyIdentity[]> {
  const connectionString = process.env.AGENT_COMMONS_DATABASE_URL;
  if (!connectionString) return [];
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      `select distinct lower(owner) as owner
         from public.agent
        where owner is not null and owner <> ''`,
    );
    return result.rows.map((row) => {
      const wallet = normalizeWallet(row.owner);
      return {
        key: `agent_commons:${row.owner}`,
        source: "agent_commons" as const,
        subject: String(row.owner),
        email: null,
        emailVerified: false,
        name: null,
        image: null,
        walletAddresses: wallet ? [wallet] : [],
        metadata: {},
      };
    });
  } finally {
    await pool.end();
  }
}

function linkedAccountValues(user: Record<string, unknown>) {
  const linked = Array.isArray(user.linked_accounts)
    ? user.linked_accounts
    : Array.isArray(user.linkedAccounts)
      ? user.linkedAccounts
      : [];
  const emails: string[] = [];
  const wallets: string[] = [];
  for (const account of linked) {
    if (!account || typeof account !== "object") continue;
    const record = account as Record<string, unknown>;
    const email = normalizeEmail(record.address ?? record.email);
    const wallet = normalizeWallet(record.address);
    if (email) emails.push(email);
    if (wallet) wallets.push(wallet);
  }
  return { emails, wallets };
}

async function loadPrivy(): Promise<LegacyIdentity[]> {
  const raw = await readJson(process.env.PRIVY_USERS_EXPORT_PATH);
  if (!raw) return [];
  const users = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { users?: unknown[] }).users)
      ? (raw as { users: unknown[] }).users
      : [];
  return users
    .filter((user): user is Record<string, unknown> => Boolean(user && typeof user === "object"))
    .map((user) => {
      const linked = linkedAccountValues(user);
      const directEmail = normalizeEmail(user.email);
      const email = directEmail ?? linked.emails[0] ?? null;
      const subject = String(user.id ?? user.user_id ?? user.did ?? "");
      return {
        key: `privy:${subject}`,
        source: "privy" as const,
        subject,
        email,
        emailVerified: Boolean(email),
        name:
          typeof user.name === "string"
            ? user.name
            : email?.split("@")[0] ?? null,
        image: typeof user.image === "string" ? user.image : null,
        walletAddresses: linked.wallets,
        metadata: { linkedAccounts: user.linked_accounts ?? user.linkedAccounts ?? [] },
      };
    })
    .filter((identity) => identity.subject);
}

function applyOverrides(
  identities: LegacyIdentity[],
  union: UnionFind,
  overrides: Overrides,
) {
  const bySourceSubject = new Map(
    identities.map((identity) => [`${identity.source}:${identity.subject.toLowerCase()}`, identity.key]),
  );
  const byWallet = new Map<string, string[]>();
  for (const identity of identities) {
    for (const wallet of identity.walletAddresses) {
      byWallet.set(wallet, [...(byWallet.get(wallet) ?? []), identity.key]);
    }
  }

  for (const [canonicalEmailRaw, override] of Object.entries(
    overrides.canonicalEmails ?? {},
  )) {
    const canonicalEmail = normalizeEmail(canonicalEmailRaw);
    if (!canonicalEmail) continue;
    const anchor = `override-email:${canonicalEmail}`;
    union.add(anchor);
    const references = [
      ...(override.coursesUserIds ?? []).map((value) => `courses:${value}`),
      ...(override.privyUserIds ?? []).map((value) => `privy:${value}`),
      ...(override.commonOsTenantIds ?? []).map((value) => `common_os:${value}`),
    ];
    for (const reference of references) {
      const key = bySourceSubject.get(reference.toLowerCase());
      if (key) union.union(anchor, key);
    }
    for (const walletRaw of override.walletAddresses ?? []) {
      const wallet = normalizeWallet(walletRaw);
      if (!wallet) continue;
      for (const key of byWallet.get(wallet) ?? []) union.union(anchor, key);
    }
    for (const identity of identities) {
      if (identity.email === canonicalEmail) union.union(anchor, identity.key);
    }
  }
}

function buildGroups(identities: LegacyIdentity[], overrides: Overrides) {
  const union = new UnionFind();
  for (const identity of identities) union.add(identity.key);

  const verifiedEmailOwner = new Map<string, string>();
  const walletOwner = new Map<string, string>();
  for (const identity of identities) {
    if (identity.email && identity.emailVerified) {
      const existing = verifiedEmailOwner.get(identity.email);
      if (existing) union.union(existing, identity.key);
      else verifiedEmailOwner.set(identity.email, identity.key);
    }
    if (identity.source === "privy" || identity.source === "common_os") {
      for (const wallet of identity.walletAddresses) {
        const existing = walletOwner.get(wallet);
        if (existing) union.union(existing, identity.key);
        else walletOwner.set(wallet, identity.key);
      }
    }
  }

  // Wallet-only Agent Commons records may join only through a Privy/Common OS
  // identity that proves the same wallet association.
  for (const identity of identities.filter(
    (entry) => entry.source === "agent_commons",
  )) {
    for (const wallet of identity.walletAddresses) {
      const owner = walletOwner.get(wallet);
      if (owner) union.union(owner, identity.key);
    }
  }

  applyOverrides(identities, union, overrides);

  const grouped = new Map<string, LegacyIdentity[]>();
  for (const identity of identities) {
    const root = union.find(identity.key);
    grouped.set(root, [...(grouped.get(root) ?? []), identity]);
  }
  return [...grouped.values()];
}

function canonicalEmailForGroup(group: LegacyIdentity[], overrides: Overrides) {
  const overrideEmails = Object.keys(overrides.canonicalEmails ?? {})
    .map(normalizeEmail)
    .filter((email): email is string => Boolean(email));
  for (const email of overrideEmails) {
    const configured = overrides.canonicalEmails?.[email];
    if (!configured) continue;
    const references = new Set([
      ...(configured.coursesUserIds ?? []).map((value) => `courses:${value}`),
      ...(configured.privyUserIds ?? []).map((value) => `privy:${value}`),
      ...(configured.commonOsTenantIds ?? []).map((value) => `common_os:${value}`),
    ]);
    if (
      group.some(
        (identity) =>
          identity.email === email ||
          references.has(`${identity.source}:${identity.subject}`) ||
          identity.walletAddresses.some((wallet) =>
            (configured.walletAddresses ?? [])
              .map(normalizeWallet)
              .includes(wallet),
          ),
      )
    ) {
      return email;
    }
  }
  return (
    group.find((identity) => identity.email && identity.emailVerified)?.email ??
    group.find((identity) => identity.email)?.email ??
    null
  );
}

async function upsertGroup(
  client: PoolClient,
  group: LegacyIdentity[],
  overrides: Overrides,
) {
  const email = canonicalEmailForGroup(group, overrides);
  if (!email) return { status: "unresolved" as const, group };

  const existing = await client.query(`select id from "user" where lower(email) = $1`, [
    email,
  ]);
  const userId = existing.rows[0]?.id ?? id("usr");
  const name =
    group.find((identity) => identity.name)?.name ?? email.split("@")[0]!;
  const image = group.find((identity) => identity.image)?.image ?? null;
  const emailVerified = group.some(
    (identity) => identity.email === email && identity.emailVerified,
  );

  await client.query(
    `insert into "user"
       (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict (email) do update
       set name = coalesce("user".name, excluded.name),
           image = coalesce("user".image, excluded.image),
           "emailVerified" = "user"."emailVerified" or excluded."emailVerified",
           "updatedAt" = now()`,
    [userId, name, email, emailVerified, image],
  );

  const workspaceResult = await client.query(
    `select workspace_id from commons_workspace_membership
      where user_id = $1 and role = 'owner' order by created_at asc limit 1`,
    [userId],
  );
  const workspaceId = workspaceResult.rows[0]?.workspace_id ?? id("wsp");
  if (!workspaceResult.rowCount) {
    await client.query(
      `insert into commons_workspace (id, name, slug, kind)
       values ($1, $2, $3, 'personal')`,
      [workspaceId, `${name}'s workspace`, slugForEmail(email)],
    );
    await client.query(
      `insert into commons_workspace_membership
       (id, workspace_id, user_id, role, status)
       values ($1, $2, $3, 'owner', 'active')`,
      [id("mem"), workspaceId, userId],
    );
    await client.query(
      `update "user" set "defaultWorkspaceId" = $2 where id = $1`,
      [userId, workspaceId],
    );
  }
  await client.query(
    `insert into commons_project
       (id, workspace_id, created_by_user_id, name, slug, environment)
     select $1, $2, $3, 'Default project', $4, 'production'
      where not exists (
        select 1 from commons_project where workspace_id = $2
      )`,
    [id("prj"), workspaceId, userId, `default-${randomUUID().slice(0, 8)}`],
  );

  for (const identity of group) {
    await client.query(
      `insert into commons_identity_alias
       (id, user_id, source, source_subject, email, email_verified, metadata)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       on conflict (source, source_subject) do update
       set user_id = excluded.user_id,
           email = excluded.email,
           email_verified = excluded.email_verified,
           metadata = excluded.metadata`,
      [
        id("idn"),
        userId,
        identity.source,
        identity.subject,
        identity.email,
        identity.emailVerified,
        JSON.stringify(identity.metadata),
      ],
    );

    for (const wallet of identity.walletAddresses) {
      await client.query(
        `insert into commons_identity_alias
         (id, user_id, source, source_subject, email, email_verified, metadata)
         values ($1, $2, 'wallet', $3, null, false, $4::jsonb)
         on conflict (source, source_subject) do update set user_id = excluded.user_id`,
        [id("idn"), userId, wallet, JSON.stringify({ linkedFrom: identity.source })],
      );
    }

    if (identity.source === "courses" && identity.passwordHash) {
      await client.query(
        `insert into account
         (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $3, $4, now(), now())
         on conflict do nothing`,
        [randomUUID(), userId, userId, identity.passwordHash],
      );
    }
  }

  return { status: "linked" as const, userId, workspaceId, email, group };
}

async function updateSources(
  linked: Array<Awaited<ReturnType<typeof upsertGroup>>>,
) {
  const successful = linked.filter(
    (
      result,
    ): result is Extract<typeof result, { status: "linked" }> =>
      result.status === "linked",
  );

  if (process.env.COURSES_MONGODB_URI) {
    const mongo = new MongoClient(process.env.COURSES_MONGODB_URI);
    await mongo.connect();
    try {
      const collection = mongo.db().collection("users");
      for (const result of successful) {
        for (const identity of result.group.filter(
          (entry) => entry.source === "courses",
        )) {
          await collection.updateOne(
            { _id: new ObjectId(identity.subject) },
            {
              $set: {
                identityUserId: result.userId,
                identityWorkspaceId: result.workspaceId,
              },
            },
          );
        }
      }
    } finally {
      await mongo.close();
    }
  }

  if (process.env.COMMON_OS_MONGODB_URI) {
    const mongo = new MongoClient(process.env.COMMON_OS_MONGODB_URI);
    await mongo.connect();
    try {
      const collection = mongo
        .db()
        .collection<{
          _id: string;
          identityUserId?: string;
          workspaceId?: string;
          updatedAt?: Date;
        }>("tenants");
      for (const result of successful) {
        for (const identity of result.group.filter(
          (entry) => entry.source === "common_os",
        )) {
          await collection.updateOne(
            { _id: identity.subject },
            {
              $set: {
                identityUserId: result.userId,
                workspaceId: result.workspaceId,
                updatedAt: new Date(),
              },
            },
          );
        }
      }
    } finally {
      await mongo.close();
    }
  }

  if (process.env.AGENT_COMMONS_DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.AGENT_COMMONS_DATABASE_URL,
    });
    try {
      for (const result of successful) {
        for (const identity of result.group.filter(
          (entry) => entry.source === "agent_commons",
        )) {
          await pool.query(
            `update public.agent
                set owner_user_id = $2, workspace_id = $3
              where lower(owner) = lower($1)`,
            [identity.subject, result.userId, result.workspaceId],
          );
        }
      }
    } finally {
      await pool.end();
    }
  }
}

async function main() {
  if (APPLY && process.env.IDENTITY_MIGRATION_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Refusing to mutate data. Set IDENTITY_MIGRATION_CONFIRM=${REQUIRED_CONFIRMATION}.`,
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const configuredOverrides =
    (await readJson(process.env.IDENTITY_MIGRATION_OVERRIDES_PATH)) as
      | Overrides
      | null;
  const overrides: Overrides = {
    ...configuredOverrides,
    canonicalEmails: {
      "bashybaranaba@gmail.com": {},
      ...(configuredOverrides?.canonicalEmails ?? {}),
    },
  };

  const identities = (
    await Promise.all([
      loadCourses(),
      loadPrivy(),
      loadAgentCommonsOwners(),
      loadCommonOs(),
    ])
  ).flat();
  const groups = buildGroups(identities, overrides);
  const report = groups.map((group) => ({
    canonicalEmail: canonicalEmailForGroup(group, overrides),
    sources: group.map((identity) => ({
      source: identity.source,
      subject: identity.subject,
      email: identity.email,
      wallets: identity.walletAddresses,
    })),
  }));

  if (!APPLY) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          identityCount: identities.length,
          canonicalGroupCount: groups.length,
          unresolvedGroupCount: report.filter((group) => !group.canonicalEmail).length,
          groups: report,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${process.env.IDENTITY_DB_SCHEMA ?? "commons_identity"}`,
    ssl:
      process.env.IDENTITY_DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  const client = await pool.connect();
  const linked: Array<Awaited<ReturnType<typeof upsertGroup>>> = [];
  try {
    await client.query("begin");
    for (const group of groups) {
      linked.push(await upsertGroup(client, group, overrides));
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  await updateSources(linked);
  console.log(
    JSON.stringify(
      {
        mode: "applied",
        linked: linked.filter((result) => result.status === "linked").length,
        unresolved: linked.filter((result) => result.status === "unresolved").length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
