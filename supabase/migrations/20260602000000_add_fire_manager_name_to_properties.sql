-- ============================================================================
-- Migration: add_fire_manager_name_to_properties
-- Applied: TBD (橋本さん明示承認後に Supabase MCP apply_migration で適用)
-- 目的: properties テーブルに防火管理者の氏名カラム (fire_manager_name) を追加。
--
-- 背景:
--   設計レポート .tmp/property-fire-manager-design2.md の PR-1（案B＝物件直）。
--   物件に「防火管理者（氏名のみ・任意）」を持たせ、後続 PR-2 で各点検様式
--   (bekki) の fire_manager 欄に初期値として転記する（bekki page が既存の
--   properties select に乗せる）。
--
--   Web 調査により防火管理者欄は「氏名のみ」（住所・資格欄は無い）、選任して
--   いない物件は空白で可 → text NULL（任意）の 1 カラムのみ追加。届出者の
--   notifier_name 等と同じ持ち方。
--
--   既存カラム・データ・他テーブル (inspection_soukatsu / bekki 各表) には
--   一切触らない。properties への nullable カラム追加のみ（既存行は NULL）。
-- ============================================================================

-- (1) 防火管理者の氏名カラムを追加（氏名のみ・任意・NULL 許容）。
--     IF NOT EXISTS で冪等。既存行は NULL（= 未選任/未入力）。
ALTER TABLE public.properties
    ADD COLUMN IF NOT EXISTS fire_manager_name text;

COMMENT ON COLUMN public.properties.fire_manager_name IS
    '防火管理者の氏名（任意・NULL 許容）。選任していない物件は NULL/空。各点検様式(bekki)の fire_manager 初期値に使う（PR-2）。住所・資格欄は持たない（氏名のみ）。';

-- ============================================================================
-- 適用後の検証 SELECT (手動実行例)
-- ============================================================================
-- -- カラム追加確認
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'properties'
--     AND column_name = 'fire_manager_name';
-- -- expect: 1 row, fire_manager_name / text / YES
--
-- -- 既存行は NULL（既存データ非破壊）
-- SELECT count(*) AS total, count(fire_manager_name) AS with_value
--   FROM public.properties;
-- -- expect: with_value = 0（追加直後は全行 NULL）、total は変化なし
--
-- -- 既存カラムが無傷か（届出者・建物・設備）
-- SELECT count(*) FROM public.properties
--   WHERE notifier_name IS NOT NULL;  -- expect: 変化なし

-- ============================================================================
-- ロールバック (緊急時)
-- ============================================================================
/*
ALTER TABLE public.properties DROP COLUMN IF EXISTS fire_manager_name;
*/
