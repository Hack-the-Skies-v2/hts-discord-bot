-- Each hacker can earn points for at most 5 correct Discord trivia answers.
UPDATE public.point_actions
SET max_redemptions = 5
WHERE name = 'Discord trivia';
