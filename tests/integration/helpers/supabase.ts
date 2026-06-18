import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for integration tests. ` + "Run `supabase status -o env` to get the key, then export it.",
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_KEY = requiredEnv("SUPABASE_KEY");
const SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface MintedUser {
  id: string;
  client: SupabaseClient;
}

export interface UsersFixture {
  a: MintedUser;
  b: MintedUser;
  cleanup: () => Promise<void>;
}

async function mintUser(email: string, password: string): Promise<MintedUser> {
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create user ${email}: ${error.message}`);
  }
  const id = data.user.id;

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in as ${email}: ${signInError.message}`);
  }

  return { id, client };
}

export async function makeUsers(): Promise<UsersFixture> {
  const runId = crypto.randomUUID();
  const password = "Test1234!";

  const a = await mintUser(`user-a-${runId}@test.local`, password);
  const b = await mintUser(`user-b-${runId}@test.local`, password);

  const cleanup = async () => {
    const svc = serviceClient();
    await svc.auth.admin.deleteUser(a.id);
    await svc.auth.admin.deleteUser(b.id);
  };

  return { a, b, cleanup };
}
