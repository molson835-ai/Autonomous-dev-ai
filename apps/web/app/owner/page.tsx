import type { Metadata } from "next";
import OwnerConsole from "./owner-console";

export const metadata: Metadata = {
  title: "Eve Owner Console",
  description: "Private owner review for Eve's durable task and memory proposals.",
  robots: { index: false, follow: false },
};

export default function OwnerPage() {
  return <OwnerConsole />;
}
