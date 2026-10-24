import { Lock, Users } from "lucide-react";

import { Segmented } from "@/components/ui";
import type { Visibility } from "@/types/api";

export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "family", label: "Для семьи" },
        { value: "private", label: "Только мне" },
      ]}
    />
  );
}

export function PrivateMark() {
  return (
    <span title="Видно только вам" aria-label="Личное" className="inline-flex text-subtle">
      <Lock className="size-3.5" />
    </span>
  );
}

export function FamilyMark() {
  return <Users className="size-3.5 text-subtle" aria-label="Для семьи" />;
}
