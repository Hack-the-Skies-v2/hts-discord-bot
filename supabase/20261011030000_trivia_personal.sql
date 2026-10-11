-- Personal trivia: each hacker is issued their own question and has 10 seconds to answer.
-- A row is created when the question is issued (responded = false) and flipped to responded = true
-- exactly once when they answer or let it expire, so a question can never be seen twice.
ALTER TABLE public.trivia_answers
  ADD COLUMN IF NOT EXISTS responded boolean NOT NULL DEFAULT true;

ALTER TABLE public.trivia_questions
  ALTER COLUMN time_limit_seconds SET DEFAULT 10;

UPDATE public.trivia_questions SET time_limit_seconds = 10;
