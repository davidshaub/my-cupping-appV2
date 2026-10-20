// Shorten generated date/time titles for display without renaming saved sessions.
export const displaySessionName = name => String(name ?? '').replace(
  /^(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}:\d{2}):\d{2}(\s*[AP]M)?$/i,
  '$1$2'
);
