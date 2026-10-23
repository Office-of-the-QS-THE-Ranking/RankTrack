import { RecognitionWall } from "@/components/recognition/RecognitionWall";

import { Gate } from "@/components/hub/Gate";

export const metadata = { title: "Recognition" };

export default function Recognition() {
  return (
    <Gate path="/admin/recognition" title="Recognition">
      <RecognitionWall mode="internal" />
    </Gate>
  );
}
