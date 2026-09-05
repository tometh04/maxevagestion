import { ReservationDetailPage } from "@/components/operations/reservation-detail-page"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ReservationDetailPage id={(await params).id} />
}
