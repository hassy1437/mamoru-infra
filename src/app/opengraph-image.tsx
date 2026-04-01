import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Mamoru Infra — 消防設備点検の報告書作成を効率化"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 50%, #eef2ff 100%)",
                    fontFamily: "sans-serif",
                }}
            >
                {/* Top accent */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 6,
                        background: "linear-gradient(90deg, #2563eb, #6366f1)",
                    }}
                />

                {/* Logo */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        marginBottom: 32,
                    }}
                >
                    <div
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontSize: 28,
                            fontWeight: 800,
                        }}
                    >
                        M
                    </div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: "#1e293b" }}>
                        Mamoru Infra
                    </div>
                </div>

                {/* Headline */}
                <div
                    style={{
                        fontSize: 52,
                        fontWeight: 800,
                        color: "#0f172a",
                        marginBottom: 16,
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    現場の事務作業を、
                    <span style={{ color: "#2563eb" }}>ゼロ</span>
                    にする。
                </div>

                {/* Subheadline */}
                <div
                    style={{
                        fontSize: 24,
                        color: "#64748b",
                        marginBottom: 40,
                    }}
                >
                    スマホで入力 → 報告書PDF自動生成 | 無料・インストール不要
                </div>

                {/* Feature pills */}
                <div style={{ display: "flex", gap: 16 }}>
                    {["別記様式 第1〜第8対応", "作成時間 1/3に短縮", "オフライン対応"].map(
                        (text) => (
                            <div
                                key={text}
                                style={{
                                    padding: "10px 24px",
                                    borderRadius: 999,
                                    background: "white",
                                    border: "1px solid #e2e8f0",
                                    fontSize: 18,
                                    fontWeight: 600,
                                    color: "#334155",
                                }}
                            >
                                {text}
                            </div>
                        )
                    )}
                </div>
            </div>
        ),
        { ...size }
    )
}
