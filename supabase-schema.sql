create table if not exists public.jk_queue (
  slug text primary key,
  title text not null,
  source_url text not null,
  source_rank integer not null default 0,
  status text not null default 'pending' check (status in ('pending','extracting','retry','completed','skipped')),
  next_episode integer not null default 1,
  episode_count integer not null default 0,
  attempts integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jk_queue_status_rank_idx on public.jk_queue(status, source_rank);

create table if not exists public.jk_animes (
  slug text primary key,
  title text not null,
  alternative_titles jsonb not null default '[]'::jsonb,
  image_url text,
  description text not null default '',
  year integer,
  status text not null default 'Finalizado',
  genres jsonb not null default '[]'::jsonb,
  source_url text not null,
  episode_count integer not null default 0,
  extracted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jk_episodes (
  anime_slug text not null references public.jk_animes(slug) on delete cascade,
  chapter_number integer not null,
  thumbnail text,
  servers jsonb not null default '[]'::jsonb,
  downloads jsonb not null default '[]'::jsonb,
  source_url text not null,
  extracted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (anime_slug, chapter_number)
);

create index if not exists jk_episodes_anime_idx on public.jk_episodes(anime_slug, chapter_number);

alter table public.jk_queue enable row level security;
alter table public.jk_animes enable row level security;
alter table public.jk_episodes enable row level security;

-- No public policies: only the service-role key stored in GitHub Secrets can read/write.
