import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"

type GeneratePdfBody = {
    report_date?: string
    fire_department_name?: string
    notifier_address?: string
    notifier_name?: string
    notifier_phone?: string
    building_address?: string
    building_name?: string
    building_usage?: string
    floor_above?: number | string | null
    floor_below?: number | string | null
    total_floor_area?: number | string | null
    equipment_types?: string[] | null
}

const toText = (value: unknown) => {
    if (value === null || value === undefined) return undefined
    const text = String(value).trim()
    return text.length > 0 ? text : undefined
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as GeneratePdfBody

        const pdfPath = path.join(process.cwd(), "public", "PDF", "bekki_houkoku.pdf")
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)

        const firstPage = pdfDoc.getPages()[0]
        const { height } = firstPage.getSize()

        const draw = (text: string | undefined, x: number, y: number, size = 10.5, maxWidth?: number) => {
            if (!text) return
            let currentSize = size

            if (maxWidth) {
                const textWidth = customFont.widthOfTextAtSize(text, currentSize)
                if (textWidth > maxWidth) {
                    currentSize = currentSize * (maxWidth / textWidth)
                }
            }

            firstPage.drawText(text, {
                x,
                y: height - y,
                size: currentSize,
                font: customFont,
                color: rgb(0, 0, 0),
            })
        }

        const d = new Date(body.report_date ?? "")
        if (!Number.isNaN(d.getTime())) {
            draw(String(d.getFullYear()), 380, 100)
            draw(String(d.getMonth() + 1), 430, 100)
            draw(String(d.getDate()), 480, 100)
        }

        draw(toText(body.fire_department_name), 60, 95, 12)

        const notifierX = 312
        draw(toText(body.notifier_address), notifierX, 151, 10.5, 200)
        draw(toText(body.notifier_name), notifierX, 168, 10.5, 200)
        draw(toText(body.notifier_phone), notifierX, 185, 10.5, 200)

        const tableX = 150
        draw(toText(body.building_address), tableX, 269, 10.5, 350)
        draw(toText(body.building_name), tableX, 305, 10.5, 350)
        draw(toText(body.building_usage), tableX, 340, 10.5, 180)

        draw(toText(body.floor_above), 190, 381)
        draw(toText(body.floor_below) ?? "0", 300, 381)
        draw(toText(body.total_floor_area), 430, 381)

        const equipments = Array.isArray(body.equipment_types) ? body.equipment_types.join("、") : ""
        draw(equipments || undefined, tableX, 410, 9, 380)

        const pdfBytes = await pdfDoc.save()

        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="official_report.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
