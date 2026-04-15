import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/providers";

export const metadata: Metadata = {
  title: {
    default: "Work Tracking Dashboard",
    template: "%s | Work Tracking Dashboard",
  },
  description: "업무 현황, 집중 시간, GitHub/Notion 업데이트를 한 화면에서 관리하는 대시보드.",
  applicationName: "Work Tracking Dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
