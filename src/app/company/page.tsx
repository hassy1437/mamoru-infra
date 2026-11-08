import { Building2 } from "lucide-react"

import Breadcrumb from "@/components/breadcrumb"
import CompanyManager from "@/components/company-manager"
import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { isFunctionMissing, type CompanyInvitation, type CompanyMember, type MyCompany } from "@/lib/company"

/**
 * 会社の画面（2026-11-08・点検アプリの会社 3 番目）。
 *   会社の名前・会社の人・役割・外す・招待（送る／送り直す／取り消す）。
 *   ★決まり（管理者だけ・最後の管理者・会社の契約の人は外せない）は DB が持つ。ここは見せるだけ。
 *   ★DB の招待と役割（mamoruinfra-web 20261231130000）がまだ無いときは「準備中」を出す。
 */
export default async function CompanyPage() {
    const { supabase } = await getAuthenticatedClient()

    const mine = await supabase.rpc("my_company")
    if (mine.error && isFunctionMissing(mine.error)) {
        return (
            <Shell>
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
                    会社の画面は準備中です。もうしばらくお待ちください。
                </p>
            </Shell>
        )
    }

    const company = ((mine.data ?? []) as MyCompany[])[0] ?? null
    let members: CompanyMember[] = []
    let invitations: CompanyInvitation[] = []
    if (company) {
        const m = await supabase.rpc("company_members_list")
        members = (m.data ?? []) as CompanyMember[]
        if (company.my_role === "admin") {
            const i = await supabase.rpc("company_invitations_list")
            invitations = (i.data ?? []) as CompanyInvitation[]
        }
    }

    return (
        <Shell>
            <CompanyManager company={company} members={members} invitations={invitations} />
        </Shell>
    )
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                <Breadcrumb items={[{ label: "会社と人" }]} />
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-7 h-7 text-blue-600 shrink-0" />
                        会社と人
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        同じ会社の人は、報告書・物件・点検者・測定機器を一緒に見て直せます。
                    </p>
                </div>
                {children}
            </div>
        </main>
    )
}
