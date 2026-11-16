-- PREPARED ONLY: do not run until the owner has configured/tested staging push,
-- reviewed extension/queue permissions and confirmed R0 request limits.
-- No extension, secret or scheduler is enabled by application migrations.
-- Store the SAME private token as KONNEKT_PUSH_WEBHOOK_SECRET in Supabase Vault
-- under konnekt_staging_push_hook_token, outside Git/migration files.
-- Explicit owner activation: SET konnekt.enable_staging_push_retry = 'true';
DO $setup$
BEGIN
  IF current_setting('konnekt.enable_staging_push_retry',true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Explicit staging retry activation is required.';
  END IF;
  IF to_regclass('konnekt_private.push_outbox') IS NULL OR to_regclass('cron.job') IS NULL
     OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'Inspect/enable the approved free scheduler/network prerequisites first.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='konnekt_staging_push_hook_token') THEN
    RAISE EXCEPTION 'Private staging webhook token must be configured in Vault first.';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='konnekt-staging-push-retry') THEN
    RAISE EXCEPTION 'A retry job already exists; inspect it rather than adding a duplicate.';
  END IF;
  PERFORM cron.schedule('konnekt-staging-push-retry','* * * * *',$job$
    SELECT net.http_post(
      url:='https://oiwtfkgrnpzirghbsvim.supabase.co/functions/v1/dispatch-push',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='konnekt_staging_push_hook_token')),
      body:='{"type":"DRAIN"}'::jsonb,timeout_milliseconds:=60000
    ) WHERE EXISTS(SELECT 1 FROM konnekt_private.push_outbox o WHERE o.status='pending'
      AND o.next_attempt_at<=now() AND (o.lease_until IS NULL OR o.lease_until<=now()));
  $job$);
END;
$setup$;
-- To disable after owner review:
-- SELECT cron.unschedule('konnekt-staging-push-retry');
