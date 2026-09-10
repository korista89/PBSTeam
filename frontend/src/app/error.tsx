"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

// Next.js가 커스텀 에러 바운더리 없이 클라이언트 예외를 만나면 "Application error:
// a client-side exception has occurred"라는 복구 불가능한 기본 화면을 보여준다.
// 최소한 새로고침/대시보드 이동이 가능한 화면으로 대체한다.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const router = useRouter();

    useEffect(() => {
        console.error("클라이언트 오류:", error);
    }, [error]);

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "24px" }}>
            <div className="empty-state" style={{ maxWidth: "480px" }}>
                <div className="empty-state-icon">⚠️</div>
                <div className="empty-state-title">일시적인 오류가 발생했습니다</div>
                <div className="empty-state-text">
                    페이지를 불러오는 중 문제가 생겼습니다. 데이터는 안전하게 저장되어 있을 가능성이 높습니다 — 새로고침 후에도 반복되면 관리자에게 알려주세요.
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                    <button onClick={() => reset()} className="btn btn-primary">🔄 다시 시도</button>
                    <button onClick={() => router.push("/")} className="btn btn-secondary">🏠 대시보드로 이동</button>
                </div>
            </div>
        </div>
    );
}
