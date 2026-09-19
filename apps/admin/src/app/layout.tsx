export const metadata = { title: 'LumaSearch Admin', description: 'Admin dashboard for LumaSearch' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950">{children}</body>
    </html>
  );
}