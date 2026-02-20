import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Building, ClipboardCheck, Wrench } from "lucide-react"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="relative max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-10 md:p-16 text-center space-y-10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        <div className="flex justify-center relative z-10">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-5 rounded-2xl shadow-lg shadow-blue-200/50 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <Wrench className="w-14 h-14 text-white" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-5 relative z-10">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Mamoru Infra
            <span className="block text-xl md:text-2xl mt-2 text-blue-600 font-bold">
              消防設備点検・報告書作成ツール
            </span>
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed max-w-lg mx-auto">
            作業内容を選択してください。
          </p>
        </div>

        <div className="flex flex-col gap-5 justify-center items-center relative z-10 pt-4">
          <Link href="/reports/new" className="w-full group">
            <Button size="lg" className="w-full text-lg px-10 py-7 gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-2xl font-bold">
              <Building className="w-6 h-6" />
              物件基本情報の入力
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link href="/inspection" className="w-full group">
            <Button size="lg" className="w-full text-lg px-10 py-7 gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-2xl font-bold">
              <ClipboardCheck className="w-6 h-6" />
              消防設備点検スタート
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>

        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      </div>
    </main>
  )
}
