import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
	title: "edge-pi Documentation",
	description: "Documentation for the edge-pi SDK and CLI",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<div className="layout">
					<Sidebar />
					<main className="content">{children}</main>
				</div>
			</body>
		</html>
	);
}
