-- RGD War Chat setup.
-- Warning: this resets chat and game data. Run it in Supabase SQL Editor.

drop table if exists battles cascade;
drop table if exists trade_offers cascade;
drop table if exists player_states cascade;
drop table if exists states cascade;
drop table if exists players cascade;
drop table if exists messages cascade;
drop table if exists profiles cascade;

create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  muted_until timestamp,
  last_mute_message_at timestamp,
  created_at timestamp default now()
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  username text not null,
  content text not null,
  deleted boolean default false,
  created_at timestamp default now()
);

create table players (
  id uuid references auth.users primary key,
  username text unique not null,
  money numeric default 100,
  food numeric default 50,
  water numeric default 50,
  population integer default 10,
  soldiers integer default 3,
  soldier_power numeric default 1,
  day integer default 1,
  last_day_at timestamp default now(),
  last_oil_collected_at timestamp default now(),
  oil_cycle_minutes integer default 50,
  last_oil_maintenance_at timestamp default now(),
  oil_failure_chance numeric default 0.10,
  custom_districts jsonb default '[]'::jsonb,
  oil_rigs jsonb default '[]'::jsonb,
  updated_at timestamp default now()
);

create table states (
  id text primary key,
  name text not null,
  x integer not null,
  y integer not null,
  soldiers integer not null,
  soldier_power numeric not null,
  money numeric not null,
  food numeric not null,
  water numeric not null,
  natural_oil_level integer default 0
);

create table player_states (
  player_id uuid references auth.users not null,
  state_id text references states(id) not null,
  soldiers integer default 0,
  custom_name text,
  oil_rig_level integer default 0,
  primary key (player_id, state_id)
);

create table battles (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references auth.users not null,
  state_id text references states(id) not null,
  result text not null,
  report text not null,
  created_at timestamp default now()
);

create table trade_offers (
  id uuid default gen_random_uuid() primary key,
  from_player uuid references auth.users not null,
  from_username text not null,
  to_username text not null,
  status text default 'pending',
  offer jsonb not null,
  request jsonb not null,
  created_at timestamp default now()
);

insert into states (id, name, x, y, soldiers, soldier_power, money, food, water, natural_oil_level) values
  ('northwatch', 'Northwatch', 1, 1, 7, 2, 60, 90, 70, 0),
  ('ironfield', 'Ironfield', 2, 1, 10, 2, 110, 80, 55, 1),
  ('sunford', 'Sunford', 3, 1, 14, 3, 130, 120, 90, 0),
  ('greenbay', 'Greenbay', 1, 2, 6, 1, 70, 160, 120, 0),
  ('crownmere', 'Crownmere', 2, 2, 18, 4, 220, 150, 150, 2),
  ('eastvale', 'Eastvale', 3, 2, 9, 2, 90, 80, 130, 0),
  ('stonepass', 'Stonepass', 1, 3, 12, 3, 100, 65, 80, 1),
  ('riverhold', 'Riverhold', 2, 3, 8, 2, 85, 140, 170, 0),
  ('ashridge', 'Ashridge', 3, 3, 16, 4, 190, 100, 90, 2),
  ('redmesa', 'Redmesa', 4, 1, 19, 4, 230, 120, 70, 3),
  ('frostgate', 'Frostgate', 5, 1, 11, 3, 120, 75, 95, 0),
  ('saltmarsh', 'Saltmarsh', 6, 1, 13, 3, 160, 95, 190, 1),
  ('blackport', 'Blackport', 4, 2, 21, 5, 270, 130, 110, 2),
  ('silverrun', 'Silverrun', 5, 2, 15, 3, 190, 180, 120, 0),
  ('dunewatch', 'Dunewatch', 6, 2, 17, 4, 210, 80, 65, 3),
  ('wolfpine', 'Wolfpine', 4, 3, 12, 2, 140, 210, 100, 0),
  ('stormfen', 'Stormfen', 5, 3, 20, 5, 260, 140, 180, 1),
  ('goldcliff', 'Goldcliff', 6, 3, 24, 6, 340, 160, 130, 2);

alter table profiles enable row level security;
alter table messages enable row level security;
alter table players enable row level security;
alter table states enable row level security;
alter table player_states enable row level security;
alter table battles enable row level security;
alter table trade_offers enable row level security;

create policy "Read profiles" on profiles for select using (true);
create policy "Insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Update own profile moderation" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Read messages" on messages for select using (auth.role() = 'authenticated');
create policy "Send own messages" on messages for insert with check (auth.uid() = user_id);
create policy "Delete own messages" on messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Read own player" on players for select using (auth.uid() = id);
create policy "Create own player" on players for insert with check (auth.uid() = id);
create policy "Update own player" on players for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Read states" on states for select using (auth.role() = 'authenticated');

create policy "Read own state ownership" on player_states for select using (auth.uid() = player_id);
create policy "Create own state ownership" on player_states for insert with check (auth.uid() = player_id);
create policy "Update own state ownership" on player_states for update using (auth.uid() = player_id) with check (auth.uid() = player_id);

create policy "Read own battles" on battles for select using (auth.uid() = player_id);
create policy "Create own battles" on battles for insert with check (auth.uid() = player_id);

create policy "Read relevant trades" on trade_offers for select using (
  auth.uid() = from_player or
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.username = trade_offers.to_username)
);
create policy "Create own trades" on trade_offers for insert with check (auth.uid() = from_player);
create policy "Update received trades" on trade_offers for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.username = trade_offers.to_username)
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.username = trade_offers.to_username)
);

create or replace function accept_trade_offer(trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trade_offers%rowtype;
  receiver_id uuid;
  giver players%rowtype;
  receiver players%rowtype;
  offer_oil integer;
  request_oil integer;
begin
  select * into t from trade_offers where id = trade_id for update;
  if not found then
    raise exception 'Trade not found';
  end if;

  select id into receiver_id from profiles where username = t.to_username;
  if receiver_id is null or auth.uid() <> receiver_id then
    raise exception 'Only the receiving player can accept this trade';
  end if;

  if t.status <> 'pending' then
    raise exception 'This trade is no longer pending';
  end if;

  select * into giver from players where id = t.from_player for update;
  select * into receiver from players where id = receiver_id for update;

  if giver.money < coalesce((t.offer->>'money')::numeric, 0)
    or giver.food < coalesce((t.offer->>'food')::numeric, 0)
    or giver.water < coalesce((t.offer->>'water')::numeric, 0)
    or giver.soldiers < coalesce((t.offer->>'soldiers')::integer, 0)
    or giver.population < coalesce((t.offer->>'population')::integer, 0) then
    raise exception 'Offering player no longer owns enough resources';
  end if;

  if receiver.money < coalesce((t.request->>'money')::numeric, 0)
    or receiver.food < coalesce((t.request->>'food')::numeric, 0)
    or receiver.water < coalesce((t.request->>'water')::numeric, 0)
    or receiver.soldiers < coalesce((t.request->>'soldiers')::integer, 0)
    or receiver.population < coalesce((t.request->>'population')::integer, 0) then
    raise exception 'You do not own enough resources';
  end if;

  offer_oil := coalesce((t.offer->>'oil_rigs')::integer, 0);
  request_oil := coalesce((t.request->>'oil_rigs')::integer, 0);

  if offer_oil > coalesce(jsonb_array_length(giver.oil_rigs), 0) then
    raise exception 'Offering player does not own enough oil rigs';
  end if;

  if request_oil > coalesce(jsonb_array_length(receiver.oil_rigs), 0) then
    raise exception 'You do not own enough oil rigs';
  end if;

  update players set
    money = money - coalesce((t.offer->>'money')::numeric, 0) + coalesce((t.request->>'money')::numeric, 0),
    food = food - coalesce((t.offer->>'food')::numeric, 0) + coalesce((t.request->>'food')::numeric, 0),
    water = water - coalesce((t.offer->>'water')::numeric, 0) + coalesce((t.request->>'water')::numeric, 0),
    soldiers = soldiers - coalesce((t.offer->>'soldiers')::integer, 0) + coalesce((t.request->>'soldiers')::integer, 0),
    population = population - coalesce((t.offer->>'population')::integer, 0) + coalesce((t.request->>'population')::integer, 0),
    updated_at = now()
  where id = t.from_player;

  update players set
    money = money + coalesce((t.offer->>'money')::numeric, 0) - coalesce((t.request->>'money')::numeric, 0),
    food = food + coalesce((t.offer->>'food')::numeric, 0) - coalesce((t.request->>'food')::numeric, 0),
    water = water + coalesce((t.offer->>'water')::numeric, 0) - coalesce((t.request->>'water')::numeric, 0),
    soldiers = soldiers + coalesce((t.offer->>'soldiers')::integer, 0) - coalesce((t.request->>'soldiers')::integer, 0),
    population = population + coalesce((t.offer->>'population')::integer, 0) - coalesce((t.request->>'population')::integer, 0),
    updated_at = now()
  where id = receiver_id;

  perform move_oil_rigs_count(t.from_player, receiver_id, offer_oil);
  perform move_oil_rigs_count(receiver_id, t.from_player, request_oil);

  update trade_offers set status = 'accepted' where id = trade_id;
end;
$$;

create or replace function move_oil_rigs_count(from_id uuid, to_id uuid, rig_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  from_rigs jsonb;
  to_rigs jsonb;
  to_districts jsonb;
  target_district_id text;
  target_cell_key text;
  moved jsonb;
  kept jsonb;
begin
  if coalesce(rig_count, 0) <= 0 then
    return;
  end if;

  select oil_rigs into from_rigs from players where id = from_id for update;
  select oil_rigs, custom_districts into to_rigs, to_districts from players where id = to_id for update;

  if coalesce(jsonb_array_length(from_rigs), 0) < rig_count then
    raise exception 'Not enough oil rigs to trade';
  end if;

  target_district_id := to_districts->0->>'id';
  target_cell_key := to_districts->0->'cells'->>0;
  if target_district_id is null or target_cell_key is null then
    raise exception 'Receiving player needs at least one owned state for incoming rigs';
  end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into moved
  from (
    select
      jsonb_set(
        jsonb_set(value, '{districtId}', to_jsonb(target_district_id), true),
        '{cellKey}',
        to_jsonb(target_cell_key),
        true
      ) as value
    from jsonb_array_elements(coalesce(from_rigs, '[]'::jsonb)) with ordinality as t(value, ordinality)
    order by coalesce((value->>'level')::integer, 1) desc, ordinality
    limit rig_count
  ) moved_rows;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into kept
  from (
    select value
    from jsonb_array_elements(coalesce(from_rigs, '[]'::jsonb)) with ordinality as t(value, ordinality)
    where ordinality not in (
      select ordinality
      from jsonb_array_elements(coalesce(from_rigs, '[]'::jsonb)) with ordinality as t2(value, ordinality)
      order by coalesce((value->>'level')::integer, 1) desc, ordinality
      limit rig_count
    )
    order by ordinality
  ) kept_rows;

  update players set oil_rigs = kept where id = from_id;
  update players set oil_rigs = coalesce(to_rigs, '[]'::jsonb) || moved where id = to_id;
end;
$$;
