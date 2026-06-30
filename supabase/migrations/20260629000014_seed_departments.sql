INSERT INTO departments (name) VALUES
  ('Engineering'),
  ('Marketing'),
  ('Design'),
  ('Product'),
  ('Sales'),
  ('Operations'),
  ('Finance'),
  ('Human Resources'),
  ('Legal'),
  ('Customer Support'),
  ('Research'),
  ('IT')
ON CONFLICT (name) DO NOTHING;
