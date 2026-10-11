CREATE TABLE public.discord_links (
  discord_id text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trivia_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL UNIQUE,
  choices text[] NOT NULL,
  correct_index integer NOT NULL,
  time_limit_seconds integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trivia_questions_valid
    CHECK (
      array_length(choices, 1) BETWEEN 2 AND 4
      AND correct_index >= 0
      AND correct_index < array_length(choices, 1)
      AND time_limit_seconds > 0
    )
);

-- One answer per hacker per question; the primary key enforces "redeem once".
CREATE TABLE public.trivia_answers (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE CASCADE,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- Only the bot (service role) touches these; RLS on with no policies blocks everyone else.
ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_answers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.point_actions (name, description, points, max_redemptions)
SELECT 'Discord trivia', 'Answer a trivia question correctly in the HTS Discord', 10, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.point_actions WHERE name = 'Discord trivia');
