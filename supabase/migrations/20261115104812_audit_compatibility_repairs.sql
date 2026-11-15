-- PROPOSED ONLY. Requires owner approval; never applied by this audit.
-- Inspected live project: itkoagpigiifodfhoujt, 15 November 2026.
-- No row deletion, RLS disabling, bucket-publicity changes or credential changes.
begin;
set local lock_timeout = '5s';

alter table public.conversations add column if not exists description text not null default '';
alter table public.messages add column if not exists media_encrypted boolean not null default false;
alter table public.messages add column if not exists media_encryption_iv text;
alter table public.messages add column if not exists media_mime_type text;

-- Keep the deployed function signature so all existing triggers remain valid.
-- notifications has reference_id, not entity_id/entity_type.
create or replace function public.konnekt_create_notification(
  p_recipient uuid, p_actor uuid, p_type text, p_body text,
  p_entity_type text default null, p_entity_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  insert into public.notifications(recipient_id, actor_id, type, body, reference_id)
  values(p_recipient, p_actor, p_type, left(coalesce(p_body, ''), 500), p_entity_id);
end;
$$;
revoke all on function public.konnekt_create_notification(uuid,uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.konnekt_create_notification(uuid,uuid,text,text,text,uuid) to service_role;

-- Existing public-media policy accepts statuses/posts but rejects the Reels UI.
drop policy if exists "users upload public media to own folder" on storage.objects;
create policy "users upload public media to own folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'konnekt-public-media'
  and (storage.foldername(name))[1] = any(array['statuses','posts','reels'])
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
commit;
