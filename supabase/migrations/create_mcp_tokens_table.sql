-- ============================================
-- MCP Tokens (Personal Access Tokens for the Flowya MCP server)
-- ============================================
-- Each row is a long-lived token a user generates from Flowya ("Connect with AI")
-- to authenticate an MCP client (Cursor, Claude, Cowork) against the hosted
-- Flowya MCP server. Only the SHA-256 hash is stored; the plaintext token
-- (prefix `fmcp_`) is shown to the user exactly once.
create table if not exists mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'token',
  token_hash text not null unique,
  preview text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table mcp_tokens enable row level security;

-- Users can see and manage (create/revoke) their own tokens from a signed-in
-- session. The MCP server itself reads tokens via the service role (bypasses
-- RLS) to resolve token -> user_id on every request.
create policy "Users can view their own mcp tokens"
  on mcp_tokens for select
  using (auth.uid() = user_id);

create policy "Users can insert their own mcp tokens"
  on mcp_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own mcp tokens"
  on mcp_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_mcp_tokens_user on mcp_tokens(user_id, revoked_at);
create index if not exists idx_mcp_tokens_hash on mcp_tokens(token_hash);
