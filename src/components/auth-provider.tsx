"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const AuthContext = createContext<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
})

export function AuthProvider({
    children,
    initialUser,
}: {
    children: React.ReactNode
    initialUser: User | null
}) {
    const [user, setUser] = useState<User | null>(initialUser)
    const [loading, setLoading] = useState(!initialUser)

    useEffect(() => {
        const supabase = createClient()
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
