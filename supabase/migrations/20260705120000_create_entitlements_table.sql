-- Flowya Pro entitlements — single source of truth for who is Pro.
--
-- Consumed identically by the macOS app, the iOS app and the flowya-mcp service
-- via public.is_pro(). Written ONLY by trusted server webhooks (Stripe / Apple)
-- using the service role, which bypasses RLS. Clients can read their own row but
-- never write it.

create table if not exists public.entitlements (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  status                        text not null default 'free'
                                  check (status in ('free','trialing','active','past_due','canceled','grandfathered','lifetime')),
  plan                          text check (plan in ('monthly','annual')),
  source                        text check (source in ('stripe','apple','grandfather')),
  stripe_customer_id            text,
  stripe_subscription_id        text,
  apple_original_transaction_id text,
  current_period_end            timestamptz,
  trial_end                     timestamptz,
  grandfather_until             timestamptz,
  updated_at                    timestamptz not null default now()
);

-- Lookups used by webhook handlers to resolve a row from a provider id.
create index if not exists entitlements_stripe_customer_idx on public.entitlements (stripe_customer_id);
create index if not exists entitlements_stripe_sub_idx      on public.entitlements (stripe_subscription_id);
create index if not exists entitlements_apple_otx_idx       on public.entitlements (apple_original_transaction_id);

alter table public.entitlements enable row level security;

-- Read-only, own row. No client write policy on purpose: webhooks use the
-- service role (bypasses RLS) as the only writer.
drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement"
  on public.entitlements for select
  using (auth.uid() = user_id);

-- Date-aware Pro check: expired trials / grandfather / subscriptions fall back
-- to free automatically — no cron job needed. 3-day dunning grace on past_due.
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid
      and (
           e.status = 'lifetime'
        or (e.status = 'active'        and coalesce(e.current_period_end, 'epoch'::timestamptz) >= now())
        or (e.status = 'past_due'      and coalesce(e.current_period_end, 'epoch'::timestamptz) + interval '3 days' >= now())
        or (e.status = 'trialing'      and coalesce(e.trial_end, 'epoch'::timestamptz) >= now())
        or (e.status = 'grandfathered' and coalesce(e.grandfather_until, 'epoch'::timestamptz) >= now())
      )
  );
$$;

-- Convenience overload for the currently authenticated user (RLS-safe RPC).
create or replace function public.is_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_pro(auth.uid());
$$;

grant execute on function public.is_pro(uuid) to authenticated, service_role;
grant execute on function public.is_pro()     to authenticated, service_role;

-- Keep updated_at fresh on every write.
create or replace function public.touch_entitlements_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_entitlements_touch on public.entitlements;
create trigger trg_entitlements_touch
  before update on public.entitlements
  for each row execute function public.touch_entitlements_updated_at();

-- Realtime so the macOS app unlocks Pro instantly after a web/Stripe purchase
-- (same channel it already uses for todos). Guarded so re-runs don't error.
do $$
begin
  alter publication supabase_realtime add table public.entitlements;
exception when duplicate_object then null;
end $$;
