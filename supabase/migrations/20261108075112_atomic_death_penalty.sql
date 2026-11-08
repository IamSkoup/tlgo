-- Charge a proportional death penalty under the wallet row lock.
-- Only the trusted game server (service_role) may invoke this function.
create or replace function public.sf_death_penalty(p_user uuid, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_balance bigint;
  loss bigint;
  new_balance bigint;
begin
  if p_user is null or length(p_event_key) not between 8 and 150
     or left(p_event_key,6) <> 'death:' then
    raise exception 'Invalid death event';
  end if;

  select balance into current_balance
  from public.wallets where user_id = p_user for update;
  if not found then raise exception 'Wallet not found'; end if;

  if exists(select 1 from public.ledger
            where user_id = p_user and event_key = p_event_key) then
    return jsonb_build_object('amount',0,'balance',current_balance,'charged',false);
  end if;

  loss := least(current_balance,round(current_balance * 0.035)::bigint);
  if loss <= 0 then
    return jsonb_build_object('amount',0,'balance',current_balance,'charged',false);
  end if;

  new_balance := current_balance - loss;
  update public.wallets set balance = new_balance,updated_at = now()
  where user_id = p_user;
  insert into public.ledger(user_id,delta,balance_after,reason,event_key)
  values (p_user,-loss,new_balance,'Потеря Claws при гибели',p_event_key);

  return jsonb_build_object('amount',loss,'balance',new_balance,'charged',true);
end $$;

revoke all on function public.sf_death_penalty(uuid,text) from public,anon,authenticated;
grant execute on function public.sf_death_penalty(uuid,text) to service_role;
notify pgrst, 'reload schema';
