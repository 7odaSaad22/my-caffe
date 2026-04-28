-- Create Inventory Table
create table inventory (
  id bigint primary key generated always as identity,
  name text not null,
  stock int default 0
);

-- Create Orders Table
create table orders (
  id bigint primary key generated always as identity,
  employee_name text,
  items jsonb,
  note text,
  status text default 'pending',
  date timestamptz default now(),
  processed_by text,
  rating int,
  processed_date timestamptz
);

-- Create Users Table (Simple Auth)
create table app_users (
  username text primary key,
  password text not null,
  role text default 'user',
  created_at timestamptz default now()
);

-- Insert Initial Data
insert into inventory (name, stock) values
  ('شاي', 50),
  ('قهوة تركي', 30),
  ('نسكافيه', 40),
  ('عصير برتقال', 20),
  ('يانسون', 25);

insert into app_users (username, password, role) values
  ('hitler', '1122', 'super_admin');
