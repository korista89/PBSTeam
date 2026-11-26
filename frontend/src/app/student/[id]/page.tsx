import { redirect } from "next/navigation";

// 개별학생대시보드는 개별학생 행동중재 ⓪ 학생 현황으로 합쳤다. 예전 링크·북마크를 그쪽으로 보낸다.
export default function LegacyStudentPage({ params }: { params: { id: string } }) {
  redirect(`/target-behavior?student=${encodeURIComponent(decodeURIComponent(params.id))}`);
}
