export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center font-sans">
      <h1 className="text-4xl font-semibold tracking-tight">Sentou</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Send a Claude artifact as a private, gated, tracked link.
      </p>
      <a
        href="https://github.com/TrueLineCollective/sentou"
        className="font-medium underline underline-offset-4"
      >
        github.com/TrueLineCollective/sentou
      </a>
    </main>
  );
}
