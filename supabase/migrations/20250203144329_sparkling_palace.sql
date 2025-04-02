/*
  # Create daily summaries table

  1. New Tables
    - `daily_summaries`
      - `id` (uuid, primary key)
      - `content` (text, the summary content)
      - `citations` (jsonb, array of citation objects)
      - `timestamp` (timestamptz, when the summary was generated)
      - `created_at` (timestamptz, when the record was created)

  2. Security
    - Enable RLS on `daily_summaries` table
    - Add policy for public read access
*/

CREATE TABLE IF NOT EXISTS daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
  ON daily_summaries
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role to insert"
  ON daily_summaries
  FOR INSERT
  TO anon
  WITH CHECK (true);