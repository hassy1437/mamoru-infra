import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        // 1. アプリから送られてきたデータを取得
        const body = await req.json();

        // 2. publicフォルダにある template.docx を読み込む
        const templatePath = path.join(process.cwd(), "public", "template.docx");
        const content = fs.readFileSync(templatePath, "binary");

        // 3. ライブラリを準備
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '[[', end: ']]' }, // ← これを追加！
        });

        // 4. 日付データを分解 (例: "2025-12-14" -> 2025, 12, 14)
        const dateObj = new Date(body.report_date);
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1;
        const day = dateObj.getDate();

        // 5. データをテンプレートのプレースホルダーに流し込む
        // 左側がテンプレートの{{名前}}、右側がデータベースのデータです
        doc.render({
            report_year: year,
            report_month: month,
            report_day: day,
            notifier_address: body.notifier_address,
            notifier_name: body.notifier_name,
            notifier_phone: body.notifier_phone,
            property_address: body.building_address, // DBのカラム名と対応付け
            property_name: body.building_name,
            property_usage: body.building_usage,
            floors_above: body.floor_above,
            floors_below: body.floor_below ?? 0, // 地下が空欄なら0にする
            total_area: body.total_floor_area,
            equipment_types: body.equipment_types ? body.equipment_types.join("、") : "なし",
        });

        // 6. Wordファイルを生成
        const buf = doc.getZip().generate({
            type: "nodebuffer",
            compression: "DEFLATE",
        });

        // 7. 生成したファイルをブラウザに返す
        // 修正: buf を 'as any' で型変換して渡します（これでエラーが消えます）
        return new NextResponse(buf as any, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": 'attachment; filename="fire_report.docx"',
            },
        });

    } catch (error) {
        console.error("Word generation error:", error);
        return NextResponse.json({ error: "Failed to generate document" }, { status: 500 });
    }
}