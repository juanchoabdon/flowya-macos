-- Track whether an active subscription is set to cancel at period end, so the
-- UI can say "Pro — cancels on X (won't renew)" and offer Reactivate, instead
-- of wrongly showing "renews on X". Additive + idempotent.

alter table public.entitlements
  add column if not exists cancel_at_period_end boolean not null default false;
