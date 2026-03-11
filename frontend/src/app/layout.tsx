import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "특수학교 경은PBST 통합관리플랫폼",
    template: "%s | 경은PBST 플랫폼",
  },
  description: "특수학교 긍정적 행동지원(PBST) 데이터 기반 의사결정 플랫폼. Tier 1/2/3 행동 분석, CICO 모니터링, 위기행동 관리를 지원합니다.",
  keywords: ["경은PBST", "PBST", "PBIS", "특수교육", "행동지원", "CICO", "Tier", "행동중재"],
  openGraph: {
    title: "특수학교 경은PBST 통합관리플랫폼",
    description: "데이터 기반 긍정적 행동지원 의사결정 플랫폼",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        {children}
        <footer style={{ textAlign: "center", padding: "20px", backgroundColor: "#f8f9fa", color: "#6c757d", fontSize: "14px", letterSpacing: "0.5px" }}>
            &copy; 2026 Jong Ho Park, Special Educator, BCBA. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
