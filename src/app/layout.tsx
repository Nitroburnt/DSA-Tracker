import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "DSA Tracker",
  description: "Track your DSA progress with streaks, history, and a curriculum grid.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-full flex flex-col bg-black text-slate-200 selection:bg-[#00FF66] selection:text-black font-chakra">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
