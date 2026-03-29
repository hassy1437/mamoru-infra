import {
    normalizeInspectorNameValue,
    normalizeWitnessValue,
} from "@/lib/bekki-header-normalization"

export const normalizeBekkiWitnessForState = (value: unknown) => normalizeWitnessValue(value)

export const normalizeBekkiInspectorNameForState = (value: unknown) => normalizeInspectorNameValue(value)

export const normalizeBekkiWitnessForPayload = (value: unknown) => normalizeWitnessValue(value)

export const normalizeBekkiInspectorNameForPayload = (value: unknown) => normalizeInspectorNameValue(value)
