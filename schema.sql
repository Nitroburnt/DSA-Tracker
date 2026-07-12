-- ============================================================================
-- MINIMALIST CYBERPUNK DSA TRACKER SCHEMA
-- ============================================================================

-- Enable UUID extension if not enabled
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Table: user_profiles (Extended Auth Data)
-- ----------------------------------------------------------------------------
create table public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    display_name text not null,
    max_streak int4 default 0 not null,
    current_streak int4 default 0 not null,
    role text default 'user' not null check (role in ('user', 'admin')),
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.user_profiles enable row level security;

create policy "Allow read access to all profiles for authenticated users" 
    on public.user_profiles for select to authenticated 
    using (true);

create policy "Allow users to update their own profile" 
    on public.user_profiles for update to authenticated 
    using (auth.uid() = id) 
    with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Table: topics (Admin Managed Topic List)
-- ----------------------------------------------------------------------------
create table public.topics (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.topics enable row level security;

create policy "Allow read access to topics for authenticated users"
    on public.topics for select to authenticated
    using (true);

create policy "Allow full access to topics for admin users"
    on public.topics for all to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where user_profiles.id = auth.uid() and user_profiles.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- Table: problems (Admin Managed Curriculum)
-- ----------------------------------------------------------------------------
create table public.problems (
    id uuid primary key default gen_random_uuid(),
    topic_id uuid not null references public.topics(id) on delete restrict,
    day_number int4 not null,
    problem_name text not null,
    link_1 text not null,
    link_2 text,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.problems enable row level security;

create policy "Allow read access to problems for authenticated users" 
    on public.problems for select to authenticated 
    using (true);

create policy "Allow full access to problems for admin users" 
    on public.problems for all to authenticated 
    using (
        exists (
            select 1 from public.user_profiles
            where user_profiles.id = auth.uid() and user_profiles.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- Table: user_completions (Junction Table for Progress Tracking)
-- ----------------------------------------------------------------------------
create table public.user_completions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(id) on delete cascade,
    problem_id uuid not null references public.problems(id) on delete cascade,
    completed_at timestamptz default timezone('utc'::text, now()) not null,
    constraint user_completions_user_id_problem_id_key unique (user_id, problem_id)
);

alter table public.user_completions enable row level security;

create policy "Allow select completions for owner" 
    on public.user_completions for select to authenticated 
    using (auth.uid() = user_id);

create policy "Allow insert completions for owner" 
    on public.user_completions for insert to authenticated 
    with check (auth.uid() = user_id);

create policy "Allow delete completions for owner" 
    on public.user_completions for delete to authenticated 
    using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Auth Trigger: Automatically create a user profile on signup
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.user_profiles (id, email, display_name, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'display_name', 'Cyber Warrior'),
        'user'
    );
    return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
