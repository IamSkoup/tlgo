-- Quest completion and its wallet/XP award commit or roll back together.
create or replace function public.sf_finish_quest(p_user uuid,p_quest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare quest_reward integer; quest_xp integer; quest_count integer;
        prior text; result jsonb; current_balance bigint;
begin
 select case p_quest when 'rafiki' then 75 when 'fuli' then 95 when 'kion' then 130 end,
        case p_quest when 'rafiki' then 65 when 'fuli' then 80 when 'kion' then 110 end,
        case p_quest when 'rafiki' then 3 when 'fuli' then 2 when 'kion' then 2 end
 into quest_reward, quest_xp, quest_count;
 if quest_reward is null then raise exception 'Unknown quest'; end if;
 -- Serialise with purchases and all other rewards to this wallet.
 select balance into current_balance from public.wallets where user_id=p_user for update;
 if not found then raise exception 'Wallet not found'; end if;
 select state into prior from public.quest_progress
 where user_id=p_user and quest_id=p_quest for update;
 if prior='completed' then return jsonb_build_object('awarded',false,'balance',current_balance); end if;
 if prior is distinct from 'active' then raise exception 'Quest has not been started'; end if;
 result:=public.sf_grant_activity(p_user,quest_reward,'Поручение: '||p_quest,'quest:'||p_quest,quest_xp);
 update public.quest_progress set state='completed',progress=quest_count,completed_at=now()
 where user_id=p_user and quest_id=p_quest;
 return result;
end $$;
revoke all on function public.sf_finish_quest(uuid,text) from public,anon,authenticated;
grant execute on function public.sf_finish_quest(uuid,text) to service_role;
