import axios from "axios";

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return "Can't reach the server. Check your connection and try again.";
    const detail = err.response.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const messages = detail.map((d) => (typeof d?.msg === "string" ? d.msg : null)).filter(Boolean);
      if (messages.length > 0) return messages.join(", ");
    }
    return FALLBACK_MESSAGE;
  }
  if (err instanceof Error && err.message) return err.message;
  return FALLBACK_MESSAGE;
}
