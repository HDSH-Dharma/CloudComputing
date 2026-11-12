import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Buat akun" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <Logo className="text-xl" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Buat akun</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">Daftar gratis untuk mulai melacak filamen.</p>
        </div>
        <AuthForm mode="signup" next={next} initialError={error} />
      </div>
    </main>
  );
}
