import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "الانطلاق - نظام إدارة المبيعات",
  description: "نظام ERP و POS مخصص لشركة الانطلاق لتصنيع وتوريد خراطيم ومواسير الكهرباء",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
