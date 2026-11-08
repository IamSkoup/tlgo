-- Shops, server-owned inventory transactions and persistent hunger.
insert into public.items(code,name,category,price) values
 ('berries','Лесные ягоды','food',12),
 ('meat','Вяленое мясо','food',24),
 ('fish','Сушёная рыба','food',19),
 ('fruit','Плоды баобаба','food',15),
 ('herb','Лечебные травы','medicine',28)
on conflict (code) do update set name=excluded.name,category=excluded.category,price=excluded.price;

create table if not exists public.player_survival (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 hunger numeric(6,2) not null default 100 check (hunger between 0 and 100),
 updated_at timestamptz not null default now()
);
alter table public.player_survival enable row level security;
revoke all on public.player_survival from anon, authenticated;
grant select on public.player_survival to authenticated;
create policy survival_self on public.player_survival for select to authenticated
 using (user_id = (select auth.uid()));

create or replace function public.sf_shop_buy(p_user uuid,p_item text,p_event_key text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_price integer;v_balance bigint;
begin
 if length(p_event_key) not between 8 and 150 then raise exception 'Invalid purchase token'; end if;
 select price into v_price from public.items where code=p_item and category in ('food','medicine');
 if v_price is null or v_price <= 0 then raise exception 'Item unavailable'; end if;
 perform 1 from public.wallets where user_id=p_user for update;
 if exists(select 1 from public.ledger where user_id=p_user and event_key=p_event_key) then raise exception 'Purchase already processed'; end if;
 v_balance := public.sf_apply_wallet(p_user,-v_price,'Покупка: '||p_item,p_event_key);
 insert into public.inventory(user_id,item_code,quantity) values(p_user,p_item,1)
 on conflict(user_id,item_code) do update set quantity=public.inventory.quantity+1
 where public.inventory.quantity<9999;
 if not found then raise exception 'Инвентарь переполнен'; end if;
 return v_balance;
end $$;

create or replace function public.sf_grant_item(p_user uuid,p_item text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_quantity integer;
begin
 if not exists(select 1 from public.items where code=p_item) then raise exception 'Unknown item'; end if;
 insert into public.inventory(user_id,item_code,quantity) values(p_user,p_item,1)
 on conflict(user_id,item_code) do update set quantity=public.inventory.quantity+1
 where public.inventory.quantity<9999
 returning quantity into v_quantity;
 if v_quantity is null then raise exception 'Инвентарь переполнен'; end if;
 return v_quantity;
end $$;

create or replace function public.sf_consume_item(p_user uuid,p_item text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_qty integer;
begin
 select quantity into v_qty from public.inventory where user_id=p_user and item_code=p_item for update;
 if v_qty is null or v_qty<1 then raise exception 'Предмет закончился'; end if;
 if v_qty=1 then
   delete from public.inventory where user_id=p_user and item_code=p_item;
   return 0;
 end if;
 update public.inventory set quantity=quantity-1 where user_id=p_user and item_code=p_item returning quantity into v_qty;
 return v_qty;
end $$;

create or replace function public.sf_save_hunger(p_user uuid,p_hunger numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_hunger is null or p_hunger<0 or p_hunger>100 then raise exception 'Invalid hunger'; end if;
 insert into public.player_survival(user_id,hunger) values(p_user,round(p_hunger,2))
 on conflict(user_id) do update set hunger=excluded.hunger,updated_at=now();
end $$;

revoke all on function public.sf_shop_buy(uuid,text,text) from public, anon, authenticated;
revoke all on function public.sf_grant_item(uuid,text) from public, anon, authenticated;
revoke all on function public.sf_consume_item(uuid,text) from public, anon, authenticated;
revoke all on function public.sf_save_hunger(uuid,numeric) from public, anon, authenticated;
grant execute on function public.sf_shop_buy(uuid,text,text) to service_role;
grant execute on function public.sf_grant_item(uuid,text) to service_role;
grant execute on function public.sf_consume_item(uuid,text) to service_role;
grant execute on function public.sf_save_hunger(uuid,numeric) to service_role;
