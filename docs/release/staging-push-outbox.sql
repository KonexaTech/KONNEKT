-- STAGING ONLY, after staging-push-delivery.sql. No backfill, secrets, HTTP or scheduler.
BEGIN;
CREATE TABLE IF NOT EXISTS konnekt_private.push_outbox(
  notification_id uuid PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  provider_id uuid
);
ALTER TABLE konnekt_private.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON konnekt_private.push_outbox FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS push_outbox_pending ON konnekt_private.push_outbox(next_attempt_at) WHERE status='pending';
CREATE OR REPLACE FUNCTION public.konnekt_enqueue_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO konnekt_private.push_outbox(notification_id) VALUES(new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_enqueue_push() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS konnekt_enqueue_push ON public.notifications;
CREATE TRIGGER konnekt_enqueue_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.konnekt_enqueue_push();

CREATE OR REPLACE FUNCTION public.konnekt_claim_push_notifications(p_notification_id uuid DEFAULT NULL,p_limit integer DEFAULT 1)
RETURNS TABLE(notification_id uuid,lease_token uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE konnekt_private.push_outbox o SET status='failed',lease_until=NULL,lease_token=NULL
    WHERE o.status='pending' AND o.attempts>=8 AND (o.lease_until IS NULL OR o.lease_until<=now());
  RETURN QUERY WITH selected AS (
    SELECT o.notification_id FROM konnekt_private.push_outbox o
      WHERE o.status='pending' AND o.attempts<8 AND o.next_attempt_at<=now()
        AND (o.lease_until IS NULL OR o.lease_until<=now())
        AND (p_notification_id IS NULL OR o.notification_id=p_notification_id)
      ORDER BY o.next_attempt_at,o.notification_id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,1),5))
  ) UPDATE konnekt_private.push_outbox o SET attempts=o.attempts+1,
      lease_until=now()+interval '2 minutes',lease_token=pg_catalog.gen_random_uuid()
    FROM selected s WHERE o.notification_id=s.notification_id RETURNING o.notification_id,o.lease_token;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_claim_push_notifications(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_claim_push_notifications(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.konnekt_complete_push_notification(p_notification_id uuid,p_lease_token uuid,p_result text,p_provider_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_result NOT IN ('accepted','skipped','retry') OR p_result IS NULL OR (p_result='accepted' AND p_provider_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid push completion result.';
  END IF;
  UPDATE konnekt_private.push_outbox o SET status=CASE WHEN p_result='retry' THEN CASE WHEN o.attempts>=8 THEN 'failed' ELSE 'pending' END ELSE p_result END,
    next_attempt_at=CASE WHEN p_result='retry' THEN now()+least(900,(5*power(2,o.attempts))::int)*interval '1 second' ELSE o.next_attempt_at END,
    lease_until=NULL,lease_token=NULL,provider_id=CASE WHEN p_result='accepted' THEN p_provider_id ELSE NULL END
    WHERE o.notification_id=p_notification_id AND o.status='pending' AND o.lease_token=p_lease_token;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.konnekt_complete_push_notification(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.konnekt_complete_push_notification(uuid,uuid,text,uuid) TO service_role;
COMMIT;
