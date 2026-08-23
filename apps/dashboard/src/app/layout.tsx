import "./globals.css";

export const metadata = {
  title: "London Property AI — CRM",
  description: "Lead generation, qualification, and follow-up dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
