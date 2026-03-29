-- ============================================================
-- Migration: Add authentication & Row Level Security (RLS)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add user_id columns to tables that don't have them
ALTER TABLE public.inspection_soukatsu
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.inspection_itiran
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Set default values so new inserts auto-populate user_id
ALTER TABLE public.properties
    ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.inspection_soukatsu
    ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.inspection_itiran
    ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 3. Performance index for RLS join lookups
CREATE INDEX IF NOT EXISTS idx_inspection_soukatsu_user_id
    ON public.inspection_soukatsu (id, user_id);

CREATE INDEX IF NOT EXISTS idx_properties_user_id
    ON public.properties (user_id);

CREATE INDEX IF NOT EXISTS idx_inspection_itiran_user_id
    ON public.inspection_itiran (user_id);

-- 4. Enable RLS on all tables
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_soukatsu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_itiran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_shokaki_bekki1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_shokasen_bekki2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_sprinkler_bekki3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_water_spray_bekki4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_foam_bekki5 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_inert_gas_bekki6 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_halogen_bekki7 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_powder_bekki8 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_okugai_shokasen_bekki9 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_doryoku_pump_bekki10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_jidou_kasai_houchi_bekki11_1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_gas_leak_fire_alarm_bekki11_2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_leakage_fire_alarm_bekki12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_fire_department_notification_bekki13 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_emergency_alarm_bekki14 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_evacuation_equipment_bekki15 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_guidance_lights_signs_bekki16 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_fire_water_bekki17 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_smoke_control_bekki18 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_connected_sprinkler_bekki19 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_standpipe_bekki20 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_emergency_power_outlet_bekki21 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_radio_communication_support_bekki22 ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Direct user_id ownership
CREATE POLICY "Users can CRUD own properties"
    ON public.properties FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own reports"
    ON public.inspection_reports FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own soukatsu"
    ON public.inspection_soukatsu FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own itiran"
    ON public.inspection_itiran FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. RLS Policies: Bekki tables via soukatsu_id join
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'inspection_shokaki_bekki1',
            'inspection_shokasen_bekki2',
            'inspection_sprinkler_bekki3',
            'inspection_water_spray_bekki4',
            'inspection_foam_bekki5',
            'inspection_inert_gas_bekki6',
            'inspection_halogen_bekki7',
            'inspection_powder_bekki8',
            'inspection_okugai_shokasen_bekki9',
            'inspection_doryoku_pump_bekki10',
            'inspection_jidou_kasai_houchi_bekki11_1',
            'inspection_gas_leak_fire_alarm_bekki11_2',
            'inspection_leakage_fire_alarm_bekki12',
            'inspection_fire_department_notification_bekki13',
            'inspection_emergency_alarm_bekki14',
            'inspection_evacuation_equipment_bekki15',
            'inspection_guidance_lights_signs_bekki16',
            'inspection_fire_water_bekki17',
            'inspection_smoke_control_bekki18',
            'inspection_connected_sprinkler_bekki19',
            'inspection_standpipe_bekki20',
            'inspection_emergency_power_outlet_bekki21',
            'inspection_radio_communication_support_bekki22'
        ])
    LOOP
        EXECUTE format(
            'CREATE POLICY "Users can CRUD own %1$s" ON public.%1$I FOR ALL
             USING (EXISTS (
                 SELECT 1 FROM public.inspection_soukatsu s
                 WHERE s.id = %1$I.soukatsu_id AND s.user_id = auth.uid()
             ))
             WITH CHECK (EXISTS (
                 SELECT 1 FROM public.inspection_soukatsu s
                 WHERE s.id = %1$I.soukatsu_id AND s.user_id = auth.uid()
             ))',
            tbl
        );
    END LOOP;
END
$$;
