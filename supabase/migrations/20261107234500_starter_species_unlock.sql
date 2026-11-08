-- Starter choices are free at character creation, but alternate starters
-- can be collected later for a modest in-game cost.
create or replace function public.sf_buy_species(p_user uuid,p_species text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare p integer; result_balance bigint;
begin
 select case when starter then 120 else price end into p
 from public.species_catalog where code=p_species;
 if p is null then raise exception 'Unknown species'; end if;
 perform 1 from public.wallets where user_id=p_user for update;
 if exists(select 1 from public.player_species where user_id=p_user and species=p_species) then raise exception 'Already owned'; end if;
 result_balance:=public.sf_apply_wallet(p_user,-p,'Новый вид: '||p_species,'species:'||p_species);
 insert into public.player_species(user_id,species) values(p_user,p_species);
 return result_balance;
end $$;
revoke all on function public.sf_buy_species(uuid,text) from public,anon,authenticated;
grant execute on function public.sf_buy_species(uuid,text) to service_role;
