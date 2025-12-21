-- Enable realtime for profiles table to allow instant logout on deactivation
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;