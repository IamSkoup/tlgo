-- Savanna Freedom Online. Run only in a dedicated new Supabase project.
create extension if not exists pgcrypto;

create table public.species_catalog (
  code text primary key,
  title text not null,
  role text not null,
  model text not null,
  price integer not null check (price >= 0),
  hp integer not null check (hp between 40 and 400),
  speed numeric(5,2) not null check (speed between 2 and 35),
  power integer not null check (power between 1 and 100),
  stamina integer not null check (stamina between 40 and 250),
  description text not null,
  starter boolean not null default false
);

insert into public.species_catalog values
 ('lion','Молодой лев','Хищник','lion',0,130,8.2,20,110,'Выносливый боец, хороший выбор для патрулей.',true),
 ('hyena','Пятнистая гиена','Хищник','hyena',0,118,9.4,19,120,'Сильна в командной охоте.',true),
 ('zebra','Зебра','Травоядное','zebra',0,145,10.8,14,135,'Уверенный бег и мощный защитный удар.',true),
 ('gazelle','Газель','Травоядное','gazelle',0,95,13.0,12,145,'Быстрая разведка и сбор редких растений.',true),
 ('warthog','Бородавочник','Всеядное','warthog',0,150,9.0,17,125,'Крепкий характер и неплохая защита.',true),
 ('monkey','Павиан','Всеядное','monkey',0,100,10.0,13,140,'Находит то, чего другие не замечают.',true),
 ('cheetah','Гепард','Хищник','cheetah',320,90,16.5,16,95,'Молниеносная скорость, но мало выносливости.',false),
 ('leopard','Леопард','Хищник','lion',440,118,11.2,24,112,'Скрытный охотник каменных холмов.',false),
 ('lion_adult','Взрослый лев','Хищник','lion',580,185,8.7,31,105,'Надёжен в защите, не так быстр.',false),
 ('wild_dog','Гиеновидная собака','Хищник','hyena',400,107,12.2,20,130,'Манёвренный охотник, идеален для стаи.',false),
 ('croc','Крокодил','Хищник','croc',640,210,5.5,34,105,'Опасен в воде и у берега.',false),
 ('giraffe','Жираф','Травоядное','giraffe',710,215,9.1,28,120,'Дальнее наблюдение и защита стада.',false),
 ('rhino','Носорог','Травоядное','elephant',820,260,7.0,35,90,'Мощный рывок, скромная манёвренность.',false),
 ('hippo','Бегемот','Травоядное','hippo',850,270,6.4,35,95,'Защитник водопоя.',false),
 ('elephant','Слон','Травоядное','elephant',1300,330,6.7,40,105,'Выдерживает удар и помогает стаду.',false),
 ('eagle','Орёл','Птица','bird',950,75,13.0,11,100,'Разведчик; полный режим полёта ещё в производстве.',false);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (nickname ~ '^[a-zA-Zа-яА-ЯёЁ0-9_]{3,20}$'),
  level integer not null default 1 check (level between 1 and 1000),
  xp integer not null default 0 check (xp >= 0),
  selected_species text not null references public.species_catalog(code),
  color integer not null default 0 check (color between 0 and 16777215),
  reputation integer not null default 0 check (reputation between -1000 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reserved_nickname check (lower(nickname) not in ('admin','administrator','moderator','system','supabase','сервер','админ','модератор'))
);
create unique index profiles_nickname_lower_unique on public.profiles(lower(nickname));

create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
create table public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null,
  event_key text not null,
  created_at timestamptz not null default now(),
  unique(user_id,event_key)
);
create index ledger_user_created_idx on public.ledger(user_id, created_at desc);

create table public.player_species (
  user_id uuid not null references public.profiles(id) on delete cascade,
  species text not null references public.species_catalog(code),
  mastery_xp integer not null default 0 check (mastery_xp >= 0),
  power_rank integer not null default 0 check (power_rank between 0 and 5),
  endurance_rank integer not null default 0 check (endurance_rank between 0 and 5),
  acquired_at timestamptz not null default now(),
  primary key(user_id,species)
);
create table public.items (
  code text primary key,
  name text not null,
  category text not null,
  price integer not null check(price >= 0)
);
create table public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_code text not null references public.items(code),
  quantity integer not null default 1 check(quantity between 1 and 9999),
  primary key(user_id,item_code)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 3 and 45),
  visibility text not null check(visibility in ('public','private','friends')),
  invite_code text unique,
  owner_id uuid references public.profiles(id),
  region text not null default 'eu',
  created_at timestamptz not null default now()
);
create table public.session_members (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(session_id,user_id)
);
insert into public.game_sessions(id,name,visibility,owner_id,invite_code)
values('00000000-0000-4000-8000-000000000001','Общая саванна','public',null,null);
create index session_members_user_idx on public.session_members(user_id);
create table public.player_positions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  x numeric(9,2) not null default -65,
  z numeric(9,2) not null default 42,
  heading numeric(7,4) not null default 0,
  saved_at timestamptz not null default now(),
  check (x between -348 and 348 and z between -348 and 348)
);

create table public.friendships (
  requester uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  primary key(requester,recipient),
  check(requester <> recipient)
);
create index friendships_recipient_idx on public.friendships(recipient,status);
create table public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 3 and 28),
  leader uuid not null references public.profiles(id),
  emblem text not null default 'sun',
  created_at timestamptz not null default now()
);
create table public.clan_members (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('leader','officer','member')),
  joined_at timestamptz not null default now(),
  primary key(clan_id,user_id),
  unique(user_id)
);
create table public.chat_messages (
  id bigint generated always as identity primary key,
  author uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.game_sessions(id) on delete cascade,
  clan_id uuid references public.clans(id) on delete cascade,
  recipient uuid references public.profiles(id) on delete cascade,
  body text not null check(length(body) between 1 and 350),
  created_at timestamptz not null default now(),
  constraint chat_target_required check(num_nonnulls(session_id,clan_id,recipient) = 1)
);
create index chat_session_idx on public.chat_messages(session_id,created_at desc);
create table public.quest_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id text not null,
  state text not null default 'active' check(state in ('active','completed')),
  progress integer not null default 0 check(progress >= 0),
  completed_at timestamptz,
  primary key(user_id,quest_id)
);
create table public.player_reputation (
  user_id uuid not null references public.profiles(id) on delete cascade,
  faction text not null,
  score integer not null default 0 check(score between -1000 and 1000),
  primary key(user_id,faction)
);
create table public.achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  primary key(user_id,code)
);
create table public.sanctions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references public.profiles(id) on delete cascade,
  reported uuid references public.profiles(id) on delete set null,
  body text not null check(length(body) between 10 and 1000),
  created_at timestamptz not null default now()
);
create table public.game_audit (
  id bigint generated always as identity primary key,
  actor uuid references public.profiles(id) on delete set null,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- All mutations go through verified game servers. The browser may only read
-- its own private records and publicly visible profile/catalog information.
do $$ declare t text; begin
 foreach t in array array['species_catalog','profiles','wallets','ledger','player_species','items','inventory','game_sessions','session_members','player_positions','friendships','clans','clan_members','chat_messages','quest_progress','player_reputation','achievements','sanctions','reports','game_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy species_read on public.species_catalog for select to authenticated using(true);
create policy item_read on public.items for select to authenticated using(true);
create policy profile_read on public.profiles for select to authenticated using(true);
create policy wallet_self on public.wallets for select to authenticated using(user_id = (select auth.uid()));
create policy ledger_self on public.ledger for select to authenticated using(user_id = (select auth.uid()));
create policy unlocks_self on public.player_species for select to authenticated using(user_id = (select auth.uid()));
create policy inventory_self on public.inventory for select to authenticated using(user_id = (select auth.uid()));
create policy session_public on public.game_sessions for select to authenticated using(visibility = 'public' or owner_id = (select auth.uid()) or exists(select 1 from public.session_members sm where sm.session_id = id and sm.user_id = (select auth.uid())));
create policy session_members_own on public.session_members for select to authenticated using(user_id = (select auth.uid()));
create policy position_self on public.player_positions for select to authenticated using(user_id = (select auth.uid()));
create policy friends_own on public.friendships for select to authenticated using(requester = (select auth.uid()) or recipient = (select auth.uid()));
create policy clan_read on public.clans for select to authenticated using(true);
create policy clan_members_read on public.clan_members for select to authenticated using(true);
create policy chat_private on public.chat_messages for select to authenticated using(
 author = (select auth.uid()) or recipient = (select auth.uid())
 or (session_id is not null and exists(select 1 from public.session_members sm where sm.session_id=public.chat_messages.session_id and sm.user_id=(select auth.uid())))
 or (clan_id is not null and exists(select 1 from public.clan_members cm where cm.clan_id=public.chat_messages.clan_id and cm.user_id=(select auth.uid())))
);
create policy quest_self on public.quest_progress for select to authenticated using(user_id = (select auth.uid()));
create policy reputation_self on public.player_reputation for select to authenticated using(user_id = (select auth.uid()));
create policy achievements_self on public.achievements for select to authenticated using(user_id = (select auth.uid()));
create policy sanctions_self on public.sanctions for select to authenticated using(user_id = (select auth.uid()));
create policy reports_self on public.reports for select to authenticated using(reporter = (select auth.uid()));
-- Never expose private audit rows to authenticated/anon clients.
revoke select on public.game_audit from authenticated;

-- Narrow security-definer RPC surface: executable by service_role only.
create or replace function public.sf_create_profile(p_user uuid,p_nickname text,p_species text,p_color integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'Invalid auth user'; end if;
 if p_nickname !~ '^[a-zA-Zа-яА-ЯёЁ0-9_]{3,20}$' then raise exception 'Invalid nickname'; end if;
 if lower(p_nickname) in ('admin','administrator','moderator','system','supabase','сервер','админ','модератор') then raise exception 'Reserved nickname'; end if;
 if not exists(select 1 from public.species_catalog where code=p_species and starter) then raise exception 'Not a starter species'; end if;
 insert into public.profiles(id,nickname,selected_species,color) values(p_user,p_nickname,p_species,p_color);
 insert into public.wallets(user_id,balance) values(p_user,60);
 insert into public.ledger(user_id,delta,balance_after,reason,event_key) values(p_user,60,60,'Стартовый запас','welcome');
 insert into public.player_species(user_id,species) values(p_user,p_species);
end $$;

create or replace function public.sf_apply_wallet(p_user uuid,p_delta bigint,p_reason text,p_event_key text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare balance_new bigint; existing bigint;
begin
 if length(p_event_key) not between 4 and 150 or p_delta = 0 or abs(p_delta)>10000 then raise exception 'Invalid transaction'; end if;
 select balance_after into existing from public.ledger where user_id=p_user and event_key=p_event_key;
 if found then return existing; end if;
 update public.wallets set balance=balance+p_delta,updated_at=now()
 where user_id=p_user and balance+p_delta >= 0 returning balance into balance_new;
 if not found then raise exception 'Insufficient balance or missing wallet'; end if;
 insert into public.ledger(user_id,delta,balance_after,reason,event_key)
 values(p_user,p_delta,balance_new,left(p_reason,100),p_event_key)
 on conflict (user_id,event_key) do nothing;
 if not found then raise exception 'Concurrent duplicate transaction'; end if;
 return balance_new;
end $$;

create or replace function public.sf_buy_species(p_user uuid,p_species text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare p integer; result_balance bigint;
begin
 select price into p from public.species_catalog where code=p_species and not starter;
 if p is null then raise exception 'Unknown purchasable species'; end if;
 -- Row lock serializes purchases of different species on the same wallet.
 perform 1 from public.wallets where user_id=p_user for update;
 if exists(select 1 from public.player_species where user_id=p_user and species=p_species) then raise exception 'Already owned'; end if;
 result_balance := public.sf_apply_wallet(p_user,-p,'Новый вид: '||p_species,'species:'||p_species);
 insert into public.player_species(user_id,species) values(p_user,p_species);
 return result_balance;
end $$;

create or replace function public.sf_select_species(p_user uuid,p_species text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.player_species where user_id=p_user and species=p_species) then raise exception 'Species not owned'; end if;
 update public.profiles set selected_species=p_species,updated_at=now() where id=p_user;
end $$;

create or replace function public.sf_upgrade(p_user uuid,p_species text,p_stat text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare rank_now integer; cost integer; result_balance bigint;
begin
 if p_stat not in ('power','endurance') then raise exception 'Unknown upgrade'; end if;
 perform 1 from public.wallets where user_id=p_user for update;
 select case when p_stat='power' then power_rank else endurance_rank end into rank_now
 from public.player_species where user_id=p_user and species=p_species for update;
 if rank_now is null or rank_now >= 5 then raise exception 'Upgrade unavailable'; end if;
 cost := 45*(rank_now+1);
 result_balance := public.sf_apply_wallet(p_user,-cost,'Развитие: '||p_stat,'upgrade:'||p_species||':'||p_stat||':'||(rank_now+1));
 if p_stat='power' then update public.player_species set power_rank=power_rank+1 where user_id=p_user and species=p_species;
 else update public.player_species set endurance_rank=endurance_rank+1 where user_id=p_user and species=p_species; end if;
 return result_balance;
end $$;

create or replace function public.sf_create_clan(p_user uuid,p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_clan uuid;
begin
 if length(p_name) not between 3 and 28 or p_name !~ '^[a-zA-Zа-яА-ЯёЁ0-9 _-]+$' then raise exception 'Invalid clan name'; end if;
 if exists(select 1 from public.clan_members where user_id=p_user) then raise exception 'Already in a clan'; end if;
 perform 1 from public.wallets where user_id=p_user for update;
 perform public.sf_apply_wallet(p_user,-180,'Создание прайда','clan:create:'||p_name);
 insert into public.clans(name,leader) values(p_name,p_user) returning id into new_clan;
 insert into public.clan_members(clan_id,user_id,role) values(new_clan,p_user,'leader');
 return new_clan;
end $$;

create or replace function public.sf_join_clan(p_user uuid,p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare found_clan uuid;
begin
 if exists(select 1 from public.clan_members where user_id=p_user) then raise exception 'Already in a clan'; end if;
 select id into found_clan from public.clans where lower(name)=lower(p_name);
 if found_clan is null then raise exception 'Clan not found'; end if;
 insert into public.clan_members(clan_id,user_id,role) values(found_clan,p_user,'member');
 return found_clan;
end $$;

create or replace function public.sf_leave_clan(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare membership record;
begin
 select cm.clan_id,cm.role into membership from public.clan_members cm where cm.user_id=p_user;
 if not found then raise exception 'Not in a clan'; end if;
 if membership.role='leader' and (select count(*) from public.clan_members where clan_id=membership.clan_id)>1 then raise exception 'Transfer leadership before leaving'; end if;
 delete from public.clan_members where user_id=p_user;
 if membership.role='leader' then delete from public.clans where id=membership.clan_id; end if;
end $$;

revoke all on function public.sf_create_profile(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.sf_apply_wallet(uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.sf_buy_species(uuid,text) from public,anon,authenticated;
revoke all on function public.sf_select_species(uuid,text) from public,anon,authenticated;
revoke all on function public.sf_upgrade(uuid,text,text) from public,anon,authenticated;
revoke all on function public.sf_create_clan(uuid,text) from public,anon,authenticated;
revoke all on function public.sf_join_clan(uuid,text) from public,anon,authenticated;
revoke all on function public.sf_leave_clan(uuid) from public,anon,authenticated;
grant execute on function public.sf_create_profile(uuid,text,text,integer) to service_role;
grant execute on function public.sf_apply_wallet(uuid,bigint,text,text) to service_role;
grant execute on function public.sf_buy_species(uuid,text) to service_role;
grant execute on function public.sf_select_species(uuid,text) to service_role;
grant execute on function public.sf_upgrade(uuid,text,text) to service_role;
grant execute on function public.sf_create_clan(uuid,text) to service_role;
grant execute on function public.sf_join_clan(uuid,text) to service_role;
grant execute on function public.sf_leave_clan(uuid) to service_role;
