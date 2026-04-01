import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: 180,
                    height: 180,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                    borderRadius: 40,
                }}
            >
                <div
                    style={{
                        fontSize: 90,
                        fontWeight: 800,
                        color: "white",
                        fontFamily: "sans-serif",
                    }}
                >
                    M
                </div>
            </div>
        ),
        { ...size }
    )
}
