import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";
import { OfflineIndicator } from "@/components/offline-indicator";
import { Toaster } from "@/components/ui/toaster";
import ChatbotHint from "@/components/chatbot-hint";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mamoru Infra — 消防設備点検の報告書作成を効率化",
  description: "スマホで入力するだけで、消防設備点検結果報告書のPDFをその場で自動生成。消火器・屋内消火栓・スプリンクラー等7設備に対応。インストール不要・無料で利用可能。",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mamoru Infra",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth failure should not crash the entire app.
    // Middleware handles route protection independently.
  }

  return (
    <html lang="ja">
      <body
        className={`${notoSansJP.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider initialUser={user}>
          <Toaster />
          <OfflineIndicator />
          <ServiceWorkerRegistrar />
          {children}
        </AuthProvider>
        <ChatbotHint />
        <Script id="dify-chatbot-config" strategy="afterInteractive">
          {`window.difyChatbotConfig = { token: 'bvhfapiUdU8yqQmc' }`}
        </Script>
        <Script
          src="https://udify.app/embed.min.js"
          id="bvhfapiUdU8yqQmc"
          strategy="afterInteractive"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes mamoru-chatbot-pulse {
                0%, 100% {
                  box-shadow: 0 4px 12px rgba(28, 100, 242, 0.35);
                }
                50% {
                  box-shadow: 0 4px 24px rgba(28, 100, 242, 0.65), 0 0 0 10px rgba(28, 100, 242, 0.12);
                }
              }
              #dify-chatbot-bubble-button {
                background-color: #1C64F2 !important;
                animation: mamoru-chatbot-pulse 2.5s ease-in-out infinite;
              }
              #dify-chatbot-bubble-window {
                width: 24rem !important;
                height: 40rem !important;
              }
              @media (prefers-reduced-motion: reduce) {
                #dify-chatbot-bubble-button {
                  animation: none;
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
