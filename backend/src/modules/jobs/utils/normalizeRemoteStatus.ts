import type { RemoteStatus } from "@personal-job-automation/shared/types";
import { normalizeText } from "./text.js";

export const normalizeRemoteStatus = (
  value: string | undefined,
): RemoteStatus => {
  const normalized = value ? normalizeText(value) : "";
  if (["remote", "work from home", "wfh", "fully remote"].includes(normalized))
    return "remote";
  if (["hybrid", "flexible hybrid"].includes(normalized)) return "hybrid";
  if (
    ["onsite", "on site", "office", "in office", "on premise"].includes(
      normalized,
    )
  )
    return "onsite";
  if (["any", "remote or hybrid", "remote hybrid onsite"].includes(normalized))
    return "any";
  return "unknown";
};
