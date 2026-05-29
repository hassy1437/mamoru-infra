-- ============================================================================
-- Migration: create_inspectors_table
-- Applied: TBD (橋本さん明示承認後に Supabase MCP apply_migration で適用)
-- 目的: 点検者マスタ (inspectors テーブル) の新規作成 + RLS + updated_at trigger
--
-- 背景:
--   設計レポート .tmp/inspector-master-design.md および
--   .tmp/inspectors-table-design.md に基づく事前登録 (点検者マスタ) PR-2。
--   per-user で複数の点検者マスタを保持し、後続 PR-3 (マスタ管理 UI) と
--   PR-4 (itiran-form 統合) で利用する。
--
--   既存テーブル (properties / inspection_itiran / inspection_soukatsu /
--   profiles) には一切触らない。新規テーブル追加のみ。
-- ============================================================================

-- (1) updated_at の自動更新用 trigger function (新規作成、汎用)
--     ※ 既に同名関数が存在しないことを確認済み (2026-05-29、
--        SELECT count(*) FROM information_schema.routines
--         WHERE routine_schema='public' AND routine_name='set_updated_at' → 0)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

-- (2) inspectors テーブル本体
CREATE TABLE public.inspectors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL DEFAULT auth.uid()
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
    label           text NOT NULL DEFAULT '',
    inspector_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.inspectors IS
    '点検者マスタ。per-user で複数登録可能。inspector_data jsonb に InspectorData 型をそのまま保存。';
COMMENT ON COLUMN public.inspectors.label IS
    'マスタ一覧での識別ラベル (例: "橋本 拓也"、"事務 山田")。空文字許容。';
COMMENT ON COLUMN public.inspectors.inspector_data IS
    'InspectorData 型 (address/name/company/phone/equipment_names + shoubou_licenses 8 種別 + shoubou_notes + kensa_licenses 3 種別)';

-- (3) インデックス
CREATE INDEX idx_inspectors_user_id
    ON public.inspectors(user_id);
CREATE INDEX idx_inspectors_user_id_updated_at
    ON public.inspectors(user_id, updated_at DESC);

-- (4) RLS 有効化 + ポリシー (properties / inspection_itiran と同パターン)
ALTER TABLE public.inspectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_inspectors"
    ON public.inspectors
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- (5) updated_at 自動更新 trigger
CREATE TRIGGER inspectors_set_updated_at
    BEFORE UPDATE ON public.inspectors
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 適用後の検証 SELECT (手動実行例)
-- ============================================================================
-- -- テーブル存在確認
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'inspectors';
-- -- expect: 1 row, "inspectors"
--
-- -- RLS が有効化されているか
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relname = 'inspectors';
-- -- expect: relrowsecurity = true
--
-- -- ポリシー確認
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'inspectors';
-- -- expect: 1 row, rls_inspectors, ALL, (auth.uid() = user_id), (auth.uid() = user_id)
--
-- -- インデックス確認
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'inspectors';
-- -- expect: 3 rows (inspectors_pkey, idx_inspectors_user_id, idx_inspectors_user_id_updated_at)
--
-- -- trigger 確認
-- SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_schema = 'public' AND event_object_table = 'inspectors';
-- -- expect: 1 row, inspectors_set_updated_at
--
-- -- 既存テーブル (本物 4 件保護) への影響ゼロ確認
-- SELECT count(*) FROM public.properties;          -- expect: 変化なし (調査時 7 行)
-- SELECT count(*) FROM public.inspection_itiran;  -- expect: 変化なし
-- SELECT count(*) FROM public.inspection_soukatsu; -- expect: 変化なし

-- ============================================================================
-- ロールバック (緊急時、3 ステップ)
-- ============================================================================
/*
-- (1) trigger 削除
DROP TRIGGER IF EXISTS inspectors_set_updated_at ON public.inspectors;

-- (2) テーブル削除 (CASCADE で index と policy も自動削除)
DROP TABLE IF EXISTS public.inspectors CASCADE;

-- (3) set_updated_at function は将来の再利用候補なので原則残置。
--     ただし本 PR-2 が単独で巻き戻しになる場合 (= 他テーブルで使われていない場合) は削除可:
-- DROP FUNCTION IF EXISTS public.set_updated_at();
*/
