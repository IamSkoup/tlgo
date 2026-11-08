-- Natural coat pigments. The initial coat remains free; a later change costs Claws.
create or replace function public.sf_buy_coat(p_user uuid,p_color integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare prior_color integer; balance_new bigint;
begin
 if p_color not in (14001235,12945995,12034442,9929066,9867403,14999502,6969670,14200949)
 then raise exception 'Choose a natural coat colour'; end if;
 perform 1 from public.wallets where user_id=p_user for update;
 select color into prior_color from public.profiles where id=p_user for update;
 if prior_color is null then raise exception 'Profile missing'; end if;
 if prior_color=p_color then raise exception 'Colour already selected'; end if;
 balance_new:=public.sf_apply_wallet(p_user,-65,'Новый окрас','coat:'||p_color||':'||gen_random_uuid()::text);
 update public.profiles set color=p_color,updated_at=now() where id=p_user;
 return balance_new;
end $$;
revoke all on function public.sf_buy_coat(uuid,integer) from public,anon,authenticated;
grant execute on function public.sf_buy_coat(uuid,integer) to service_role;
