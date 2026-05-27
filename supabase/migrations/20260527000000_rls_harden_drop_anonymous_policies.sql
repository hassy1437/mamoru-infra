-- ============================================================================
-- Migration: rls_harden_drop_anonymous_policies
-- Applied: 2026-05-27 (via Supabase MCP apply_migration)
-- 目的: RLS の抜け穴ポリシー削除 + photos バケット非公開化
--
-- 背景:
--   調査レポート .tmp/rls-audit.md で次の抜け穴を特定:
--   - properties / inspection_itiran に `Allow all` ポリシー(OR 結合で素通り)
--   - inspection_soukatsu に `Allow anonymous insert/select` ポリシー
--   - storage.photos バケットが public=true + 4 個の全公開ポリシー
--
--   削除前に SELECT で確認: 全 public.* テーブルで user_id NULL = 0、
--   owner mismatch = 0 を確認済み。本物データ 4 ユーザー分のみ存在。
--   photos バケットはアプリ未使用 (IndexedDB ベースのため)。
-- ============================================================================

-- (1) properties: 抜け穴ポリシー削除
-- 残るのは `rls_properties` (ALL, auth.uid() = user_id) のみ
DROP POLICY IF EXISTS "Allow all" ON public.properties;

-- (2) inspection_itiran: 抜け穴ポリシー削除
-- 残るのは `rls_inspection_itiran` (ALL, auth.uid() = user_id) のみ
DROP POLICY IF EXISTS "Allow all" ON public.inspection_itiran;

-- (3) inspection_soukatsu: 匿名アクセス 2 ポリシー削除
-- 残るのは `rls_inspection_soukatsu` (ALL, auth.uid() = user_id) のみ
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.inspection_soukatsu;
DROP POLICY IF EXISTS "Allow anonymous select" ON public.inspection_soukatsu;

-- (4) Storage photos バケットの非公開化
-- アプリは photos バケットを未使用（IndexedDB ベース）
UPDATE storage.buckets SET public = false WHERE id = 'photos';

-- (5) Storage の全公開ポリシー削除（4 個）
-- アプリ未使用なので新ポリシーは追加不要
DROP POLICY IF EXISTS "Allow All 1io9m69_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow All 1io9m69_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow All 1io9m69_2" ON storage.objects;
DROP POLICY IF EXISTS "Allow All 1io9m69_3" ON storage.objects;

-- ============================================================================
-- 検証 SELECT（手動実行例）
-- ============================================================================
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND policyname IN ('Allow all', 'Allow anonymous insert', 'Allow anonymous select');
-- -- expect: 0 rows
--
-- SELECT public FROM storage.buckets WHERE id = 'photos';
-- -- expect: false
--
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'storage';
-- -- expect: 0

-- ============================================================================
-- ロールバック（緊急時の復旧用、9 ステートメント）
-- ============================================================================
/*
-- 抜け穴ポリシーの再作成
CREATE POLICY "Allow all" ON public.properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.inspection_itiran FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous insert" ON public.inspection_soukatsu FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous select" ON public.inspection_soukatsu FOR SELECT USING (true);

-- Storage バケット公開化
UPDATE storage.buckets SET public = true WHERE id = 'photos';

-- Storage の全公開ポリシー再作成
CREATE POLICY "Allow All 1io9m69_0" ON storage.objects FOR SELECT USING (bucket_id = 'photos'::text);
CREATE POLICY "Allow All 1io9m69_1" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'photos'::text);
CREATE POLICY "Allow All 1io9m69_2" ON storage.objects FOR UPDATE USING (bucket_id = 'photos'::text);
CREATE POLICY "Allow All 1io9m69_3" ON storage.objects FOR DELETE USING (bucket_id = 'photos'::text);
*/
