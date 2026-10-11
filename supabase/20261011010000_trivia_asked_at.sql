-- Lets the serverless bot remember which questions it has already posted.
ALTER TABLE public.trivia_questions ADD COLUMN IF NOT EXISTS asked_at timestamptz;
