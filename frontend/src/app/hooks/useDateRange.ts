"use client";

import { useEffect, useState } from "react";
import { loadInitialDateRange } from "../utils";

// 상단 분석기간(AppShell 날짜 필터)과 연동된 기간. 바뀌면 pbis-date-change 이벤트로 알린다.
export function useDateRange() {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    useEffect(() => {
        const { start, end } = loadInitialDateRange();
        setStartDate(start);
        setEndDate(end);

        // 상단 날짜 필터 변경 수신
        const handleDateChange = (e: CustomEvent) => {
            setStartDate(e.detail.startDate);
            setEndDate(e.detail.endDate);
        };

        window.addEventListener('pbis-date-change', handleDateChange as EventListener);
        return () => window.removeEventListener('pbis-date-change', handleDateChange as EventListener);
    }, []);

    return { startDate, endDate };
}
