// Supabase connection for the AZCL website.
// The anon (publishable) key is meant to be public; it only allows what the
// database rules in supabase/setup.sql permit. Never put the service_role key here.
window.AZCL_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY"
};
