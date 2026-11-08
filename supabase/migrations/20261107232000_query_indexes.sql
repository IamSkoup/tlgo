-- Cover foreign keys used by deletion, moderation, social queries and chats.
alter table public.sanctions add column id bigint generated always as identity primary key;
create index if not exists chat_author_idx on public.chat_messages(author);
create index if not exists chat_clan_idx on public.chat_messages(clan_id, created_at desc);
create index if not exists chat_recipient_idx on public.chat_messages(recipient, created_at desc);
create index if not exists clans_leader_idx on public.clans(leader);
create index if not exists game_audit_actor_idx on public.game_audit(actor);
create index if not exists game_sessions_owner_idx on public.game_sessions(owner_id);
create index if not exists inventory_item_idx on public.inventory(item_code);
create index if not exists player_species_species_idx on public.player_species(species);
create index if not exists profiles_selected_species_idx on public.profiles(selected_species);
create index if not exists reports_reported_idx on public.reports(reported);
create index if not exists reports_reporter_idx on public.reports(reporter);
create index if not exists sanctions_user_idx on public.sanctions(user_id);
