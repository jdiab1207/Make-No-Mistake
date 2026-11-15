import { Suspense } from "react";
import NtDesktop from "@/components/NtDesktop";

export default function Home() {
  return (
    <Suspense fallback={<div className="nt-desktop" />}>
      <NtDesktop />
    </Suspense>
  );
}
