/** Link zum Quellcode, aus der Umgebung (.env: VITE_GITHUB_URL) */
export const GITHUB_URL: string =
  (import.meta.env.VITE_GITHUB_URL as string | undefined) || 'https://github.com/your-name/pianist';
