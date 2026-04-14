import "../styles/index.css";
import { Figtree } from "next/font/google";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

export const metadata = {
  title: "Modular Forms",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
