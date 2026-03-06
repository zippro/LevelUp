-- ================================================
-- RLS Security Fix for level_scores and weekly_reports
-- Created: 2026-01-21
-- Issue: Both tables exposed via PostgREST without RLS
-- ================================================

-- 1. Enable RLS on level_scores
ALTER TABLE public.level_scores ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read level_scores
CREATE POLICY "Allow authenticated read on level_scores" 
ON public.level_scores
FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to insert level_scores
CREATE POLICY "Allow authenticated insert on level_scores" 
ON public.level_scores
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update level_scores
CREATE POLICY "Allow authenticated update on level_scores" 
ON public.level_scores
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Allow authenticated users to delete level_scores
CREATE POLICY "Allow authenticated delete on level_scores" 
ON public.level_scores
FOR DELETE 
TO authenticated 
USING (true);

-- ================================================

-- 2. Enable RLS on weekly_reports
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read weekly_reports
CREATE POLICY "Allow authenticated read on weekly_reports" 
ON public.weekly_reports
FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to insert weekly_reports
CREATE POLICY "Allow authenticated insert on weekly_reports" 
ON public.weekly_reports
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update weekly_reports
CREATE POLICY "Allow authenticated update on weekly_reports" 
ON public.weekly_reports
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Allow authenticated users to delete weekly_reports
CREATE POLICY "Allow authenticated delete on weekly_reports" 
ON public.weekly_reports
FOR DELETE 
TO authenticated 
USING (true);
