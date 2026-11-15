-- PROPOSED ONLY: owner approval and isolated SQL tests required before applying.
-- This restricts existing permissions; it does not disable or weaken RLS.
-- Profile phone privacy and public-media privacy need a separate data-model decision.
begin;
set local lock_timeout = '5s';

-- Keep the legacy endpoint compatible, but delegate all contact checks and
-- concurrency control to the inspected username RPC.
create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_name text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select username into target_name from public.profiles where id = target_user_id;
  if target_name is null then raise exception 'KONNEKT user not found'; end if;
  return public.konnekt_start_direct_conversation(target_name);
end;
$$;
revoke execute on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated, service_role;

-- Atomic definer RPCs create conversations/members. Direct table inserts bypass
-- those checks and can turn a private chat into a multi-member conversation.
revoke insert on public.conversations, public.conversation_members from anon, authenticated;

-- Retain participant identity; client calls only change lifecycle timestamps/status.
revoke update on public.call_sessions from authenticated;
grant update(status, answered_at, ended_at) on public.call_sessions to authenticated;
revoke update on public.group_call_sessions from authenticated;
grant update(status, ended_at) on public.group_call_sessions to authenticated;
revoke update on public.group_call_participants from authenticated;
grant update(status, joined_at) on public.group_call_participants to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

-- RESTRICTIVE checks also apply alongside duplicate permissive legacy policies.
drop policy if exists audit_call_contact_guard on public.call_sessions;
create policy audit_call_contact_guard on public.call_sessions as restrictive for insert to authenticated
with check (
  caller_id = (select auth.uid()) and callee_id <> (select auth.uid())
  and not public.konnekt_is_blocked_pair(callee_id)
  and (conversation_id is null or (
    public.is_konnekt_conversation_member(conversation_id)
    and exists(select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id and cm.user_id = call_sessions.callee_id)
  ))
);

drop policy if exists audit_direct_message_block_guard on public.messages;
create policy audit_direct_message_block_guard on public.messages as restrictive for insert to authenticated
with check (not exists (
  select 1 from public.conversations c join public.conversation_members cm on cm.conversation_id = c.id
  where c.id = messages.conversation_id and not c.is_group
    and cm.user_id <> (select auth.uid()) and public.konnekt_is_blocked_pair(cm.user_id)
));

drop policy if exists audit_receipt_membership_guard on public.message_receipts;
create policy audit_receipt_membership_guard on public.message_receipts as restrictive for insert to authenticated
with check (exists(select 1 from public.messages m where m.id = message_receipts.message_id
  and public.is_konnekt_conversation_member(m.conversation_id)));

drop policy if exists audit_envelope_recipient_guard on public.group_key_envelopes;
create policy audit_envelope_recipient_guard on public.group_key_envelopes as restrictive for insert to authenticated
with check (
  exists(select 1 from public.conversations c where c.id = group_key_envelopes.conversation_id
    and c.is_group and c.created_by = (select auth.uid()))
  and exists(select 1 from public.conversation_members cm where cm.conversation_id = group_key_envelopes.conversation_id
    and cm.user_id = group_key_envelopes.user_id)
);

drop policy if exists audit_group_invite_membership_guard on public.group_call_participants;
create policy audit_group_invite_membership_guard on public.group_call_participants as restrictive for insert to authenticated
with check (exists(select 1 from public.group_call_sessions s
  join public.conversation_members cm on cm.conversation_id = s.conversation_id
  where s.id = group_call_participants.call_id and cm.user_id = group_call_participants.user_id));

-- Reporter identity alone does not protect server-owned moderation fields.
drop policy if exists audit_report_submission_guard on public.user_reports;
create policy audit_report_submission_guard on public.user_reports as restrictive for insert to authenticated
with check (status = 'open' and moderator_id is null and moderator_notes = '' and reviewed_at is null);

-- Trigger internals need no public RPC execution. Trigger execution remains intact.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'konnekt_notify_%' or p.proname in ('handle_new_konnekt_user','rls_auto_enable'))
  loop execute format('revoke execute on function %s from public, anon, authenticated', f.signature); end loop;
end $$;

-- Push/browser notifications must not duplicate private plaintext message bodies.
create or replace function public.konnekt_notify_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member_record record;
begin
  for member_record in select user_id from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.konnekt_create_notification(member_record.user_id, new.sender_id,
      'message', 'You received a new message.', 'conversation', new.conversation_id);
  end loop;
  return new;
end;
$$;
revoke execute on function public.konnekt_notify_message() from public, anon, authenticated;
commit;
