-- ═══════════ ОЧИЩЕННЯ АРХІВНИХ КАБІНЕТІВ (3+ ДНІ В АРХІВІ) ═══════════
--
-- «хотів не тільки історію а і самі кабінети видаляти тому що вони
-- займають пам'ять … клікнув на архівед і сайт завис».
-- Рішення людини: видаляти лише з FB LIVE, у вікні Accounts лишати; 3 дні.
--
-- Кабінет, що лежить в архіві 3+ дні (archived_at), щоночі очищається:
-- журнал подій (account_events), спенд по днях (fb_spend_daily), знімок
-- (fb_ad_today), модерація (fb_ad_moderation), журнал правил (fb_rule_log).
-- Рядок accounts_mapping ЛИШАЄТЬСЯ з позначкою purged_at: це мітка
-- «архів» (без неї Sync повернув би кабінет як забанений) і рядок вікна
-- Accounts. FB LIVE рядки з purged_at не показує зовсім.
--
-- archived_at ставить тригер, коли status стає 'archive'; повернули з
-- архіву — archived_at і purged_at скидаються. Перший запуск заповнив
-- archived_at з журналу (остання подія → archived), інакше — created_at.
--
-- 2026-11-26: застосовано; перший прогін очистив 20 кабінетів.

alter table public.accounts_mapping add column if not exists archived_at timestamptz;
alter table public.accounts_mapping add column if not exists purged_at timestamptz;

update public.accounts_mapping m set archived_at = coalesce(
  (select max(e.at) from public.account_events e
    where e.account_id = regexp_replace(m.account_id, '\D', '', 'g') and e.to_state = 'archived'),
  m.created_at, now())
where lower(m.status) = 'archive' and m.archived_at is null;

create or replace function public.accounts_mapping_archived_at()
returns trigger language plpgsql as $$
begin
  if lower(coalesce(new.status, '')) = 'archive' then
    if tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'archive' then
      new.archived_at := now(); new.purged_at := null;
    end if;
  else
    new.archived_at := null; new.purged_at := null;
  end if;
  return new;
end $$;
drop trigger if exists accounts_mapping_archived_at on public.accounts_mapping;
create trigger accounts_mapping_archived_at before insert or update of status on public.accounts_mapping
  for each row execute function public.accounts_mapping_archived_at();

create or replace function public.fb_archive_purge()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  create temp table _ids on commit drop as
    select m.id as row_id, x.aid
      from public.accounts_mapping m
      cross join lateral (values (regexp_replace(coalesce(m.account_id, ''), '\D', '', 'g')),
                                 (regexp_replace(coalesce(m.fb_account_id, ''), '\D', '', 'g'))) as x(aid)
     where lower(m.status) = 'archive' and m.purged_at is null
       and m.archived_at < now() - interval '3 days' and x.aid <> '';
  delete from public.account_events  where account_id in (select aid from _ids);
  delete from public.fb_spend_daily  where account_id in (select aid from _ids);
  delete from public.fb_ad_today     where account_id in (select aid from _ids);
  delete from public.fb_ad_moderation where account_id in (select aid from _ids);
  delete from public.fb_rule_log     where account_id in (select aid from _ids);
  update public.accounts_mapping set purged_at = now() where id in (select row_id from _ids);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.fb_archive_purge() from public, anon, authenticated;

-- щодня о 03:20 UTC
select cron.schedule('fb-archive-purge', '20 3 * * *', $$ select public.fb_archive_purge(); $$);
