import { redirect } from "next/navigation";

// 개별학생대시보드 목록은 개별학생 행동중재(학생 목록)와 Tier3관리(연간 보기 아래 Tier3 학생 현황)로 옮겼다.
export default function LegacyStudentListPage() {
  redirect("/target-behavior");
}
