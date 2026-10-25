import { Users } from "lucide-react";
import { useState } from "react";

import { inviteCode, useSession } from "@/app/session";
import { Button, Input } from "@/components/ui";

/** "Есть приглашение?" — paste the partner's link or code when the app was opened without it. */
export function InviteCodeForm({ className }: { className?: string }) {
  const { openInvite } = useSession();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const code = inviteCode(value);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (code) openInvite(code);
      }}
      noValidate
    >
      <Input
        label="Ссылка или код приглашения"
        placeholder="https://t.me/… или inv_…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={touched && value && !code ? "В тексте нет кода приглашения — скопируйте ссылку целиком" : undefined}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <Button type="submit" variant="secondary" block className="mt-3" icon={<Users className="size-4" />} disabled={!value.trim()}>
        Присоединиться по приглашению
      </Button>
    </form>
  );
}
