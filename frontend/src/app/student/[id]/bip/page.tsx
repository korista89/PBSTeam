import { redirect } from "next/navigation";

// 기존 북마크도 해당 학생의 통합 행동중재 화면으로 연결한다.
export default function LegacyBipPage({ params }: { params: { id: string } }) {
  redirect(`/target-behavior?student=${encodeURIComponent(params.id)}&step=bip`);
}
