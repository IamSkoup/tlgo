-- Award Claws and XP in one serialised, idempotent database transaction.
create or replace function public.sf_grant_activity(
  p_user uuid,p_amount integer,p_reason text,p_event_key text,p_xp integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_balance bigint; new_balance bigint; new_xp integer;
begin
 if p_amount not between 1 and 1000 or p_xp not between 0 and 1000
    or length(p_event_key) not between 8 and 180 then
  raise exception 'Invalid activity reward';
 end if;
 select balance into current_balance from public.wallets where user_id=p_user for update;
 if not found then raise exception 'Wallet not found'; end if;
 if exists(select 1 from public.ledger where user_id=p_user and event_key=p_event_key) then
  return jsonb_build_object('balance',current_balance,'awarded',false);
 end if;
 new_balance:=current_balance+p_amount;
 update public.wallets set balance=new_balance,updated_at=now() where user_id=p_user;
 insert into public.ledger(user_id,delta,balance_after,reason,event_key)
 values(p_user,p_amount,new_balance,left(p_reason,100),p_event_key);
 update public.profiles set xp=xp+p_xp,
 level=least(1000,1+floor(sqrt((xp+p_xp)::numeric/100))::integer),updated_at=now()
 where id=p_user returning xp into new_xp;
 return jsonb_build_object('balance',new_balance,'awarded',true,'xp',new_xp);
end $$;
revoke all on function public.sf_grant_activity(uuid,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.sf_grant_activity(uuid,integer,text,text,integer) to service_role;

-- Public display names are unique regardless of letter case for communities.
create unique index if not exists clans_name_lower_unique on public.clans(lower(name));
-- Explicit deny policy documents that the audit log has no player-facing reads.
create policy game_audit_no_player_access on public.game_audit
for select to authenticated using(false);
