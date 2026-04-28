-- Clean up existing data for production launch
TRUNCATE TABLE orders; -- Remove all test orders
TRUNCATE TABLE inventory RESTART IDENTITY; -- Remove test inventory
TRUNCATE TABLE app_users; -- Remove test users (re-add Super Admin)

-- Re-insert only the Super Admin
INSERT INTO app_users (username, password, role) VALUES 
  ('hitler', '1122', 'super_admin');

-- Optional: If you want empty inventory or start fresh
-- INSERT INTO inventory (name, stock) VALUES ... (Add real products later via UI)
