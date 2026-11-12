import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard"); // middleware sends signed-out users on to /login
}
