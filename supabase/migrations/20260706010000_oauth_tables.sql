-- ============================================================
-- OAuth 2.1 tables for Flowya MCP
-- Supports authorization_code + refresh_token grant types
-- with Dynamic Client Registration (RFC 7591) and PKCE (S256).
-- ============================================================

-- Registered OAuth clients (e.g. GPT, Claude Desktop via authorize flow)
create table if not exists public.oauth_clients (
  client_id                  text primary key,
  client_name                text not null default 'MCP client',
  redirect_uris              text[] not null,
  grant_types                text[] not null default '{authorization_code,refresh_token}',
  token_endpoint_auth_method text not null default 'none',
  created_at                 timestamptz not null default now()
);

-- Single-use authorization codes (PKCE-bound, 2-min TTL)
create table if not exists public.oauth_auth_codes (
  code_hash              text primary key,
  client_id              text not null references public.oauth_clients(client_id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  redirect_uri           text not null,
  code_challenge         text not null,
  code_challenge_method  text not null default 'S256',
  expires_at             timestamptz not null,
  used                   boolean not null default false,
  created_at             timestamptz not null default now()
);

-- Access + refresh tokens
create table if not exists public.oauth_tokens (
  token_hash   text primary key,
  kind         text not null check (kind in ('access', 'refresh')),
  client_id    text not null references public.oauth_clients(client_id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

-- RLS: clients are public (needed for validation endpoint)
alter table public.oauth_clients enable row level security;
create policy "oauth_clients read-only public"
  on public.oauth_clients for select using (true);

-- RLS: codes + tokens only accessible by the service role (via service key)
alter table public.oauth_auth_codes enable row level security;
alter table public.oauth_tokens enable row level security;

-- Helpful indices
create index if not exists idx_oauth_tokens_user on public.oauth_tokens(user_id, kind);
create index if not exists idx_oauth_codes_client on public.oauth_auth_codes(client_id);
