-- STAGING ONLY. Review and run on isolated staging before production approval.
-- Audited against production policies on 2026-11-15. Do not apply automatically.
BEGIN;

-- Existing permissive INSERT policies are OR-combined. Remove all three
-- call-session INSERT policies and replace with one complete predicate.
DROP POLICY IF EXISTS "KONNEKT signed in users create calls" ON public.call_sessions;
DROP POLICY IF EXISTS "caller creates calls" ON public.call_sessions;
DROP POLICY IF EXISTS "audit_call_contact_guard" ON public.call_sessions;
CREATE POLICY "konnekt_call_insert_authorized"
ON public.call_sessions FOR INSERT TO authenticated
WITH CHECK (
  caller_id = (SELECT auth.uid())
  AND callee_id <> (SELECT auth.uid())
  AND NOT public.konnekt_is_blocked_pair(callee_id)
  AND (
    conversation_id IS NULL OR (
      public.is_konnekt_conversation_member(conversation_id)
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = call_sessions.conversation_id
          AND cm.user_id = call_sessions.callee_id
      )
    )
  )
);

-- Consolidate messaging INSERT authorization so blocking cannot be
-- bypassed through another permissive INSERT policy.
DROP POLICY IF EXISTS "members send messages" ON public.messages;
DROP POLICY IF EXISTS "audit_direct_message_block_guard" ON public.messages;
CREATE POLICY "konnekt_message_insert_authorized"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND public.is_konnekt_conversation_member(conversation_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE c.id = messages.conversation_id
      AND NOT c.is_group
      AND cm.user_id <> (SELECT auth.uid())
      AND public.konnekt_is_blocked_pair(cm.user_id)
  )
);

-- RLS policy helpers must remain callable by authenticated users.
-- Removing anonymous EXECUTE addresses the two security-advisor findings.
REVOKE EXECUTE ON FUNCTION public.is_konnekt_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_konnekt_conversation_creator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_konnekt_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_konnekt_conversation_creator(uuid) TO authenticated;

COMMIT;

-- Staging acceptance: as an anonymous user, both helper RPCs are denied.
-- As member A, inserts into own conversation succeed.
-- As non-member C, inserts are denied.
-- After A blocks B (or vice versa), new direct messages and calls A->B
-- are denied. Unblocked calls and messages must still succeed.
-- Verify remaining policies on both tables before applying: another
-- permissive INSERT policy would still bypass the consolidated predicate.
