export function fmtDate(value: string | Date) {
  return new Date(value).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function fmtTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDayLabel(value: string | Date) {
  const date = new Date(value);
  const today = new Date();
  const diff = Math.round(
    (new Date(date.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(date).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function toDateKey(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export const SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "English",
  "History",
  "Economics",
  "Other",
];

export const CATEGORIES = ["notes", "slides", "past papers", "assignment", "book", "other"];

export const SEMESTERS = ["Semester 1", "Semester 2", "Semester 3", "Semester 4", "Semester 5", "Semester 6"];
