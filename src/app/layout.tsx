
'use client';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { useTheme } from '@/hooks/use-theme';

// NOTE: The useTheme hook and theme logic have been moved into the useTheme hook
// to ensure client-side state is managed correctly.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme } = useTheme();

  return (
    // The className is now managed by the useTheme hook.
    // suppressHydrationWarning is important to prevent a flash of unstyled content
    // and errors when the server-rendered class differs from the client's preference.
    <html lang="en" className={theme} style={{ colorScheme: theme }} suppressHydrationWarning>
      <head />
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
