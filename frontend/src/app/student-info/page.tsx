"use client";

// Tier1 › 학생정보 및 이해자료: 학급을 골라 학생의 학습면·생활면·건강면·유의사항을 쓴다(개별학생 행동중재 ⓪ 탭과 같은 자료).
import React from "react";
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";
import Profiles from "./Profiles";

export default function StudentInfoPage() {
    return (
        <AuthCheck>
            <AppShell currentPage="student-info" title="📇 학생정보 및 이해자료"
                subtitle="제출 의무가 없는 작성 도우미입니다. 예시 문장을 골라 초안을 만들고 미리보기에서 한글(HWPX)로 저장해 쓰세요. AI에는 쓰이지 않습니다.">
                <Profiles />
            </AppShell>
        </AuthCheck>
    );
}
