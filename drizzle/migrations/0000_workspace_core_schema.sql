create extension if not exists vector with schema extensions;

-- ===== Enums =====
create type public.app_role as enum ('platform_admin');
create type public.tenant_role as enum ('owner', 'admin', 'editor', 'member', 'viewer');

-- ===== Profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ===== Platform roles =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- ===== Tenants (workspaces) =====
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tenants to authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  role public.tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members(user_id);
grant select, insert, update, delete on public.tenant_members to authenticated;
grant all on public.tenant_members to service_role;
alter table public.tenant_members enable row level security;

-- ===== Helper functions (security definer, avoid RLS recursion) =====
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_tenant_member(_user_id uuid, _tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenant_members where user_id = _user_id and tenant_id = _tenant_id)
$$;

-- Role order: owner < admin < editor < member < viewer (lower = more privileged)
create or replace function public.has_tenant_role(_user_id uuid, _tenant_id uuid, _min_role public.tenant_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where user_id = _user_id and tenant_id = _tenant_id and role <= _min_role
  )
$$;

create or replace function public.shares_tenant(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members m1
    join public.tenant_members m2 on m1.tenant_id = m2.tenant_id
    where m1.user_id = _a and m2.user_id = _b
  )
$$;

-- ===== Policies: profiles / roles / tenants / members =====
create policy "Read own or teammate profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_tenant(auth.uid(), id));
create policy "Insert own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "Update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Read own platform roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid());

create policy "Members read their workspaces" on public.tenants for select to authenticated
  using (public.is_tenant_member(auth.uid(), id) or created_by = auth.uid());
create policy "Users create workspaces" on public.tenants for insert to authenticated
  with check (created_by = auth.uid());
create policy "Admins update workspaces" on public.tenants for update to authenticated
  using (public.has_tenant_role(auth.uid(), id, 'admin')) with check (public.has_tenant_role(auth.uid(), id, 'admin'));
create policy "Owners delete workspaces" on public.tenants for delete to authenticated
  using (public.has_tenant_role(auth.uid(), id, 'owner'));

create policy "Members read membership" on public.tenant_members for select to authenticated
  using (public.is_tenant_member(auth.uid(), tenant_id));
create policy "Admins add members" on public.tenant_members for insert to authenticated
  with check (public.has_tenant_role(auth.uid(), tenant_id, 'admin') and (role <> 'owner' or public.has_tenant_role(auth.uid(), tenant_id, 'owner')));
create policy "Admins change member roles" on public.tenant_members for update to authenticated
  using (public.has_tenant_role(auth.uid(), tenant_id, 'admin') and (role <> 'owner' or public.has_tenant_role(auth.uid(), tenant_id, 'owner')))
  with check (public.has_tenant_role(auth.uid(), tenant_id, 'admin') and (role <> 'owner' or public.has_tenant_role(auth.uid(), tenant_id, 'owner')));
create policy "Admins remove members or self leave" on public.tenant_members for delete to authenticated
  using (user_id = auth.uid() or (public.has_tenant_role(auth.uid(), tenant_id, 'admin') and (role <> 'owner' or public.has_tenant_role(auth.uid(), tenant_id, 'owner'))));

-- Creator of a workspace becomes its owner
create or replace function public.handle_new_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_members (tenant_id, user_id, role) values (new.id, new.created_by, 'owner')
  on conflict (tenant_id, user_id) do nothing;
  return new;
end;
$$;
create trigger on_tenant_created after insert on public.tenants
  for each row execute function public.handle_new_tenant();

-- New user: profile + personal workspace
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _name text;
begin
  _name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, left(_name, 80), coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'))
  on conflict (id) do nothing;
  insert into public.tenants (name, created_by) values (left(_name, 60) || '''s workspace', new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Events =====
create table public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 400),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null,
  format text not null check (format in ('online', 'in_person', 'hybrid')),
  start_at timestamptz not null,
  end_at timestamptz,
  venue text,
  city text,
  country text,
  registration_url text check (registration_url is null or registration_url ~ '^https://'),
  technologies text[] not null default '{}',
  audience text[] not null default '{}',
  is_free boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  search_tsv tsvector,
  index_status text not null default 'pending' check (index_status in ('pending', 'indexed', 'failed')),
  index_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_tenant_idx on public.events(tenant_id);
create index events_start_idx on public.events(start_at);
create index events_tsv_idx on public.events using gin(search_tsv);
create index events_tech_idx on public.events using gin(technologies);
create index events_pending_idx on public.events(index_status) where index_status <> 'indexed';
grant select on public.events to anon;
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;

create policy "Anyone reads published public events" on public.events for select to anon, authenticated
  using (tenant_id is null and status = 'published');
create policy "Members read workspace events" on public.events for select to authenticated
  using (tenant_id is not null and public.is_tenant_member(auth.uid(), tenant_id));
create policy "Editors create events" on public.events for insert to authenticated
  with check (
    (tenant_id is not null and public.has_tenant_role(auth.uid(), tenant_id, 'editor'))
    or (tenant_id is null and public.has_role(auth.uid(), 'platform_admin'))
  );
create policy "Editors update events" on public.events for update to authenticated
  using (
    (tenant_id is not null and public.has_tenant_role(auth.uid(), tenant_id, 'editor'))
    or (tenant_id is null and public.has_role(auth.uid(), 'platform_admin'))
  )
  with check (
    (tenant_id is not null and public.has_tenant_role(auth.uid(), tenant_id, 'editor'))
    or (tenant_id is null and public.has_role(auth.uid(), 'platform_admin'))
  );
create policy "Editors delete events" on public.events for delete to authenticated
  using (
    (tenant_id is not null and public.has_tenant_role(auth.uid(), tenant_id, 'editor'))
    or (tenant_id is null and public.has_role(auth.uid(), 'platform_admin'))
  );

-- Maintain keyword index and mark for re-embedding when searchable content changes
create or replace function public.events_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.technologies, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.category, '') || ' ' || coalesce(new.summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '') || ' ' || coalesce(array_to_string(new.audience, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.venue, '') || ' ' || coalesce(new.city, '') || ' ' || coalesce(new.country, '') || ' ' || replace(new.format, '_', ' ')), 'D');
  if tg_op = 'INSERT' or
     new.title is distinct from old.title or new.summary is distinct from old.summary or
     new.description is distinct from old.description or new.category is distinct from old.category or
     new.format is distinct from old.format or new.technologies is distinct from old.technologies or
     new.audience is distinct from old.audience or new.city is distinct from old.city or new.venue is distinct from old.venue then
    new.index_status := 'pending';
    new.index_error := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger events_before_write before insert or update on public.events
  for each row execute function public.events_before_write();

-- ===== Event embeddings (server-only) =====
create table public.event_embeddings (
  event_id uuid primary key references public.events(id) on delete cascade,
  embedding extensions.vector(768) not null,
  embedding_model text not null,
  content_hash text not null,
  indexed_at timestamptz not null default now()
);
create index event_embeddings_hnsw on public.event_embeddings using hnsw (embedding extensions.vector_cosine_ops);
grant all on public.event_embeddings to service_role;
alter table public.event_embeddings enable row level security;

-- ===== Hybrid search (scope-checked, returns only authorized events) =====
create or replace function public.search_events(
  query_embedding extensions.vector(768),
  keyword_query text,
  workspace_id uuid,
  filter_formats text[],
  filter_categories text[],
  filter_technologies text[],
  filter_start timestamptz,
  filter_end timestamptz,
  filter_city text,
  match_count int default 60
)
returns table (
  id uuid, tenant_id uuid, title text, summary text, description text, category text, format text,
  start_at timestamptz, end_at timestamptz, venue text, city text, country text, registration_url text,
  technologies text[], audience text[], is_free boolean,
  semantic_score double precision, keyword_score double precision
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  _limit int := least(greatest(coalesce(match_count, 60), 1), 100);
  _tsq tsquery := null;
begin
  if workspace_id is not null and not public.is_tenant_member(auth.uid(), workspace_id) then
    raise exception 'Not authorized for this workspace' using errcode = '42501';
  end if;
  if keyword_query is not null and length(trim(keyword_query)) > 0 then
    _tsq := to_tsquery('english', keyword_query);
  end if;

  return query
  with scoped as (
    select e.* from public.events e
    where e.status = 'published'
      and (e.tenant_id is null or (workspace_id is not null and e.tenant_id = workspace_id))
      and (filter_formats is null or cardinality(filter_formats) = 0 or e.format = any(filter_formats))
      and (filter_categories is null or cardinality(filter_categories) = 0 or lower(e.category) = any(select lower(c) from unnest(filter_categories) c))
      and (filter_technologies is null or cardinality(filter_technologies) = 0 or exists (
            select 1 from unnest(e.technologies) t where lower(t) = any(select lower(x) from unnest(filter_technologies) x)))
      and (filter_start is null or e.start_at >= filter_start)
      and (filter_end is null or e.start_at <= filter_end)
      and (filter_city is null or lower(e.city) = lower(filter_city))
  ),
  vec as (
    select s.id, (1 - (emb.embedding <=> query_embedding))::double precision as sim
    from scoped s join public.event_embeddings emb on emb.event_id = s.id
    where query_embedding is not null
    order by emb.embedding <=> query_embedding
    limit _limit
  ),
  kw as (
    select s.id, ts_rank_cd(s.search_tsv, _tsq, 32)::double precision as rnk
    from scoped s
    where _tsq is not null and s.search_tsv @@ _tsq
    order by rnk desc
    limit _limit
  ),
  browse as (
    select s.id from scoped s
    where query_embedding is null and _tsq is null
    order by s.start_at asc
    limit _limit
  ),
  cand as (
    select v.id from vec v union select k.id from kw k union select b.id from browse b
  )
  select s.id, s.tenant_id, s.title, s.summary, s.description, s.category, s.format,
         s.start_at, s.end_at, s.venue, s.city, s.country, s.registration_url,
         s.technologies, s.audience, s.is_free,
         coalesce(v.sim, 0)::double precision, coalesce(k.rnk, 0)::double precision
  from cand c
  join scoped s on s.id = c.id
  left join vec v on v.id = c.id
  left join kw k on k.id = c.id;
end;
$$;
revoke all on function public.search_events from public;
grant execute on function public.search_events to anon, authenticated, service_role;

create or replace function public.get_events_by_ids(event_ids uuid[], workspace_id uuid)
returns table (
  id uuid, tenant_id uuid, title text, summary text, description text, category text, format text,
  start_at timestamptz, end_at timestamptz, venue text, city text, country text, registration_url text,
  technologies text[], audience text[], is_free boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if workspace_id is not null and not public.is_tenant_member(auth.uid(), workspace_id) then
    raise exception 'Not authorized for this workspace' using errcode = '42501';
  end if;
  return query
  select e.id, e.tenant_id, e.title, e.summary, e.description, e.category, e.format,
         e.start_at, e.end_at, e.venue, e.city, e.country, e.registration_url,
         e.technologies, e.audience, e.is_free
  from public.events e
  where e.id = any(event_ids[1:200])
    and e.status = 'published'
    and (e.tenant_id is null or (workspace_id is not null and e.tenant_id = workspace_id));
end;
$$;
revoke all on function public.get_events_by_ids from public;
grant execute on function public.get_events_by_ids to anon, authenticated, service_role;

-- Facets for forms (authorized scope only)
create or replace function public.event_facets(workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _res jsonb;
begin
  if workspace_id is not null and not public.is_tenant_member(auth.uid(), workspace_id) then
    raise exception 'Not authorized for this workspace' using errcode = '42501';
  end if;
  with scoped as (
    select * from public.events e where e.status = 'published'
      and (e.tenant_id is null or (workspace_id is not null and e.tenant_id = workspace_id))
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(distinct category order by category) from scoped), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(distinct city order by city) from scoped where city is not null), '[]'::jsonb),
    'technologies', coalesce((select jsonb_agg(t order by t) from (select distinct unnest(technologies) t from scoped) x), '[]'::jsonb),
    'total', (select count(*) from scoped)
  ) into _res;
  return _res;
end;
$$;
revoke all on function public.event_facets from public;
grant execute on function public.event_facets to anon, authenticated, service_role;

-- ===== Chat sessions & messages =====
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  title text not null default 'New conversation' check (char_length(title) <= 120),
  is_saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_sessions_user_idx on public.chat_sessions(user_id, updated_at desc);
grant select, insert, update, delete on public.chat_sessions to authenticated;
grant all on public.chat_sessions to service_role;
alter table public.chat_sessions enable row level security;
create policy "Own sessions read" on public.chat_sessions for select to authenticated using (user_id = auth.uid());
create policy "Own sessions create" on public.chat_sessions for insert to authenticated
  with check (user_id = auth.uid() and (tenant_id is null or public.is_tenant_member(auth.uid(), tenant_id)));
create policy "Own sessions update" on public.chat_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (tenant_id is null or public.is_tenant_member(auth.uid(), tenant_id)));
create policy "Own sessions delete" on public.chat_sessions for delete to authenticated using (user_id = auth.uid());

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 20000),
  parts jsonb not null default '[]'::jsonb,
  context jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages(session_id, created_at);
grant select, insert, update, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;
create policy "Own messages read" on public.chat_messages for select to authenticated
  using (exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "Own messages write" on public.chat_messages for insert to authenticated
  with check (exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "Own messages delete" on public.chat_messages for delete to authenticated
  using (exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- ===== Saved dashboards =====
create table public.saved_dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('private', 'workspace')),
  configuration jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_dashboards_tenant_idx on public.saved_dashboards(tenant_id, updated_at desc);
grant select, insert, update, delete on public.saved_dashboards to authenticated;
grant all on public.saved_dashboards to service_role;
alter table public.saved_dashboards enable row level security;
create policy "Read own or shared dashboards" on public.saved_dashboards for select to authenticated
  using (owner_id = auth.uid() or (visibility = 'workspace' and public.is_tenant_member(auth.uid(), tenant_id)));
create policy "Members create dashboards" on public.saved_dashboards for insert to authenticated
  with check (owner_id = auth.uid() and public.has_tenant_role(auth.uid(), tenant_id, 'member'));
create policy "Owners update dashboards" on public.saved_dashboards for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_tenant_member(auth.uid(), tenant_id));
create policy "Owners or admins delete dashboards" on public.saved_dashboards for delete to authenticated
  using (owner_id = auth.uid() or public.has_tenant_role(auth.uid(), tenant_id, 'admin'));

-- ===== Search analytics (written by server) =====
create table public.search_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  tenant_id uuid,
  session_id uuid,
  client_key text,
  query text not null,
  intent text,
  filters jsonb,
  result_count int not null default 0,
  top_score double precision,
  low_confidence boolean not null default false,
  latency_ms int,
  status text not null default 'ok' check (status in ('ok', 'no_results', 'error', 'rate_limited')),
  error_category text,
  created_at timestamptz not null default now()
);
create index search_queries_created_idx on public.search_queries(created_at desc);
create index search_queries_client_idx on public.search_queries(client_key, created_at desc);
grant select on public.search_queries to authenticated;
grant all on public.search_queries to service_role;
alter table public.search_queries enable row level security;
create policy "Platform admins read search analytics" on public.search_queries for select to authenticated
  using (public.has_role(auth.uid(), 'platform_admin'));

-- ===== Feedback =====
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  message_id text,
  query text check (char_length(query) <= 2000),
  rating text not null check (rating in ('useful', 'irrelevant', 'incorrect_info', 'incorrect_explanation')),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
grant select on public.feedback to authenticated;
grant all on public.feedback to service_role;
alter table public.feedback enable row level security;
create policy "Platform admins read feedback" on public.feedback for select to authenticated
  using (public.has_role(auth.uid(), 'platform_admin'));

-- ===== Audit log (append-only, written by triggers / server) =====
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_idx on public.audit_logs(tenant_id, created_at desc);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "Workspace admins read audit logs" on public.audit_logs for select to authenticated
  using ((tenant_id is not null and public.has_tenant_role(auth.uid(), tenant_id, 'admin')) or public.has_role(auth.uid(), 'platform_admin'));

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _row jsonb;
  _meta jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then _row := to_jsonb(old); else _row := to_jsonb(new); end if;
  if tg_table_name = 'tenant_members' then
    _meta := jsonb_build_object('user_id', _row ->> 'user_id', 'role', _row ->> 'role');
  elsif tg_table_name = 'events' then
    _meta := jsonb_build_object('title', _row ->> 'title');
  elsif tg_table_name = 'saved_dashboards' then
    _meta := jsonb_build_object('name', _row ->> 'name', 'visibility', _row ->> 'visibility');
  end if;
  insert into public.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
  values (
    nullif(_row ->> 'tenant_id', '')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    _row ->> 'id',
    _meta
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger audit_tenant_members after insert or update or delete on public.tenant_members
  for each row execute function public.audit_row_change();
create trigger audit_events after insert or update of title, summary, description, category, format, start_at, end_at, status, technologies or delete on public.events
  for each row execute function public.audit_row_change();
create trigger audit_saved_dashboards after insert or update or delete on public.saved_dashboards
  for each row execute function public.audit_row_change();

-- updated_at helpers
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_tenants before update on public.tenants for each row execute function public.touch_updated_at();
create trigger touch_sessions before update on public.chat_sessions for each row execute function public.touch_updated_at();
create trigger touch_dashboards before update on public.saved_dashboards for each row execute function public.touch_updated_at();

-- ===== Avatars storage (private bucket; owner writes, teammates read) =====
create or replace function public.can_view_avatar_folder(_folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if _folder is null or _folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return _folder = auth.uid()::text or public.shares_tenant(auth.uid(), _folder::uuid);
end;
$$;
create policy "Read own or teammate avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_view_avatar_folder((storage.foldername(name))[1]));
create policy "Users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);