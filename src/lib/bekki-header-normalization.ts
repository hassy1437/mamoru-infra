const KNOWN_HEADER_PREFIXES = [
    "\u7acb\u4f1a\u8005",
    "\u4e3b\u4efb\u70b9\u691c\u8005",
    "\u70b9\u691c\u8005",
] as const

const PREFIX_PATTERN = new RegExp(`^(?:${KNOWN_HEADER_PREFIXES.join("|")})[\\s\\u3000:\\uff1a-]*`)

export const stripKnownHeaderPrefix = (value: unknown) => {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim()
    if (!normalized) return ""

    return normalized.replace(PREFIX_PATTERN, "").trim()
}

export const normalizeWitnessValue = (value: unknown) => stripKnownHeaderPrefix(value)

export const normalizeInspectorNameValue = (value: unknown) => stripKnownHeaderPrefix(value)
