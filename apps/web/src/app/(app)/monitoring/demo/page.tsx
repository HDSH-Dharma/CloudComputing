import type { Metadata } from "next";
import Link from "next/link";
import { VideoDemo } from "@/components/video-demo";
import { ghostBtn, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Demo deteksi video" };

export default function MonitoringDemoPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      <PageHeader
        title="Demo deteksi dari video"
        description="Putar rekaman printer untuk menguji deteksi gagal, sukses, dan macet tanpa printer sungguhan."
        action={<Link href="/monitoring" className={ghostBtn}>Kembali ke live</Link>}
      />
      <VideoDemo />
    </div>
  );
}
