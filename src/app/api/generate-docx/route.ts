import { NextRequest, NextResponse } from "next/server"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import fs from "fs"
import path from "path"

type GenerateDocxBody = {
    report_date?: string
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

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as GenerateDocxBody

        const templatePath = path.join(process.cwd(), "public", "template.docx")
        const content = fs.readFileSync(templatePath, "binary")

        const zip = new PizZip(content)
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "[[", end: "]]" },
        })

        const dateObj = new Date(body.report_date ?? "")
        const year = Number.isNaN(dateObj.getTime()) ? "" : dateObj.getFullYear()
        const month = Number.isNaN(dateObj.getTime()) ? "" : dateObj.getMonth() + 1
        const day = Number.isNaN(dateObj.getTime()) ? "" : dateObj.getDate()

        doc.render({
            report_year: year,
            report_month: month,
            report_day: day,
            notifier_address: body.notifier_address ?? "",
            notifier_name: body.notifier_name ?? "",
            notifier_phone: body.notifier_phone ?? "",
            property_address: body.building_address ?? "",
            property_name: body.building_name ?? "",
            property_usage: body.building_usage ?? "",
            floors_above: body.floor_above ?? "",
            floors_below: body.floor_below ?? 0,
            total_area: body.total_floor_area ?? "",
            equipment_types: Array.isArray(body.equipment_types) ? body.equipment_types.join("、") : "なし",
        })

        const buf = doc.getZip().generate({
            type: "nodebuffer",
            compression: "DEFLATE",
        })

        return new NextResponse(buf as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": 'attachment; filename="fire_report.docx"',
            },
        })
    } catch (error) {
        console.error("Word generation error:", error)
        return NextResponse.json({ error: "Failed to generate document" }, { status: 500 })
    }
}
