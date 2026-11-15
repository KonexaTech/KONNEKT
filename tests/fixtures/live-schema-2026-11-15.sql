create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role; grant execute on all functions in schema auth to anon,authenticated,service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create table public."account_deletion_requests"("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"status" text default 'requested'::text not null,"reason" text default ''::text not null,"created_at" timestamp with time zone default now() not null,"processed_at" timestamp with time zone); alter table public."account_deletion_requests" enable row level security;
create table public."call_sessions"("id" uuid default gen_random_uuid() not null,"conversation_id" uuid,"caller_id" uuid not null,"callee_id" uuid not null,"call_type" text not null,"status" text default 'ringing'::text not null,"started_at" timestamp with time zone default now() not null,"answered_at" timestamp with time zone,"ended_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null); alter table public."call_sessions" enable row level security;
create table public."call_signals"("id" bigint not null,"call_id" uuid not null,"sender_id" uuid not null,"signal_type" text not null,"payload" jsonb default '{}'::jsonb not null,"created_at" timestamp with time zone default now() not null); alter table public."call_signals" enable row level security;
create table public."conversation_members"("conversation_id" uuid not null,"user_id" uuid not null,"joined_at" timestamp with time zone default now() not null,"role" text default 'member'::text not null,"last_read_at" timestamp with time zone); alter table public."conversation_members" enable row level security;
create table public."conversations"("id" uuid default gen_random_uuid() not null,"title" text,"is_group" boolean default false not null,"created_by" uuid not null,"created_at" timestamp with time zone default now() not null); alter table public."conversations" enable row level security;
create table public."follows"("follower_id" uuid not null,"followed_id" uuid not null,"created_at" timestamp with time zone default now() not null); alter table public."follows" enable row level security;
create table public."group_call_participants"("call_id" uuid not null,"user_id" uuid not null,"status" text default 'invited'::text not null,"joined_at" timestamp with time zone); alter table public."group_call_participants" enable row level security;
create table public."group_call_sessions"("id" uuid default gen_random_uuid() not null,"conversation_id" uuid not null,"created_by" uuid not null,"call_type" text not null,"status" text default 'ringing'::text not null,"created_at" timestamp with time zone default now() not null,"ended_at" timestamp with time zone); alter table public."group_call_sessions" enable row level security;
create table public."group_call_signals"("id" uuid default gen_random_uuid() not null,"call_id" uuid not null,"sender_id" uuid not null,"recipient_id" uuid not null,"signal_type" text not null,"payload" jsonb default '{}'::jsonb not null,"created_at" timestamp with time zone default now() not null); alter table public."group_call_signals" enable row level security;
create table public."group_key_envelopes"("id" uuid default gen_random_uuid() not null,"conversation_id" uuid not null,"user_id" uuid not null,"sender_id" uuid not null,"sender_public_key" text not null,"key_version" integer default 1 not null,"wrapped_key" text not null,"wrap_iv" text not null,"created_at" timestamp with time zone default now() not null); alter table public."group_key_envelopes" enable row level security;
create table public."live_stream_comments"("id" uuid default gen_random_uuid() not null,"stream_id" uuid not null,"user_id" uuid not null,"body" text not null,"created_at" timestamp with time zone default now() not null); alter table public."live_stream_comments" enable row level security;
create table public."live_streams"("id" uuid default gen_random_uuid() not null,"host_id" uuid not null,"title" text not null,"category" text default 'Other'::text not null,"audience" text default 'Everyone'::text not null,"status" text default 'live'::text not null,"provider" text default 'not_configured'::text not null,"provider_room_id" text,"started_at" timestamp with time zone default now() not null,"ended_at" timestamp with time zone); alter table public."live_streams" enable row level security;
create table public."message_receipts"("message_id" uuid not null,"user_id" uuid not null,"delivered_at" timestamp with time zone,"read_at" timestamp with time zone); alter table public."message_receipts" enable row level security;
create table public."messages"("id" uuid default gen_random_uuid() not null,"conversation_id" uuid not null,"sender_id" uuid not null,"body" text default ''::text not null,"created_at" timestamp with time zone default now() not null,"edited_at" timestamp with time zone,"media_path" text,"media_type" text,"is_encrypted" boolean default false not null,"encryption_iv" text); alter table public."messages" enable row level security;
create table public."moderation_actions"("id" uuid default gen_random_uuid() not null,"moderator_id" uuid not null,"target_user_id" uuid,"report_id" uuid,"action" text not null,"reason" text default ''::text not null,"created_at" timestamp with time zone default now() not null); alter table public."moderation_actions" enable row level security;
create table public."moderation_admins"("user_id" uuid not null,"added_at" timestamp with time zone default now() not null); alter table public."moderation_admins" enable row level security;
create table public."notifications"("id" uuid default gen_random_uuid() not null,"recipient_id" uuid not null,"actor_id" uuid,"type" text not null,"body" text default ''::text not null,"reference_id" uuid,"read_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null); alter table public."notifications" enable row level security;
create table public."post_comments"("id" uuid default gen_random_uuid() not null,"post_id" uuid not null,"user_id" uuid not null,"body" text not null,"created_at" timestamp with time zone default now() not null); alter table public."post_comments" enable row level security;
create table public."post_likes"("post_id" uuid not null,"user_id" uuid not null,"created_at" timestamp with time zone default now() not null); alter table public."post_likes" enable row level security;
create table public."posts"("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"caption" text default ''::text not null,"media_url" text not null,"media_type" text not null,"created_at" timestamp with time zone default now() not null); alter table public."posts" enable row level security;
create table public."profiles"("id" uuid not null,"username" text,"full_name" text default ''::text not null,"phone" text,"avatar_url" text,"bio" text default ''::text not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"encryption_public_key" text); alter table public."profiles" enable row level security;
create table public."reel_comments"("id" uuid default gen_random_uuid() not null,"reel_id" uuid not null,"user_id" uuid not null,"body" text not null,"created_at" timestamp with time zone default now() not null,"deleted_at" timestamp with time zone); alter table public."reel_comments" enable row level security;
create table public."reel_likes"("reel_id" uuid not null,"user_id" uuid not null,"created_at" timestamp with time zone default now() not null); alter table public."reel_likes" enable row level security;
create table public."reels"("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"caption" text default ''::text not null,"media_path" text not null,"visibility" text default 'public'::text not null,"published_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"deleted_at" timestamp with time zone); alter table public."reels" enable row level security;
create table public."statuses"("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"text_content" text,"media_url" text,"media_type" text default 'text'::text not null,"expires_at" timestamp with time zone default (now() + '24:00:00'::interval) not null,"created_at" timestamp with time zone default now() not null); alter table public."statuses" enable row level security;
create table public."user_blocks"("blocker_id" uuid not null,"blocked_id" uuid not null,"created_at" timestamp with time zone default now() not null); alter table public."user_blocks" enable row level security;
create table public."user_device_keys"("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"device_label" text default 'Device'::text not null,"identity_public_key" text not null,"signed_prekey" text not null,"signed_prekey_signature" text not null,"created_at" timestamp with time zone default now() not null,"revoked_at" timestamp with time zone); alter table public."user_device_keys" enable row level security;
create table public."user_key_backups"("user_id" uuid not null,"ciphertext" text not null,"salt" text not null,"iv" text not null,"iterations" integer not null,"key_version" integer default 1 not null,"updated_at" timestamp with time zone default now() not null); alter table public."user_key_backups" enable row level security;
create table public."user_presence"("user_id" uuid not null,"is_online" boolean default false not null,"last_seen_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null); alter table public."user_presence" enable row level security;
create table public."user_reports"("id" uuid default gen_random_uuid() not null,"reporter_id" uuid not null,"reported_user_id" uuid,"content_id" uuid,"content_type" text default 'user'::text not null,"reason" text not null,"details" text default ''::text not null,"status" text default 'open'::text not null,"moderator_id" uuid,"moderator_notes" text default ''::text not null,"created_at" timestamp with time zone default now() not null,"reviewed_at" timestamp with time zone); alter table public."user_reports" enable row level security;
alter table public."account_deletion_requests" add constraint "account_deletion_requests_pkey" PRIMARY KEY (id);
alter table public."account_deletion_requests" add constraint "account_deletion_requests_status_check" CHECK ((status = ANY (ARRAY['requested'::text, 'processing'::text, 'completed'::text, 'rejected'::text])));
alter table public."call_sessions" add constraint "call_sessions_status_check" CHECK ((status = ANY (ARRAY['ringing'::text, 'accepted'::text, 'rejected'::text, 'missed'::text, 'ended'::text, 'failed'::text])));
alter table public."call_sessions" add constraint "call_sessions_pkey" PRIMARY KEY (id);
alter table public."call_sessions" add constraint "call_sessions_call_type_check" CHECK ((call_type = ANY (ARRAY['voice'::text, 'video'::text])));
alter table public."call_signals" add constraint "call_signals_signal_type_check" CHECK ((signal_type = ANY (ARRAY['offer'::text, 'answer'::text, 'ice'::text, 'hangup'::text, 'reject'::text])));
alter table public."call_signals" add constraint "call_signals_pkey" PRIMARY KEY (id);
alter table public."conversation_members" add constraint "conversation_members_pkey" PRIMARY KEY (conversation_id, user_id);
alter table public."conversations" add constraint "conversations_pkey" PRIMARY KEY (id);
alter table public."follows" add constraint "follows_no_self" CHECK ((follower_id <> followed_id));
alter table public."follows" add constraint "follows_pkey" PRIMARY KEY (follower_id, followed_id);
alter table public."group_call_participants" add constraint "group_call_participants_pkey" PRIMARY KEY (call_id, user_id);
alter table public."group_call_participants" add constraint "group_call_participants_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'joined'::text, 'declined'::text, 'left'::text])));
alter table public."group_call_sessions" add constraint "group_call_sessions_status_check" CHECK ((status = ANY (ARRAY['ringing'::text, 'active'::text, 'ended'::text])));
alter table public."group_call_sessions" add constraint "group_call_sessions_pkey" PRIMARY KEY (id);
alter table public."group_call_sessions" add constraint "group_call_sessions_check" CHECK (((status <> 'ended'::text) OR (ended_at IS NOT NULL)));
alter table public."group_call_sessions" add constraint "group_call_sessions_call_type_check" CHECK ((call_type = ANY (ARRAY['voice'::text, 'video'::text])));
alter table public."group_call_signals" add constraint "group_call_signals_check" CHECK ((sender_id <> recipient_id));
alter table public."group_call_signals" add constraint "group_call_signals_pkey" PRIMARY KEY (id);
alter table public."group_call_signals" add constraint "group_call_signals_signal_type_check" CHECK ((signal_type = ANY (ARRAY['offer'::text, 'answer'::text, 'ice-candidate'::text, 'hangup'::text])));
alter table public."group_key_envelopes" add constraint "group_key_envelopes_pkey" PRIMARY KEY (id);
alter table public."group_key_envelopes" add constraint "group_key_envelopes_conversation_id_user_id_key_version_key" UNIQUE (conversation_id, user_id, key_version);
alter table public."live_stream_comments" add constraint "live_stream_comments_pkey" PRIMARY KEY (id);
alter table public."live_stream_comments" add constraint "live_stream_comments_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)));
alter table public."live_streams" add constraint "live_streams_status_check" CHECK ((status = ANY (ARRAY['live'::text, 'ended'::text])));
alter table public."live_streams" add constraint "live_streams_pkey" PRIMARY KEY (id);
alter table public."message_receipts" add constraint "message_receipts_pkey" PRIMARY KEY (message_id, user_id);
alter table public."messages" add constraint "messages_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 10000)));
alter table public."messages" add constraint "messages_body_or_media" CHECK (((char_length(body) <= 10000) AND ((char_length(body) > 0) OR (media_path IS NOT NULL))));
alter table public."messages" add constraint "messages_pkey" PRIMARY KEY (id);
alter table public."moderation_actions" add constraint "moderation_actions_action_check" CHECK ((action = ANY (ARRAY['warning'::text, 'report_actioned'::text, 'content_removed'::text, 'temporary_restriction'::text, 'account_suspended'::text, 'account_restored'::text, 'report_dismissed'::text])));
alter table public."moderation_actions" add constraint "moderation_actions_reason_check" CHECK ((char_length(reason) <= 2000));
alter table public."moderation_actions" add constraint "moderation_actions_pkey" PRIMARY KEY (id);
alter table public."moderation_admins" add constraint "moderation_admins_pkey" PRIMARY KEY (user_id);
alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);
alter table public."post_comments" add constraint "post_comments_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));
alter table public."post_comments" add constraint "post_comments_pkey" PRIMARY KEY (id);
alter table public."post_likes" add constraint "post_likes_pkey" PRIMARY KEY (post_id, user_id);
alter table public."posts" add constraint "posts_media_type_check" CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
alter table public."posts" add constraint "posts_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_username_format" CHECK (((username IS NULL) OR (username ~ '^[a-zA-Z0-9_.]{3,20}$'::text)));
alter table public."profiles" add constraint "profiles_username_key" UNIQUE (username);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."reel_comments" add constraint "reel_comments_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));
alter table public."reel_comments" add constraint "reel_comments_pkey" PRIMARY KEY (id);
alter table public."reel_likes" add constraint "reel_likes_pkey" PRIMARY KEY (reel_id, user_id);
alter table public."reels" add constraint "reels_pkey" PRIMARY KEY (id);
alter table public."reels" add constraint "reels_visibility_check" CHECK ((visibility = ANY (ARRAY['public'::text, 'followers'::text, 'private'::text])));
alter table public."statuses" add constraint "statuses_pkey" PRIMARY KEY (id);
alter table public."statuses" add constraint "statuses_media_type_check" CHECK ((media_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text])));
alter table public."statuses" add constraint "statuses_content_present" CHECK (((NULLIF(text_content, ''::text) IS NOT NULL) OR (media_url IS NOT NULL)));
alter table public."user_blocks" add constraint "user_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);
alter table public."user_blocks" add constraint "user_blocks_check" CHECK ((blocker_id <> blocked_id));
alter table public."user_device_keys" add constraint "user_device_keys_pkey" PRIMARY KEY (id);
alter table public."user_key_backups" add constraint "user_key_backups_pkey" PRIMARY KEY (user_id);
alter table public."user_key_backups" add constraint "user_key_backups_key_version_check" CHECK ((key_version = 1));
alter table public."user_key_backups" add constraint "user_key_backups_iterations_check" CHECK (((iterations >= 100000) AND (iterations <= 1000000)));
alter table public."user_presence" add constraint "user_presence_pkey" PRIMARY KEY (user_id);
alter table public."user_reports" add constraint "user_reports_check" CHECK (((reported_user_id IS NULL) OR (reported_user_id <> reporter_id)));
alter table public."user_reports" add constraint "user_reports_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'actioned'::text, 'dismissed'::text])));
alter table public."user_reports" add constraint "user_reports_details_check" CHECK ((char_length(details) <= 2000));
alter table public."user_reports" add constraint "user_reports_reason_check" CHECK (((char_length(reason) >= 3) AND (char_length(reason) <= 100)));
alter table public."user_reports" add constraint "user_reports_content_type_check" CHECK ((content_type = ANY (ARRAY['user'::text, 'post'::text, 'comment'::text, 'message'::text, 'other'::text])));
alter table public."user_reports" add constraint "user_reports_pkey" PRIMARY KEY (id);
alter table public."call_sessions" add constraint "call_sessions_callee_id_fkey" FOREIGN KEY (callee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."call_sessions" add constraint "call_sessions_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
alter table public."call_sessions" add constraint "call_sessions_caller_id_fkey" FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."call_signals" add constraint "call_signals_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."call_signals" add constraint "call_signals_call_id_fkey" FOREIGN KEY (call_id) REFERENCES call_sessions(id) ON DELETE CASCADE;
alter table public."conversation_members" add constraint "conversation_members_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
alter table public."conversation_members" add constraint "conversation_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."conversations" add constraint "conversations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."follows" add constraint "follows_follower_id_fkey" FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."follows" add constraint "follows_followed_id_fkey" FOREIGN KEY (followed_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_call_participants" add constraint "group_call_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_call_participants" add constraint "group_call_participants_call_id_fkey" FOREIGN KEY (call_id) REFERENCES group_call_sessions(id) ON DELETE CASCADE;
alter table public."group_call_sessions" add constraint "group_call_sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_call_sessions" add constraint "group_call_sessions_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
alter table public."group_call_signals" add constraint "group_call_signals_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_call_signals" add constraint "group_call_signals_call_id_fkey" FOREIGN KEY (call_id) REFERENCES group_call_sessions(id) ON DELETE CASCADE;
alter table public."group_call_signals" add constraint "group_call_signals_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_key_envelopes" add constraint "group_key_envelopes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_key_envelopes" add constraint "group_key_envelopes_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."group_key_envelopes" add constraint "group_key_envelopes_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
alter table public."live_stream_comments" add constraint "live_stream_comments_stream_id_fkey" FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE;
alter table public."live_stream_comments" add constraint "live_stream_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."live_streams" add constraint "live_streams_host_id_fkey" FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."message_receipts" add constraint "message_receipts_message_id_fkey" FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
alter table public."message_receipts" add constraint "message_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
alter table public."moderation_actions" add constraint "moderation_actions_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."moderation_actions" add constraint "moderation_actions_report_id_fkey" FOREIGN KEY (report_id) REFERENCES user_reports(id) ON DELETE SET NULL;
alter table public."moderation_actions" add constraint "moderation_actions_moderator_id_fkey" FOREIGN KEY (moderator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."moderation_admins" add constraint "moderation_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."notifications" add constraint "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."notifications" add constraint "notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."post_comments" add constraint "post_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public."post_comments" add constraint "post_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."post_likes" add constraint "post_likes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public."post_likes" add constraint "post_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."posts" add constraint "posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."reel_comments" add constraint "reel_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."reel_comments" add constraint "reel_comments_reel_id_fkey" FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE;
alter table public."reel_likes" add constraint "reel_likes_reel_id_fkey" FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE;
alter table public."reel_likes" add constraint "reel_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."reels" add constraint "reels_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."statuses" add constraint "statuses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_blocks" add constraint "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_blocks" add constraint "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_device_keys" add constraint "user_device_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_key_backups" add constraint "user_key_backups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_presence" add constraint "user_presence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_reports" add constraint "user_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_reports" add constraint "user_reports_moderator_id_fkey" FOREIGN KEY (moderator_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."user_reports" add constraint "user_reports_reported_user_id_fkey" FOREIGN KEY (reported_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.create_direct_conversation(target_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    current_user_id uuid;
    new_conversation_id uuid;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;

    IF target_user_id IS NULL OR target_user_id = current_user_id THEN
        RAISE EXCEPTION 'Choose another KONNEKT member.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM auth.users
        WHERE id = target_user_id
    ) THEN
        RAISE EXCEPTION 'This KONNEKT account does not exist.';
    END IF;

    INSERT INTO public.conversations (
        created_by,
        is_group
    )
    VALUES (
        current_user_id,
        false
    )
    RETURNING id INTO new_conversation_id;

    INSERT INTO public.conversation_members (
        conversation_id,
        user_id
    )
    VALUES
        (new_conversation_id, current_user_id),
        (new_conversation_id, target_user_id);

    RETURN new_conversation_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_konnekt_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, username, full_name, phone)
  values (new.id, nullif(lower(new.raw_user_meta_data ->> 'username'), ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.is_konnekt_conversation_creator(target_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = target_conversation
      AND c.created_by = (SELECT auth.uid())
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_konnekt_conversation_member(target_conversation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists(select 1 from public.conversation_members cm where cm.conversation_id=target_conversation and cm.user_id=auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.is_konnekt_moderator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.moderation_admins
    where user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_can_view_reel(target_reel uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.reels r
    where r.id = target_reel
      and r.deleted_at is null
      and (
        r.user_id = (select auth.uid())
        or (
          r.published_at is not null
          and (
            r.visibility = 'public'
            or (
              r.visibility = 'followers'
              and exists (
                select 1
                from public.follows f
                where f.follower_id = (select auth.uid())
                  and f.followed_id = r.user_id
              )
            )
          )
        )
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_create_group_conversation(group_title text, group_description text, member_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  new_conversation_id uuid;
  member_count integer;
  distinct_member_count integer;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  if group_title is null
     or char_length(trim(group_title)) < 1
     or char_length(trim(group_title)) > 60 then
    raise exception 'Group name must be between 1 and 60 characters';
  end if;

  if char_length(coalesce(group_description, '')) > 200 then
    raise exception 'Group description cannot exceed 200 characters';
  end if;

  if member_ids is null then
    raise exception 'Choose at least one other member';
  end if;

  select count(*), count(distinct member_id)
    into member_count, distinct_member_count
  from unnest(member_ids) as selected(member_id);

  if member_count < 1 or member_count > 99 then
    raise exception 'Choose between 1 and 99 other members';
  end if;

  if member_count <> distinct_member_count then
    raise exception 'Duplicate group members were selected';
  end if;

  if actor = any(member_ids) then
    raise exception 'You are already included in this group';
  end if;

  if exists (
    select 1
    from unnest(member_ids) as selected(member_id)
    where selected.member_id is null
       or not exists (
         select 1
         from public.profiles p
         where p.id = selected.member_id
       )
  ) then
    raise exception 'One or more selected members could not be found';
  end if;

  if exists (
    select 1
    from unnest(member_ids) as selected(member_id)
    where public.konnekt_is_blocked_pair(selected.member_id)
  ) then
    raise exception 'A selected member cannot be added because of a block relationship';
  end if;

  insert into public.conversations (
    created_by,
    title,
    description,
    is_group
  )
  values (
    actor,
    trim(group_title),
    trim(coalesce(group_description, '')),
    true
  )
  returning id into new_conversation_id;

  insert into public.conversation_members (
    conversation_id,
    user_id
  )
  select new_conversation_id, actor
  union all
  select new_conversation_id, selected.member_id
  from unnest(member_ids) as selected(member_id);

  return new_conversation_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_create_notification(p_recipient uuid, p_actor uuid, p_type text, p_body text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_recipient is null then
    return;
  end if;

  if p_actor is not null and p_recipient = p_actor then
    return;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    body,
    entity_type,
    entity_id
  )
  values (
    p_recipient,
    p_actor,
    p_type,
    left(coalesce(p_body, ''), 500),
    p_entity_type,
    p_entity_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_is_blocked_pair(other_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_blocks b
        WHERE
            (
                b.blocker_id = (SELECT auth.uid())
                AND b.blocked_id = other_user
            )
            OR
            (
                b.blocker_id = other_user
                AND b.blocked_id = (SELECT auth.uid())
            )
    );
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  if owner_id is not null and owner_id<>new.user_id then
    insert into public.notifications(recipient_id,actor_id,type,body,reference_id)
    values(owner_id,new.user_id,'comment','Someone commented on your post.',new.post_id);
  end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_follow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.konnekt_create_notification(
    new.followed_id,
    new.follower_id,
    'follow',
    'Someone started following you.',
    'profile',
    new.follower_id
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  if owner_id is not null and owner_id<>new.user_id then
    insert into public.notifications(recipient_id,actor_id,type,body,reference_id) values(owner_id,new.user_id,'like','Someone liked your post.',new.post_id);
  end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_live_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare owner_id uuid;
begin
  select host_id into owner_id from public.live_streams where id=new.stream_id;
  if owner_id is not null and owner_id<>new.user_id then
    insert into public.notifications(recipient_id,actor_id,type,body,reference_id)
    values(owner_id,new.user_id,'live_comment','Someone commented on your live stream.',new.stream_id);
  end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member_record record;
  message_text text;
begin
  message_text := left(coalesce(new.body, ''), 120);

  if message_text = '' then
    message_text := 'You received a new message.';
  else
    message_text := 'New message: ' || message_text;
  end if;

  for member_record in
    select user_id
    from public.conversation_members
    where conversation_id = new.conversation_id
      and user_id <> new.sender_id
  loop
    perform public.konnekt_create_notification(
      member_record.user_id,
      new.sender_id,
      'message',
      message_text,
      'conversation',
      new.conversation_id
    );
  end loop;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_reel_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reel_owner uuid;
begin
  select user_id into reel_owner
  from public.reels
  where id = new.reel_id;

  perform public.konnekt_create_notification(
    reel_owner,
    new.user_id,
    'comment',
    'Someone commented on your Reel.',
    'reel',
    new.reel_id
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_notify_reel_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reel_owner uuid;
begin
  select user_id into reel_owner
  from public.reels
  where id = new.reel_id;

  perform public.konnekt_create_notification(
    reel_owner,
    new.user_id,
    'like',
    'Someone liked your Reel.',
    'reel',
    new.reel_id
  );

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.konnekt_start_direct_conversation(target_username text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    actor UUID;
    target UUID;
    existing_id UUID;
    new_id UUID;
    clean_username TEXT;
BEGIN

    -- Identify the authenticated user.
    actor := auth.uid();

    IF actor IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate the supplied username.
    clean_username := regexp_replace(
        trim(coalesce(target_username, '')),
        '^@',
        ''
    );

    IF length(clean_username) < 3 THEN
        RAISE EXCEPTION 'Enter a valid username';
    END IF;

    -- Find the recipient.
    SELECT p.id
    INTO target
    FROM public.profiles p
    WHERE lower(p.username) = lower(clean_username)
    LIMIT 1;

    IF target IS NULL THEN
        RAISE EXCEPTION 'KONNEKT user not found';
    END IF;

    -- Prevent conversations with yourself.
    IF target = actor THEN
        RAISE EXCEPTION 'You cannot start a chat with yourself';
    END IF;

    -- Prevent contact if either user has blocked the other.
    IF public.konnekt_is_blocked_pair(target) THEN
        RAISE EXCEPTION 'This user cannot be contacted';
    END IF;

    -- Serialize simultaneous attempts for the same pair.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            LEAST(actor::TEXT, target::TEXT)
            || ':'
            || GREATEST(actor::TEXT, target::TEXT),
            0
        )
    );

    -- Check again after obtaining the lock.
    IF public.konnekt_is_blocked_pair(target) THEN
        RAISE EXCEPTION 'This user cannot be contacted';
    END IF;

    -- Reuse an existing one-to-one conversation.
    SELECT c.id
    INTO existing_id
    FROM public.conversations c
    WHERE
        c.is_group = FALSE

        AND EXISTS (
            SELECT 1
            FROM public.conversation_members m
            WHERE m.conversation_id = c.id
              AND m.user_id = actor
        )

        AND EXISTS (
            SELECT 1
            FROM public.conversation_members m
            WHERE m.conversation_id = c.id
              AND m.user_id = target
        )

        AND (
            SELECT COUNT(*)
            FROM public.conversation_members m
            WHERE m.conversation_id = c.id
        ) = 2

    ORDER BY c.created_at DESC
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
        RETURN existing_id;
    END IF;

    -- Create a new private conversation.
    INSERT INTO public.conversations (
        created_by,
        is_group
    )
    VALUES (
        actor,
        FALSE
    )
    RETURNING id INTO new_id;

    -- Add both participants.
    INSERT INTO public.conversation_members (
        conversation_id,
        user_id
    )
    VALUES
        (new_id, actor),
        (new_id, target);

    RETURN new_id;

END;
$function$
;
create policy "users read own deletion requests" on public."account_deletion_requests" for select to authenticated using ((user_id = auth.uid()));
create policy "users submit own deletion requests" on public."account_deletion_requests" for insert to authenticated with check ((user_id = auth.uid()));
create policy "KONNEKT call participants read sessions" on public."call_sessions" for select to authenticated using (((caller_id = auth.uid()) OR (callee_id = auth.uid())));
create policy "KONNEKT call participants update sessions" on public."call_sessions" for update to authenticated using (((caller_id = auth.uid()) OR (callee_id = auth.uid()))) with check (((caller_id = auth.uid()) OR (callee_id = auth.uid())));
create policy "KONNEKT signed in users create calls" on public."call_sessions" for insert to authenticated with check (((caller_id = auth.uid()) AND (callee_id <> auth.uid())));
create policy "caller creates calls" on public."call_sessions" for insert to authenticated with check ((auth.uid() = caller_id));
create policy "participants read calls" on public."call_sessions" for select to authenticated using (((auth.uid() = caller_id) OR (auth.uid() = callee_id)));
create policy "participants update calls" on public."call_sessions" for update to authenticated using (((auth.uid() = caller_id) OR (auth.uid() = callee_id))) with check (((auth.uid() = caller_id) OR (auth.uid() = callee_id)));
create policy "KONNEKT call participants read signals" on public."call_signals" for select to authenticated using ((EXISTS ( SELECT 1
   FROM call_sessions cs
  WHERE ((cs.id = call_signals.call_id) AND ((cs.caller_id = auth.uid()) OR (cs.callee_id = auth.uid()))))));
create policy "KONNEKT call participants send signals" on public."call_signals" for insert to authenticated with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM call_sessions cs
  WHERE ((cs.id = call_signals.call_id) AND ((cs.caller_id = auth.uid()) OR (cs.callee_id = auth.uid())))))));
create policy "participants read call signals" on public."call_signals" for select to authenticated using ((EXISTS ( SELECT 1
   FROM call_sessions c
  WHERE ((c.id = call_signals.call_id) AND ((c.caller_id = auth.uid()) OR (c.callee_id = auth.uid()))))));
create policy "participants send call signals" on public."call_signals" for insert to authenticated with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM call_sessions c
  WHERE ((c.id = call_signals.call_id) AND ((c.caller_id = auth.uid()) OR (c.callee_id = auth.uid())))))));
create policy "conversation creator adds members" on public."conversation_members" for insert to authenticated with check (is_konnekt_conversation_creator(conversation_id));
create policy "members see own memberships" on public."conversation_members" for select to authenticated using (((user_id = auth.uid()) OR is_konnekt_conversation_member(conversation_id)));
create policy "creator adds conversation" on public."conversations" for insert to authenticated with check ((created_by = ( SELECT auth.uid() AS uid)));
create policy "members read conversations" on public."conversations" for select to authenticated using (is_konnekt_conversation_member(id));
create policy "follows visible to authenticated" on public."follows" for select to authenticated using (true);
create policy "users follow as themselves" on public."follows" for insert to authenticated with check ((follower_id = auth.uid()));
create policy "users unfollow as themselves" on public."follows" for delete to authenticated using ((follower_id = auth.uid()));
create policy "group call participants invited by member" on public."group_call_participants" for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM group_call_sessions s
  WHERE ((s.id = group_call_participants.call_id) AND (s.created_by = auth.uid()) AND is_konnekt_conversation_member(s.conversation_id)))));
create policy "group call participants read own room" on public."group_call_participants" for select to authenticated using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_call_sessions s
  WHERE ((s.id = group_call_participants.call_id) AND is_konnekt_conversation_member(s.conversation_id))))));
create policy "users update own group call status" on public."group_call_participants" for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "conversation members create group calls" on public."group_call_sessions" for insert to authenticated with check (((created_by = auth.uid()) AND is_konnekt_conversation_member(conversation_id)));
create policy "conversation members read group calls" on public."group_call_sessions" for select to authenticated using (is_konnekt_conversation_member(conversation_id));
create policy "participants update group calls" on public."group_call_sessions" for update to authenticated using (is_konnekt_conversation_member(conversation_id)) with check (is_konnekt_conversation_member(conversation_id));
create policy "call participants exchange group signals" on public."group_call_signals" for all to authenticated using (((sender_id = auth.uid()) OR (recipient_id = auth.uid()))) with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM group_call_participants p
  WHERE ((p.call_id = group_call_signals.call_id) AND (p.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM group_call_participants p
  WHERE ((p.call_id = group_call_signals.call_id) AND (p.user_id = group_call_signals.recipient_id))))));
create policy "members create group key envelopes" on public."group_key_envelopes" for insert to authenticated with check (((sender_id = auth.uid()) AND is_konnekt_conversation_member(conversation_id) AND is_konnekt_conversation_member(conversation_id)));
create policy "members read own group key envelopes" on public."group_key_envelopes" for select to authenticated using (((user_id = auth.uid()) AND is_konnekt_conversation_member(conversation_id)));
create policy "live chat visible to members" on public."live_stream_comments" for select to authenticated using ((EXISTS ( SELECT 1
   FROM live_streams s
  WHERE ((s.id = live_stream_comments.stream_id) AND (s.status = 'live'::text)))));
create policy "signed in users send live chat" on public."live_stream_comments" for insert to authenticated with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM live_streams s
  WHERE ((s.id = live_stream_comments.stream_id) AND (s.status = 'live'::text))))));
create policy "authenticated users view live rooms" on public."live_streams" for select to authenticated using (((status = 'live'::text) OR (host_id = auth.uid())));
create policy "hosts create own live rooms" on public."live_streams" for insert to authenticated with check ((host_id = auth.uid()));
create policy "hosts update own live rooms" on public."live_streams" for update to authenticated using ((host_id = auth.uid())) with check ((host_id = auth.uid()));
create policy "members can view receipts" on public."message_receipts" for select to authenticated using ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversation_members cm ON ((cm.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_receipts.message_id) AND (cm.user_id = auth.uid())))));
create policy "users mark own receipts" on public."message_receipts" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users update own receipts" on public."message_receipts" for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "members read messages" on public."messages" for select to authenticated using (is_konnekt_conversation_member(conversation_id));
create policy "members send messages" on public."messages" for insert to authenticated with check (((sender_id = auth.uid()) AND is_konnekt_conversation_member(conversation_id)));
create policy "sender deletes own messages" on public."messages" for delete to authenticated using (((sender_id = auth.uid()) AND is_konnekt_conversation_member(conversation_id)));
create policy "sender edits own messages" on public."messages" for update to authenticated using ((sender_id = auth.uid())) with check (((sender_id = auth.uid()) AND is_konnekt_conversation_member(conversation_id)));
create policy "moderators append moderation actions" on public."moderation_actions" for insert to authenticated with check (((moderator_id = auth.uid()) AND is_konnekt_moderator()));
create policy "moderators read moderation actions" on public."moderation_actions" for select to authenticated using (is_konnekt_moderator());
create policy "users can check own moderator status" on public."moderation_admins" for select to authenticated using ((user_id = auth.uid()));
create policy "konnekt_notifications_read" on public."notifications" for select to authenticated using ((recipient_id = ( SELECT auth.uid() AS uid)));
create policy "konnekt_notifications_update" on public."notifications" for update to authenticated using ((recipient_id = ( SELECT auth.uid() AS uid))) with check ((recipient_id = ( SELECT auth.uid() AS uid)));
create policy "users mark own notifications" on public."notifications" for update to authenticated using ((recipient_id = auth.uid())) with check ((recipient_id = auth.uid()));
create policy "users read own notifications" on public."notifications" for select to authenticated using ((recipient_id = auth.uid()));
create policy "conversation members read chat media" on storage."objects" for select to authenticated using (((bucket_id = 'konnekt-chat-media'::text) AND is_konnekt_conversation_member(((storage.foldername(name))[1])::uuid)));
create policy "conversation members upload chat media" on storage."objects" for insert to authenticated with check (((bucket_id = 'konnekt-chat-media'::text) AND is_konnekt_conversation_member(((storage.foldername(name))[1])::uuid) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "public media readable by signed in users" on storage."objects" for select to authenticated using ((bucket_id = 'konnekt-public-media'::text));
create policy "users delete own chat media" on storage."objects" for delete to authenticated using (((bucket_id = 'konnekt-chat-media'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "users delete own public media" on storage."objects" for delete to authenticated using (((bucket_id = 'konnekt-public-media'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "users upload public media to own folder" on storage."objects" for insert to authenticated with check (((bucket_id = 'konnekt-public-media'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['statuses'::text, 'posts'::text])) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "comments visible to authenticated" on public."post_comments" for select to authenticated using (true);
create policy "users comment as themselves" on public."post_comments" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users delete own comments" on public."post_comments" for delete to authenticated using ((user_id = auth.uid()));
create policy "likes visible to authenticated" on public."post_likes" for select to authenticated using (true);
create policy "users like as themselves" on public."post_likes" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users remove own likes" on public."post_likes" for delete to authenticated using ((user_id = auth.uid()));
create policy "authenticated users view posts" on public."posts" for select to authenticated using (true);
create policy "users create own posts" on public."posts" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users delete own posts" on public."posts" for delete to authenticated using ((user_id = auth.uid()));
create policy "users update own posts" on public."posts" for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "profile owner inserts own row" on public."profiles" for insert to authenticated with check ((auth.uid() = id));
create policy "profile owner updates own row" on public."profiles" for update to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "profiles readable by authenticated" on public."profiles" for select to authenticated using (true);
create policy "konnekt_reel_comments_delete" on public."reel_comments" for delete to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "konnekt_reel_comments_insert" on public."reel_comments" for insert to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND konnekt_can_view_reel(reel_id)));
create policy "konnekt_reel_comments_read" on public."reel_comments" for select to authenticated using (((deleted_at IS NULL) AND konnekt_can_view_reel(reel_id)));
create policy "konnekt_reel_comments_update" on public."reel_comments" for update to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "konnekt_reel_likes_delete" on public."reel_likes" for delete to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "konnekt_reel_likes_insert" on public."reel_likes" for insert to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND konnekt_can_view_reel(reel_id)));
create policy "konnekt_reel_likes_read" on public."reel_likes" for select to authenticated using (konnekt_can_view_reel(reel_id));
create policy "konnekt_reels_delete" on public."reels" for delete to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "konnekt_reels_insert" on public."reels" for insert to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "konnekt_reels_read" on public."reels" for select to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ((deleted_at IS NULL) AND (published_at IS NOT NULL) AND ((visibility = 'public'::text) OR ((visibility = 'followers'::text) AND (EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.followed_id = reels.user_id)))))))));
create policy "konnekt_reels_update" on public."reels" for update to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "authenticated users view active statuses" on public."statuses" for select to authenticated using ((expires_at > now()));
create policy "users create own statuses" on public."statuses" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users delete own statuses" on public."statuses" for delete to authenticated using ((user_id = auth.uid()));
create policy "Users can block others" on public."user_blocks" for insert to authenticated with check (((blocker_id = ( SELECT auth.uid() AS uid)) AND (blocked_id <> ( SELECT auth.uid() AS uid))));
create policy "Users can unblock others" on public."user_blocks" for delete to authenticated using ((blocker_id = ( SELECT auth.uid() AS uid)));
create policy "Users can view their own blocks" on public."user_blocks" for select to authenticated using (((blocker_id = ( SELECT auth.uid() AS uid)) OR (blocked_id = ( SELECT auth.uid() AS uid))));
create policy "users create own blocks" on public."user_blocks" for insert to authenticated with check ((blocker_id = auth.uid()));
create policy "users read own blocks" on public."user_blocks" for select to authenticated using ((blocker_id = auth.uid()));
create policy "users remove own blocks" on public."user_blocks" for delete to authenticated using ((blocker_id = auth.uid()));
create policy "authenticated can read active public keys" on public."user_device_keys" for select to authenticated using ((revoked_at IS NULL));
create policy "users manage own device keys" on public."user_device_keys" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users revoke own device keys" on public."user_device_keys" for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "users create own key backup" on public."user_key_backups" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users read own key backup" on public."user_key_backups" for select to authenticated using ((user_id = auth.uid()));
create policy "users update own key backup" on public."user_key_backups" for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "presence visible to authenticated" on public."user_presence" for select to authenticated using (true);
create policy "users publish own presence" on public."user_presence" for insert to authenticated with check ((user_id = auth.uid()));
create policy "users update own presence" on public."user_presence" for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "moderators update reports" on public."user_reports" for update to authenticated using ((EXISTS ( SELECT 1
   FROM moderation_admins ma
  WHERE (ma.user_id = auth.uid())))) with check ((EXISTS ( SELECT 1
   FROM moderation_admins ma
  WHERE (ma.user_id = auth.uid()))));
create policy "reporters and moderators read reports" on public."user_reports" for select to authenticated using (((reporter_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM moderation_admins ma
  WHERE (ma.user_id = auth.uid())))));
create policy "reporters create reports" on public."user_reports" for insert to authenticated with check (((reporter_id = auth.uid()) AND ((reported_user_id IS NULL) OR (reported_user_id <> auth.uid()))));
create policy "users submit own reports" on public."user_reports" for insert to authenticated with check (((reporter_id = auth.uid()) AND ((reported_user_id IS NULL) OR (reported_user_id <> auth.uid()))));
grant all on all tables in schema public to authenticated; grant usage,select on all sequences in schema public to authenticated;
create trigger konnekt_notify_follow after insert on public.follows for each row execute function public.konnekt_notify_follow();
create trigger konnekt_notify_message after insert on public.messages for each row execute function public.konnekt_notify_message();
create trigger konnekt_notify_reel_comment after insert on public.reel_comments for each row execute function public.konnekt_notify_reel_comment();
create trigger konnekt_notify_reel_like after insert on public.reel_likes for each row execute function public.konnekt_notify_reel_like();